package com.DevBridge.devbridge.domain.strategy.service.broker;

import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import com.DevBridge.devbridge.domain.payment.service.CryptoService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Binance REST API 클라이언트 (Spring Boot 서버 측).
 *
 * - 스팟:   https://api.binance.com
 * - 선물:   https://fapi.binance.com
 * - 테스트넷: env=MOCK → https://testnet.binance.vision (스팟)
 *
 * 보안 규칙:
 *  - API Key는 X-MBX-APIKEY 헤더로만 전달 (URL 파라미터 금지)
 *  - Secret Key는 HMAC-SHA256 서명에만 사용, 절대 네트워크로 전송하지 않음
 *  - Private 엔드포인트는 timestamp + signature 파라미터 필수
 *  - BrokerAccount.tradingEnabled == true 확인은 호출 측(Controller) 책임
 *
 * 참고: https://developers.binance.com/docs/binance-spot-api-docs
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class BinanceApiClient {

    private static final String SPOT_HOST        = "https://api.binance.com";
    private static final String SPOT_TESTNET_HOST = "https://testnet.binance.vision";
    private static final String FUTURES_HOST     = "https://fapi.binance.com";

    private final CryptoService crypto;
    private final ObjectMapper  objectMapper = new ObjectMapper();

    /** 심볼별 거래소 필터(LOT_SIZE/PRICE_FILTER/NOTIONAL) 캐시. key = host|symbol. */
    private final Map<String, SymbolFilters> filterCache = new ConcurrentHashMap<>();

    // ── 인프라 ────────────────────────────────────────────────────────────────

    private RestClient client(String baseUrl) {
        return RestClient.builder()
                .baseUrl(baseUrl)
                .build();
    }

    private String spotHost(BrokerAccount b) {
        return b.getEnv() == BrokerAccount.Env.MOCK ? SPOT_TESTNET_HOST : SPOT_HOST;
    }

    private String futuresHost(BrokerAccount b) {
        // Binance 선물 테스트넷: https://testnet.binancefuture.com (별도 계정 필요)
        // 현재 MOCK env에서도 실제 fapi를 사용하되, 별도 테스트넷 계정이 있으면 환경변수로 분기 가능
        return FUTURES_HOST;
    }

    private String decryptSecret(BrokerAccount b) {
        return crypto.decrypt(b.getBinanceApiSecretEnc());
    }

    /**
     * rate-limit 백오프 래퍼. HTTP 429(요청한도)/418(IP 자동밴 경고) 시 Retry-After 를 존중해 재시도(최대 3회).
     * 이를 무시하고 계속 호출하면 IP 밴(418, 최대 3일)으로 번지므로 모든 Binance 호출은 이 래퍼를 통과한다.
     */
    private <T> T withBackoff(java.util.function.Supplier<T> op) {
        int attempts = 0;
        while (true) {
            try {
                return op.get();
            } catch (RestClientResponseException e) {
                int sc = e.getStatusCode().value();
                if ((sc == 429 || sc == 418) && attempts < 3) {
                    attempts++;
                    long waitSec = 1;
                    try {
                        String ra = e.getResponseHeaders() == null ? null
                                : e.getResponseHeaders().getFirst("Retry-After");
                        if (ra != null && !ra.isBlank()) waitSec = Math.max(1, Long.parseLong(ra.trim()));
                    } catch (Exception ignore) { }
                    waitSec = Math.min(waitSec, 10) * attempts; // 점증·상한
                    log.warn("[Binance] HTTP {} rate-limit — {}s 후 재시도 ({}/3)", sc, waitSec, attempts);
                    try {
                        Thread.sleep(waitSec * 1000L);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw e;
                    }
                    continue;
                }
                throw e;
            }
        }
    }

    // ── HMAC-SHA256 서명 ──────────────────────────────────────────────────────

    /**
     * Binance 서명: HMAC-SHA256(queryString, secretKey) → HEX
     */
    private String sign(String data, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] raw = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(raw);
        } catch (Exception e) {
            throw new RuntimeException("Binance sign failed", e);
        }
    }

    /** 파라미터 Map을 쿼리스트링으로 변환 (순서 보장 — LinkedHashMap 사용). */
    private String toQueryString(Map<String, Object> params) {
        var sb = new StringBuilder();
        params.forEach((k, v) -> {
            if (!sb.isEmpty()) sb.append('&');
            sb.append(k).append('=').append(v);
        });
        return sb.toString();
    }

    /** timestamp + signature가 추가된 쿼리스트링 반환. */
    private String signedQuery(Map<String, Object> params, String secret) {
        // timestamp는 항상 마지막 전에 삽입 (signature는 맨 마지막)
        params.put("timestamp", System.currentTimeMillis());
        String qs = toQueryString(params);
        return qs + "&signature=" + sign(qs, secret);
    }

    // ── Public 엔드포인트 ──────────────────────────────────────────────────────

    /** 서버 연결 테스트 (인증 불필요). */
    public boolean ping(BrokerAccount b) {
        try {
            client(spotHost(b)).get().uri("/api/v3/ping").retrieve().toBodilessEntity();
            return true;
        } catch (Exception e) {
            log.warn("Binance ping failed: {}", e.getMessage());
            return false;
        }
    }

    /**
     * 24시간 통계 (현재가, 변동률, 거래량).
     * @param symbol 예) BTCUSDT
     */
    public Map<String, Object> getTicker24h(BrokerAccount b, String symbol) {
        String json = client(spotHost(b)).get()
                .uri("/api/v3/ticker/24hr?symbol=" + symbol)
                .retrieve()
                .body(String.class);
        return parseMap(json);
    }

    /**
     * 오더북 조회.
     * @param depth 호가 건수 (5 | 10 | 20 | 50 | 100 | 500 | 1000)
     */
    public Map<String, Object> getOrderBook(BrokerAccount b, String symbol, int depth) {
        String json = client(spotHost(b)).get()
                .uri("/api/v3/depth?symbol=" + symbol + "&limit=" + depth)
                .retrieve()
                .body(String.class);
        return parseMap(json);
    }

    /**
     * 선물 펀딩레이트 조회 (최근 N건).
     */
    public List<Map<String, Object>> getFundingRate(BrokerAccount b, String symbol, int limit) {
        String json = client(futuresHost(b)).get()
                .uri("/fapi/v1/fundingRate?symbol=" + symbol + "&limit=" + limit)
                .retrieve()
                .body(String.class);
        return parseList(json);
    }

    // ── Private: 계정 조회 ─────────────────────────────────────────────────────

    /**
     * 스팟 계정 잔고 조회.
     * @return { "balances": [{"asset":"BTC","free":"0.001","locked":"0"},...], "totalUsdtValue": 1234.56 }
     */
    public Map<String, Object> getSpotBalance(BrokerAccount b) {
        String secret = decryptSecret(b);
        Map<String, Object> params = new LinkedHashMap<>();
        String qs = signedQuery(params, secret);

        String json = withBackoff(() -> client(spotHost(b)).get()
                .uri("/api/v3/account?" + qs)
                .header("X-MBX-APIKEY", b.getBinanceApiKey())
                .retrieve()
                .body(String.class));

        try {
            JsonNode root = objectMapper.readTree(json);
            List<Map<String, Object>> nonZero = new ArrayList<>();
            double totalUsdt = 0.0;
            for (JsonNode node : root.get("balances")) {
                double free = Double.parseDouble(node.get("free").asText("0"));
                double locked = Double.parseDouble(node.get("locked").asText("0"));
                if (free + locked > 1e-10) {
                    String asset = node.get("asset").asText();
                    nonZero.add(Map.of("asset", asset, "free", free, "locked", locked));
                    if ("USDT".equals(asset)) totalUsdt += free + locked;
                }
            }
            return Map.of(
                "balances", nonZero,
                "totalUsdtValue", totalUsdt,
                "accountType", root.path("accountType").asText("SPOT"),
                "canTrade", root.path("canTrade").asBoolean(false)
            );
        } catch (Exception e) {
            throw new RuntimeException("getSpotBalance parse failed: " + e.getMessage(), e);
        }
    }

    /**
     * 선물 계정 잔고 + 포지션 조회.
     */
    public Map<String, Object> getFuturesBalance(BrokerAccount b) {
        String secret = decryptSecret(b);
        Map<String, Object> params = new LinkedHashMap<>();
        String qs = signedQuery(params, secret);

        String json = client(futuresHost(b)).get()
                .uri("/fapi/v2/account?" + qs)
                .header("X-MBX-APIKEY", b.getBinanceApiKey())
                .retrieve()
                .body(String.class);

        try {
            JsonNode root = objectMapper.readTree(json);
            List<Map<String, Object>> openPositions = new ArrayList<>();
            if (root.has("positions")) {
                for (JsonNode pos : root.get("positions")) {
                    double amt = Double.parseDouble(pos.path("positionAmt").asText("0"));
                    if (Math.abs(amt) > 1e-10) {
                        openPositions.add(Map.of(
                            "symbol",       pos.path("symbol").asText(),
                            "positionAmt",  amt,
                            "entryPrice",   pos.path("entryPrice").asText("0"),
                            "unrealizedPnl",pos.path("unrealizedProfit").asText("0"),
                            "leverage",     pos.path("leverage").asText("1")
                        ));
                    }
                }
            }
            return Map.of(
                "totalWalletBalance",     root.path("totalWalletBalance").asDouble(0),
                "totalUnrealizedProfit",  root.path("totalUnrealizedProfit").asDouble(0),
                "availableBalance",       root.path("availableBalance").asDouble(0),
                "openPositions",          openPositions
            );
        } catch (Exception e) {
            throw new RuntimeException("getFuturesBalance parse failed: " + e.getMessage(), e);
        }
    }

    // ── Private: 주문 ─────────────────────────────────────────────────────────

    /**
     * 스팟 주문.
     *
     * @param symbol   예) BTCUSDT
     * @param side     BUY | SELL
     * @param type     MARKET | LIMIT
     * @param qty      수량 (MARKET BUY는 quoteOrderQty가 더 일반적이나 여기서는 qty 통일)
     * @param price    LIMIT 주문 가격 (MARKET 무시)
     */
    public Map<String, Object> placeSpotOrder(
            BrokerAccount b, String symbol, String side, String type, String qty, String price) {
        String secret = decryptSecret(b);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("symbol", symbol);
        params.put("side", side);
        params.put("type", type);
        params.put("quantity", qty);
        if ("LIMIT".equalsIgnoreCase(type)) {
            params.put("timeInForce", "GTC");
            params.put("price", price);
        }
        String qs = signedQuery(params, secret);

        try {
            String json = withBackoff(() -> client(spotHost(b)).post()
                    .uri("/api/v3/order")
                    .header("X-MBX-APIKEY", b.getBinanceApiKey())
                    .contentType(org.springframework.http.MediaType.APPLICATION_FORM_URLENCODED)
                    .body(qs)
                    .retrieve()
                    .body(String.class));
            return parseMap(json);
        } catch (RestClientResponseException e) {
            String msg = e.getResponseBodyAsString();
            log.warn("Binance spot order failed {}: {}", symbol, msg);
            throw new RuntimeException("Binance spot order failed: " + msg, e);
        }
    }

    /**
     * 선물 주문 (USDT-M 영구 선물).
     *
     * @param reduceOnly 청산 전용 주문 여부
     */
    public Map<String, Object> placeFuturesOrder(
            BrokerAccount b, String symbol, String side, String type,
            String qty, String price, boolean reduceOnly) {
        String secret = decryptSecret(b);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("symbol", symbol);
        params.put("side", side);
        params.put("type", type);
        params.put("quantity", qty);
        if ("LIMIT".equalsIgnoreCase(type)) {
            params.put("timeInForce", "GTC");
            params.put("price", price);
        }
        if (reduceOnly) params.put("reduceOnly", "true");
        String qs = signedQuery(params, secret);

        try {
            String json = client(futuresHost(b)).post()
                    .uri("/fapi/v1/order")
                    .header("X-MBX-APIKEY", b.getBinanceApiKey())
                    .contentType(org.springframework.http.MediaType.APPLICATION_FORM_URLENCODED)
                    .body(qs)
                    .retrieve()
                    .body(String.class);
            return parseMap(json);
        } catch (RestClientResponseException e) {
            String msg = e.getResponseBodyAsString();
            log.warn("Binance futures order failed {}: {}", symbol, msg);
            throw new RuntimeException("Binance futures order failed: " + msg, e);
        }
    }

    /**
     * 선물 레버리지 설정 (1x ~ 125x).
     */
    public Map<String, Object> setLeverage(BrokerAccount b, String symbol, int leverage) {
        String secret = decryptSecret(b);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("symbol", symbol);
        params.put("leverage", leverage);
        String qs = signedQuery(params, secret);

        String json = client(futuresHost(b)).post()
                .uri("/fapi/v1/leverage")
                .header("X-MBX-APIKEY", b.getBinanceApiKey())
                .contentType(org.springframework.http.MediaType.APPLICATION_FORM_URLENCODED)
                .body(qs)
                .retrieve()
                .body(String.class);
        return parseMap(json);
    }

    /**
     * 미체결 주문 취소 (스팟).
     */
    public Map<String, Object> cancelSpotOrder(BrokerAccount b, String symbol, long orderId) {
        String secret = decryptSecret(b);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("symbol", symbol);
        params.put("orderId", orderId);
        String qs = signedQuery(params, secret);

        String json = client(spotHost(b)).delete()
                .uri("/api/v3/order?" + qs)
                .header("X-MBX-APIKEY", b.getBinanceApiKey())
                .retrieve()
                .body(String.class);
        return parseMap(json);
    }

    // ── Private: 주문 조회 / 현재가 / 거래소 필터 (Broker 어댑터용) ───────────────

    /** 현재가 조회 (public). @return { "symbol":..., "last_price": double } */
    public Map<String, Object> getSpotPrice(BrokerAccount b, String symbol) {
        BigDecimal price = getSpotPriceValue(b, symbol);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("symbol", symbol);
        out.put("last_price", price.doubleValue());
        return out;
    }

    /** 현재가 BigDecimal (명목가 검증용). */
    public BigDecimal getSpotPriceValue(BrokerAccount b, String symbol) {
        String json = withBackoff(() -> client(spotHost(b)).get()
                .uri("/api/v3/ticker/price?symbol=" + symbol)
                .retrieve()
                .body(String.class));
        Map<String, Object> raw = parseMap(json);
        return new BigDecimal(String.valueOf(raw.getOrDefault("price", "0")));
    }

    /** 단일 스팟 주문 상태 조회 (signed). @return Binance order JSON (status/executedQty/cummulativeQuoteQty 등). */
    public Map<String, Object> querySpotOrder(BrokerAccount b, String symbol, long orderId) {
        String secret = decryptSecret(b);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("symbol", symbol);
        params.put("orderId", orderId);
        String qs = signedQuery(params, secret);

        String json = withBackoff(() -> client(spotHost(b)).get()
                .uri("/api/v3/order?" + qs)
                .header("X-MBX-APIKEY", b.getBinanceApiKey())
                .retrieve()
                .body(String.class));
        return parseMap(json);
    }

    /** exchangeInfo 의 LOT_SIZE/PRICE_FILTER/NOTIONAL 필터 (심볼별 캐시). 수량/가격 절삭·명목가 검증에 사용. */
    public SymbolFilters getSymbolFilters(BrokerAccount b, String symbol) {
        String key = spotHost(b) + "|" + symbol;
        SymbolFilters cached = filterCache.get(key);
        if (cached != null) return cached;

        String json = client(spotHost(b)).get()
                .uri("/api/v3/exchangeInfo?symbol=" + symbol)
                .retrieve()
                .body(String.class);
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode sym = root.path("symbols").path(0);
            BigDecimal stepSize = null, tickSize = null, minQty = null, minNotional = null;
            for (JsonNode flt : sym.path("filters")) {
                String t = flt.path("filterType").asText("");
                switch (t) {
                    case "LOT_SIZE" -> { stepSize = bd(flt, "stepSize"); minQty = bd(flt, "minQty"); }
                    case "PRICE_FILTER" -> tickSize = bd(flt, "tickSize");
                    case "NOTIONAL" -> minNotional = bd(flt, "minNotional");
                    case "MIN_NOTIONAL" -> { if (minNotional == null) minNotional = bd(flt, "minNotional"); }
                    default -> { }
                }
            }
            SymbolFilters f = new SymbolFilters(stepSize, tickSize, minQty, minNotional);
            filterCache.put(key, f);
            return f;
        } catch (Exception e) {
            throw new RuntimeException("exchangeInfo parse failed for " + symbol + ": " + e.getMessage(), e);
        }
    }

    private static BigDecimal bd(JsonNode n, String field) {
        String s = n.path(field).asText("");
        try { return s.isBlank() ? null : new BigDecimal(s); } catch (Exception e) { return null; }
    }

    /**
     * 심볼 거래소 필터. 크립토 수량/가격은 stepSize/tickSize 배수여야 하고 명목가는 minNotional 이상이어야 한다.
     * 부동소수 반올림으로 인한 거부를 막기 위해 항상 BigDecimal 로 내림 절삭한다.
     */
    public record SymbolFilters(BigDecimal stepSize, BigDecimal tickSize, BigDecimal minQty, BigDecimal minNotional) {
        /** 수량을 stepSize 배수로 내림. */
        public BigDecimal truncateQty(BigDecimal qty) {
            if (qty == null) return BigDecimal.ZERO;
            if (stepSize == null || stepSize.signum() == 0) return qty;
            BigDecimal floored = qty.subtract(qty.remainder(stepSize));
            int scale = Math.max(0, stepSize.stripTrailingZeros().scale());
            return floored.setScale(scale, RoundingMode.DOWN);
        }
        /** 가격을 tickSize 배수로 내림. */
        public BigDecimal truncatePrice(BigDecimal price) {
            if (price == null) return null;
            if (tickSize == null || tickSize.signum() == 0) return price;
            BigDecimal floored = price.subtract(price.remainder(tickSize));
            int scale = Math.max(0, tickSize.stripTrailingZeros().scale());
            return floored.setScale(scale, RoundingMode.DOWN);
        }
    }

    /** Binance 원본 에러 메시지 → 사용자 친화 문구 (오류코드 기반). */
    public static String friendlyError(String raw) {
        if (raw == null) return "Binance API 오류";
        if (raw.contains("-2014") || raw.contains("API-key format invalid"))
            return "Binance API Key 형식이 올바르지 않습니다. 발급된 API Key를 다시 확인해 주세요.";
        if (raw.contains("-1100") || raw.contains("Illegal characters"))
            return "파라미터에 허용되지 않는 문자가 포함되어 있습니다.";
        if (raw.contains("-1121") || raw.contains("Invalid symbol"))
            return "유효하지 않은 심볼입니다. (예: BTCUSDT)";
        if (raw.contains("-2015") || raw.contains("Invalid API-key"))
            return "Binance API Key가 유효하지 않거나 만료되었습니다. API 권한(읽기/거래)을 확인해 주세요.";
        if (raw.contains("-1022") || raw.contains("Signature"))
            return "서명 검증 실패 — API Secret가 올바르지 않거나 시스템 시각이 맞지 않습니다.";
        if (raw.contains("-1021"))
            return "타임스탬프 오류(-1021) — 서버와 시스템 시각 차이가 큽니다. 시계를 동기화해 주세요.";
        if (raw.contains("-2010") || raw.contains("insufficient balance") || raw.contains("insufficient"))
            return "잔고가 부족합니다.";
        if (raw.contains("-1013") || raw.contains("LOT_SIZE") || raw.contains("MIN_NOTIONAL") || raw.contains("PRICE_FILTER"))
            return "주문 수량/가격이 거래소 필터(LOT_SIZE/MIN_NOTIONAL/PRICE_FILTER) 조건을 만족하지 않습니다.";
        return "Binance API 오류: " + (raw.length() > 200 ? raw.substring(0, 200) + "..." : raw);
    }

    // ── 내부 유틸 ─────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseMap(String json) {
        try {
            return objectMapper.readValue(json, Map.class);
        } catch (Exception e) {
            throw new RuntimeException("Binance response parse failed: " + json, e);
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseList(String json) {
        try {
            return objectMapper.readValue(json, List.class);
        } catch (Exception e) {
            throw new RuntimeException("Binance response parse failed: " + json, e);
        }
    }
}
