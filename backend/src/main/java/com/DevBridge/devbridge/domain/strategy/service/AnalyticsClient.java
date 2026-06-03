package com.DevBridge.devbridge.domain.strategy.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryRegistry;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * HTTP client for the Alpha-Helix Python analytics sidecar.
 * All heavy quant logic (yfinance, vectorbt, QuantStats, SHAP, XGBoost) lives there.
 *
 * 개선 사항:
 *  - Resilience4j CircuitBreaker: 10회 중 50% 실패 시 30초 OPEN (Python 사이드카 다운 시 빠른 실패)
 *  - Resilience4j Retry: 최대 3회 재시도, 2초 대기 (일시적 네트워크 오류 대응)
 *  - 4xx(클라이언트 오류)는 재시도 제외 — 잘못된 파라미터 반복 호출 방지
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AnalyticsClient {

    @Value("${app.analytics.base-url}")
    private String baseUrl;

    @Value("${app.analytics.internal-token}")
    private String token;

    @Value("${app.analytics.timeout-sec:30}")
    private int timeoutSec;

    @Value("${app.analytics.heavy-timeout-sec:120}")
    private int heavyTimeoutSec;

    private final ObjectMapper om = new ObjectMapper();
    private final CircuitBreakerRegistry cbRegistry;
    private final RetryRegistry retryRegistry;

    private CircuitBreaker circuitBreaker;
    private Retry retry;

    @PostConstruct
    void init() {
        circuitBreaker = cbRegistry.circuitBreaker("analytics");
        retry = retryRegistry.retry("analytics");
    }

    private HttpClient client() {
        return HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /** 실제 HTTP 호출. 4xx는 재시도 없는 ClientError로 래핑. */
    private JsonNode callOnce(String path, String method, Object body) {
        return callOnce(path, method, body, timeoutSec);
    }

    /** 무거운 연산(Trust, Regime) 전용 — 120s 타임아웃 */
    private JsonNode callOnceHeavy(String path, String method, Object body) {
        return callOnce(path, method, body, heavyTimeoutSec);
    }

    private JsonNode callOnce(String path, String method, Object body, int timeoutSeconds) {
        try {
            String payload = body == null ? "" : om.writeValueAsString(body);
            byte[] payloadBytes = payload.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            log.info("analytics CALL {} {} payload-len={}", method, path, payloadBytes.length);
            HttpRequest.Builder b = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + path))
                    .header("Content-Type", "application/json; charset=utf-8")
                    .header("Accept", "application/json")
                    .header("X-Internal-Token", token)
                    .timeout(Duration.ofSeconds(timeoutSeconds));
            HttpRequest req = switch (method) {
                case "GET" -> b.GET().build();
                case "POST" -> b.POST(HttpRequest.BodyPublishers.ofByteArray(payloadBytes)).build();
                default -> throw new IllegalArgumentException("method " + method);
            };
            HttpResponse<String> resp = client().send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() >= 400 && resp.statusCode() < 500) {
                // 4xx — 클라이언트 오류: 재시도 무의미, Circuit Breaker 카운트 제외
                log.warn("analytics {} {} → HTTP {} (client error, no retry)", method, path, resp.statusCode());
                throw new AnalyticsException.ClientError(
                        "analytics client error HTTP " + resp.statusCode() + ": " + resp.body());
            }
            if (resp.statusCode() >= 500) {
                log.warn("analytics {} {} → HTTP {} (server error)", method, path, resp.statusCode());
                throw new AnalyticsException("analytics server error HTTP " + resp.statusCode() + ": " + resp.body());
            }
            return om.readTree(resp.body());
        } catch (AnalyticsException e) {
            throw e;
        } catch (java.net.ConnectException | java.net.http.HttpConnectTimeoutException e) {
            log.error("analytics connection refused {} {}", method, path);
            throw new AnalyticsException("Analytics 서버에 연결할 수 없습니다 (" + baseUrl + "). Python 서버가 실행 중인지 확인하세요.", e);
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            log.error("analytics call failed {} {}", method, path, e);
            throw new AnalyticsException("analytics call failed: " + msg, e);
        }
    }

    /** Retry + CircuitBreaker 래핑 호출 */
    private JsonNode call(String path, String method, Object body) {
        Supplier<JsonNode> decorated = CircuitBreaker.decorateSupplier(
                circuitBreaker,
                Retry.decorateSupplier(retry, () -> callOnce(path, method, body))
        );
        return executeDecorated(decorated, method, path);
    }

    /** Trust/Regime 전용 heavy 호출 (120s 타임아웃, 재시도 없음 — 연산이 무거워 재시도는 역효과). */
    private JsonNode callHeavy(String path, String method, Object body) {
        Supplier<JsonNode> decorated = CircuitBreaker.decorateSupplier(
                circuitBreaker,
                () -> callOnceHeavy(path, method, body)
        );
        return executeDecorated(decorated, method, path);
    }

    private JsonNode executeDecorated(Supplier<JsonNode> decorated, String method, String path) {
        try {
            return decorated.get();
        } catch (AnalyticsException.ClientError e) {
            throw e; // 클라이언트 오류는 그대로 전파
        } catch (io.github.resilience4j.circuitbreaker.CallNotPermittedException e) {
            log.warn("analytics circuit OPEN — fast fail for {} {}", method, path);
            throw new AnalyticsException("Analytics 서비스가 일시적으로 사용 불가합니다. 잠시 후 다시 시도해주세요.");
        } catch (Exception e) {
            if (e instanceof AnalyticsException ae) throw ae;
            throw new AnalyticsException("analytics call failed: " + e.getMessage(), e);
        }
    }

    /** GET /health — used for liveness check from Spring. */
    public boolean isHealthy() {
        try {
            JsonNode n = callOnce("/health", "GET", null); // health check는 CB 우회
            return "ok".equals(n.path("status").asText());
        } catch (Exception e) {
            return false;
        }
    }

    /** POST /backtest — run vectorbt backtest. */
    public JsonNode backtest(String ticker, String strategy, Map<String, Object> extra) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("ticker", ticker);
        body.put("strategy", strategy == null ? "sma_cross" : strategy);
        if (extra != null) body.putAll(extra);
        return call("/backtest", "POST", body);
    }

    /** POST /lean/backtest — run QuantConnect Lean backtest (Docker, 첫 실행 매우 느림). */
    public JsonNode leanBacktest(
            String strategyId,
            List<String> symbols,
            String startDate,
            String endDate,
            String market,
            Map<String, Object> paramOverrides,
            Map<String, Object> extra) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("strategy_id", strategyId);
        body.put("symbols", symbols);
        body.put("start_date", startDate);
        body.put("end_date", endDate);
        body.put("market", market == null ? "us" : market);
        if (paramOverrides != null && !paramOverrides.isEmpty()) {
            body.put("param_overrides", paramOverrides);
        }
        if (extra != null) body.putAll(extra);
        // Lean 은 Docker 컨테이너 spin-up + 백테스트 계산이 무거우니 heavy timeout 사용
        return callHeavy("/lean/backtest", "POST", body);
    }

    /** GET /lean/strategies — Lean 의 등록된 preset 전략 목록 + 파라미터 정의. */
    public JsonNode leanListStrategies() {
        return callOnce("/lean/strategies", "GET", null);
    }

    /** POST /lean/backtest/start — 비동기 잡 시작, {job_id} 즉시 반환 (재시도 없음: 중복 잡 방지). */
    public JsonNode leanBacktestStart(
            String strategyId, List<String> symbols, String startDate, String endDate,
            String market, Map<String, Object> paramOverrides) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("strategy_id", strategyId);
        body.put("symbols", symbols);
        body.put("start_date", startDate);
        body.put("end_date", endDate);
        body.put("market", market == null ? "us" : market);
        if (paramOverrides != null && !paramOverrides.isEmpty()) {
            body.put("param_overrides", paramOverrides);
        }
        return callOnce("/lean/backtest/start", "POST", body);
    }

    /** GET /lean/backtest/status/{jobId}?since=N — 진행 로그(증분) + 완료 시 결과. */
    public JsonNode leanBacktestStatus(String jobId, int since) {
        return callOnce("/lean/backtest/status/" + jobId + "?since=" + Math.max(0, since), "GET", null);
    }

    /** GET /lean/health — Lean 실행환경(Docker 데몬/lean CLI/이미지) 준비 상태. */
    public JsonNode leanHealth() {
        return callOnce("/lean/health", "GET", null);
    }

    /** GET /data/status — 수집된 시장 데이터 현황(소스/심볼별 행 수 + 최신 시각). */
    public JsonNode dataStatus() {
        return call("/data/status", "GET", null);
    }

    /** GET /data/ohlcv — DB(없으면 실시간 fetch)에서 OHLCV 미리보기 행. */
    public JsonNode dataOhlcv(String symbol, String tf, String source, int limit) {
        StringBuilder p = new StringBuilder("/data/ohlcv?symbol=")
                .append(java.net.URLEncoder.encode(symbol, java.nio.charset.StandardCharsets.UTF_8))
                .append("&tf=").append(tf == null || tf.isBlank() ? "1d" : tf)
                .append("&limit=").append(limit);
        if (source != null && !source.isBlank()) {
            p.append("&source=").append(java.net.URLEncoder.encode(source, java.nio.charset.StandardCharsets.UTF_8));
        }
        return call(p.toString(), "GET", null);
    }

    /** POST /signals/today — daily signal batch (used by 22:30 KST scheduler). */
    public JsonNode todaySignals(List<String> tickers, String strategy, boolean includeMl) {
        return call("/signals/today", "POST", Map.of(
                "tickers", tickers,
                "strategy", strategy == null ? "sma_cross" : strategy,
                "include_ml", includeMl
        ));
    }

    /** POST /models/train — train XGBoost classifier for one ticker. */
    public JsonNode trainModel(String ticker) {
        return call("/models/train", "POST", Map.of("ticker", ticker, "period", "5y"));
    }

    /** POST /robust/walk-forward — out-of-sample validation. */
    public JsonNode walkForward(String ticker, String strategy) {
        return call("/robust/walk-forward", "POST", Map.of(
                "ticker", ticker,
                "strategy", strategy == null ? "sma_cross" : strategy,
                "period", "10y"
        ));
    }

    /** GET /price/latest?ticker=XXX */
    public Double latestClose(String ticker) {
        try {
            JsonNode n = callOnce("/price/latest?ticker=" + ticker, "GET", null);
            return n.path("close").isNumber() ? n.path("close").asDouble() : null;
        } catch (Exception e) {
            log.warn("latestClose failed for {}: {}", ticker, e.getMessage());
            return null;
        }
    }

    /** POST /regime — market regime analysis (bull/bear/sideways/high-vol). */
    public JsonNode regime(String ticker) {
        return regime(ticker, null);
    }

    /**
     * POST /regime — 옵션 확장 버전.
     * options 지원 키: period(String, default 10y), strategy(String),
     *                  method("rule"|"hmm"), smoothing(int), n_states(int).
     * null/빈 맵이면 rule + period=10y 기본 동작.
     */
    public JsonNode regime(String ticker, Map<String, Object> options) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("ticker", ticker);
        // 10y로 늘려 bear/high-vol regime 표본을 충분히 확보 (이전 5y는 bear=2일에 그침)
        body.put("period", "10y");
        if (options != null) {
            for (String k : new String[]{"period", "strategy", "method", "smoothing", "n_states"}) {
                if (options.containsKey(k) && options.get(k) != null) {
                    body.put(k, options.get(k));
                }
            }
        }
        return callHeavy("/regime", "POST", body);
    }

    /** POST /trust — composite Trust Score (0~100) from multiple robustness checks. */
    public JsonNode trustScore(String ticker, String strategy) {
        return trustScore(ticker, strategy, null);
    }

    /**
     * POST /trust — 사용자 조정 옵션을 함께 전달하는 확장 버전.
     * options 예: { weights: {generalization:0.3,...}, overfit_penalty_max:10,
     *               wf_train:504, wf_test:63, mdd_target_pct:25.0, period:"10y" }
     * null/빈 맵이면 기본값 사용.
     */
    public JsonNode trustScore(String ticker, String strategy, Map<String, Object> options) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("ticker", ticker);
        body.put("strategy", strategy == null ? "sma_cross" : strategy);
        if (options != null) {
            // 알려진 옵션 키만 화이트리스트로 전달 (Pydantic이 unknown 거부)
            for (String k : new String[]{
                    "period", "weights", "overfit_penalty_max",
                    "wf_train", "wf_test", "mdd_target_pct",
                    "asset_class", "leverage"
            }) {
                if (options.containsKey(k) && options.get(k) != null) {
                    body.put(k, options.get(k));
                }
            }
        }
        return callHeavy("/trust", "POST", body);
    }

    /** POST /backtest/infinite-buying — 무한매수법 백테스트. */
    public JsonNode infiniteBuying(List<String> tickers, Map<String, Object> extra) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("tickers", tickers);
        body.put("period", "10y");
        if (extra != null) body.putAll(extra);
        return call("/backtest/infinite-buying", "POST", body);
    }

    /** POST /orders/infinite-buying/plan — 다음 거래일 주문 계획. */
    public JsonNode infiniteBuyingPlan(List<String> tickers, Map<String, Object> extra) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("tickers", tickers);
        body.put("period", "10y");
        if (extra != null) body.putAll(extra);
        return call("/orders/infinite-buying/plan", "POST", body);
    }

    /** POST /backtest/infinite-buying/sizing — 목표 월수익 → 필요 시드 역산. */
    public JsonNode infiniteBuyingSizing(List<String> tickers, Map<String, Object> extra) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("tickers", tickers);
        body.put("period", "2y");
        if (extra != null) body.putAll(extra);
        return call("/backtest/infinite-buying/sizing", "POST", body);
    }

    public static class AnalyticsException extends RuntimeException {
        public AnalyticsException(String m) { super(m); }
        public AnalyticsException(String m, Throwable t) { super(m, t); }

        /** 4xx 클라이언트 오류 — 재시도 제외 대상 */
        public static class ClientError extends AnalyticsException {
            public ClientError(String m) { super(m); }
        }
    }
}

