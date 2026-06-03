package com.DevBridge.devbridge.domain.strategy.service.broker;

import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import com.DevBridge.devbridge.domain.strategy.entity.OrderProposal;

import java.math.BigDecimal;
import java.util.Map;

/**
 * 브로커 추상화 — KIS(해외주식)와 Binance(크립토 현물)를 하나의 주문/체결/잔고 계약으로 통일한다.
 *
 * <p>설계 의도: 기존 {@link KisApiClient}/{@link BinanceApiClient} 는 <b>전혀 수정하지 않고</b>
 * 얇은 어댑터({@link KisBrokerAdapter}, {@link BinanceBrokerAdapter})로 감싸,
 * {@link ProposalExecutionService}/{@link OrderFillService}/주문 컨트롤러가
 * {@link BrokerRouter} 를 통해 broker_type 으로만 분기하도록 한다.
 *
 * <p>심볼 표기: KIS 는 미국주식 ticker(SPY/AAPL), Binance 는 페어(BTCUSDT). 수량은 base 단위
 * (주식 정수 / 코인 분수). limitPrice == null 이면 시장가(MARKET).
 */
public interface Broker {

    BrokerAccount.BrokerType type();

    enum Side { BUY, SELL }

    /**
     * 주문 체결 타입.
     *  - LIMIT : 일반 지정가 (KIS ORD_DVSN=00) — 기존 기본
     *  - LOC   : 장마감지정가 (Limit On Close) — 무한매수법 LOC평단 매수에 사용 (KIS ORD_DVSN=34)
     *  - MARKET: 보통가/시장가 — KIS 미국은 시장가 미지원이라 어댑터가 현재가 지정가로 변환
     * 크립토(Binance)는 LOC 개념이 없어 LIMIT/MARKET 로만 처리한다.
     */
    enum OrderType { LIMIT, LOC, MARKET }

    /** 주문 결과(정규화). ok=false 면 {@code message} 가 사용자 친화 에러. */
    record OrderResult(boolean ok, String orderNo, String code, String message) {
        public static OrderResult success(String orderNo, String code) {
            return new OrderResult(true, orderNo, code, null);
        }
        public static OrderResult failure(String code, String message) {
            return new OrderResult(false, null, code, message);
        }
    }

    /** 체결 조회 결과(정규화). fillStatus ∈ {UNKNOWN,OPEN,PARTIAL,FILLED,CANCELLED}. */
    record FillResult(String fillStatus, BigDecimal filledQty, BigDecimal avgPrice, String error) {
        public static FillResult of(String fillStatus, BigDecimal filledQty, BigDecimal avgPrice) {
            return new FillResult(fillStatus, filledQty, avgPrice, null);
        }
        public static FillResult error(String error) {
            return new FillResult(null, null, null, error);
        }
    }

    /** 실제 주문 전송(주문타입 지정). 호출측이 모든 안전 게이트(kill-switch/한도/검증)를 먼저 통과시켜야 한다. */
    OrderResult placeOrder(BrokerAccount account, String symbol, Side side, BigDecimal qty, BigDecimal limitPrice, OrderType orderType);

    /** 하위호환: 주문타입 미지정 → LIMIT(지정가). */
    default OrderResult placeOrder(BrokerAccount account, String symbol, Side side, BigDecimal qty, BigDecimal limitPrice) {
        return placeOrder(account, symbol, side, qty, limitPrice, OrderType.LIMIT);
    }

    /** 이미 접수된 주문(proposal.kisOrderNo 에 저장된 브로커 주문번호)의 현재 체결 상태. */
    FillResult queryFill(BrokerAccount account, OrderProposal proposal);

    /**
     * 정규화 잔고 스냅샷(lastBalanceJson 으로 저장됨).
     * KIS 는 {@code total_market_value_usd} 키를 포함(손실 서킷브레이커가 사용),
     * Binance 현물은 미실현 손익 개념이 없어 해당 키가 없다.
     */
    Map<String, Object> getBalance(BrokerAccount account);

    /** 현재가. 반환 맵은 {@code last_price}(USD/USDT) 키를 포함한다. */
    Map<String, Object> getQuote(BrokerAccount account, String symbol);
}
