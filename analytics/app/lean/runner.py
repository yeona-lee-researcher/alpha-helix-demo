"""LeanBacktestRunner — analytics 사이드카에서 Lean 백테스트를 실행하는 진입점.

흐름:
    1. Spring → POST /lean/backtest 호출 → BacktestRequest 받음
    2. 우리 yf_client (Polygon/yfinance) 로 OHLCV 데이터 fetch
    3. kis_backtest.DataConverter 로 KIS-style CSV 작성 → Lean 워크스페이스
    4. kis_backtest.StrategyRegistry + LeanCodeGenerator 로 main.py 코드 생성
    5. kis_backtest.LeanExecutor.run() 으로 Docker 실행
    6. 결과 JSON 파싱해서 응답

KIS 인증을 사용하지 않음 — 데이터는 우리 기존 yf/Polygon fetcher 로 공급.
KIS 데이터가 필요한 시점에 credentials.py + kis_backtest.providers.kis 활성화.
"""
from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class LeanBacktestRequest:
    """단일 Lean 백테스트 요청."""
    strategy_id: str                       # 예: "sma_crossover"
    symbols: List[str]                     # 예: ["SPY"], ["005930"]
    start_date: str                        # "YYYY-MM-DD"
    end_date: str                          # "YYYY-MM-DD"
    initial_capital: float = 100_000_000.0 # 1억원 default
    market: str = "us"                     # "us" or "krx"
    param_overrides: Optional[Dict[str, Any]] = None
    commission_rate: float = 0.00015       # 0.015%
    tax_rate: float = 0.0                  # 매도세 (US 0, KRX 0.2%)
    slippage: float = 0.0


@dataclass
class LeanBacktestResult:
    """Lean 백테스트 결과 (Spring 으로 반환할 정규화 형태)."""
    success: bool
    run_id: str
    statistics: Dict[str, Any]             # CAGR, Sharpe, MaxDD 등
    equity_curve: List[Dict[str, Any]]     # [{date, value}, ...]
    trades_count: int
    raw_json_path: Optional[str] = None    # 디버깅용
    error: Optional[str] = None
    elapsed_seconds: Optional[float] = None


def _fetch_ohlcv(symbol: str, start: str, end: str, market: str) -> pd.DataFrame:
    """우리 기존 yf_client 로 OHLCV 가져옴.

    market='us' → yfinance (또는 Polygon 우선)
    market='krx' → 현재 미지원. KIS 데이터 어댑터 추가는 다음 세션 작업.
    """
    if market == "krx":
        raise NotImplementedError(
            "KRX 데이터 소스는 아직 미통합 — 이번 세션은 US 백테스트만 검증. "
            "다음 세션에서 KIS daily chart fetcher 추가 예정."
        )
    # period 계산 (yfinance 는 period 형식 받음)
    from app.data.yf_client import get_history
    start_dt = datetime.strptime(start, "%Y-%m-%d")
    end_dt = datetime.strptime(end, "%Y-%m-%d")
    days = (end_dt - start_dt).days
    if days <= 365:
        period = "1y"
    elif days <= 730:
        period = "2y"
    elif days <= 1825:
        period = "5y"
    else:
        period = "10y"

    df = get_history(symbol, period=period, interval="1d")
    # 인덱스를 datetime → 'date' 컬럼으로 (DataConverter 기대 형식)
    df = df.reset_index().rename(columns={
        df.index.name or "Date": "date",
        "Open": "open", "High": "high", "Low": "low", "Close": "close", "Volume": "volume",
    })
    # 요청 기간으로 필터링
    df["date"] = pd.to_datetime(df["date"])
    df = df[(df["date"] >= start_dt) & (df["date"] <= end_dt)].copy()
    return df


def run_lean_backtest(req: LeanBacktestRequest, progress_cb=None) -> LeanBacktestResult:
    """단일 Lean 백테스트 실행.

    progress_cb(level, msg): 진행 콜백.
      level='phase' 단계전환 | 'lean' lean stdout 라인 | 'info'/'error' 일반 로그.
      None 이면 무시 (동기 /lean/backtest 경로는 콜백 없이 그대로 동작).
    """
    started_at = datetime.now()
    run_id = f"{req.strategy_id}-{uuid.uuid4().hex[:8]}"
    _emit = progress_cb if callable(progress_cb) else (lambda *a, **k: None)

    # ─── lazy import: kis_backtest 가 무거우니 (전체 strategies 자동 등록) 요청 시점에만 로드 ───
    # 주의: 반드시 'kis_backtest.*' 절대 import 만 사용 — 'app.lean.kis_backtest.*' 와
    # 'kis_backtest.*' 가 사이드 by 사이드로 import 되면 Python 이 두 개의 모듈 인스턴스를
    # 만들어서 StrategyRegistry 가 두 벌이 됨 → preset 등록은 한쪽에만 일어나고 조회는 빈 쪽에서 함.
    try:
        import app.lean  # noqa: F401  — sys.path 주입 트리거
        # preset 전략 자동 등록 (import side-effect)
        import kis_backtest.strategies.preset  # noqa: F401
        from kis_backtest.strategies.registry import StrategyRegistry
        from kis_backtest.codegen.generator import LeanCodeGenerator, CodeGenConfig
        from kis_backtest.lean.executor import LeanExecutor
        from kis_backtest.lean.project_manager import LeanProjectManager
        from kis_backtest.lean.data_converter import DataConverter
        from kis_backtest.lean.result_formatter import ResultFormatter
    except Exception as e:
        logger.exception("kis_backtest 라이브러리 import 실패")
        return LeanBacktestResult(
            success=False, run_id=run_id, statistics={}, equity_curve=[], trades_count=0,
            error=f"kis_backtest import 실패: {e}",
        )

    try:
        # 1. 전략 조회 + 파라미터 적용
        if req.param_overrides:
            definition = StrategyRegistry.build_with_params(req.strategy_id, **req.param_overrides)
        else:
            definition = StrategyRegistry.build(req.strategy_id)
    except KeyError:
        return LeanBacktestResult(
            success=False, run_id=run_id, statistics={}, equity_curve=[], trades_count=0,
            error=f"Strategy not found: {req.strategy_id}. "
                  f"가능: {', '.join(StrategyRegistry.list_all())}",
        )

    try:
        _emit("phase", f"전략 로드: {definition.name}")
        # 2. 데이터 fetch (우리 yf/Polygon)
        data_dict: Dict[str, pd.DataFrame] = {}
        for sym in req.symbols:
            _emit("phase", f"데이터 로드: {sym} ({req.start_date}~{req.end_date})")
            df = _fetch_ohlcv(sym, req.start_date, req.end_date, req.market)
            if df.empty:
                raise ValueError(f"No OHLCV data for {sym} between {req.start_date} ~ {req.end_date}")
            data_dict[sym] = df
        logger.info(f"[Lean] fetched {len(data_dict)} symbols")

        # 3. 프로젝트 생성
        _emit("phase", f"Lean 프로젝트 생성: {run_id}")
        market_type = "us" if req.market == "us" else "krx"
        currency = "USD" if req.market == "us" else "KRW"
        project = LeanProjectManager.create_project(
            run_id=run_id,
            symbols=req.symbols,
            start_date=req.start_date,
            end_date=req.end_date,
            initial_capital=req.initial_capital,
            commission_rate=req.commission_rate,
            tax_rate=req.tax_rate,
            strategy_type=req.strategy_id,
            strategy_params=req.param_overrides or {},
            strategy_id=req.strategy_id,
            strategy_name=definition.name,
            market_type=market_type,
            currency=currency,
        )

        # 4. 데이터 CSV 작성 (Lean 포맷)
        _emit("phase", f"데이터 CSV 변환 ({len(data_dict)} 종목)")
        DataConverter.export(data_dict, str(project.data_dir), market_type=market_type)

        # 5. main.py 코드 생성
        from kis_backtest.core.converters import from_definition
        schema = from_definition(definition)
        gen_config = CodeGenConfig(
            market=market_type,
            commission_rate=req.commission_rate,
            tax_rate=req.tax_rate,
            slippage=req.slippage,
            initial_capital=req.initial_capital,
        )
        generator = LeanCodeGenerator(schema, gen_config)
        lean_code = generator.generate(req.symbols, req.start_date, req.end_date)
        (project.project_dir / "main.py").write_text(lean_code, encoding="utf-8")
        logger.info(f"[Lean] main.py written ({len(lean_code)} bytes)")
        _emit("phase", f"Lean 알고리즘 코드 생성 ({len(lean_code)} bytes)")

        # 6. Docker 실행
        _emit("phase", "Lean 엔진 실행 (Docker 컨테이너 부팅)…")
        lean_run = LeanExecutor.run(project, stream_logs=False, timeout=600,
                                    on_line=lambda line: _emit("lean", line))
        _emit("phase", f"Lean 엔진 완료 ({lean_run.duration_seconds:.1f}s) · 결과 파싱 중…")

        # 7. 결과 파싱 — ResultFormatter 는 {"result": {...}} 형태로 중첩 반환
        api_resp = ResultFormatter.to_api_response(
            lean_run,
            symbols=req.symbols,
            start_date=req.start_date,
            end_date=req.end_date,
            initial_capital=req.initial_capital,
            strategy_type=req.strategy_id,
            strategy_params=req.param_overrides or {},
            currency=currency,
            strategy_name=definition.name,
        )
        result_obj = api_resp.get("result", {})
        stats = result_obj.get("statistics", {})
        equity = result_obj.get("equity_curve", [])
        trades = result_obj.get("trades", [])

        elapsed = (datetime.now() - started_at).total_seconds()
        logger.info(f"[Lean] backtest done run_id={run_id} elapsed={elapsed:.1f}s")
        return LeanBacktestResult(
            success=True,
            run_id=run_id,
            statistics=stats,
            equity_curve=equity,
            trades_count=len(trades),
            raw_json_path=str(lean_run.result_json) if lean_run.result_json else None,
            elapsed_seconds=elapsed,
        )

    except Exception as e:
        logger.exception(f"[Lean] backtest failed run_id={run_id}")
        elapsed = (datetime.now() - started_at).total_seconds()
        return LeanBacktestResult(
            success=False, run_id=run_id, statistics={}, equity_curve=[], trades_count=0,
            error=str(e), elapsed_seconds=elapsed,
        )


def list_available_strategies() -> List[Dict[str, Any]]:
    """등록된 preset 전략 목록 + 파라미터 정의."""
    import app.lean  # noqa: F401  — sys.path 주입
    import kis_backtest.strategies.preset  # noqa: F401
    from kis_backtest.strategies.registry import StrategyRegistry
    return StrategyRegistry.list_all_with_params()
