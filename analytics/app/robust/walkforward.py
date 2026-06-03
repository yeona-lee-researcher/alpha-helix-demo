"""
Rolling out-of-sample (OOS) validation.

⚠️ 주의: 이름은 "walk-forward" 지만 파라미터 재최적화(re-optimization)는 하지 않는다.
`train_window` 는 각 폴드에서 건너뛰는 워밍업/오프셋 구간일 뿐이며, 실제 백테스트는
test 구간에만 동일한 고정 파라미터로 실행된다. 즉 "시간대별 OOS 일관성"을 측정하는
견고성 테스트이지, train 구간에서 파라미터를 새로 최적화하는 정통 워크포워드가 아니다.
(정통 워크포워드 재최적화는 향후 개선 항목.)
"""
from __future__ import annotations
import numpy as np
import pandas as pd

from app.backtest.vbt_engine import BacktestParams, run_backtest


def walk_forward(
    close: pd.Series,
    params: BacktestParams,
    train_window: int = 252,  # 1 year trading days
    test_window: int = 63,    # 1 quarter
) -> dict:
    """
    시리즈를 rolling [skip(train_window) | test] 폴드로 나누고 test 구간만 백테스트한다.
    train_window 는 재최적화가 아니라 단순 오프셋(워밍업)이다 — 모든 폴드가 동일 params 사용.
    """
    n = len(close)
    folds = []
    start = 0
    while start + train_window + test_window <= n:
        test_slice = close.iloc[start + train_window: start + train_window + test_window]
        try:
            res = run_backtest(test_slice, params)["stats"]
        except Exception as e:
            res = {"error": str(e)}
        folds.append({
            "fold": len(folds) + 1,
            "test_start": str(test_slice.index[0].date()),
            "test_end": str(test_slice.index[-1].date()),
            "stats": res,
        })
        start += test_window

    # Aggregate
    valid = [f["stats"] for f in folds if "error" not in f["stats"] and f["stats"].get("sharpe") is not None]
    if not valid:
        return {"folds": folds, "summary": None}

    def avg(key):
        vals = [s[key] for s in valid if s.get(key) is not None]
        return round(float(np.mean(vals)), 4) if vals else None

    summary = {
        "n_folds": len(folds),
        "n_valid": len(valid),
        "avg_total_return_pct": avg("total_return_pct"),
        "avg_sharpe": avg("sharpe"),
        "avg_max_drawdown_pct": avg("max_drawdown_pct"),
        "avg_win_rate_pct": avg("win_rate_pct"),
    }
    return {"folds": folds, "summary": summary}
