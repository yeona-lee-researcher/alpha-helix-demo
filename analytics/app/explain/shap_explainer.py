"""
SHAP explanations for the XGBoost signal model.
Returns per-feature contributions (top-N) for the latest prediction.
"""
from __future__ import annotations
try:
    import shap  # type: ignore
    _SHAP_AVAILABLE = True
except Exception:
    shap = None  # type: ignore
    _SHAP_AVAILABLE = False
import pandas as pd

from app.models.xgb_signal import build_features, FEATURE_COLS, load_model


def explain_latest(df: pd.DataFrame, ticker: str, top_n: int = 5) -> dict | None:
    if not _SHAP_AVAILABLE:
        return None
    bundle = load_model(ticker)
    if bundle is None:
        return None

    feats = build_features(df)
    if feats.empty:
        return None

    X_latest = feats[FEATURE_COLS].iloc[[-1]]
    explainer = shap.TreeExplainer(bundle["model"])
    sv = explainer.shap_values(X_latest)
    # XGBoost binary returns ndarray (1, n_features)
    values = sv[0] if hasattr(sv, "__len__") else sv

    contribs = sorted(
        [{"feature": f, "value": float(X_latest.iloc[0][f]), "shap": float(values[i])}
         for i, f in enumerate(FEATURE_COLS)],
        key=lambda d: abs(d["shap"]),
        reverse=True,
    )[:top_n]

    direction = "UP" if sum(c["shap"] for c in contribs) > 0 else "DOWN"
    return {
        "ticker": ticker.upper(),
        "as_of": str(feats.index[-1].date()),
        "predicted_direction": direction,
        "top_contributions": contribs,
        "human_summary": _summarize(contribs, direction),
    }


_FEATURE_LABEL_KO = {
    "ret_1": "1일 수익률", "ret_5": "5일 수익률", "ret_20": "20일 수익률",
    "sma_20_ratio": "20일 이동평균 대비 위치",
    "sma_60_ratio": "60일 이동평균 대비 위치",
    "sma_200_ratio": "200일 이동평균 대비 위치",
    "vol_20": "20일 변동성", "vol_60": "60일 변동성",
    "rsi_14": "RSI(14)",
    "macd": "MACD", "macd_signal_diff": "MACD-시그널 차이",
    "range_pct": "당일 가격범위",
    "vol_ratio_20": "20일 평균 거래량 대비 비율",
}


def _summarize(contribs: list, direction: str) -> str:
    lines = [f"모델은 익일 {'상승' if direction == 'UP' else '하락'}을 예측합니다. 주요 근거:"]
    for c in contribs:
        label = _FEATURE_LABEL_KO.get(c["feature"], c["feature"])
        side = "↑ 상승쪽" if c["shap"] > 0 else "↓ 하락쪽"
        lines.append(f"  • {label} = {c['value']:.4f} → {side} 기여 ({c['shap']:+.3f})")
    return "\n".join(lines)
