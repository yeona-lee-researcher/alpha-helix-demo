package com.DevBridge.devbridge.domain.strategy.service.broker;

import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import com.DevBridge.devbridge.domain.payment.service.CryptoService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 한국투자증권 OpenAPI 미국주식 클라이언트.
 * 모의투자 / 실전 도메인 자동 분기, 토큰 캐시(23h), 주문 TR-ID 자동 매핑.
 *
 * 공식 문서: https://apiportal.koreainvestment.com  (해외주식 거래 API)
 *
 * 주의사항:
 *  - 모든 주문은 호출 전 BrokerAccount.tradingEnabled == true && lastVerifiedAt != null 확인 필요 (호출 측 책임)
 *  - 한도 검증(maxOrderUsd, dailyOrderUsd)도 호출 측 책임 — 본 클래스는 KIS API 래퍼만 담당
 *  - 토큰 발급 호출은 1분 1회 제한이 있으므로 반드시 캐시 사용
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class KisApiClient {

    private static final String MOCK_HOST = "https://openapivts.koreainvestment.com:29443";
    private static final String REAL_HOST = "https://openapi.koreainvestment.com:9443";

    /**
     * 해외주식 거래소 코드 매핑 (KIS 공식 코드).
     *  - 주문/잔고용:  NASD(나스닥) · NYSE(뉴욕) · AMEX(아멕스)
     *  - 시세조회용:   NAS · NYS · AMS  (이건 별도 메서드에서 변환)
     * 사용자 미지정 시 티커별 알려진 매핑을 우선 사용하고, 모르면 NASD 기본.
     */
    private static final Map<String, String> EXCHANGE_BY_TICKER = Map.ofEntries(
            // NYSE (S&P 500 블루칩, ETF)
            Map.entry("BRK.B", "NYSE"), Map.entry("JPM", "NYSE"), Map.entry("BAC", "NYSE"),
            Map.entry("WMT", "NYSE"),   Map.entry("DIS", "NYSE"), Map.entry("KO",  "NYSE"),
            Map.entry("PG",  "NYSE"),   Map.entry("XOM", "NYSE"), Map.entry("CVX", "NYSE"),
            Map.entry("V",   "NYSE"),   Map.entry("MA",  "NYSE"), Map.entry("PFE", "NYSE"),
            Map.entry("JNJ", "NYSE"),   Map.entry("NKE", "NYSE"), Map.entry("MCD", "NYSE"),
            Map.entry("SCHD","NYSE"),   Map.entry("VOO", "NYSE"), Map.entry("VTI", "NYSE"),
            Map.entry("DIA", "NYSE"),   Map.entry("SPY", "NYSE"), Map.entry("IWM", "NYSE"),
            Map.entry("GLD", "NYSE"),   Map.entry("SLV", "NYSE"), Map.entry("TLT", "NYSE"),
            Map.entry("SHY", "NYSE"),
            // AMEX = NYSE Arca 상장 레버리지/인버스 ETF (Direxion, ProShares 등)
            // OVRS_EXCG_CD 를 NASD 로 보내면 EGW00202(GW라우팅 오류) 발생
            Map.entry("SOXL", "AMEX"), Map.entry("SOXS", "AMEX"),
            Map.entry("SPXL", "AMEX"), Map.entry("SPXS", "AMEX"),
            Map.entry("TECL", "AMEX"), Map.entry("TECS", "AMEX"),
            Map.entry("LABU", "AMEX"), Map.entry("LABD", "AMEX"),
            Map.entry("FNGU", "AMEX"), Map.entry("FNGD", "AMEX"),
            Map.entry("UDOW", "AMEX"), Map.entry("SDOW", "AMEX"),
            Map.entry("UPRO", "AMEX"), Map.entry("SPXU", "AMEX"),
            Map.entry("TNA",  "AMEX"), Map.entry("TZA",  "AMEX"),
            Map.entry("ARKK", "AMEX"), Map.entry("ARKG", "AMEX"),
            Map.entry("ARKW", "AMEX"), Map.entry("ARKF", "AMEX"),
            Map.entry("USO",  "AMEX"), Map.entry("UCO",  "AMEX"),
            Map.entry("UVXY", "AMEX"), Map.entry("SVXY", "AMEX")
            // 나머지는 NASD 기본 (AAPL, MSFT, GOOGL, AMZN, META, TSLA, NVDA, QQQ, TQQQ ...)
    );

    private static String exchangeOf(String ticker) {
        if (ticker == null) return "NASD";
        return EXCHANGE_BY_TICKER.getOrDefault(ticker.toUpperCase(), "NASD");
    }

    /** 시세 조회 코드는 끝의 D/E/S 가 빠진 3자리 (NAS/NYS/AMS) */
    private static String quoteExchangeOf(String ticker) {
        return switch (exchangeOf(ticker)) {
            case "NYSE" -> "NYS";
            case "AMEX" -> "AMS";
            default -> "NAS";
        };
    }

    private final CryptoService crypto;
    private final TradingControlService tradingControl;  // 동적 kill-switch (B3)
    private final ObjectMapper om = new ObjectMapper();

    /** key = userId + ":" + env, value = 토큰+만료시각 */
    private final Map<String, CachedToken> tokenCache = new ConcurrentHashMap<>();
    /** 토큰 갱신 동시성 락 (key 별). 동시 요청이 몰려도 1회만 발급 → KIS 1분 토큰 throttle 회피. (B3) */
    private final Map<String, Object> tokenLocks = new ConcurrentHashMap<>();
    private Object tokenLockFor(String key) { return tokenLocks.computeIfAbsent(key, k -> new Object()); }

    private record CachedToken(String token, Instant expiresAt) {
        boolean valid() { return Instant.now().isBefore(expiresAt.minus(Duration.ofMinutes(5))); }
    }

    private String host(BrokerAccount.Env env) {
        return env == BrokerAccount.Env.REAL ? REAL_HOST : MOCK_HOST;
    }

    private RestClient http(BrokerAccount.Env env) {
        // KIS 응답은 Content-Type이 application/json; charset=UTF-8 또는 가끔 text/plain 으로 오기도 함.
        // RestClient.builder()를 직접 호출하면 Spring Boot의 자동 컨버터가 적용되지 않아
        // JsonNode 역직렬화 시 "Type definition error: [simple type, class JsonNode]" 발생.
        // → ObjectMapper 명시 + 추가 MediaType 허용으로 강제 등록.
        MappingJackson2HttpMessageConverter jackson = new MappingJackson2HttpMessageConverter(om);
        jackson.setSupportedMediaTypes(List.of(
                MediaType.APPLICATION_JSON,
                new MediaType("application", "json", StandardCharsets.UTF_8),
                MediaType.TEXT_PLAIN,
                MediaType.ALL
        ));
        return RestClient.builder()
                .baseUrl(host(env))
                .messageConverters(c -> {
                    c.clear();
                    c.add(new StringHttpMessageConverter(StandardCharsets.UTF_8));
                    c.add(jackson);
                })
                .build();
    }

    private String cacheKey(BrokerAccount b) { return b.getUser().getId() + ":" + b.getEnv(); }

    /**
     * KIS Gateway는 Transfer-Encoding: chunked 요청을 라우팅 단계에서 거부 → EGW00202(GW라우팅 오류) 발생.
     * RestClient에 Map을 그대로 넘기면 일부 환경에서 chunked로 전송되므로,
     * ObjectMapper로 미리 byte[]로 직렬화한 뒤 본문을 넘겨 Spring이 Content-Length를 자동 부여하도록 한다.
     * (참고: KIS 사용자 사례에서 가장 흔한 EGW00202 원인 — chunked 전송)
     */
    private byte[] jsonBytes(Object body) {
        try {
            return om.writeValueAsBytes(body);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("KIS 요청 직렬화 실패: " + e.getMessage(), e);
        }
    }

    /** 요청 바이트를 로그에 찍을 때 appsecret 만 마스킹. */
    private static String previewWithSecretMasked(byte[] payload, String secret) {
        String s = new String(payload, StandardCharsets.UTF_8);
        if (secret != null && !secret.isBlank()) {
            String tail = secret.length() >= 4 ? secret.substring(secret.length() - 4) : "";
            s = s.replace(secret, "***...***" + tail);
        }
        return s;
    }

    // ───────────────────────────────────────────── 1. OAuth 토큰 발급

    /**
     * KIS access token 발급 (캐시됨, 23h 유지).
     * 키 자체가 잘못된 경우 RestClientResponseException → 호출측에서 사용자에게 안내.
     */
    public String getAccessToken(BrokerAccount b) {
        String key = cacheKey(b);
        CachedToken cached = tokenCache.get(key);
        if (cached != null && cached.valid()) return cached.token;

        // B3: 토큰 갱신 동기화 — 같은 계정에 동시 요청이 몰려도 1회만 발급(KIS 1분 throttle 회피).
        synchronized (tokenLockFor(key)) {
        CachedToken again = tokenCache.get(key); // double-check: 대기 중 다른 스레드가 이미 갱신했을 수 있음
        if (again != null && again.valid()) return again.token;

        String appSecret = crypto.decrypt(b.getAppSecretEnc());
        // 키 순서 보장: 공식 Python 샘플은 grant_type → appkey → appsecret 순서로 직렬화함.
        // 일부 게이트웨이 구현이 순서에 민감할 수 있어 LinkedHashMap 사용.
        Map<String, String> body = new LinkedHashMap<>();
        body.put("grant_type", "client_credentials");
        body.put("appkey", b.getAppKey());
        body.put("appsecret", appSecret);

        String appKey = b.getAppKey();
        String appKeyHead = (appKey != null && appKey.length() >= 4) ? appKey.substring(0, 4) : String.valueOf(appKey);
        String appKeyTail = (appKey != null && appKey.length() >= 4) ? appKey.substring(appKey.length() - 4) : "";
        String secretTail = (appSecret != null && appSecret.length() >= 4) ? appSecret.substring(appSecret.length() - 4) : "(short)";
        String url = host(b.getEnv()) + "/oauth2/tokenP";
        log.info("[KIS] token request user={} env={} url={} appkey={}...{}(len={}) secret=...{}(len={})",
                b.getUser().getId(), b.getEnv(), url,
                appKeyHead, appKeyTail, appKey == null ? 0 : appKey.length(),
                secretTail, appSecret == null ? 0 : appSecret.length());

        // ─────────────────────────────────────────────────────────────────────────────
        // Spring RestClient → JDK HttpURLConnection 으로 교체.
        // 이유: Spring RestClient 의 기본 헤더 (특히 User-Agent: "Java-http-client/...") 가
        //       KIS 게이트웨이의 자동화 트래픽 필터에 걸려 키/IP 검증 단계 이전에
        //       403 + EGW00002 로 즉시 거부되는 케이스가 확인됨.
        //       (PowerShell Invoke-RestMethod 로는 동일 키/IP 에서 정상 토큰 발급됨).
        // 공식 Python 샘플 (koreainvestment/open-trading-api examples_llm/auth/auth_token.py) 의
        // requests.post 동작을 최대한 그대로 재현 — 헤더 4개 명시, 그 외 자동 헤더 최소화.
        // ─────────────────────────────────────────────────────────────────────────────
        JsonNode resp;
        int status = -1;
        String respBody = "";
        try {
            byte[] payload = jsonBytes(body);
            log.info("[KIS] token request bytes len={} preview={}",
                    payload.length, previewWithSecretMasked(payload, appSecret));

            HttpURLConnection conn = (HttpURLConnection) new URI(url).toURL().openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(15_000);
            conn.setUseCaches(false);
            conn.setInstanceFollowRedirects(false);
            // 헤더: 공식 Python 샘플과 동일 + PowerShell 스타일 User-Agent.
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "text/plain");
            conn.setRequestProperty("charset", "UTF-8");
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 alpha-helix/1.0");
            conn.setFixedLengthStreamingMode(payload.length); // Content-Length 명시 (chunked 회피)
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload);
                os.flush();
            }
            status = conn.getResponseCode();
            InputStream is = (status >= 200 && status < 300) ? conn.getInputStream() : conn.getErrorStream();
            if (is != null) {
                try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                    respBody = sb.toString();
                }
            }
            log.info("[KIS] token response status={} body.len={}", status, respBody.length());

            if (status < 200 || status >= 300) {
                log.warn("[KIS] token error user={} env={} status={} body={}",
                        b.getUser().getId(), b.getEnv(), status, respBody);
                throw new IllegalStateException(status + " " + respBody);
            }
            resp = om.readTree(respBody);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[KIS] token transport error user={} env={} status={} body={} cause={}",
                    b.getUser().getId(), b.getEnv(), status, respBody, e.getMessage());
            throw new IllegalStateException("KIS 토큰 요청 실패: " + e.getMessage(), e);
        }

        if (resp == null || !resp.hasNonNull("access_token")) {
            String detail = resp == null ? "empty" : resp.toString();
            throw new IllegalStateException("KIS 토큰 응답이 비정상: " + detail);
        }
        String token = resp.get("access_token").asText();
        long expSec = resp.path("expires_in").asLong(86_400);
        Instant exp = Instant.now().plusSeconds(expSec);
        tokenCache.put(key, new CachedToken(token, exp));
        log.info("[KIS] token issued user={} env={} ttl={}h", b.getUser().getId(), b.getEnv(), expSec / 3600);
        return token;
        } // synchronized(tokenLockFor(key))
    }

    public void invalidateToken(BrokerAccount b) {
        tokenCache.remove(cacheKey(b));
    }

    // ───────────────────────────────────────────── 2. 해외주식 잔고 조회 (연결 검증 겸용)

    /**
     * 미국주식 잔고 + 예수금 조회.
     * tr_id: 모의 VTTS3012R, 실전 TTTS3012R
     * 응답 정규화: { cash_usd, positions:[{ticker,qty,avg_price,market_value,unrealized_pnl}], raw }
     */
    public Map<String, Object> getOverseasBalance(BrokerAccount b) {
        String token = getAccessToken(b);
        String trId = b.getEnv() == BrokerAccount.Env.REAL ? "TTTS3012R" : "VTTS3012R";

        JsonNode resp = withRateLimitRetry(() -> http(b.getEnv()).get()
                .uri(uriBuilder -> uriBuilder.path("/uapi/overseas-stock/v1/trading/inquire-balance")
                        .queryParam("CANO", b.getCano())
                        .queryParam("ACNT_PRDT_CD", b.getAcntPrdtCd())
                        .queryParam("OVRS_EXCG_CD", "NASD") // 잔고는 전체 조회하므로 기본 NASD
                        .queryParam("TR_CRCY_CD", "USD")
                        .queryParam("CTX_AREA_FK200", "")
                        .queryParam("CTX_AREA_NK200", "")
                        .build())
                .header("authorization", "Bearer " + token)
                .header("appkey", b.getAppKey())
                .header("appsecret", crypto.decrypt(b.getAppSecretEnc()))
                .header("tr_id", trId)
                .retrieve()
                .body(JsonNode.class));

        Map<String, Object> out = normalizeBalance(resp);
        // 추가: 국내 잔고 API로 원화 예수금도 함께 조회 (실패해도 USD 응답은 정상 반환)
        try {
            out.put("cash_krw", getDomesticCashKrw(b, token));
        } catch (Exception e) {
            log.warn("[KIS] getDomesticCashKrw failed user={} env={}: {}",
                    b.getUser().getId(), b.getEnv(), e.getMessage());
            out.put("cash_krw", 0.0);
        }
        // inquire-balance(VTTS3012R) output2 에는 USD 예수금 필드가 없음.
        // 체결기준현재잔고(VTRP6504R/CTRP6504R) output3 (통화별 배열)에서 CRCY_CD=USD 행의 frcr_dncl_amt_2 사용.
        try {
            double usd = getOverseasCashUsd(b, token);
            if (usd > 0) out.put("cash_usd", usd);
        } catch (Exception e) {
            log.warn("[KIS] getOverseasCashUsd failed user={} env={}: {}",
                    b.getUser().getId(), b.getEnv(), e.getMessage());
        }
        return out;
    }

    /**
     * 해외주식 체결기준현재잔고 API로 USD 예수금만 추출.
     * tr_id: 모의 VTRP6504R, 실전 CTRP6504R
     * output3 = 통화별 배열 → crcy_cd == "USD" 행의 frcr_dncl_amt_2.
     */
    private double getOverseasCashUsd(BrokerAccount b, String token) {
        String trId = b.getEnv() == BrokerAccount.Env.REAL ? "CTRP6504R" : "VTRP6504R";
        JsonNode resp = withRateLimitRetry(() -> http(b.getEnv()).get()
                .uri(uriBuilder -> uriBuilder.path("/uapi/overseas-stock/v1/trading/inquire-present-balance")
                        .queryParam("CANO", b.getCano())
                        .queryParam("ACNT_PRDT_CD", b.getAcntPrdtCd())
                        .queryParam("WCRC_FRCR_DVSN_CD", "02") // 02:외화기준
                        .queryParam("NATN_CD", "840")          // 840:미국
                        .queryParam("TR_MKET_CD", "00")        // 00:전체
                        .queryParam("INQR_DVSN_CD", "00")      // 00:전체
                        .build())
                .header("authorization", "Bearer " + token)
                .header("appkey", b.getAppKey())
                .header("appsecret", crypto.decrypt(b.getAppSecretEnc()))
                .header("tr_id", trId)
                .retrieve()
                .body(JsonNode.class));
        if (resp == null) return 0.0;
        log.info("[KIS] present-balance rt_cd={} msg={} user={}",
                resp.path("rt_cd").asText(""), resp.path("msg1").asText(""), b.getUser().getId());
        JsonNode out3 = resp.path("output3");
        if (out3.isArray()) {
            for (JsonNode row : out3) {
                if ("USD".equalsIgnoreCase(row.path("crcy_cd").asText(""))) {
                    return row.path("frcr_dncl_amt_2").asDouble(0);
                }
            }
            // crcy_cd 없으면 첫 행
            if (out3.size() > 0) return out3.get(0).path("frcr_dncl_amt_2").asDouble(0);
        } else if (out3.isObject()) {
            return out3.path("frcr_dncl_amt_2").asDouble(0);
        }
        return 0.0;
    }

    /**
     * 국내주식 잔고 API로 원화 예수금만 추출.
     * tr_id: 모의 VTTC8434R, 실전 TTTC8434R
     * output2[0].dnca_tot_amt = 예수금 총금액(원화)
     */
    private double getDomesticCashKrw(BrokerAccount b, String token) {
        String trId = b.getEnv() == BrokerAccount.Env.REAL ? "TTTC8434R" : "VTTC8434R";
        JsonNode resp = withRateLimitRetry(() -> http(b.getEnv()).get()
                .uri(uriBuilder -> uriBuilder.path("/uapi/domestic-stock/v1/trading/inquire-balance")
                        .queryParam("CANO", b.getCano())
                        .queryParam("ACNT_PRDT_CD", b.getAcntPrdtCd())
                        .queryParam("AFHR_FLPR_YN", "N")
                        .queryParam("OFL_YN", "")
                        .queryParam("INQR_DVSN", "02")
                        .queryParam("UNPR_DVSN", "01")
                        .queryParam("FUND_STTL_ICLD_YN", "N")
                        .queryParam("FNCG_AMT_AUTO_RDPT_YN", "N")
                        .queryParam("PRCS_DVSN", "00")
                        .queryParam("CTX_AREA_FK100", "")
                        .queryParam("CTX_AREA_NK100", "")
                        .build())
                .header("authorization", "Bearer " + token)
                .header("appkey", b.getAppKey())
                .header("appsecret", crypto.decrypt(b.getAppSecretEnc()))
                .header("tr_id", trId)
                .retrieve()
                .body(JsonNode.class));
        if (resp == null) return 0.0;
        JsonNode out2 = resp.path("output2");
        if (out2.isArray() && out2.size() > 0) {
            return out2.get(0).path("dnca_tot_amt").asDouble(0);
        }
        return out2.path("dnca_tot_amt").asDouble(0);
    }

    /**
     * KIS 초당 거래건수 초과 (EGW00201) 처리. 두 가지 응답 형태 모두 대응:
     *   ① HTTP 200 + body {rt_cd:1, msg_cd:EGW00201, ...}     (정상 케이스)
     *   ② HTTP 500 + body {rt_cd:1, msg_cd:EGW00201, ...}     (모의투자에서 자주 발생)
     * 두 케이스 모두 1.5초 슬립 후 1회 재시도. 모의는 실전보다 throttle 이 빡빡함.
     */
    private static JsonNode withRateLimitRetry(java.util.function.Supplier<JsonNode> call) {
        try {
            JsonNode resp = call.get();
            if (isRateLimited(resp)) {
                try { Thread.sleep(1500); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
                resp = call.get();
            }
            return resp;
        } catch (RestClientResponseException ex) {
            String body = ex.getResponseBodyAsString();
            if (body != null && body.contains("EGW00201")) {
                try { Thread.sleep(1500); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
                return call.get(); // 재시도 — 이번에 또 실패하면 그대로 throw
            }
            throw ex;
        }
    }

    private static boolean isRateLimited(JsonNode resp) {
        return resp != null
                && "1".equals(resp.path("rt_cd").asText())
                && "EGW00201".equals(resp.path("msg_cd").asText());
    }

    private Map<String, Object> normalizeBalance(JsonNode resp) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (resp == null) {
            out.put("cash_usd", 0.0);
            out.put("positions", java.util.List.of());
            out.put("raw", null);
            return out;
        }
        // output1 = 보유종목 배열, output2 = 예수금 등 요약
        java.util.List<Map<String, Object>> positions = new java.util.ArrayList<>();
        if (resp.path("output1").isArray()) {
            for (JsonNode n : resp.path("output1")) {
                Map<String, Object> p = new LinkedHashMap<>();
                p.put("ticker", n.path("ovrs_pdno").asText(""));
                p.put("name", n.path("ovrs_item_name").asText(""));
                p.put("qty", n.path("ovrs_cblc_qty").asDouble(0));
                p.put("avg_price", n.path("pchs_avg_pric").asDouble(0));
                p.put("now_price", n.path("now_pric2").asDouble(0));
                p.put("market_value_usd", n.path("ovrs_stck_evlu_amt").asDouble(0));
                p.put("unrealized_pnl_usd", n.path("frcr_evlu_pfls_amt").asDouble(0));
                positions.add(p);
            }
        }
        double cash = resp.path("output2").path("frcr_dncl_amt_2").asDouble(
                resp.path("output2").path("frcr_buy_able_amt").asDouble(0));
        out.put("cash_usd", cash);
        out.put("positions", positions);
        out.put("total_market_value_usd",
                resp.path("output2").path("tot_evlu_pfls_amt").asDouble(0));
        out.put("raw_rt_cd", resp.path("rt_cd").asText(""));
        out.put("raw_msg", resp.path("msg1").asText(""));
        return out;
    }

    // ───────────────────────────────────────────── 3. 미국주식 주문 (시장가/지정가)

    public enum Side { BUY, SELL }

    /**
     * 미국주식 주문 전송.
     * tr_id 매핑 (KIS 공식):
     *   실전 매수 TTTT1002U / 매도 TTTT1006U
     *   모의 매수 VTTT1002U / 매도 VTTT1006U
     *
     * @param limitPrice null 또는 0 → 시장가(예약가 0). KIS는 미국 정규장 시장가를 LOO/MOO 형태로 받지 않으므로
     *                   안전하게 LOO(지정가)만 권장. 호출측에서 호가 책임.
     * @return { kis_order_no, status, raw }
     */
    /** KIS 미국주식 ORD_DVSN: 00=지정가(확정). */
    public static final String ORD_DVSN_LIMIT = "00";

    /**
     * LOC(장마감지정가) ORD_DVSN 코드 = 34 (KIS 공식 examples_llm/overseas_stock/order/order.py docstring 확정).
     * ⚠️ 모의투자(VTTT)는 00:지정가만 지원 → LOC(34)는 REAL 전용. (어댑터에서 MOCK 은 00 으로 다운그레이드)
     * 만일을 위해 설정(kis.overseas.ord-dvsn-loc)으로 교체 가능하게 둔다.
     */
    @org.springframework.beans.factory.annotation.Value("${kis.overseas.ord-dvsn-loc:34}")
    private String ordDvsnLoc;

    public String locOrdDvsn() { return (ordDvsnLoc == null || ordDvsnLoc.isBlank()) ? "34" : ordDvsnLoc; }

    /** 하위호환: 주문구분 미지정 → 지정가(00). */
    public Map<String, Object> placeOverseasOrder(BrokerAccount b, String ticker, Side side,
                                                  long quantity, Double limitPrice) {
        return placeOverseasOrder(b, ticker, side, quantity, limitPrice, ORD_DVSN_LIMIT);
    }

    public Map<String, Object> placeOverseasOrder(BrokerAccount b, String ticker, Side side,
                                                  long quantity, Double limitPrice, String ordDvsn) {
        if (quantity <= 0) throw new IllegalArgumentException("quantity는 1 이상이어야 합니다.");
        if (tradingControl.isKillSwitchOn()) {
            throw new IllegalStateException("KIS 주문 차단: 전역 거래 차단 스위치(kill-switch) 활성화");
        }
        String token = getAccessToken(b);
        boolean real = b.getEnv() == BrokerAccount.Env.REAL;
        String trId = (real ? "TTTT" : "VTTT") + (side == Side.BUY ? "1002U" : "1006U");

        // EGW00202(GW라우팅) 회피: 매핑 우선 거래소로 1차 시도 후 실패 시 NASD/NYSE/AMEX 순으로 폴백.
        String primary = exchangeOf(ticker);
        java.util.List<String> exchanges = new java.util.ArrayList<>();
        exchanges.add(primary);
        for (String alt : List.of("NASD", "NYSE", "AMEX")) {
            if (!exchanges.contains(alt)) exchanges.add(alt);
        }

        JsonNode resp = null;
        String lastBody = "";
        for (String excg : exchanges) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("CANO", b.getCano());
            body.put("ACNT_PRDT_CD", b.getAcntPrdtCd());
            body.put("OVRS_EXCG_CD", excg);
            body.put("PDNO", ticker);
            body.put("ORD_QTY", String.valueOf(quantity));
            body.put("OVRS_ORD_UNPR", limitPrice == null ? "0" : String.format("%.2f", limitPrice));
            body.put("ORD_SVR_DVSN_CD", "0");
            body.put("ORD_DVSN", ordDvsn == null || ordDvsn.isBlank() ? ORD_DVSN_LIMIT : ordDvsn); // 00:지정가 / 34:LOC

            try {
                resp = http(b.getEnv()).post()
                        .uri("/uapi/overseas-stock/v1/trading/order")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("authorization", "Bearer " + token)
                        .header("appkey", b.getAppKey())
                        .header("appsecret", crypto.decrypt(b.getAppSecretEnc()))
                        .header("tr_id", trId)
                        // CRITICAL: Map 그대로 보내면 chunked encoding으로 전송되어 KIS GW가 EGW00202로 거부.
                        // byte[]로 직렬화하여 Content-Length를 명시한다.
                        .body(jsonBytes(body))
                        .retrieve()
                        .body(JsonNode.class);
            } catch (RestClientResponseException ex) {
                lastBody = ex.getResponseBodyAsString();
                throw new IllegalStateException("KIS 주문 거부: " + lastBody, ex);
            }

            String rtCd = resp == null ? "" : resp.path("rt_cd").asText("");
            String msgCd = resp == null ? "" : resp.path("msg_cd").asText("");
            // 성공 또는 라우팅 외 다른 비즈니스 에러면 종료
            if ("0".equals(rtCd) || !"EGW00202".equals(msgCd)) {
                if (!"0".equals(rtCd)) {
                    log.warn("[KIS] order non-zero rt_cd={} msg_cd={} msg={} ticker={} excg={}",
                            rtCd, msgCd, resp == null ? "" : resp.path("msg1").asText(""), ticker, excg);
                }
                break;
            }
            // EGW00202 → 다음 거래소 코드로 폴백
            log.warn("[KIS] EGW00202 GW routing failed ticker={} excg={} → trying next exchange", ticker, excg);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rt_cd", resp == null ? "" : resp.path("rt_cd").asText(""));
        out.put("msg_cd", resp == null ? "" : resp.path("msg_cd").asText(""));
        out.put("msg", resp == null ? "" : resp.path("msg1").asText(""));
        out.put("kis_order_no", resp == null ? "" : resp.path("output").path("ODNO").asText(""));
        out.put("kis_order_time", resp == null ? "" : resp.path("output").path("ORD_TMD").asText(""));
        out.put("ticker", ticker);
        out.put("side", side.name());
        out.put("qty", quantity);
        out.put("limit_price", limitPrice);
        return out;
    }

    // ───────────────────────────────────────────── 4. 미국주식 체결/주문 내역 조회

    /**
     * 당일 미체결 + 체결 통합 조회 (간이).
     * 정확한 일자 필터링이 필요하면 호출측에서 시작/종료일 옵션을 추가해 확장.
     */
    public JsonNode getTodayOrders(BrokerAccount b) {
        String token = getAccessToken(b);
        String trId = b.getEnv() == BrokerAccount.Env.REAL ? "TTTS3035R" : "VTTS3035R";
        return http(b.getEnv()).get()
                .uri(uriBuilder -> uriBuilder.path("/uapi/overseas-stock/v1/trading/inquire-nccs")
                        .queryParam("CANO", b.getCano())
                        .queryParam("ACNT_PRDT_CD", b.getAcntPrdtCd())
                        .queryParam("OVRS_EXCG_CD", "NASD")
                        .queryParam("SORT_SQN", "DS")
                        .queryParam("CTX_AREA_FK200", "")
                        .queryParam("CTX_AREA_NK200", "")
                        .build())
                .header("authorization", "Bearer " + token)
                .header("appkey", b.getAppKey())
                .header("appsecret", crypto.decrypt(b.getAppSecretEnc()))
                .header("tr_id", trId)
                .retrieve()
                .body(JsonNode.class);
    }

    // ───────────────────────────────────────────── 5. 해외주식 현재가 조회 (인증 불필요한 시세 API)

    /**
     * 미국주식 현재가 + 등락률 조회.
     * tr_id: HHDFS00000300 (모의/실전 동일)
     * 거래소 코드는 시세용 3자리(NAS/NYS/AMS) 사용.
     *
     * 응답 정규화: { ticker, last_price, change_rate_pct, volume, raw_rt_cd }
     */
    public Map<String, Object> getOverseasQuote(BrokerAccount b, String ticker) {
        String token = getAccessToken(b);
        JsonNode resp = http(b.getEnv()).get()
                .uri(uriBuilder -> uriBuilder.path("/uapi/overseas-price/v1/quotations/price")
                        .queryParam("AUTH", "")
                        .queryParam("EXCD", quoteExchangeOf(ticker))
                        .queryParam("SYMB", ticker)
                        .build())
                .header("authorization", "Bearer " + token)
                .header("appkey", b.getAppKey())
                .header("appsecret", crypto.decrypt(b.getAppSecretEnc()))
                .header("tr_id", "HHDFS00000300")
                .retrieve()
                .body(JsonNode.class);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ticker", ticker.toUpperCase());
        out.put("exchange", quoteExchangeOf(ticker));
        if (resp == null) { out.put("last_price", 0.0); return out; }
        JsonNode o = resp.path("output");
        out.put("last_price", o.path("last").asDouble(0));
        out.put("change_rate_pct", o.path("rate").asDouble(0));
        out.put("volume", o.path("tvol").asLong(0));
        out.put("raw_rt_cd", resp.path("rt_cd").asText(""));
        out.put("raw_msg", resp.path("msg1").asText(""));
        return out;
    }

    // ───────────────────────────────────────────── 6. 실시간 체결통보 WebSocket 접속키

    /**
     * KIS 실시간(체결통보 / 호가 / 체결가) WebSocket 접속용 approval_key 발급.
     * 운영에서 WebSocket 클라이언트(Spring WebFlux 등)가 이 키를 받아 wss://ops.koreainvestment.com:21000 에 연결.
     */
    public String getWsApprovalKey(BrokerAccount b) {
        String appSecret = crypto.decrypt(b.getAppSecretEnc());
        Map<String, String> body = new LinkedHashMap<>();
        body.put("grant_type", "client_credentials");
        body.put("appkey", b.getAppKey());
        body.put("secretkey", appSecret); // WebSocket 발급은 secretkey (REST 토큰의 appsecret과 키 이름 다름)

        // getAccessToken 과 동일: KIS GW 의 기본 Java UA 필터(403 EGW00002) 회피 위해 HttpURLConnection + 브라우저 UA.
        String url = host(b.getEnv()) + "/oauth2/Approval";
        try {
            byte[] payload = jsonBytes(body);
            HttpURLConnection conn = (HttpURLConnection) new URI(url).toURL().openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(15_000);
            conn.setUseCaches(false);
            conn.setInstanceFollowRedirects(false);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "text/plain");
            conn.setRequestProperty("charset", "UTF-8");
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 alpha-helix/1.0");
            conn.setFixedLengthStreamingMode(payload.length);
            try (OutputStream os = conn.getOutputStream()) { os.write(payload); os.flush(); }
            int status = conn.getResponseCode();
            InputStream is = (status >= 200 && status < 300) ? conn.getInputStream() : conn.getErrorStream();
            String respBody = "";
            if (is != null) {
                try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                    respBody = sb.toString();
                }
            }
            if (status < 200 || status >= 300) {
                throw new IllegalStateException("KIS approval_key 발급 실패: " + status + " " + respBody);
            }
            JsonNode resp = om.readTree(respBody);
            if (resp == null || !resp.hasNonNull("approval_key")) {
                throw new IllegalStateException("KIS WebSocket approval_key 응답이 비정상: " + respBody);
            }
            return resp.get("approval_key").asText();
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("KIS approval_key 요청 실패: " + e.getMessage(), e);
        }
    }
}
