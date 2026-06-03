package com.DevBridge.devbridge.domain.strategy.service.broker;

import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import com.DevBridge.devbridge.domain.strategy.entity.OrderProposal;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

/**
 * KIS(한국투자증권 해외주식) 어댑터 — 기존 {@link KisApiClient} 를 그대로 위임. KIS 로직 무수정.
 *
 * <p>주문 정수화(주식은 정수 수량), KIS rt_cd/msg_cd → 정규화 OrderResult,
 * inquire-nccs 미체결조회 휴리스틱 → 정규화 FillResult 로 변환한다.
 */
@Component
@RequiredArgsConstructor
public class KisBrokerAdapter implements Broker {

    private final KisApiClient kis;

    @Override
    public BrokerAccount.BrokerType type() {
        return BrokerAccount.BrokerType.KIS;
    }

    @Override
    public OrderResult placeOrder(BrokerAccount b, String symbol, Side side, BigDecimal qty, BigDecimal limitPrice, OrderType orderType) {
        try {
            KisApiClient.Side ks = side == Side.BUY ? KisApiClient.Side.BUY : KisApiClient.Side.SELL;
            long q = qty.setScale(0, RoundingMode.DOWN).longValue();   // 미국주식은 정수 수량
            Double lim = limitPrice == null ? null : limitPrice.doubleValue();
            // LOC=장마감지정가(34, 무한매수법 평단매수)는 REAL 전용 — KIS 모의투자는 00(지정가)만 지원(공식 docstring 명시).
            //   ⇒ MOCK 이거나 LIMIT/MARKET 이면 00, REAL+LOC 일 때만 34. (모의에서 34 전송 시 주문 거부)
            boolean realLoc = orderType == OrderType.LOC && b.getEnv() == BrokerAccount.Env.REAL;
            String ordDvsn = realLoc ? kis.locOrdDvsn() : KisApiClient.ORD_DVSN_LIMIT;
            // M4: KIS 미국주식은 단가 0(=limitPrice null) 이면 0원 지정가로 거부된다.
            //     시장가/LOC 의도라도 단가가 비면 현재가를 조회해 그 가격의 지정가로 변환(0원 전송 방지).
            if (lim == null) {
                try {
                    Map<String, Object> quote = kis.getOverseasQuote(b, symbol);
                    Object lp = quote.get("last_price");
                    double px = lp instanceof Number n ? n.doubleValue() : Double.parseDouble(String.valueOf(lp));
                    if (px > 0) lim = px;
                } catch (Exception ignore) { /* 아래에서 일괄 처리 */ }
                if (lim == null) {
                    return OrderResult.failure("NO_QUOTE",
                            "KIS 지정가 산정 실패: " + symbol + " 현재가를 조회할 수 없어 0원 지정가 전송을 막았습니다. 잠시 후 다시 시도하세요.");
                }
            }
            Map<String, Object> resp = kis.placeOverseasOrder(b, symbol, ks, q, lim, ordDvsn);
            String rtCd = String.valueOf(resp.getOrDefault("rt_cd", ""));
            if (!"0".equals(rtCd)) {
                String msgCd = String.valueOf(resp.getOrDefault("msg_cd", ""));
                String msg = String.valueOf(resp.getOrDefault("msg", ""));
                return OrderResult.failure(msgCd, friendlyKisError(msgCd, msg, b));
            }
            return OrderResult.success(String.valueOf(resp.getOrDefault("kis_order_no", "")), rtCd);
        } catch (Exception e) {
            return OrderResult.failure(null, e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
        }
    }

    @Override
    public FillResult queryFill(BrokerAccount b, OrderProposal p) {
        JsonNode resp;
        try {
            resp = kis.getTodayOrders(b);
        } catch (Exception e) {
            return FillResult.error("KIS 미체결조회 실패: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
        JsonNode output = resp == null ? null : resp.path("output");
        JsonNode match = null;
        if (output != null && output.isArray()) {
            for (JsonNode o : output) {
                if (p.getKisOrderNo().equals(o.path("odno").asText())) { match = o; break; }
            }
        }
        String fillStatus;
        int filledQty;
        if (match != null) {
            int orderQty = firstInt(match, "ft_ord_qty", "ord_qty", "ar_qty");
            int nccsQty = firstInt(match, "nccs_qty", "rmn_qty", "ord_psbl_qty");
            filledQty = Math.max(0, orderQty - nccsQty);
            fillStatus = filledQty > 0 ? "PARTIAL" : "OPEN";
        } else {
            // 미체결 목록에 없음 → 전량 체결(또는 취소). EXECUTED 수락 주문이므로 FILLED 로 간주.
            fillStatus = "FILLED";
            filledQty = p.getQty() == null ? 0 : p.getQty();
        }
        return FillResult.of(fillStatus, BigDecimal.valueOf(filledQty), null);
    }

    @Override
    public Map<String, Object> getBalance(BrokerAccount b) {
        return kis.getOverseasBalance(b);
    }

    @Override
    public Map<String, Object> getQuote(BrokerAccount b, String symbol) {
        return kis.getOverseasQuote(b, symbol);
    }

    /** KIS 응답에서 여러 후보 키 중 첫 정수값 추출 (필드명 방어적 파싱). */
    private static int firstInt(JsonNode n, String... keys) {
        for (String k : keys) {
            String s = n.path(k).asText("").trim();
            if (s.matches("-?\\d+")) return Integer.parseInt(s);
        }
        return 0;
    }

    /** KIS msg_cd → 사용자 친화 메시지. */
    private static String friendlyKisError(String msgCd, String msg, BrokerAccount ba) {
        String envLabel = ba != null && ba.getEnv() == BrokerAccount.Env.REAL ? "실전" : "모의";
        if ("EGW00202".equals(msgCd)) {
            return "KIS GW 라우팅 오류(EGW00202): 거래소 코드를 모두 시도했지만 라우팅이 실패했습니다. "
                    + "현재 " + envLabel + "계좌 기준 미국 정규장이 닫혀있거나, " + envLabel + "투자에서 거래 불가 종목일 수 있습니다.";
        }
        if ("EGW00201".equals(msgCd)) {
            return "KIS 초당 거래건수 초과(EGW00201): 잠시 후 다시 시도하세요.";
        }
        if ("EGW00105".equals(msgCd)) {
            return "KIS 인증 만료(EGW00105): 브로커 설정에서 토큰을 재발급하세요.";
        }
        return "KIS 주문 거부 (msg_cd=" + msgCd + "): " + msg;
    }
}
