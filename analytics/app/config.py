"""
Configuration loaded from env vars (with .env support).
"""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

ROOT_DIR = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT_DIR / "cache"
CACHE_DIR.mkdir(exist_ok=True)

# QuantStats가 생성하는 HTML tearsheet 저장 경로 (정적 서빙)
REPORTS_DIR = ROOT_DIR / "reports"
REPORTS_DIR.mkdir(exist_ok=True)

# Service auth: Spring Boot calls this with this token
INTERNAL_TOKEN = os.getenv("ANALYTICS_INTERNAL_TOKEN", "dev-internal-token-change-me")

# Cache TTL (minutes)
PRICE_CACHE_TTL_MIN = int(os.getenv("PRICE_CACHE_TTL_MIN", "60"))

# Universe — 화이트리스트 (Spring Boot의 ALLOWED_TICKERS와 동일하게 유지)
DEFAULT_UNIVERSE = [
    # 3X 레버리지 ETF (무한매수법 후보)
    "DFEN", "FAS", "FNGU", "LABU", "MIDU", "NAIL", "RETL", "SOXL",
    "TECL", "TNA", "TPOR", "TQQQ", "UPRO", "WANT", "WEBL",
    # 2X / 벤치마크
    "QLD", "QQQ", "SPY",
    # Storyboard 전략용 — Defensive / Risk-Off / Income
    "SCHD", "SHY", "TLT", "GLD",
    # 변동성 지표 (regime 분류용)
    "^VIX",
    # 암호화폐 (yfinance 형식: BTC-USD, ETH-USD)
    "BTC-USD", "ETH-USD",
]

# Backtest defaults
DEFAULT_INITIAL_CAPITAL = 10_000.0  # USD
# KIS 해외주식 실제 수수료: 약 0.25% (매수/매도 각각)
# 구버전 0.05%는 실제보다 5배 낙관적 → 백테스트 결과 과대평가됨
DEFAULT_FEES = 0.0025  # 0.25% per trade (KIS 해외주식 실수수료)
DEFAULT_SLIPPAGE = 0.001  # 0.10% 슬리피지 (레버리지 ETF 유동성 감안)

# Model artifacts
MODEL_DIR = ROOT_DIR / "models_cache"
MODEL_DIR.mkdir(exist_ok=True)
