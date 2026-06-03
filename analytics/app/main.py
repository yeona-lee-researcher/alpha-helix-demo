"""
Alpha-Helix analytics FastAPI service.
Run: uvicorn app.main:app --port 8001 --reload
"""
from __future__ import annotations
import logging
import os
from contextlib import asynccontextmanager
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.config import INTERNAL_TOKEN, DEFAULT_UNIVERSE, REPORTS_DIR
from app.data.yf_client import get_history, get_latest_close
from app.data import polygon_client, fred_client, binance_client, market_db
from app.data.collector import (
    collect_us_ohlcv, collect_macro, collect_crypto_ohlcv,
    full_initial_load, start_scheduler as start_data_scheduler,
    US_SYMBOLS, CRYPTO_SYMBOLS, FRED_SERIES,
)
from app.data import polygon_client, fred_client, binance_client, market_db
from app.data.collector import (
    collect_us_ohlcv, collect_macro, collect_crypto_ohlcv,
    full_initial_load, start_scheduler as start_data_scheduler,
    US_SYMBOLS, CRYPTO_SYMBOLS, FRED_SERIES,
)
from app.backtest.vbt_engine import BacktestParams, run_backtest, latest_signal
from app.backtest.infinite_buying import (
    InfiniteBuyingParams,
    run_infinite_buying,
    latest_order_plan,
)
from app.metrics.quantstats_report import compute_metrics
from app.models.xgb_signal import train_model, predict_proba_up
from app.models.retrain_scheduler import start_scheduler, retrain_all
from app.explain.shap_explainer import explain_latest
from app.robust.walkforward import walk_forward
from app.robust.regime import per_regime_stats
from app.robust.trust_score import compute_trust_score

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """스케줄러들 시작."""
    if os.getenv("DISABLE_RETRAIN_SCHEDULER", "0") != "1":
        start_scheduler()           # XGBoost 재학습
        start_data_scheduler()      # 시장 데이터 수집
        log.info("schedulers started via lifespan")
    yield


app = FastAPI(title="Alpha-Helix Analytics", version="0.2.0", lifespan=lifespan)

# QuantStats HTML tearsheet 정적 서빙: GET /reports/{file}.html (no auth — 공개 링크)
app.mount("/reports", StaticFiles(directory=str(REPORTS_DIR)), name="reports")


# ---------- Auth ----------
def require_internal_token(x_internal_token: str = Header(default="")) -> None:
    if x_internal_token != INTERNAL_TOKEN:
        raise HTTPException(status_code=401, detail="invalid internal token")


# ---------- Schemas ----------
STRATEGY_LITERAL = Literal[
    "buy_and_hold", "sma_cross", "rsi_meanrev", "macd",
    "momentum_12_1", "vix_risk_off",
]


class BacktestReq(BaseModel):
    ticker: str
    period: str = "5y"
    strategy: STRATEGY_LITERAL = "sma_cross"
    sma_fast: int = 20
    sma_slow: int = 60
    rsi_period: int = 14
    rsi_low: int = 30
    rsi_high: int = 70
    macd_fast: int = 12
    macd_slow: int = 26
    macd_signal: int = 9
    momentum_long_days: int = 252
    momentum_short_days: int = 21
    vix_threshold: float = 25.0
    initial_capital: float = 10000.0
    fees: float = 0.0025   # 0.25% 기본값 (KIS 해외주식 실수수료)
    slippage: float = 0.001  # 0.10% 슬리피지


class SignalReq(BaseModel):
    tickers: list[str] = Field(default_factory=lambda: list(DEFAULT_UNIVERSE))
    strategy: STRATEGY_LITERAL = "sma_cross"
    sma_fast: int = 20
    sma_slow: int = 60
    include_ml: bool = True


# ---------- Endpoints ----------
@app.get("/health")
def health():
    return {"status": "ok", "service": "alpha-helix-analytics", "version": "0.2.0"}


@app.post("/models/retrain", dependencies=[Depends(require_internal_token)])
def trigger_retrain(force: bool = False):
    """XGBoost 모델 즉시 재학습 (관리자/운영자용). force=true면 오늘 이미 했어도 재실행."""
    result = retrain_all(force=force)
    return result


@app.get("/price/latest", dependencies=[Depends(require_internal_token)])
def price_latest(ticker: str):
    try:
        return {"ticker": ticker.upper(), "close": get_latest_close(ticker)}
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/backtest", dependencies=[Depends(require_internal_token)])
def backtest(req: BacktestReq):
    try:
        df = get_history(req.ticker, period=req.period)
        params = BacktestParams(
            strategy=req.strategy,
            sma_fast=req.sma_fast, sma_slow=req.sma_slow,
            rsi_period=req.rsi_period, rsi_low=req.rsi_low, rsi_high=req.rsi_high,
            macd_fast=req.macd_fast, macd_slow=req.macd_slow, macd_signal=req.macd_signal,
            momentum_long_days=req.momentum_long_days,
            momentum_short_days=req.momentum_short_days,
            vix_threshold=req.vix_threshold,
            initial_capital=req.initial_capital,
            fees=req.fees, slippage=req.slippage,
        )

        # vix_risk_off 는 ^VIX 동일 기간 필요
        vix_series = None
        if req.strategy == "vix_risk_off":
            try:
                vix_df = get_history("^VIX", period=req.period)
                vix_series = vix_df["Close"]
            except Exception as ve:
                raise HTTPException(400, f"VIX fetch failed: {ve}")

        result = run_backtest(df["Close"], params, vix=vix_series)
        result["ticker"] = req.ticker.upper()

        # --- QuantStats overlay (Step 1: 전략수익률 + SPY 벤치마크) ---
        # vbt_engine이 반환한 진짜 전략 수익률 (수수료/슬리피지 반영). buy&hold 아님.
        strat_returns = result.pop("_strategy_returns", None)
        if strat_returns is None:
            # fallback (안전장치) — 사실상 도달 안 함
            strat_returns = df["Close"].pct_change().dropna()

        # SPY 벤치마크 — alpha/beta/information_ratio 계산용
        bench_returns = None
        if req.ticker.upper() != "SPY":
            try:
                spy = get_history("SPY", period=req.period)
                bench_returns = spy["Close"].pct_change().dropna()
                # 인덱스 정렬
                bench_returns = bench_returns.reindex(strat_returns.index).dropna()
                strat_returns = strat_returns.reindex(bench_returns.index).dropna()
            except Exception as be:
                log.warning("benchmark SPY fetch failed: %s", be)

        result["risk_metrics"] = compute_metrics(strat_returns, benchmark=bench_returns)
        # 단순보유 비교용
        result["buy_and_hold_metrics"] = compute_metrics(df["Close"].pct_change().dropna())
        return result
    except Exception as e:
        log.exception("backtest failed")
        raise HTTPException(500, str(e))


@app.post("/signals/today", dependencies=[Depends(require_internal_token)])
def signals_today(req: SignalReq):
    """
    For each ticker: rule-based signal + (optional) XGBoost probability + SHAP top contributors.
    Used by Spring Boot scheduler at 22:30 KST.
    """
    out = []
    params = BacktestParams(
        strategy=req.strategy,
        sma_fast=req.sma_fast, sma_slow=req.sma_slow,
    )
    for t in req.tickers:
        item: dict = {"ticker": t.upper()}
        try:
            df = get_history(t, period="2y")
            sig = latest_signal(df["Close"], params)
            item.update(sig)

            if req.include_ml:
                proba = predict_proba_up(df, t)
                if proba:
                    item["ml_proba_up"] = proba["proba_up"]
                    expl = explain_latest(df, t, top_n=3)
                    if expl:
                        item["explanation"] = {
                            "predicted_direction": expl["predicted_direction"],
                            "top_contributions": expl["top_contributions"],
                            "human_summary": expl["human_summary"],
                        }
                else:
                    item["ml_note"] = "모델 미학습 — POST /models/train 호출 필요"
        except Exception as e:
            item["error"] = str(e)
        out.append(item)
    return {"signals": out}


class TrainReq(BaseModel):
    ticker: str
    period: str = "5y"


@app.post("/models/train", dependencies=[Depends(require_internal_token)])
def train(req: TrainReq):
    try:
        df = get_history(req.ticker, period=req.period)
        return train_model(df, req.ticker)
    except Exception as e:
        log.exception("train failed")
        raise HTTPException(500, str(e))


class WalkForwardReq(BaseModel):
    ticker: str
    period: str = "10y"
    strategy: STRATEGY_LITERAL = "sma_cross"
    train_window: int = 252
    test_window: int = 63


@app.post("/robust/walk-forward", dependencies=[Depends(require_internal_token)])
def walk_forward_endpoint(req: WalkForwardReq):
    try:
        df = get_history(req.ticker, period=req.period)
        params = BacktestParams(strategy=req.strategy)
        return walk_forward(df["Close"], params, req.train_window, req.test_window)
    except Exception as e:
        log.exception("walk-forward failed")
        raise HTTPException(500, str(e))


class RegimeReq(BaseModel):
    ticker: str
    period: str = "5y"
    strategy: STRATEGY_LITERAL = "sma_cross"
    method: str = "rule"      # "rule" | "hmm"
    smoothing: int = 0        # Viterbi-style minimum-run filter (0=off, 권장 5)
    n_states: int = 4         # HMM 상태 수 (rule-based에서는 무시)


@app.post("/regime", dependencies=[Depends(require_internal_token)])
def regime_endpoint(req: RegimeReq):
    try:
        df = get_history(req.ticker, period=req.period)
        params = BacktestParams(strategy=req.strategy)
        return per_regime_stats(
            df["Close"], params,
            method=req.method,
            smoothing=req.smoothing,
            n_states=req.n_states,
            ticker=req.ticker,
            period=req.period,
        )
    except Exception as e:
        log.exception("regime failed")
        raise HTTPException(500, str(e))


class TrustReq(BaseModel):
    ticker: str
    period: str = "10y"
    strategy: STRATEGY_LITERAL = "sma_cross"
    # mdd_target_pct=None 이면 자산별 자동 (etf_index 25 / 2x 50 / 3x 75 / single 35)
    mdd_target_pct: float | None = None
    # 사용자 조정 영역 (Analyst Mode) — 모두 선택적
    weights: dict[str, float] | None = None
    overfit_penalty_max: int = 15
    wf_train: int = 252
    wf_test: int = 63
    # 자산 분류 override — "auto" 시 ticker 로 자동 판별
    asset_class: str = "auto"
    leverage: int | None = None


@app.post("/trust", dependencies=[Depends(require_internal_token)])
def trust_endpoint(req: TrustReq):
    try:
        df = get_history(req.ticker, period=req.period)
        params = BacktestParams(strategy=req.strategy)
        return compute_trust_score(
            df["Close"], params,
            mdd_target_pct=req.mdd_target_pct,
            weights=req.weights,
            overfit_penalty_max=req.overfit_penalty_max,
            wf_train=req.wf_train,
            wf_test=req.wf_test,
            ticker=req.ticker,
            asset_class=req.asset_class,
            leverage=req.leverage,
        )
    except Exception as e:
        log.exception("trust failed")
        raise HTTPException(500, str(e))


# ---------- Infinite Buying Method (무한매수법) ----------
class InfiniteBuyingReq(BaseModel):
    tickers: list[str] = Field(default_factory=lambda: ["TQQQ", "SOXL"])
    period: str = "5y"
    split: int = 40
    take_profit_pct: float = 10.0
    loc_offset_pct: float = 15.0
    initial_capital: float = 300_000_000.0
    fees: float = 0.0025      # 0.25% — CLAUDE.md 명세(InfiniteBuyingParams 기본값과 정합)
    slippage: float = 0.001   # 0.1%


def _build_ib_params(req: "InfiniteBuyingReq") -> InfiniteBuyingParams:
    """요청 → InfiniteBuyingParams."""
    return InfiniteBuyingParams(
        split=req.split,
        take_profit_pct=req.take_profit_pct,
        loc_offset_pct=req.loc_offset_pct,
        initial_capital=req.initial_capital,
        fees=req.fees,
        slippage=req.slippage,
    )


def _ticker_series(closes: dict, max_points: int = 1500) -> dict:
    """백테스트 응답에 종목별 가격 시계열을 실어 보낸다(프론트 차트 탭용). 과다 포인트는 다운샘플."""
    out = {}
    for tk, s in (closes or {}).items():
        try:
            ser = s.dropna()
            if len(ser) > max_points:
                step = len(ser) // max_points + 1
                ser = ser.iloc[::step]
            out[tk] = [
                {"date": (idx.date().isoformat() if hasattr(idx, "date") else str(idx)), "close": round(float(v), 4)}
                for idx, v in ser.items()
            ]
        except Exception:
            pass
    return out


@app.post("/backtest/infinite-buying", dependencies=[Depends(require_internal_token)])
def backtest_infinite_buying(req: InfiniteBuyingReq):
    try:
        closes: dict = {}
        for t in req.tickers:
            df = get_history(t, period=req.period)
            closes[t.upper()] = df["Close"]
        params = _build_ib_params(req)
        result = run_infinite_buying(closes, params)
        strat_returns = result.pop("_strategy_returns", None)
        if strat_returns is not None and len(strat_returns) > 1:
            result["risk_metrics"] = compute_metrics(strat_returns)
        result["ticker_series"] = _ticker_series(closes)
        return result
    except Exception as e:
        log.exception("infinite_buying failed")
        raise HTTPException(500, str(e))


@app.post("/orders/infinite-buying/plan", dependencies=[Depends(require_internal_token)])
def infinite_buying_plan(req: InfiniteBuyingReq):
    try:
        closes: dict = {}
        for t in req.tickers:
            df = get_history(t, period=req.period)
            closes[t.upper()] = df["Close"]
        params = _build_ib_params(req)
        return latest_order_plan(closes, params)
    except Exception as e:
        log.exception("infinite_buying plan failed")
        raise HTTPException(500, str(e))


# ---------- 시드 역산: "월 N만원 벌려면 종목별 시드 얼마?" ----------
# 실현 현금흐름은 시드에 정확히 선형 비례(엔진이 분할금액·수량을 비율로 계산, 소수주 허용).
# → 참조시드로 1회 백테스트해서 월 실현액을 측정한 뒤, 목표 ÷ 측정 배수로 필요시드를 역산.
REFERENCE_SEED_USD = 100_000.0  # 측정용 참조 시드(결과 비율엔 영향 없음 — 선형이므로 상쇄)


class InfiniteBuyingSizingReq(InfiniteBuyingReq):
    target_monthly_usd: float | None = None
    target_monthly_krw: float | None = None
    fx: float = 1380.0  # KRW per USD
    start: str | None = None  # 직접 지정 시작일(ISO). 주면 워밍업 포함 측정창 [start,end]
    end: str | None = None    # 직접 지정 종료일(ISO). 미지정 시 오늘


@app.post("/backtest/infinite-buying/sizing", dependencies=[Depends(require_internal_token)])
def infinite_buying_sizing(req: InfiniteBuyingSizingReq):
    try:
        # 목표 월수익(USD) 산출
        if req.target_monthly_usd and req.target_monthly_usd > 0:
            target_usd = float(req.target_monthly_usd)
        elif req.target_monthly_krw and req.target_monthly_krw > 0:
            target_usd = float(req.target_monthly_krw) / req.fx
        else:
            raise HTTPException(400, "target_monthly_usd 또는 target_monthly_krw(>0)가 필요합니다")

        # 데이터 로드 — 직접 지정(start/end) 또는 짧은 프리셋이면 워밍업(평단·분할매수 누적) 포함해 측정창으로 자른다.
        from datetime import date as _date, timedelta as _td
        closes: dict = {}
        _SHORT = {"2mo": 60, "3mo": 90, "6mo": 180}
        eff_start = req.start
        eff_end = req.end or _date.today().isoformat()
        if not eff_start and req.period in _SHORT:
            eff_start = (_date.today() - _td(days=_SHORT[req.period])).isoformat()
        win_end = eff_end
        if eff_start:
            warm_from = _date.fromisoformat(eff_start) - _td(days=120)   # 측정창 전 워밍업
            yrs = (_date.today() - warm_from).days / 365.0 + 0.5
            fetch_period = "max" if yrs > 9 else "10y" if yrs > 4 else "5y" if yrs > 1.5 else "2y"
            for t in req.tickers:
                df = get_history(t, period=fetch_period).loc[str(warm_from):win_end]
                closes[t.upper()] = df["Close"]
        else:
            for t in req.tickers:
                df = get_history(t, period=req.period)
                closes[t.upper()] = df["Close"]

        # 참조 시드로 측정 (사용자 initial_capital 무시 — 시드를 '구하는' 게 목적)
        params = _build_ib_params(req)
        params.initial_capital = REFERENCE_SEED_USD
        result = run_infinite_buying(closes, params)
        result.pop("_strategy_returns", None)
        stats = result["stats"]

        if eff_start:
            # 측정창 [start, end] 안의 익절(실현)만 합산 → 워밍업 제외, 그 기간 순수 월 현금흐름
            months = max(0.5, (_date.fromisoformat(win_end) - _date.fromisoformat(eff_start)).days / 30.4)
            sells = [tr for tr in result.get("recent_trades", [])
                     if tr.get("side") == "SELL" and eff_start <= str(tr.get("date", "")) <= win_end]
            window_realized = sum(float(tr.get("realized", 0) or 0) for tr in sells)
            monthly = window_realized / months
            stats = {**stats, "estimated_monthly_cashflow": round(monthly, 4),
                     "window_sells": len(sells), "window_months": round(months, 2)}
        else:
            monthly = stats.get("estimated_monthly_cashflow") or 0.0

        period_label = f"{eff_start}~{win_end}" if eff_start else req.period

        if monthly <= 0:
            return {
                "feasible": False,
                "reason": "해당 기간에 익절(실현수익)이 없어 시드 역산 불가 — 기간을 늘리거나 다른 구간을 선택하세요.",
                "period": period_label,
                "reference_seed_usd": REFERENCE_SEED_USD,
                "measured_monthly_usd": round(monthly, 2),
                "backtest_stats": stats,
            }

        scale = target_usd / monthly
        required_usd = REFERENCE_SEED_USD * scale

        up = [t.upper() for t in req.tickers]
        alloc = {t: required_usd / len(up) for t in up}

        per_ticker = {
            t: {
                "seed_usd": round(alloc[t], 2),
                "seed_krw": round(alloc[t] * req.fx),
                "daily_buy_usd": round(alloc[t] / params.split, 2),
                "daily_buy_krw": round(alloc[t] / params.split * req.fx),
            }
            for t in up
        }

        return {
            "feasible": True,
            "period": period_label,
            "fx": req.fx,
            "split": params.split,
            "target_monthly_usd": round(target_usd, 2),
            "target_monthly_krw": round(target_usd * req.fx),
            "reference_seed_usd": REFERENCE_SEED_USD,
            "measured_monthly_usd": round(monthly, 2),
            "measured_monthly_krw": round(monthly * req.fx),
            "scale_factor": round(scale, 4),
            "required_seed_usd": round(required_usd, 2),
            "required_seed_krw": round(required_usd * req.fx),
            "per_ticker": per_ticker,
            "backtest_stats": stats,
            "caveat": (
                f"{period_label} 과거 성과 기준 선형 추정입니다. 미래 수익은 시장 상황에 따라 달라지며, "
                f"레버리지 ETF는 낙폭이 큽니다(이 구간 MDD {stats.get('max_drawdown_pct')}%). "
                f"같은 시드라도 약세장 구간에서는 월수익이 크게 줄 수 있습니다."
            ),
        }
    except HTTPException:
        raise
    except Exception as e:
        log.exception("infinite_buying sizing failed")
        raise HTTPException(500, str(e))


# ---------- Step 3: QuantStats 풀 tearsheet (HTML) ----------
class FullReportReq(BaseModel):
    ticker: str
    period: str = "5y"
    strategy: STRATEGY_LITERAL = "sma_cross"
    sma_fast: int = 20
    sma_slow: int = 60
    rsi_period: int = 14
    rsi_low: int = 30
    rsi_high: int = 70
    macd_fast: int = 12
    macd_slow: int = 26
    macd_signal: int = 9
    momentum_long_days: int = 252
    momentum_short_days: int = 21
    vix_threshold: float = 25.0
    initial_capital: float = 10000.0
    fees: float = 0.0025      # 0.25% — BacktestReq/CLAUDE.md 명세와 정합
    slippage: float = 0.001   # 0.1%
    benchmark: str = "SPY"
    title: Optional[str] = None


@app.post("/report/full", dependencies=[Depends(require_internal_token)])
def report_full(req: FullReportReq):
    """
    Generates a full QuantStats HTML tearsheet and returns a URL.
    Reference: ranaroussi/quantstats -- qs.reports.html(returns, benchmark='SPY', output=path)
    """
    import uuid
    import quantstats as qs  # imported here so matplotlib backend already set in metrics module

    try:
        df = get_history(req.ticker, period=req.period)
        params = BacktestParams(
            strategy=req.strategy,
            sma_fast=req.sma_fast, sma_slow=req.sma_slow,
            rsi_period=req.rsi_period, rsi_low=req.rsi_low, rsi_high=req.rsi_high,
            macd_fast=req.macd_fast, macd_slow=req.macd_slow, macd_signal=req.macd_signal,
            momentum_long_days=req.momentum_long_days,
            momentum_short_days=req.momentum_short_days,
            vix_threshold=req.vix_threshold,
            initial_capital=req.initial_capital,
            fees=req.fees, slippage=req.slippage,
        )

        vix_series = None
        if req.strategy == "vix_risk_off":
            vix_series = get_history("^VIX", period=req.period)["Close"]

        result = run_backtest(df["Close"], params, vix=vix_series)
        strat_returns = result.pop("_strategy_returns", None)
        if strat_returns is None or strat_returns.empty:
            raise HTTPException(400, "전략 수익률 생성 실패")

        # 벤치마크 시리즈
        bench_returns = None
        if req.benchmark and req.benchmark.upper() != req.ticker.upper():
            try:
                bench_df = get_history(req.benchmark, period=req.period)
                bench_returns = bench_df["Close"].pct_change().dropna()
                # 인덱스 정렬
                common = strat_returns.index.intersection(bench_returns.index)
                strat_returns = strat_returns.reindex(common)
                bench_returns = bench_returns.reindex(common)
            except Exception as be:
                log.warning("benchmark fetch failed: %s", be)
                bench_returns = None

        # 파일명 — 충돌 방지 + 캐싱 가능
        fname = f"{req.ticker.upper()}_{req.strategy}_{uuid.uuid4().hex[:8]}.html"
        out_path = REPORTS_DIR / fname
        title = req.title or f"{req.ticker.upper()} · {req.strategy}"

        # QuantStats 핵심 호출
        qs.reports.html(
            strat_returns,
            benchmark=bench_returns if bench_returns is not None else None,
            output=str(out_path),
            title=title,
        )

        return {
            "ticker": req.ticker.upper(),
            "strategy": req.strategy,
            "report_url": f"/reports/{fname}",
            "filename": fname,
            "benchmark": req.benchmark.upper() if bench_returns is not None else None,
            "summary_stats": result["stats"],
        }
    except HTTPException:
        raise
    except Exception as e:
        log.exception("report/full failed")
        raise HTTPException(500, str(e))


# ════════════════════════════════════════════════════════════════════════════
#  /data/*  — 시장 데이터 API (Phase 1)
# ════════════════════════════════════════════════════════════════════════════

class DataCollectReq(BaseModel):
    symbols: list[str] = []
    days_back: int = 7


@app.get("/data/status", dependencies=[Depends(require_internal_token)])
def data_status():
    """수집된 데이터 현황 요약 (소스별/심볼별 최신 시각 + 행 수)."""
    stats = market_db.get_collection_stats()
    return {
        "polygon_available": polygon_client.available(),
        "fred_available": fred_client.available(),
        "binance_ping": binance_client.ping(),
        "collection_stats": stats,
        "us_symbols": US_SYMBOLS,
        "crypto_symbols": CRYPTO_SYMBOLS,
        "macro_series": FRED_SERIES,
    }


@app.get("/data/ohlcv", dependencies=[Depends(require_internal_token)])
def data_ohlcv(
    symbol: str,
    tf: str = "1d",
    source: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 500,
):
    """DB에서 OHLCV 조회. DB에 없으면 Polygon/Binance에서 실시간 fetch."""
    symbol = symbol.upper()
    df = market_db.query_ohlcv(symbol, tf=tf, source=source, start=start, end=end, limit=limit)

    if df.empty:
        # DB에 없으면 실시간 fetch → DB 저장 → 반환
        is_crypto = symbol.endswith("USDT") or symbol.endswith("BTC")
        try:
            if is_crypto:
                start_date = start or (
                    (__import__("datetime").date.today() - __import__("datetime").timedelta(days=365)).isoformat()
                )
                df_fetch = binance_client.get_klines_full(symbol, interval=tf, start_date=start_date)
            elif polygon_client.available():
                from datetime import date, timedelta
                s = start or (date.today() - timedelta(days=365)).isoformat()
                e = end or date.today().isoformat()
                df_fetch = polygon_client.get_daily_bars(symbol, s, e)
            else:
                # Fallback: yfinance
                from app.data.yf_client import get_history
                df_raw = get_history(symbol)
                df_raw = df_raw.reset_index()
                df_raw.columns = [c.lower() for c in df_raw.columns]
                df_raw["symbol"] = symbol
                df_raw["source"] = "yfinance"
                df_raw["date"] = df_raw.get("date", df_raw.index)
                df_fetch = df_raw
            if not df_fetch.empty:
                market_db.upsert_ohlcv(df_fetch, tf=tf)
                df = market_db.query_ohlcv(symbol, tf=tf, source=source, start=start, end=end, limit=limit)
        except Exception as e:
            log.warning("data/ohlcv realtime fetch failed %s: %s", symbol, e)

    if df.empty:
        raise HTTPException(404, f"No data for {symbol}")

    df["ts"] = df["ts"].astype(str)
    return {"symbol": symbol, "tf": tf, "rows": len(df), "data": df.to_dict("records")}


@app.get("/data/macro", dependencies=[Depends(require_internal_token)])
def data_macro(
    series: str = "T10Y2Y,VIXCLS,DGS10,DGS2",
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    """DB에서 매크로 팩터 조회. 키가 있으면 FRED에서 실시간 보완."""
    series_ids = [s.strip() for s in series.split(",")]
    df = market_db.query_macro(series_ids, start=start, end=end)

    if df.empty and fred_client.available():
        try:
            collect_macro(series_ids=series_ids, days_back=365 * 5)
            df = market_db.query_macro(series_ids, start=start, end=end)
        except Exception as e:
            log.warning("data/macro FRED fetch failed: %s", e)

    if df.empty:
        raise HTTPException(404, "No macro data")

    df.index = df.index.astype(str)
    return {
        "series": series_ids,
        "rows": len(df),
        "data": df.reset_index().rename(columns={"index": "date"}).to_dict("records"),
    }


@app.get("/data/orderbook/{symbol}", dependencies=[Depends(require_internal_token)])
def data_orderbook(symbol: str, depth: int = 20):
    """Binance 실시간 오더북 (코인 심볼: BTCUSDT 등)."""
    try:
        ob = binance_client.get_orderbook(symbol.upper(), depth=depth)
        return ob
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/data/ticker/{symbol}", dependencies=[Depends(require_internal_token)])
def data_ticker(symbol: str):
    """실시간 시세. 코인은 Binance, US 주식은 Polygon 사용."""
    symbol = symbol.upper()
    is_crypto = symbol.endswith("USDT") or symbol.endswith("BTC")

    try:
        if is_crypto:
            return binance_client.get_ticker_24h(symbol)
        elif polygon_client.available():
            result = polygon_client.get_latest_quote(symbol)
            if result:
                return result
        # Fallback: yfinance
        from app.data.yf_client import get_latest_close
        price = get_latest_close(symbol)
        return {"symbol": symbol, "price": price, "source": "yfinance"}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/data/funding/{symbol}", dependencies=[Depends(require_internal_token)])
def data_funding(symbol: str, limit: int = 100):
    """Binance 선물 펀딩레이트 (과열/침체 지표)."""
    try:
        df = binance_client.get_funding_rate(symbol.upper(), limit=limit)
        if df.empty:
            raise HTTPException(404, "No funding data")
        df["timestamp"] = df["timestamp"].astype(str)
        return {"symbol": symbol.upper(), "rows": len(df), "data": df.to_dict("records")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/data/collect", dependencies=[Depends(require_internal_token)])
def data_collect(req: DataCollectReq):
    """수동 데이터 수집 트리거. 백그라운드에서 비동기 실행."""
    import threading

    def _run():
        symbols = req.symbols or None
        days = req.days_back
        collect_us_ohlcv(symbols=symbols, days_back=days)
        collect_macro(days_back=days)
        collect_crypto_ohlcv(days_back=days)

    threading.Thread(target=_run, daemon=True).start()
    return {"status": "collecting", "symbols": req.symbols, "days_back": req.days_back}


@app.post("/data/collect/initial", dependencies=[Depends(require_internal_token)])
def data_collect_initial():
    """5년치 전체 초기 수집 (백그라운드). 시간이 오래 걸림."""
    import threading
    threading.Thread(target=full_initial_load, args=(5,), daemon=True).start()
    return {"status": "initial_load_started"}


# ════════════════════════════════════════════════════════════════════════════
#  /futures/*  — Binance 선물 전략 API (Phase 4)
# ════════════════════════════════════════════════════════════════════════════

class FuturesBacktestReq(BaseModel):
    symbol: str = "BTCUSDT"
    strategy: str = "sma_cross"
    leverage: int = 5
    initial_capital: float = 10_000.0
    fees: float = 0.0004
    slippage: float = 0.001
    sma_fast: int = 20
    sma_slow: int = 50
    rsi_period: int = 14
    rsi_long: float = 30.0
    rsi_short: float = 70.0
    momentum_days: int = 20
    max_position_pct: float = 0.5
    stop_loss_pct: float = 0.05
    take_profit_pct: float = 0.15
    period: str = "1y"


@app.post("/futures/backtest", dependencies=[Depends(require_internal_token)])
def futures_backtest(req: FuturesBacktestReq):
    """
    Binance 선물 전략 백테스트.
    펀딩레이트 비용, 레버리지, 스탑로스/테이크프로핏 반영.
    """
    from app.backtest.futures_engine import FuturesParams, backtest_futures
    try:
        params = FuturesParams(
            symbol=req.symbol.upper(),
            strategy=req.strategy,
            leverage=max(1, min(req.leverage, 20)),  # 최대 20배 제한 (안전)
            initial_capital=req.initial_capital,
            fees=req.fees,
            slippage=req.slippage,
            sma_fast=req.sma_fast,
            sma_slow=req.sma_slow,
            rsi_period=req.rsi_period,
            rsi_long=req.rsi_long,
            rsi_short=req.rsi_short,
            momentum_days=req.momentum_days,
            max_position_pct=req.max_position_pct,
            stop_loss_pct=req.stop_loss_pct,
            take_profit_pct=req.take_profit_pct,
            period=req.period,
        )
        result = backtest_futures(params)
        return result
    except Exception as e:
        log.exception("futures/backtest failed")
        raise HTTPException(500, str(e))


@app.get("/futures/signal", dependencies=[Depends(require_internal_token)])
def futures_signal(
    symbol: str = "BTCUSDT",
    strategy: str = "sma_cross",
    leverage: int = 5,
    sma_fast: int = 20,
    sma_slow: int = 50,
    rsi_period: int = 14,
    rsi_long: float = 30.0,
    rsi_short: float = 70.0,
):
    """현재 시점의 선물 매매 신호 (1=롱, -1=숏, 0=중립)."""
    from app.backtest.futures_engine import FuturesParams, get_futures_signal
    try:
        params = FuturesParams(
            symbol=symbol.upper(),
            strategy=strategy,
            leverage=leverage,
            sma_fast=sma_fast, sma_slow=sma_slow,
            rsi_period=rsi_period, rsi_long=rsi_long, rsi_short=rsi_short,
        )
        return get_futures_signal(params)
    except Exception as e:
        log.exception("futures/signal failed")
        raise HTTPException(500, str(e))


# ════════════════════════════════════════════════════════════════════
#  Lean 백테스트 엔진 (vectorbt 와 병행)
# ════════════════════════════════════════════════════════════════════
class LeanBacktestReq(BaseModel):
    """Spring → analytics 로 들어오는 Lean 백테스트 요청."""
    strategy_id: str = Field(..., description="kis_backtest preset id (예: sma_crossover)")
    symbols: list[str] = Field(..., description="종목 코드. US: SPY, KRX: 005930")
    start_date: str = Field(..., description="YYYY-MM-DD")
    end_date: str = Field(..., description="YYYY-MM-DD")
    initial_capital: float = Field(default=100_000_000.0, description="기본 1억원")
    market: Literal["us", "krx"] = Field(default="us")
    param_overrides: Optional[dict] = Field(default=None)
    commission_rate: float = Field(default=0.00015)
    tax_rate: float = Field(default=0.0)
    slippage: float = Field(default=0.0)


@app.get("/lean/strategies", dependencies=[Depends(require_internal_token)])
def lean_list_strategies():
    """등록된 Lean preset 전략 목록 + 파라미터 정의."""
    try:
        from app.lean.runner import list_available_strategies
        return {"strategies": list_available_strategies()}
    except Exception as e:
        log.exception("lean/strategies failed")
        raise HTTPException(500, str(e))


@app.post("/lean/backtest", dependencies=[Depends(require_internal_token)])
def lean_backtest(req: LeanBacktestReq):
    """Lean Docker 엔진으로 백테스트 실행.

    주의:
      - Docker 가 호스트에 설치돼있어야 함 (quantconnect/lean:latest 이미지)
      - 첫 실행은 이미지 풀로 인해 매우 느림 (~20분)
      - US 시장만 지원 (KRX 는 KIS 데이터 어댑터 추가 후)
    """
    try:
        from app.lean.runner import run_lean_backtest, LeanBacktestRequest
        request = LeanBacktestRequest(
            strategy_id=req.strategy_id,
            symbols=req.symbols,
            start_date=req.start_date,
            end_date=req.end_date,
            initial_capital=req.initial_capital,
            market=req.market,
            param_overrides=req.param_overrides,
            commission_rate=req.commission_rate,
            tax_rate=req.tax_rate,
            slippage=req.slippage,
        )
        result = run_lean_backtest(request)
        if not result.success:
            raise HTTPException(status_code=422, detail=result.error or "lean backtest failed")
        return {
            "success": True,
            "run_id": result.run_id,
            "statistics": result.statistics,
            "equity_curve": result.equity_curve,
            "trades_count": result.trades_count,
            "elapsed_seconds": result.elapsed_seconds,
        }
    except HTTPException:
        raise
    except Exception as e:
        log.exception("lean/backtest failed")
        raise HTTPException(500, str(e))


@app.post("/lean/backtest/start", dependencies=[Depends(require_internal_token)])
def lean_backtest_start(req: LeanBacktestReq):
    """Lean 백테스트를 백그라운드 잡으로 시작 → job_id 즉시 반환.

    /lean/backtest/status/{job_id} 로 진행 로그(단계 + lean stdout)를 폴링한다.
    동기 /lean/backtest 와 동일 엔진을 쓰되, progress_cb 로 진행을 잡에 누적한다.
    """
    import threading
    from app.lean.jobs import create_job
    from app.lean.runner import run_lean_backtest, LeanBacktestRequest

    job = create_job()

    def _cb(level: str, msg: str):
        if level == "phase":
            job.set_phase(msg)
        elif level == "lean":
            job.log("info", f"[lean] {msg}")
        else:
            job.log(level, msg)

    def _run():
        try:
            request = LeanBacktestRequest(
                strategy_id=req.strategy_id,
                symbols=req.symbols,
                start_date=req.start_date,
                end_date=req.end_date,
                initial_capital=req.initial_capital,
                market=req.market,
                param_overrides=req.param_overrides,
                commission_rate=req.commission_rate,
                tax_rate=req.tax_rate,
                slippage=req.slippage,
            )
            result = run_lean_backtest(request, progress_cb=_cb)
            if not result.success:
                job.log("error", result.error or "lean backtest failed")
                job.finish_err(result.error or "lean backtest failed")
                return
            job.finish_ok({
                "success": True,
                "run_id": result.run_id,
                "statistics": result.statistics,
                "equity_curve": result.equity_curve,
                "trades_count": result.trades_count,
                "elapsed_seconds": result.elapsed_seconds,
            })
        except Exception as e:  # noqa: BLE001
            log.exception("lean/backtest/start job failed")
            job.log("error", str(e))
            job.finish_err(str(e))

    threading.Thread(target=_run, name=f"lean-job-{job.job_id}", daemon=True).start()
    return {"job_id": job.job_id, "status": "running"}


@app.get("/lean/backtest/status/{job_id}", dependencies=[Depends(require_internal_token)])
def lean_backtest_status(job_id: str, since: int = 0):
    """잡 진행 상태 + since 커서 이후 증분 로그 + 완료 시 결과."""
    from app.lean.jobs import get_job
    job = get_job(job_id)
    if job is None:
        raise HTTPException(404, f"job not found: {job_id}")
    return job.snapshot(since=since)


@app.get("/lean/health", dependencies=[Depends(require_internal_token)])
def lean_health():
    """Lean 실행 환경 준비 상태 (Docker 데몬 / lean CLI / 이미지)."""
    try:
        import app.lean  # noqa: F401  — sys.path 주입
        from kis_backtest.lean.executor import LeanExecutor, LEAN_IMAGE
    except Exception as e:
        return {"ready": False, "docker": False, "lean_cli": False, "image": False,
                "error": f"lean executor import 실패: {e}"}
    docker = LeanExecutor.check_docker()
    lean_cli = LeanExecutor.check_lean_cli()
    image = LeanExecutor.check_image() if docker else False  # docker 죽었으면 이미지 조회 스킵
    return {
        "ready": bool(docker and lean_cli and image),
        "docker": docker,
        "lean_cli": lean_cli,
        "image": image,
        "image_name": LEAN_IMAGE,
    }


