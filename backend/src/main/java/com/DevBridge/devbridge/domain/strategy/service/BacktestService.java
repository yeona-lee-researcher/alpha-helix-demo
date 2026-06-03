package com.DevBridge.devbridge.domain.strategy.service;

import com.DevBridge.devbridge.domain.strategy.entity.Strategy;
import com.DevBridge.devbridge.domain.user.entity.*;
import com.DevBridge.devbridge.domain.client.entity.*;
import com.DevBridge.devbridge.domain.project.entity.*;
import com.DevBridge.devbridge.domain.chat.entity.*;
import com.DevBridge.devbridge.domain.notification.entity.*;
import com.DevBridge.devbridge.domain.payment.entity.*;
import com.DevBridge.devbridge.domain.strategy.entity.*;
import com.DevBridge.devbridge.domain.ai.entity.*;
import com.DevBridge.devbridge.domain.user.repository.*;
import com.DevBridge.devbridge.domain.client.repository.*;
import com.DevBridge.devbridge.domain.project.repository.*;
import com.DevBridge.devbridge.domain.chat.repository.*;
import com.DevBridge.devbridge.domain.notification.repository.*;
import com.DevBridge.devbridge.domain.payment.repository.*;
import com.DevBridge.devbridge.domain.strategy.repository.*;
import com.DevBridge.devbridge.domain.ai.repository.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 무한매수법(LOC) + VR 밸류 리밸런싱 백테스트 엔진.
 * Frontend lib/backtest.js의 알고리즘과 1:1 동일.
 *
 * 결과:
 *  - StrategyTrade rows (source=BACKTEST) 재생성
 *  - StrategyBacktestSummary 1건 upsert
 *  - 마지막 날의 StrategyState 1건 upsert
 *  - 마지막 날의 DailySignal 1건 upsert
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class BacktestService {

    private static final double USD_KRW = 1300.0; // TODO: 실시간 환율 API로 교체

    private final MarketDataService marketDataService;
    private final StrategyRepository strategyRepo;
    private final StrategyTradeRepository tradeRepo;
    private final StrategyStateRepository stateRepo;
    private final StrategyBacktestSummaryRepository summaryRepo;
    private final DailySignalRepository signalRepo;
    private final ObjectMapper om = new ObjectMapper();

    // ─────────────────────────────────────── public

    @Transactional
    public StrategyBacktestSummary runFor(Long strategyId) {
        Strategy s = strategyRepo.findById(strategyId).orElseThrow();
        return runFor(s);
    }

    @Transactional
    public StrategyBacktestSummary runFor(Strategy s) {
        var ohlc = marketDataService.getDaily(s.getTicker(), s.getStartDate());
        if (ohlc.size() < 30) {
            log.warn("[Backtest] {} insufficient OHLC ({} rows)", s.getCode(), ohlc.size());
            return null;
        }
        Result r = s.getMethod() == Strategy.Method.INFINITE_BUY
                ? runInfiniteBuy(s, ohlc)
                : runValueRebalancing(s, ohlc);

        // 1) trades 재생성 (백테스트 source만)
        tradeRepo.deleteByStrategyIdAndSource(s.getId(), StrategyTrade.Source.BACKTEST);
        tradeRepo.saveAll(r.trades);

        // 2) state upsert (마지막 날)
        var last = r.equityCurve.get(r.equityCurve.size() - 1);
        var stateOpt = stateRepo.findByStrategyIdAndAsOfDate(s.getId(), last.date);
        StrategyState st = stateOpt.orElseGet(() -> StrategyState.builder()
                .strategy(s).asOfDate(last.date).build());
        st.setCashUsd(bd(last.cash));
        st.setShares(bd(last.shares));
        st.setAvgPriceUsd(bd(last.avg));
        st.setTotalCostUsd(bd(last.totalCost));
        st.setPoolUsd(bd(last.pool));
        st.setVCurrentUsd(bd(last.vCurrent));
        st.setVNextUsd(bd(last.vNext));
        st.setEquityUsd(bd(last.equity));
        stateRepo.save(st);

        // 3) summary upsert
        var summary = summaryRepo.findByStrategyId(s.getId()).orElseGet(() -> StrategyBacktestSummary.builder()
                .strategy(s).build());
        summary.setAsOfDate(last.date);
        summary.setCagrPct(bd(r.metrics.cagrPct));
        summary.setMddPct(bd(r.metrics.mddPct));
        summary.setTotalReturnPct(bd(r.metrics.totalReturnPct));
        summary.setWinRate(bd(r.metrics.winRate));
        summary.setTrustScore(computeTrustScore(r.metrics));
        summary.setEquityUsd(bd(last.equity));
        summary.setEquityKrw(bd(last.equity * USD_KRW));
        summary.setTradesCount(r.trades.size());
        summaryRepo.save(summary);

        // 4) 오늘의 시그널 upsert
        if (r.signal != null) {
            var sigOpt = signalRepo.findByStrategyIdAndAsOfDate(s.getId(), last.date);
            DailySignal sig = sigOpt.orElseGet(() -> DailySignal.builder()
                    .strategy(s).asOfDate(last.date).build());
            sig.setSignal(r.signal.signal);
            sig.setTitle(r.signal.title);
            sig.setSummary(r.signal.summary);
            sig.setAction(r.signal.action);
            // 신규 시그널이면 deliveredAt은 null로 두고 알림 스케줄러가 발송
            signalRepo.save(sig);
        }

        return summary;
    }

    // ─────────────────────────────────────── 무한매수법

    private Result runInfiniteBuy(Strategy s, List<MarketOhlcDaily> ohlc) {
        Params p = parseParams(s.getParamsJson());
        boolean crypto = isCryptoTicker(s.getTicker()); // 크립토는 분수 수량(고가 코인이라 정수 floor 면 0주)
        double principalUsd = s.getPrincipalKrw() / USD_KRW;
        double dailyBudget = principalUsd / p.splits;
        double cash = principalUsd, shares = 0, totalCost = 0;
        var trades = new ArrayList<StrategyTrade>();
        var curve = new ArrayList<Point>();
        var sellPnLs = new ArrayList<Double>();

        for (int i = 0; i < ohlc.size(); i++) {
            var bar = ohlc.get(i);
            double close = bar.getClose().doubleValue();
            double high = bar.getHigh().doubleValue();
            double open = bar.getOpen().doubleValue();
            double avg = shares > 0 ? totalCost / shares : 0;

            // 1) 매도
            if (shares > 0 && avg > 0) {
                double sellPx = avg * (1 + p.sellTargetPct / 100.0);
                if (high >= sellPx) {
                    double proceeds = shares * sellPx;
                    double pnl = proceeds - totalCost;
                    sellPnLs.add(pnl);
                    trades.add(buildTrade(s, bar.getTradeDate(), StrategyTrade.Side.SELL,
                            StrategyTrade.Kind.SELL_TARGET, sellPx, shares, pnl));
                    cash += proceeds;
                    shares = 0; totalCost = 0;
                }
            }

            // 2) 매수
            if (i == 0) {
                double px = open > 0 ? open : close;
                double qty = crypto ? dailyBudget / px : p.firstBuyShares; // 크립토 첫 매수는 예산 기준 분수
                double cost = qty * px;
                if (qty > 0 && cash >= cost) {
                    cash -= cost; shares += qty; totalCost += cost;
                    trades.add(buildTrade(s, bar.getTradeDate(), StrategyTrade.Side.BUY,
                            StrategyTrade.Kind.FIRST, px, qty, null));
                }
            } else if (cash >= dailyBudget * 0.05) {
                double newAvg = shares > 0 ? totalCost / shares : close;
                double upperLOC = newAvg * (1 + p.locUpperPct / 100.0);
                double bought = 0, cost = 0;
                StrategyTrade.Kind kind = null;
                if (close <= newAvg) {
                    double qty = crypto ? dailyBudget / close : Math.floor(dailyBudget / close);
                    if (qty > 0 && cash >= qty * close) {
                        bought = qty; cost = qty * close; kind = StrategyTrade.Kind.LOC_AVG;
                    }
                } else if (close <= upperLOC) {
                    double qty = crypto ? (dailyBudget / 2.0) / close : Math.floor((dailyBudget / 2.0) / close);
                    if (qty > 0 && cash >= qty * close) {
                        bought = qty; cost = qty * close; kind = StrategyTrade.Kind.LOC_UPPER;
                    }
                }
                if (bought > 0) {
                    cash -= cost; shares += bought; totalCost += cost;
                    trades.add(buildTrade(s, bar.getTradeDate(), StrategyTrade.Side.BUY,
                            kind, close, bought, null));
                }
            }

            double equity = cash + shares * close;
            curve.add(new Point(bar.getTradeDate(), close, equity, cash, shares, shares > 0 ? totalCost / shares : 0,
                    totalCost, 0, 0, 0));
        }

        var metrics = calcMetrics(curve, principalUsd, sellPnLs);
        var sig = infiniteBuySignal(s, p, ohlc.get(ohlc.size() - 1), curve.get(curve.size() - 1).avg, dailyBudget);
        return new Result(trades, curve, metrics, sig);
    }

    private SignalOut infiniteBuySignal(Strategy s, Params p, MarketOhlcDaily last, double avg, double dailyBudget) {
        double close = last.getClose().doubleValue();
        if (avg == 0) {
            return new SignalOut(DailySignal.Signal.BUY,
                    s.getTicker() + " 사이클 시작",
                    "직전 사이클 +" + p.sellTargetPct + "% 익절 후 리셋. 오늘 시초 1주로 새 사이클을 연다.",
                    "시장가 또는 LOC로 " + p.firstBuyShares + "주 첫 매수");
        }
        double sellPx = avg * (1 + p.sellTargetPct / 100.0);
        double upperLOC = avg * (1 + p.locUpperPct / 100.0);
        if (close >= sellPx) {
            return new SignalOut(DailySignal.Signal.PAUSE,
                    s.getTicker() + " 익절 도달",
                    String.format("평단 $%.2f 대비 %d%% 위($%.2f)를 종가가 돌파. 익절 체결 후 사이클 리셋 예정.", avg, p.sellTargetPct, sellPx),
                    "잔여 LOC 큰수매수 체결 여부 확인 후 평단 재계산");
        }
        if (close <= avg) {
            return new SignalOut(DailySignal.Signal.HOLD,
                    s.getTicker() + " 평단 이하 — 1회차 풀매수",
                    String.format("종가 $%.2f ≤ 평단 $%.2f. 오늘은 LOC 평단/큰수 둘 다 체결되어 1회차 전부 매수.", close, avg),
                    String.format("LOC 평단 $%.2f ½ + LOC 큰수 $%.2f ½ 동시 주문 (예산 $%.0f)", avg, upperLOC, dailyBudget));
        }
        return new SignalOut(DailySignal.Signal.WATCH,
                s.getTicker() + " 평단~상단 구간",
                String.format("종가 $%.2f가 평단 $%.2f과 LOC 상단 $%.2f 사이. LOC 큰수매수만 0.5회차 체결 가능.", close, avg, upperLOC),
                String.format("LOC 큰수 $%.2f ½ 매수 + 지정가 매도 $%.2f 유지", upperLOC, sellPx));
    }

    // ─────────────────────────────────────── VR 밸류 리밸런싱

    private Result runValueRebalancing(Strategy s, List<MarketOhlcDaily> ohlc) {
        Params p = parseParams(s.getParamsJson());
        double principalUsd = s.getPrincipalKrw() / USD_KRW;
        var trades = new ArrayList<StrategyTrade>();
        var curve = new ArrayList<Point>();
        var sellPnLs = new ArrayList<Double>();

        var first = ohlc.get(0);
        double pool = principalUsd * p.initialPoolPct;
        double invested = principalUsd - pool;
        double startPx = first.getOpen().doubleValue() > 0 ? first.getOpen().doubleValue() : first.getClose().doubleValue();
        double shares = invested / startPx;
        double totalCost = invested;
        double V = invested;
        double VNext = V * (1 + p.expectedReturn) + (p.biweeklyContribKrw / USD_KRW);
        int days = 0;

        trades.add(buildTrade(s, first.getTradeDate(), StrategyTrade.Side.BUY, StrategyTrade.Kind.VR_INIT,
                startPx, shares, null));

        for (var bar : ohlc) {
            double px = bar.getClose().doubleValue();
            double portValue = shares * px;
            double lower = V * (1 - p.bandPct);
            double upper = VNext * (1 + p.bandPct);

            if (portValue < lower) {
                double target = (V + VNext) / 2.0;
                double need = target - portValue;
                double buy = Math.max(0, Math.min(need, pool));
                if (buy > px * 0.1) {
                    double qty = buy / px;
                    shares += qty; totalCost += qty * px; pool -= qty * px;
                    trades.add(buildTrade(s, bar.getTradeDate(), StrategyTrade.Side.BUY,
                            StrategyTrade.Kind.VR_LOWER, px, qty, null));
                }
            } else if (portValue > upper) {
                double target = (V + VNext) / 2.0;
                double sellAmt = portValue - target;
                double newPort = portValue - sellAmt;
                double poolCap = newPort * p.poolTargetPct;
                double allowedPool = Math.min(pool + sellAmt, pool + poolCap);
                double realSell = Math.max(0, allowedPool - pool);
                if (realSell > px * 0.1) {
                    double qty = realSell / px;
                    double proceeds = qty * px;
                    double avg = totalCost / shares;
                    double pnl = (px - avg) * qty;
                    sellPnLs.add(pnl);
                    shares -= qty; totalCost -= avg * qty; pool += proceeds;
                    trades.add(buildTrade(s, bar.getTradeDate(), StrategyTrade.Side.SELL,
                            StrategyTrade.Kind.VR_UPPER, px, qty, pnl));
                }
            }

            if (days >= p.rebalanceDays) {
                V = VNext;
                VNext = V * (1 + p.expectedReturn) + (p.biweeklyContribKrw / USD_KRW);
                pool += (p.biweeklyContribKrw / USD_KRW);
                days = 0;
            } else {
                days++;
            }

            double equity = pool + shares * px;
            curve.add(new Point(bar.getTradeDate(), px, equity, 0, shares, shares > 0 ? totalCost / shares : 0,
                    totalCost, pool, V, VNext));
        }

        var metrics = calcMetrics(curve, principalUsd, sellPnLs);
        var sig = vrSignal(s, p, ohlc.get(ohlc.size() - 1), shares, pool, V, VNext);
        return new Result(trades, curve, metrics, sig);
    }

    private SignalOut vrSignal(Strategy s, Params p, MarketOhlcDaily last, double shares, double pool, double V, double VNext) {
        double close = last.getClose().doubleValue();
        double portValue = shares * close;
        double lower = V * (1 - p.bandPct);
        double upper = VNext * (1 + p.bandPct);
        if (portValue < lower) {
            return new SignalOut(DailySignal.Signal.BUY,
                    s.getTicker() + " 밴드 하단 이탈 — 추가 매수",
                    String.format("평가금 $%.0f이 하단 $%.0f 미만. Pool $%.0f에서 꺼내 V값 %.0f~%.0f 중심으로 복귀.", portValue, lower, pool, V, VNext),
                    String.format("Pool에서 약 $%.0f 추가 매수", Math.min(pool, (V + VNext) / 2.0 - portValue)));
        }
        if (portValue > upper) {
            return new SignalOut(DailySignal.Signal.PAUSE,
                    s.getTicker() + " 밴드 상단 돌파 — 매도",
                    String.format("평가금 $%.0f이 상단 $%.0f 초과. 중심선까지 매도하되 Pool 비중 %d%% 한도 적용.", portValue, upper, (int)(p.poolTargetPct * 100)),
                    String.format("약 $%.0f 매도 (Pool cap 확인)", portValue - (V + VNext) / 2.0));
        }
        return new SignalOut(DailySignal.Signal.HOLD,
                s.getTicker() + " 밴드 안 — 관망",
                String.format("평가금 $%.0f이 [$%.0f ~ $%.0f] 범위 안. 추가 매수·매도 없음. (V=%.0f, V'=%.0f)", portValue, lower, upper, V, VNext),
                "2주 주기 도래 시 V값 갱신만 수행");
    }

    // ─────────────────────────────────────── 메트릭/유틸

    private Metrics calcMetrics(List<Point> curve, double principalUsd, List<Double> sellPnLs) {
        if (curve.isEmpty()) return new Metrics(0, 0, 0, 0.5);
        var start = curve.get(0);
        var end = curve.get(curve.size() - 1);
        double totalReturnPct = ((end.equity - principalUsd) / principalUsd) * 100;
        double days = (end.date.toEpochDay() - start.date.toEpochDay());
        double years = Math.max(days / 365.25, 0.01);
        double cagrPct = (Math.pow(end.equity / principalUsd, 1.0 / years) - 1) * 100;
        double peak = Double.NEGATIVE_INFINITY;
        double mdd = 0;
        for (var pnt : curve) {
            if (pnt.equity > peak) peak = pnt.equity;
            double dd = (pnt.equity - peak) / peak * 100;
            if (dd < mdd) mdd = dd;
        }
        long wins = sellPnLs.stream().filter(v -> v > 0).count();
        double winRate = !sellPnLs.isEmpty() ? (double) wins / sellPnLs.size() : 0.5;
        return new Metrics(cagrPct, mdd, totalReturnPct, winRate);
    }

    private int computeTrustScore(Metrics m) {
        double mddAbs = Math.abs(m.mddPct);
        double raw = 70 - mddAbs * 0.7 + m.cagrPct * 0.4 + (m.winRate - 0.5) * 30;
        return Math.max(0, Math.min(100, (int) Math.round(raw)));
    }

    private StrategyTrade buildTrade(Strategy s, LocalDate date, StrategyTrade.Side side,
                                     StrategyTrade.Kind kind, double price, double shares, Double pnl) {
        return StrategyTrade.builder()
                .strategy(s).tradeDate(date).side(side).kind(kind)
                .priceUsd(bd(price)).shares(bd(shares))
                .pnlUsd(pnl != null ? bd(pnl) : null)
                .source(StrategyTrade.Source.BACKTEST)
                .build();
    }

    private static BigDecimal bd(double v) {
        if (!Double.isFinite(v)) return BigDecimal.ZERO;
        return BigDecimal.valueOf(v).setScale(6, RoundingMode.HALF_UP);
    }

    /** 크립토 페어(…USDT) — 분수 수량으로 백테스트. */
    private static boolean isCryptoTicker(String ticker) {
        return ticker != null && ticker.toUpperCase().endsWith("USDT");
    }

    private Params parseParams(String json) {
        Params p = new Params();
        if (json == null || json.isBlank()) return p;
        try {
            JsonNode n = om.readTree(json);
            if (n.has("splits")) p.splits = n.get("splits").asInt(40);
            if (n.has("sellTargetPct")) p.sellTargetPct = n.get("sellTargetPct").asInt(10);
            if (n.has("locUpperPct")) p.locUpperPct = n.get("locUpperPct").asInt(12);
            if (n.has("firstBuyShares")) p.firstBuyShares = n.get("firstBuyShares").asInt(1);
            if (n.has("rebalanceDays")) p.rebalanceDays = n.get("rebalanceDays").asInt(10);
            if (n.has("expectedReturn")) p.expectedReturn = n.get("expectedReturn").asDouble(0.02);
            if (n.has("bandPct")) p.bandPct = n.get("bandPct").asDouble(0.20);
            if (n.has("poolTargetPct")) p.poolTargetPct = n.get("poolTargetPct").asDouble(0.50);
            if (n.has("biweeklyContribKrw")) p.biweeklyContribKrw = n.get("biweeklyContribKrw").asLong(0);
            if (n.has("initialPoolPct")) p.initialPoolPct = n.get("initialPoolPct").asDouble(0.50);
        } catch (Exception e) {
            log.warn("paramsJson parse failed: {}", e.getMessage());
        }
        return p;
    }

    private static class Params {
        int splits = 40, sellTargetPct = 10, locUpperPct = 12, firstBuyShares = 1, rebalanceDays = 10;
        double expectedReturn = 0.02, bandPct = 0.20, poolTargetPct = 0.50, initialPoolPct = 0.50;
        long biweeklyContribKrw = 0;
    }

    private record Point(LocalDate date, double price, double equity, double cash, double shares, double avg,
                         double totalCost, double pool, double vCurrent, double vNext) {}
    private record Metrics(double cagrPct, double mddPct, double totalReturnPct, double winRate) {}
    private record SignalOut(DailySignal.Signal signal, String title, String summary, String action) {}
    private record Result(List<StrategyTrade> trades, List<Point> equityCurve, Metrics metrics, SignalOut signal) {}
}
