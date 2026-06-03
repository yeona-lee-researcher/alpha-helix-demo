"""Alpha-Helix Lean backtest integration.

Vendored from https://github.com/koreainvestment/open-trading-api (KIS official)
- kis_backtest/ : full library (DSL, codegen, Docker executor, presets, optimizer)
- kis_auth.py   : KIS API auth wrapper (used only when fetching data from KIS)

Our additions:
- credentials.py : Pydantic models for KIS creds passed in by Spring
- runner.py      : Thin entry point — accepts pre-fetched OHLCV, generates Lean code,
                   runs in Docker, returns parsed result. Bypasses kis_auth so we don't
                   need a per-user ~/KIS/config/kis_devlp.yaml.

NOTE on sys.path: vendored kis_backtest uses absolute imports like
`from kis_backtest.X import Y`, which assumes `kis_backtest` is top-level on sys.path.
We add this directory (which contains `kis_backtest/` and `kis_auth.py`) to sys.path
so those imports resolve without rewriting every file in the vendored tree.
"""
import sys
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))
