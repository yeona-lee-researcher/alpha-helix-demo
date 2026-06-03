"""KIS credentials shim — bridges Spring's AES-GCM-decrypted creds to kis_auth.py.

Why this module exists:
    kis_auth.py (vendored) hard-codes ~/KIS/config/kis_devlp.yaml at module-import time.
    Our analytics service receives different users' creds via Spring on each request,
    so we cannot rely on a single static file.

Usage patterns:
    1. **Backtest-only (no KIS data fetch)** — preferred for our MVP.
       Skip this module entirely. Feed OHLCV from yf_client / Polygon directly
       to DataConverter. kis_auth never imported, no yaml needed.

    2. **KIS data fetch needed** — single-tenant per process.
       Call write_kis_devlp_yaml() at process startup with one set of creds,
       set HOME env var to point there, then import kis_backtest as normal.
       Multi-tenant support would require subprocess isolation (deferred).
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import yaml


@dataclass
class KisCredentials:
    """Subset of KIS creds needed by kis_backtest.

    Mirror of `backend.domain.strategy.entity.BrokerAccount` fields that travel
    from Spring → analytics. Spring decrypts appSecret with AES-GCM before sending;
    this dataclass never sees ciphertext.
    """
    app_key: str            # 36자
    app_secret: str         # 180자
    cano: str               # 종합계좌번호 8자리
    acnt_prdt_cd: str       # 상품코드 2자리 (보통 "01")
    hts_id: str             # KIS HTS ID (eliana 등)
    is_paper: bool          # True=모의, False=실전


def write_kis_devlp_yaml(creds: KisCredentials, dest_root: Path) -> Path:
    """Writes a kis_devlp.yaml under {dest_root}/KIS/config/ in the format
    kis_auth.py expects.

    Sets paper_app/paper_sec if creds.is_paper, else my_app/my_sec — kis_auth
    reads different fields based on the auth() call's `svr` argument
    ("vps" = paper, "prod" = real).

    Returns the path to the written yaml.
    """
    cfg_dir = dest_root / "KIS" / "config"
    cfg_dir.mkdir(parents=True, exist_ok=True)

    cfg: dict[str, object] = {
        # 실전
        "my_app": "" if creds.is_paper else creds.app_key,
        "my_sec": "" if creds.is_paper else creds.app_secret,
        # 모의
        "paper_app": creds.app_key if creds.is_paper else "",
        "paper_sec": creds.app_secret if creds.is_paper else "",
        # 계좌
        "my_acct_stock": creds.cano,
        "my_paper_stock": creds.cano,
        "my_acct_future": "",
        "my_paper_future": "",
        "my_prod": creds.acnt_prdt_cd,
        "my_htsid": creds.hts_id,
        "my_token": "",
        # 도메인
        "my_url": "https://openapi.koreainvestment.com:9443",
        "my_paper_url": "https://openapivts.koreainvestment.com:29443",
        "my_url_ws": "ws://ops.koreainvestment.com:21000",
        "my_paper_url_ws": "ws://ops.koreainvestment.com:31000",
        # User-Agent (KIS 게이트웨이가 기본 Java/Python UA 차단하는 사고 회피)
        "my_agent": "Mozilla/5.0 (compatible) alpha-helix-analytics/1.0",
    }

    yaml_path = cfg_dir / "kis_devlp.yaml"
    with open(yaml_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(cfg, f, allow_unicode=True, sort_keys=False)
    return yaml_path


def configure_kis_home_once(creds: KisCredentials, home_dir: Optional[Path] = None) -> Path:
    """Sets HOME/USERPROFILE to a dir containing a fresh kis_devlp.yaml.

    MUST be called BEFORE any `import kis_auth` or `from kis_backtest.providers.kis ...`
    because those modules read the yaml at import time. Idempotent — calling twice
    with same creds is fine, but kis_auth itself only loads once per process.

    For per-request multi-tenant use, prefer spawning a subprocess.
    """
    home = home_dir or Path(os.environ.get("ALPHA_LEAN_KIS_HOME", str(Path.home())))
    write_kis_devlp_yaml(creds, home)
    os.environ["HOME"] = str(home)
    os.environ["USERPROFILE"] = str(home)
    return home
