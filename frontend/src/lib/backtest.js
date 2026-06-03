// Alpha-Helix · 무한매수법(LOC) + VR 밸류 리밸런싱 백테스트 엔진
// 입력: STRATEGY_SPECS의 단일 spec + fetchDailyOHLC가 반환한 일봉 배열
// 출력: { equityCurve, trades, metrics{cagrPct, mddPct, totalReturnPct, winRate}, todaySignal }

import { fetchDailyOHLC } from "./marketData";
import { STRATEGY_SPECS, USD_KRW_AT_START, computeTrustScore } from "../mock/strategies";

// ---------------------------------------------------------------------------
// 공용 메트릭
// ---------------------------------------------------------------------------
function calcMetrics(equityCurve, principalUSD, sellTrades) {
  if (!equityCurve.length) return { cagrPct: 0, mddPct: 0, totalReturnPct: 0, winRate: 0 };
  const start = equityCurve[0];
  const end = equityCurve[equityCurve.length - 1];
  const totalReturnPct = ((end.equity - principalUSD) / principalUSD) * 100;
  const days = (new Date(end.date) - new Date(start.date)) / (1000 * 60 * 60 * 24);
  const years = Math.max(days / 365.25, 0.01);
  const cagrPct = (Math.pow(end.equity / principalUSD, 1 / years) - 1) * 100;
  // MDD
  let peak = -Infinity;
  let mdd = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = (p.equity - peak) / peak * 100;
    if (dd < mdd) mdd = dd;
  }
  const wins = sellTrades.filter(t => t.pnl > 0).length;
  const winRate = sellTrades.length > 0 ? wins / sellTrades.length : 0.5;
  return { cagrPct, mddPct: mdd, totalReturnPct, winRate };
}

// ---------------------------------------------------------------------------
// 전략 1·2: 무한매수법 (LOC)
// 규칙 요약:
//   - 원금 / splits = 하루 매수시도액 (USD)
//   - 첫날: 시가에 firstBuyShares 매수
//   - 이후 매일:
//       종가 ≤ 평단가  → LOC 평단매수 + LOC 큰수매수 모두 체결 (1회차 전부)
//       평단 < 종가 ≤ 평단×(1+locUpperPct/100) → LOC 큰수매수만 0.5회차 체결
//       종가 > 평단×(1+locUpperPct/100) → 미체결
//     단, 매수는 보유한 cash 한도 내에서만.
//   - 매도: 매일 평단×(1+sellTargetPct/100) 지정가 매도. 당일 high가 그 가격 이상이면 전량 매도 → 평단 0, 보유 0으로 리셋.
// ---------------------------------------------------------------------------
export function runInfiniteBuyBacktest(spec, ohlc) {
  const principalUSD = spec.principalKRW / USD_KRW_AT_START;
  const dailyBudget = principalUSD / spec.params.splits;

  let cash = principalUSD;
  let shares = 0;
  let totalCost = 0;       // 총 매입금 (평단 계산용)
  const trades = [];
  const equityCurve = [];
  const sellPnLs = [];     // 매도 사이클 PnL%

  for (let i = 0; i < ohlc.length; i++) {
    const bar = ohlc[i];
    const avg = shares > 0 ? totalCost / shares : 0;

    // 1) 매도 체크 (장중 high ≥ 평단 +sellTargetPct)
    if (shares > 0 && avg > 0) {
      const sellPx = avg * (1 + spec.params.sellTargetPct / 100);
      if (bar.high >= sellPx) {
        const proceeds = shares * sellPx;
        const pnl = proceeds - totalCost;
        const pnlPct = (pnl / totalCost) * 100;
        sellPnLs.push({ pnl, pnlPct });
        trades.push({ date: bar.date, side: "SELL", price: sellPx, shares, pnl });
        cash += proceeds;
        shares = 0;
        totalCost = 0;
      }
    }

    // 2) 매수
    if (i === 0) {
      // 첫 매수: 시가에 firstBuyShares
      const px = bar.open || bar.close;
      const qty = spec.params.firstBuyShares;
      const cost = qty * px;
      if (cash >= cost) {
        cash -= cost;
        shares += qty;
        totalCost += cost;
        trades.push({ date: bar.date, side: "BUY", price: px, shares: qty, kind: "FIRST" });
      }
    } else if (cash >= dailyBudget * 0.05) {
      // LOC 매수 시뮬레이션 — 종가 기준
      const newAvg = shares > 0 ? totalCost / shares : bar.close;
      const upperLOC = newAvg * (1 + spec.params.locUpperPct / 100);
      const halfBudget = dailyBudget / 2;
      let bought = 0;
      let cost = 0;

      if (bar.close <= newAvg) {
        // 평단 매수 (절반) + 큰수 매수 (절반) 둘 다 체결
        const qty = Math.floor(dailyBudget / bar.close);
        if (qty > 0 && cash >= qty * bar.close) {
          bought += qty; cost += qty * bar.close;
        }
      } else if (bar.close <= upperLOC) {
        // 큰수 매수만 절반 체결
        const qty = Math.floor(halfBudget / bar.close);
        if (qty > 0 && cash >= qty * bar.close) {
          bought += qty; cost += qty * bar.close;
        }
      }

      if (bought > 0) {
        cash -= cost;
        shares += bought;
        totalCost += cost;
        trades.push({ date: bar.date, side: "BUY", price: bar.close, shares: bought, kind: "LOC" });
      }
    }

    const equity = cash + shares * bar.close;
    equityCurve.push({ date: bar.date, equity, price: bar.close, shares, avg: shares > 0 ? totalCost / shares : 0, cash });
  }

  const metrics = calcMetrics(equityCurve, principalUSD, sellPnLs.map(s => ({ pnl: s.pnl })));
  const last = ohlc[ohlc.length - 1];
  const lastAvg = shares > 0 ? totalCost / shares : 0;
  const todaySignal = _infiniteBuySignal(spec, last, lastAvg, cash, dailyBudget);

  return {
    spec, principalUSD, equityCurve, trades, metrics,
    state: { cash, shares, avg: lastAvg },
    todaySignal,
  };
}

function _infiniteBuySignal(spec, lastBar, avg, cash, dailyBudget) {
  if (!lastBar) return null;
  if (avg === 0) {
    return {
      signal: "BUY",
      title: `${spec.ticker} 사이클 시작`,
      summary: `직전 사이클 +${spec.params.sellTargetPct}% 익절 후 리셋. 오늘 시초 1주로 새 사이클을 연다.`,
      action: `시장가 또는 LOC로 ${spec.params.firstBuyShares}주 첫 매수`,
    };
  }
  const sellPx = avg * (1 + spec.params.sellTargetPct / 100);
  const upperLOC = avg * (1 + spec.params.locUpperPct / 100);
  if (lastBar.close >= sellPx) {
    return {
      signal: "PAUSE",
      title: `${spec.ticker} 익절 도달`,
      summary: `평단 $${avg.toFixed(2)} 대비 ${spec.params.sellTargetPct}% 위($${sellPx.toFixed(2)})를 종가가 돌파. 익절 체결 후 사이클 리셋 예정.`,
      action: `잔여 LOC 큰수매수 체결 여부 확인 후 평단 재계산`,
    };
  }
  if (lastBar.close <= avg) {
    return {
      signal: "HOLD",
      title: `${spec.ticker} 평단 이하 — 1회차 풀매수`,
      summary: `종가 $${lastBar.close.toFixed(2)} ≤ 평단 $${avg.toFixed(2)}. 오늘은 LOC 평단/큰수 둘 다 체결되어 1회차 전부 매수.`,
      action: `LOC 평단 $${avg.toFixed(2)} ½ + LOC 큰수 $${upperLOC.toFixed(2)} ½ 동시 주문 (예산 $${dailyBudget.toFixed(0)})`,
    };
  }
  return {
    signal: "WATCH",
    title: `${spec.ticker} 평단~상단 구간`,
    summary: `종가 $${lastBar.close.toFixed(2)}가 평단 $${avg.toFixed(2)}과 LOC 상단 $${upperLOC.toFixed(2)} 사이. LOC 큰수매수만 0.5회차 체결 가능.`,
    action: `LOC 큰수 $${upperLOC.toFixed(2)} ½ 매수 + 지정가 매도 $${sellPx.toFixed(2)} 유지`,
  };
}

// ---------------------------------------------------------------------------
// 전략 3: VR 밸류 리밸런싱
// 규칙 요약:
//   - 시작: 원금의 initialPoolPct만큼 Pool(현금), 나머지로 시초가 매수
//   - V값: 첫 V = 초기 매수금액. 매 rebalanceDays마다 V_next = V × (1+expectedReturn) + biweeklyContrib
//   - 밴드: [V_curr × (1-bandPct), V_next × (1+bandPct)]
//   - 평가금이 밴드 하단 미만 → Pool에서 꺼내 추가 매수 (밴드 안으로 복귀 목표)
//   - 평가금이 밴드 상단 초과 → 매도. 단 매도 후 Pool이 평가금×poolTargetPct 초과하면 그 한도까지만.
//   - 밴드 안 → 관망. biweeklyContrib는 Pool에 적립.
// ---------------------------------------------------------------------------
export function runValueRebalancingBacktest(spec, ohlc) {
  const principalUSD = spec.principalKRW / USD_KRW_AT_START;
  const p = spec.params;

  // 시작
  const firstBar = ohlc[0];
  let pool = principalUSD * p.initialPoolPct;
  let invested = principalUSD - pool;
  let shares = invested / (firstBar.open || firstBar.close);
  let totalCost = invested;
  let V = invested;                            // 첫 V값 = 초기 투자금 (USD)
  let V_next = V * (1 + p.expectedReturn) + (p.biweeklyContribKRW / USD_KRW_AT_START);
  let daysSinceRebalance = 0;
  const trades = [];
  const equityCurve = [];
  const sellPnLs = [];

  trades.push({ date: firstBar.date, side: "BUY", price: firstBar.open || firstBar.close, shares, kind: "INIT" });

  for (let i = 0; i < ohlc.length; i++) {
    const bar = ohlc[i];
    const px = bar.close;
    const portValue = shares * px;
    const lowerBand = V * (1 - p.bandPct);
    const upperBand = V_next * (1 + p.bandPct);

    // 리밸런싱 시점 여부
    const isRebalanceDay = daysSinceRebalance >= p.rebalanceDays;

    // 밴드 외 즉시 액션 (매일 체크 — 실전에서는 2주 주기지만 시그널은 매일 평가)
    if (portValue < lowerBand) {
      // 추가 매수: 평가금을 (V+V_next)/2 = 밴드 중심으로 끌어올림
      const target = (V + V_next) / 2;
      const need = target - portValue;
      const buy = Math.max(0, Math.min(need, pool));
      if (buy > px * 0.1) {
        const qty = buy / px;
        shares += qty;
        totalCost += qty * px;
        pool -= qty * px;
        trades.push({ date: bar.date, side: "BUY", price: px, shares: qty, kind: "VR-LOWER" });
      }
    } else if (portValue > upperBand) {
      // 매도: 평가금을 밴드 중심으로 낮춤
      const target = (V + V_next) / 2;
      const sellAmt = portValue - target;
      const proposedPool = pool + sellAmt;
      const newPort = portValue - sellAmt;
      const poolCap = newPort * p.poolTargetPct;
      const allowedPool = Math.min(proposedPool, pool + poolCap); // pool이 50%를 넘으면 제한
      const realSell = Math.max(0, allowedPool - pool);
      if (realSell > px * 0.1) {
        const qty = realSell / px;
        const proceeds = qty * px;
        const avg = totalCost / shares;
        const pnl = (px - avg) * qty;
        sellPnLs.push({ pnl });
        shares -= qty;
        totalCost -= avg * qty;
        pool += proceeds;
        trades.push({ date: bar.date, side: "SELL", price: px, shares: qty, kind: "VR-UPPER", pnl });
      }
    }

    // 2주 경과 시 V 갱신 + 추가 적립
    if (isRebalanceDay) {
      V = V_next;
      V_next = V * (1 + p.expectedReturn) + (p.biweeklyContribKRW / USD_KRW_AT_START);
      // 밴드 안이었으면 적립금이 Pool로 (이미 시뮬레이션상 Pool에 들어가 있음)
      pool += (p.biweeklyContribKRW / USD_KRW_AT_START);
      daysSinceRebalance = 0;
    } else {
      daysSinceRebalance += 1;
    }

    const equity = pool + shares * px;
    equityCurve.push({ date: bar.date, equity, price: px, shares, pool, V, V_next });
  }

  const metrics = calcMetrics(equityCurve, principalUSD, sellPnLs);
  const last = ohlc[ohlc.length - 1];
  const todaySignal = _vrSignal(spec, last, shares, pool, V, V_next, p);
  return {
    spec, principalUSD, equityCurve, trades, metrics,
    state: { pool, shares, V, V_next },
    todaySignal,
  };
}

function _vrSignal(spec, lastBar, shares, pool, V, V_next, p) {
  if (!lastBar) return null;
  const portValue = shares * lastBar.close;
  const lower = V * (1 - p.bandPct);
  const upper = V_next * (1 + p.bandPct);
  if (portValue < lower) {
    return {
      signal: "BUY",
      title: `${spec.ticker} 밴드 하단 이탈 — 추가 매수`,
      summary: `평가금 $${portValue.toFixed(0)}이 하단 $${lower.toFixed(0)} 미만. Pool $${pool.toFixed(0)}에서 꺼내 V값 ${V.toFixed(0)}~${V_next.toFixed(0)} 중심으로 복귀.`,
      action: `Pool에서 약 $${Math.min(pool, (V+V_next)/2 - portValue).toFixed(0)} 추가 매수`,
    };
  }
  if (portValue > upper) {
    return {
      signal: "PAUSE",
      title: `${spec.ticker} 밴드 상단 돌파 — 매도`,
      summary: `평가금 $${portValue.toFixed(0)}이 상단 $${upper.toFixed(0)} 초과. 중심선까지 매도하되 Pool 비중 ${(p.poolTargetPct*100).toFixed(0)}% 한도 적용.`,
      action: `약 $${(portValue - (V+V_next)/2).toFixed(0)} 매도 (Pool cap 확인)`,
    };
  }
  return {
    signal: "HOLD",
    title: `${spec.ticker} 밴드 안 — 관망`,
    summary: `평가금 $${portValue.toFixed(0)}이 [$${lower.toFixed(0)} ~ $${upper.toFixed(0)}] 범위 안. 추가 매수·매도 없음. (V=${V.toFixed(0)}, V'=${V_next.toFixed(0)})`,
    action: `2주 주기 도래 시 V값 갱신만 수행`,
  };
}

// ---------------------------------------------------------------------------
// Public: 전체 전략 일괄 실행
// ---------------------------------------------------------------------------
export async function runAllBacktests() {
  const results = [];
  for (const spec of STRATEGY_SPECS) {
    try {
      const ohlc = await fetchDailyOHLC(spec.ticker, spec.startDate);
      if (!ohlc || ohlc.length < 30) {
        results.push({ spec, error: "insufficient market data", metrics: null });
        continue;
      }
      const r = spec.method === "infiniteBuy"
        ? runInfiniteBuyBacktest(spec, ohlc)
        : runValueRebalancingBacktest(spec, ohlc);
      r.trustScore = computeTrustScore({
        cagrPct: r.metrics.cagrPct,
        mddPct: r.metrics.mddPct,
        winRate: r.metrics.winRate,
      });
      r.principalKRW = spec.principalKRW;
      r.equityKRW = r.equityCurve[r.equityCurve.length - 1].equity * USD_KRW_AT_START;
      r.returnPctKRW = (r.equityKRW - spec.principalKRW) / spec.principalKRW * 100;
      results.push(r);
    } catch (e) {
      console.warn(`[backtest] ${spec.id} failed:`, e?.message);
      results.push({ spec, error: e?.message || "backtest failed", metrics: null });
    }
  }
  return results;
}
