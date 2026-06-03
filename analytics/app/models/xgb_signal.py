"""
Feature engineering + XGBoost classifier predicting next-day direction (UP/DOWN).
Used as a probabilistic signal layer on top of rule-based strategies.
"""
from __future__ import annotations
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import accuracy_score, precision_score, recall_score

try:
    from xgboost import XGBClassifier
    _XGB_AVAILABLE = True
except Exception:  # pragma: no cover
    XGBClassifier = None  # type: ignore[assignment]
    _XGB_AVAILABLE = False

from app.config import MODEL_DIR


# ---------- Feature engineering ----------

def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Input: OHLCV DataFrame. Output: features X with target y_next_up."""
    out = pd.DataFrame(index=df.index)
    close = df["Close"]
    high, low, vol = df["High"], df["Low"], df["Volume"]

    # Returns
    out["ret_1"] = close.pct_change(1)
    out["ret_5"] = close.pct_change(5)
    out["ret_20"] = close.pct_change(20)

    # Moving averages
    out["sma_20_ratio"] = close / close.rolling(20).mean() - 1
    out["sma_60_ratio"] = close / close.rolling(60).mean() - 1
    out["sma_200_ratio"] = close / close.rolling(200).mean() - 1

    # Volatility
    out["vol_20"] = close.pct_change().rolling(20).std()
    out["vol_60"] = close.pct_change().rolling(60).std()

    # RSI(14)
    delta = close.diff()
    gain = delta.where(delta > 0, 0).rolling(14).mean()
    loss = -delta.where(delta < 0, 0).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    out["rsi_14"] = 100 - (100 / (1 + rs))

    # MACD
    ema12 = close.ewm(span=12).mean()
    ema26 = close.ewm(span=26).mean()
    out["macd"] = ema12 - ema26
    out["macd_signal_diff"] = out["macd"] - out["macd"].ewm(span=9).mean()

    # Range / volume
    out["range_pct"] = (high - low) / close
    out["vol_ratio_20"] = vol / vol.rolling(20).mean()

    # Target: next day up?
    out["y_next_up"] = (close.shift(-1) > close).astype(int)

    return out.dropna()


FEATURE_COLS = [
    "ret_1", "ret_5", "ret_20",
    "sma_20_ratio", "sma_60_ratio", "sma_200_ratio",
    "vol_20", "vol_60",
    "rsi_14",
    "macd", "macd_signal_diff",
    "range_pct", "vol_ratio_20",
]


# ---------- Train ----------

def train_model(df: pd.DataFrame, ticker: str) -> dict:
    if not _XGB_AVAILABLE:
        return {"ticker": ticker.upper(), "error": "xgboost not installed", "samples": 0, "cv_avg": {}, "model_path": ""}
    feats = build_features(df)
    X = feats[FEATURE_COLS]
    y = feats["y_next_up"]

    # Time-series CV (no leakage)
    tscv = TimeSeriesSplit(n_splits=5)
    cv_scores = []
    model = None
    for train_idx, test_idx in tscv.split(X):
        model = XGBClassifier(
            n_estimators=200, max_depth=4, learning_rate=0.05,
            subsample=0.9, colsample_bytree=0.9,
            eval_metric="logloss", random_state=42,
        )
        model.fit(X.iloc[train_idx], y.iloc[train_idx])
        pred = model.predict(X.iloc[test_idx])
        cv_scores.append({
            "accuracy": float(accuracy_score(y.iloc[test_idx], pred)),
            "precision": float(precision_score(y.iloc[test_idx], pred, zero_division=0)),
            "recall": float(recall_score(y.iloc[test_idx], pred, zero_division=0)),
        })

    # Final fit on all data
    final = XGBClassifier(
        n_estimators=200, max_depth=4, learning_rate=0.05,
        subsample=0.9, colsample_bytree=0.9,
        eval_metric="logloss", random_state=42,
    )
    final.fit(X, y)

    path = MODEL_DIR / f"xgb_{ticker.upper()}.joblib"
    joblib.dump({"model": final, "features": FEATURE_COLS}, path)

    avg = {k: round(np.mean([s[k] for s in cv_scores]), 4) for k in cv_scores[0]}
    return {
        "ticker": ticker.upper(),
        "samples": len(X),
        "cv_avg": avg,
        "model_path": str(path),
    }


def load_model(ticker: str):
    path = MODEL_DIR / f"xgb_{ticker.upper()}.joblib"
    if not path.exists():
        return None
    return joblib.load(path)


def predict_proba_up(df: pd.DataFrame, ticker: str) -> dict | None:
    if not _XGB_AVAILABLE:
        return None
    bundle = load_model(ticker)
    if bundle is None:
        return None
    feats = build_features(df)
    if feats.empty:
        return None
    X_latest = feats[FEATURE_COLS].iloc[[-1]]
    proba = float(bundle["model"].predict_proba(X_latest)[0][1])
    return {
        "proba_up": round(proba, 4),
        "as_of": str(feats.index[-1].date()),
    }
