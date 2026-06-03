"""
QuantStats-based risk metrics on equity curve / returns.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

# QuantStats touches matplotlib at import — set non-interactive backend first
import matplotlib
matplotlib.use("Agg")
import quantstats as qs


def _f(x):
    try:
        v = float(x)
        return None if (np.isnan(v) or np.isinf(v)) else round(v, 4)
    except Exception:
        return None


def compute_metrics(returns: pd.Series, benchmark: pd.Series | None = None) -> dict:
    """
    `returns`: daily simple returns of strategy.
    `benchmark`: optional daily simple returns (e.g., SPY buy-and-hold).
    """
    returns = returns.dropna()
    if returns.empty:
        return {}

    out = {
        "cagr_pct": _f(qs.stats.cagr(returns) * 100),
        "sharpe": _f(qs.stats.sharpe(returns)),
        "sortino": _f(qs.stats.sortino(returns)),
        "calmar": _f(qs.stats.calmar(returns)),
        "max_drawdown_pct": _f(qs.stats.max_drawdown(returns) * 100),
        "volatility_pct": _f(qs.stats.volatility(returns) * 100),
        "win_rate_pct": _f(qs.stats.win_rate(returns) * 100),
        "best_day_pct": _f(qs.stats.best(returns) * 100),
        "worst_day_pct": _f(qs.stats.worst(returns) * 100),
        "var_95_pct": _f(qs.stats.value_at_risk(returns) * 100),
        "cvar_95_pct": _f(qs.stats.conditional_value_at_risk(returns) * 100),
    }
    if benchmark is not None and not benchmark.empty:
        try:
            out["alpha"] = _f(qs.stats.greeks(returns, benchmark).get("alpha"))
            out["beta"] = _f(qs.stats.greeks(returns, benchmark).get("beta"))
            out["information_ratio"] = _f(qs.stats.information_ratio(returns, benchmark))
        except Exception:
            pass
    return out
