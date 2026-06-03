"""
무한매수법 (Infinite Buying Method) — 라오어식 분할매수 시뮬레이션.

핵심 규칙 (사용자 정의):
  - 원금 capital을 split(=40) 회차로 균등 분할 → daily_budget = capital / split
  - 매일 종가 기준으로:
      종가 <= 평단가          → daily_budget 전액으로 매수  (LOC 평단매수 1.0회)
      평단 < 종가 <= 평단*(1+loc_offset)  → daily_budget * 0.5 매수 (LOC 큰수매수 0.5회)
      그 외                    → 매수 없음
  - 보유 중 종가 >= 평단 * (1 + take_profit_pct/100)  → 전량 매도 + 사이클 리셋
  - 마지막 날 미청산 포지션은 mark-to-market

지원: 단일 티커 + 멀티 티커 (자본을 티커 수로 균등 분할).
출력: vbt_engine.run_backtest 결과와 호환되는 dict (stats, equity_curve, risk_metrics 등)
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd


@dataclass
class InfiniteBuyingParams:
    split: int = 40                  # 분할 횟수 (원금/40)
    take_profit_pct: float = 10.0    # 평단 대비 익절 트리거 (%)
    loc_offset_pct: float = 15.0     # 평단보다 비싸도 매수 허용 상한 (%)
    initial_capital: float = 10_000.0  # USD 기본값 (사용자가 KRW 환산 후 주입)
    fees: float = 0.0025  # 0.25% KIS 해외주식 실수수료
    slippage: float = 0.001  # 0.10% 슬리피지


@dataclass
class _AssetState:
    cash_alloc: float = 0.0          # 이 자산에 배정된 캐시 잔액
    qty: float = 0.0                 # 보유 수량
    cost_basis: float = 0.0          # 누적 매수 원가 (수수료 제외)
    avg_price: float = 0.0           # 평단가
    cycle_idx: int = 0               # 분할매수 회차 (split 도달 시 reset)
    cycle_budget: float = 0.0        # 현 사이클의 1회차 예산 (복리: 익절 후 재계산)
    realized_pnl: float = 0.0
    trades: list = field(default_factory=list)
    cycles_completed: int = 0


def _round(x, n=4):
    try:
        v = float(x)
        return None if (np.isnan(v) or np.isinf(v)) else round(v, n)
    except Exception:
        return None


def run_infinite_buying(
    closes: dict[str, pd.Series],
    p: InfiniteBuyingParams,
) -> dict:
    """
    closes: {ticker: pd.Series of daily close prices (DatetimeIndex)}.
            여러 티커일 경우 union index로 정렬 + ffill.
    """
    tickers = list(closes.keys())
    if not tickers:
        raise ValueError("at least one ticker required")

    df = pd.concat(
        {t: closes[t] for t in tickers},
        axis=1,
    ).sort_index().ffill().dropna(how="all")

    per_asset_capital = p.initial_capital / len(tickers)
    states: dict[str, _AssetState] = {
        t: _AssetState(cash_alloc=per_asset_capital, cycle_budget=per_asset_capital / p.split)
        for t in tickers
    }

    equity_history: list[tuple[pd.Timestamp, float]] = []

    for ts, row in df.iterrows():
        for t in tickers:
            price = row.get(t)
            if price is None or pd.isna(price) or price <= 0:
                continue
            s = states[t]
            budget = s.cycle_budget

            # 1) 익절 체크 (보유 중이고 평단 대비 +take_profit_pct 이상)
            if s.qty > 0 and s.avg_price > 0:
                trigger = s.avg_price * (1.0 + p.take_profit_pct / 100.0)
                if price >= trigger:
                    sell_price = price * (1.0 - p.slippage)
                    proceeds = s.qty * sell_price
                    fee = proceeds * p.fees
                    net = proceeds - fee
                    s.realized_pnl += net - s.cost_basis
                    s.cash_alloc += net
                    s.trades.append({
                        "date": str(ts.date()), "ticker": t, "side": "SELL",
                        "price": _round(sell_price), "qty": _round(s.qty, 6),
                        "amount": _round(net), "reason": "take_profit",
                    })
                    s.qty = 0.0
                    s.cost_basis = 0.0
                    s.avg_price = 0.0
                    s.cycle_idx = 0
                    s.cycles_completed += 1
                    # 복리: 익절 후 남은 현금 기준으로 1회차 예산 재계산
                    s.cycle_budget = s.cash_alloc / p.split if s.cash_alloc > 0 else s.cycle_budget
                    # 익절 후 사이클 리셋 → 같은 날 추가 매수 없이 다음 날부터 신규 사이클
                    continue

            # 2) 매수 결정
            if s.cycle_idx >= p.split:
                # 분할 한도 도달 + 미익절 → 추가 매수 중지 (자본 보존)
                continue

            buy_fraction = 0.0
            reason = ""
            if s.avg_price <= 0 or price <= s.avg_price:
                buy_fraction = 1.0
                reason = "loc_avg" if s.avg_price > 0 else "init_buy"
            elif price <= s.avg_price * (1.0 + p.loc_offset_pct / 100.0):
                buy_fraction = 0.5
                reason = "loc_large"
            else:
                continue

            amount = budget * buy_fraction
            if amount > s.cash_alloc:
                amount = s.cash_alloc
            if amount <= 0:
                continue

            buy_price = price * (1.0 + p.slippage)
            fee = amount * p.fees
            qty_bought = (amount - fee) / buy_price
            if qty_bought <= 0:
                continue

            new_cost = s.cost_basis + (amount - fee)
            new_qty = s.qty + qty_bought
            s.avg_price = new_cost / new_qty if new_qty > 0 else 0.0
            s.qty = new_qty
            s.cost_basis = new_cost
            s.cash_alloc -= amount
            s.cycle_idx += buy_fraction  # 0.5 또는 1.0
            s.trades.append({
                "date": str(ts.date()), "ticker": t, "side": "BUY",
                "price": _round(buy_price), "qty": _round(qty_bought, 6),
                "amount": _round(amount), "reason": reason,
                "avg_price_after": _round(s.avg_price),
                "cycle": _round(s.cycle_idx, 2),
            })

        # mark-to-market
        total_eq = 0.0
        for t in tickers:
            s = states[t]
            mv = s.qty * float(row.get(t, s.avg_price or 0))
            total_eq += s.cash_alloc + mv
        equity_history.append((ts, total_eq))

    eq_series = pd.Series([v for _, v in equity_history],
                          index=[d for d, _ in equity_history])
    daily_ret = eq_series.pct_change().fillna(0.0)

    total_return_pct = (eq_series.iloc[-1] / p.initial_capital - 1.0) * 100.0
    days = (eq_series.index[-1] - eq_series.index[0]).days or 1
    years = days / 365.25
    cagr_pct = (((eq_series.iloc[-1] / p.initial_capital) ** (1.0 / years) - 1.0) * 100.0
                if years > 0 and eq_series.iloc[-1] > 0 else 0.0)
    roll_max = eq_series.cummax()
    mdd_pct = ((eq_series / roll_max) - 1.0).min() * 100.0
    vol_annual = daily_ret.std() * np.sqrt(252) * 100.0
    sharpe = (daily_ret.mean() / daily_ret.std() * np.sqrt(252)
              if daily_ret.std() > 0 else 0.0)
    downside = daily_ret[daily_ret < 0].std()
    sortino = (daily_ret.mean() / downside * np.sqrt(252)
               if downside and downside > 0 else 0.0)
    win_rate = (daily_ret > 0).sum() / max(1, (daily_ret != 0).sum()) * 100.0

    total_trades = sum(len(s.trades) for s in states.values())
    completed_cycles = sum(s.cycles_completed for s in states.values())

    # 월 평균 실현 수익 (대시보드용 현금흐름 근사)
    realized_total = sum(s.realized_pnl for s in states.values())
    months = max(1.0, days / 30.4375)
    monthly_cashflow = realized_total / months

    # equity_curve downsample
    step = max(1, len(eq_series) // 365)
    eq_points = [
        {"date": str(d.date()), "value": _round(v)}
        for d, v in eq_series.iloc[::step].items()
    ]

    # 최근 거래 50건만
    all_trades = []
    for s in states.values():
        all_trades.extend(s.trades)
    all_trades.sort(key=lambda x: x["date"])
    recent_trades = all_trades[-50:]

    per_ticker_summary = {
        t: {
            "qty_open": _round(states[t].qty, 6),
            "avg_price": _round(states[t].avg_price),
            "cash_remaining": _round(states[t].cash_alloc),
            "cycles_completed": states[t].cycles_completed,
            "current_cycle_idx": _round(states[t].cycle_idx, 2),
            "realized_pnl": _round(states[t].realized_pnl),
            "trade_count": len(states[t].trades),
        }
        for t in tickers
    }

    return {
        "strategy": "infinite_buying",
        "tickers": tickers,
        "params": {
            "split": p.split,
            "take_profit_pct": p.take_profit_pct,
            "loc_offset_pct": p.loc_offset_pct,
            "initial_capital": p.initial_capital,
            "fees": p.fees,
            "slippage": p.slippage,
        },
        "stats": {
            "total_return_pct": _round(total_return_pct),
            "annualized_return_pct": _round(cagr_pct),
            "max_drawdown_pct": _round(mdd_pct),
            "sharpe": _round(sharpe),
            "sortino": _round(sortino),
            "win_rate_pct": _round(win_rate),
            "volatility_pct": _round(vol_annual),
            "trades": total_trades,
            "cycles_completed": completed_cycles,
            "start": str(eq_series.index[0].date()),
            "end": str(eq_series.index[-1].date()),
            "final_equity": _round(eq_series.iloc[-1]),
            "realized_pnl_total": _round(realized_total),
            "estimated_monthly_cashflow": _round(monthly_cashflow),
        },
        "per_ticker": per_ticker_summary,
        "equity_curve": eq_points,
        "recent_trades": recent_trades,
        "_strategy_returns": daily_ret,  # internal for QuantStats
    }


def latest_order_plan(
    closes: dict[str, pd.Series],
    p: InfiniteBuyingParams,
) -> dict:
    """
    Replay full history to get current state, then compute next-day order plan.
    Used by /alpha/.../queue-orders to push BUY/SELL recommendations into mock queue.
    """
    result = run_infinite_buying(closes, p)
    last_date = result["stats"]["end"]
    plans = []
    for t, summary in result["per_ticker"].items():
        last_close = float(closes[t].iloc[-1])
        avg = summary["avg_price"] or 0.0
        qty = summary["qty_open"] or 0.0
        budget = (p.initial_capital / len(closes)) / p.split
        side = None
        reason = ""
        price = last_close
        amount = 0.0

        if qty > 0 and avg > 0 and last_close >= avg * (1 + p.take_profit_pct / 100):
            side, reason = "SELL", "take_profit"
            amount = qty * last_close
        elif avg <= 0 or last_close <= avg:
            side, reason = "BUY", "loc_avg"
            amount = budget
        elif last_close <= avg * (1 + p.loc_offset_pct / 100):
            side, reason = "BUY", "loc_large"
            amount = budget * 0.5

        if side:
            plans.append({
                "ticker": t,
                "side": side,
                "order_type": "LOC",
                "price": _round(price),
                "amount": _round(amount),
                "qty": _round(amount / price if price > 0 else 0, 6) if side == "BUY" else _round(qty, 6),
                "reason": reason,
                "scheduled_for": last_date,
            })
    return {"as_of": last_date, "plans": plans, "summary": result["per_ticker"]}
