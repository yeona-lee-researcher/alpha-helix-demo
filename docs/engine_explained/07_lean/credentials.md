# `lean/credentials.py` — KIS 자격증명 다리(shim) (완전 라인별 해설)

> 원본: `analytics/app/lean/credentials.py` (101줄)
> 이 문서는 **교재 표준 예시**(`01_backtest/vbt_engine.md`)와 **동일한 형식**을 따릅니다.

---

## 📌 이 파일 한눈에

이 파일은 **"자격증명 변환 어댑터(콘센트 변환 플러그)"** 입니다.

상황을 그림으로 보면 이렇습니다. 우리 Analytics 서버는 백엔드(Spring)로부터 **암호가 풀린(평문) KIS 증권 계좌 키**를 받습니다. 그런데 우리가 빌려온(vendored) KIS 공식 라이브러리 `kis_auth.py` 는 **자기 마음대로** `~/KIS/config/kis_devlp.yaml` 이라는 **고정된 파일 한 개**만 읽도록 만들어져 있습니다. 즉 "키를 파라미터로 받는" 게 아니라 "특정 위치의 파일에서 키를 줍는" 구조입니다.

그래서 둘 사이에 **다리(shim)** 가 필요합니다. 이 파일이 하는 일은 딱 하나 — **메모리에 들어온 키를, kis_auth 가 읽을 수 있는 yaml 파일로 받아써서 올바른 위치에 놓는 것**입니다.

> 비유: 110V 기기(우리 키 객체)를 220V 콘센트(kis_auth 의 파일 규약)에 꽂으려면 **변환 어댑터**가 필요합니다. `credentials.py` 가 바로 그 어댑터입니다. 어댑터 자체는 전기를 만들지 않습니다 — **모양만 바꿔 끼워줄 뿐**입니다.

핵심 구성요소는 딱 3개입니다:

| 이름 | 한 줄 역할 | 비유 |
|---|---|---|
| `KisCredentials` (dataclass) | Spring 이 보낸 키 6개를 담는 **상자** | 변환할 플러그를 담은 통 |
| `write_kis_devlp_yaml(...)` | 그 상자를 → kis_auth 가 읽는 `kis_devlp.yaml` 파일로 **받아쓰기** | 어댑터의 핀 배치를 220V 규격으로 깎기 |
| `configure_kis_home_once(...)` | yaml 을 쓰고 + `HOME` 환경변수를 그 폴더로 **돌려놓기** | 그 어댑터를 실제 벽 콘센트에 꽂기 |

**누가 호출하나?** → **현재는 아무도 정기적으로 호출하지 않습니다.** 이게 이 파일의 가장 중요한 맥락입니다. 같은 폴더의 `runner.py`(실제 Lean 백테스트 실행기)는 데이터를 우리 `yf_client`(야후/Polygon)로 가져오기 때문에 **KIS 인증을 일부러 건너뜁니다**(`runner.py` 주석: *"KIS 인증을 사용하지 않음"*). 따라서 `credentials.py` 는 **"나중에 KRX(한국주식) 데이터를 KIS 에서 직접 받아야 할 때를 위한 예비 부품(dormant infrastructure)"** 입니다. 지금은 "있지만 잠자는" 코드입니다.

**왜 미리 만들어 뒀나?** → KIS 에서 한국 주식 일봉을 직접 받아오려면 OAuth 토큰이 필요하고, 그 토큰을 받으려면 `kis_auth.auth()` 를 호출해야 하며, 그게 다시 yaml 파일을 요구합니다. 그 순간이 오면 **이 다리만 건너면 바로 연결**되도록 미리 깔아둔 길입니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) "자격증명(credentials)" 이란?
- 증권사 API 를 쓰려면 **신분증 + 비밀번호** 같은 키가 필요합니다. KIS 의 경우:
  - `app_key`(앱키, 36자) + `app_secret`(앱시크릿, 180자) — **API 사용 허가증**. 이 둘로 OAuth 토큰을 발급받습니다.
  - `cano`(종합계좌번호 8자리) + `acnt_prdt_cd`(상품코드 2자리, 보통 "01") — **어느 계좌인지** 지정.
  - `hts_id` — KIS 홈트레이딩시스템 로그인 ID.
- **이 정보가 새면 남이 내 계좌로 주문**할 수 있으므로, DB 에는 절대 평문으로 저장하지 않습니다(AES-GCM 암호화). 이 파일이 다루는 건 **이미 복호화된(평문) 상태**입니다.

#### 2) `모의(paper)` vs `실전(real)` 투자
- KIS 는 두 종류의 서버를 줍니다:
  - **모의투자(paper / vps)** — 가짜 돈으로 연습. URL: `openapivts.koreainvestment.com:29443`
  - **실전투자(real / prod)** — 진짜 돈. URL: `openapi.koreainvestment.com:9443`
- 키도 모의용/실전용이 **따로**입니다. 그래서 yaml 안에 `my_app`(실전)과 `paper_app`(모의) 칸이 나뉩니다. `is_paper` 플래그가 "어느 칸에 키를 넣을지"를 결정합니다.

#### 3) `@dataclass` = "값들을 담는 상자 클래스를 자동으로 만들어 주는 도구"
```python
@dataclass
class KisCredentials:
    app_key: str
    ...
```
- 이렇게 쓰면 `KisCredentials(app_key="ABC", ...)` 처럼 만들 수 있는 **데이터 묶음 클래스**가 됩니다. `__init__` 같은 보일러플레이트를 파이썬이 자동 생성합니다.
- ⚠️ **헷갈리는 포인트**: 같은 폴더 `__init__.py` 의 주석은 이걸 *"Pydantic models"* 라고 부르지만, **실제 코드는 Pydantic 이 아니라 표준 라이브러리 `dataclass`** 입니다. 주석이 코드보다 오래돼 어긋난 경우(아래 함정 섹션에서 다시 설명).

#### 4) `HOME` / `USERPROFILE` 환경변수 = "내 홈 폴더가 어디냐"
- 프로그램이 `~`(틸드, 홈 폴더)를 풀 때 운영체제는 이 환경변수를 봅니다. 리눅스/맥은 `HOME`, 윈도우는 `USERPROFILE`.
- `kis_auth.py` 는 `os.path.expanduser("~")` 로 홈을 구해 `~/KIS/config/kis_devlp.yaml` 을 읽습니다. **즉 `HOME` 을 바꾸면 kis_auth 가 읽는 yaml 위치도 바뀝니다.** 이게 이 파일이 `HOME` 을 건드리는 이유입니다.

#### 5) "import 시점에 파일을 읽는다" = 가장 중요한 타이밍 함정
- 보통 함수는 "호출할 때" 실행됩니다. 하지만 `kis_auth.py` 는 **모듈 최상단**(함수 밖)에서 yaml 을 엽니다:
  ```python
  # kis_auth.py L51 (원본)
  with open(os.path.join(config_root, "kis_devlp.yaml"), encoding="UTF-8") as f:
  ```
- 이 코드는 `import kis_auth` 하는 **바로 그 순간** 실행됩니다. 그러니 yaml 은 **import 보다 먼저** 존재해야 합니다. 순서가 뒤바뀌면 파일이 없어서 터집니다. → `configure_kis_home_once` 의 *"MUST be called BEFORE any import"* 경고의 근거.

#### 6) 멱등(idempotent)
- "같은 입력으로 여러 번 호출해도 결과가 같고 부작용이 안 쌓인다"는 뜻. yaml 을 두 번 써도 같은 내용으로 덮어쓸 뿐이라 안전 — `configure_kis_home_once` 가 멱등이라고 말하는 이유.

---

## 🗺 전체 흐름도

```
[백엔드 Spring]  BrokerAccount(app_secret 은 DB에 AES-GCM 암호문)
       │  복호화(decrypt) 후 평문 키를 HTTP 로 전송
       ▼
[Analytics]  KisCredentials(app_key, app_secret, cano, acnt_prdt_cd, hts_id, is_paper)
       │      ← 평문 키 6개를 담은 "상자"
       ▼
┌─────────────────────────────────────────────────────────────┐
│ configure_kis_home_once(creds, home_dir=None)               │
│   ① home 폴더 결정 (인자 > ALPHA_LEAN_KIS_HOME env > ~)     │
│   ② write_kis_devlp_yaml(creds, home)  ───────────┐        │
│   ③ os.environ["HOME"]/["USERPROFILE"] = home      │        │
└────────────────────────────────────────────────────┼────────┘
                                                      │
                                                      ▼
                           write_kis_devlp_yaml(creds, dest_root)
                              {dest_root}/KIS/config/kis_devlp.yaml 작성
                              ├ is_paper=True  → paper_app/paper_sec 에 키
                              └ is_paper=False → my_app/my_sec 에 키
                                + 계좌/도메인 URL/User-Agent 채움
                                                      │
                                                      ▼  (반드시 이 다음에)
                           import kis_auth   ← 최상단에서 위 yaml 을 읽음
                              auth(svr="vps"/"prod") 가 키로 OAuth 토큰 발급
                                                      │
                                                      ▼
                                   KIS OpenAPI (모의/실전) 데이터 fetch
```

> 한 줄 요약: **메모리 속 키 → yaml 파일 → HOME 으로 위치 지정 → kis_auth 가 그 파일을 읽음.** 이 파일은 "메모리 → 파일 → 위치" 세 단계의 다리입니다.

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) — `L1-L17`

```python
# L1-L17
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
```
- **무엇을 하나**: 이 파일이 *왜* 존재하는지를 못 박는 설명서입니다. 실행되지 않고 사람이 읽는 용도(docstring).
- **핵심 메시지 3개**:
  1. *"shim"* — 우리가 KIS 코드를 고치지 않으려고 끼운 **얇은 변환층**. (vendored 코드를 함부로 수정하면 업스트림 업데이트와 충돌하므로, 바깥에 다리만 놓는 전략.)
  2. *"hard-codes ... at module-import time"* — kis_auth 가 **import 순간** 고정 경로 yaml 을 읽는다는, 이 파일 존재의 근본 이유. (사전지식 5번.)
  3. *"different users' creds ... on each request"* — 요청마다 사용자가 다를 수 있는데 파일은 하나뿐이라 충돌 → 그래서 **"한 프로세스에 한 사용자(single-tenant)"** 로만 안전하고, **다중 사용자(multi-tenant)는 서브프로세스 격리가 필요(나중으로 미룸)** 라고 솔직히 적어둠.
- **헷갈리는 포인트**: "Usage pattern 1" 에서 *"Skip this module entirely"* — 즉 **현재 우리 MVP 는 이 파일을 안 쓰는 게 기본**입니다. 백테스트 데이터는 yf/Polygon 으로 충분하니 KIS 인증 자체가 불필요. 이 파일은 "패턴 2(KIS 데이터가 꼭 필요할 때)"를 위한 준비물입니다.

---

### B. import 묶음 — `L18-L25`

```python
# L18-L25
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import yaml
```
- `from __future__ import annotations` — 타입힌트를 "문자열처럼 늦게 평가"하게 하는 파이썬 기능. 초보는 **"최신 타입표기를 안전하게 쓰기 위한 주문"** 으로 이해하면 됩니다(예: `dict[str, object]` 를 구버전 파이썬에서도 무리 없이 적게 해줌).
- `os` — **환경변수**(`os.environ`) 조작과 경로 결합에 사용. 이 파일의 부작용(HOME 변경)이 여기서 나옵니다.
- `dataclass` — 위에서 본 "값 상자" 데코레이터.
- `Path`(pathlib) — 경로를 **문자열 합치기 대신 `/` 연산자**로 안전하게 다루는 객체. 예: `dest_root / "KIS" / "config"`. 윈도우/리눅스 구분자(`\` vs `/`)를 알아서 처리.
- `Optional` — `Optional[Path]` = "Path 이거나 None". 함수 인자가 생략 가능함을 표현.
- `yaml` — **PyYAML 라이브러리**. 파이썬 dict ↔ `.yaml` 텍스트 변환기. 키를 yaml 로 받아쓸 때 씁니다.

> 💡 초보 포인트: import 가 **표준 라이브러리(os/dataclasses/pathlib/typing)** 와 **외부 라이브러리(yaml)** 로 한 줄 띄워 나뉘어 있습니다. 이건 파이썬 관습(PEP 8): "내 것이 아닌 외부 패키지는 따로 묶기".

---

### C. 자격증명 상자 `KisCredentials` — `L28-L41`

```python
# L28-L41
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
```
- **무엇을 하나**: Spring 이 HTTP 로 넘겨준 **키 6개를 하나로 묶는 상자**. 함수들이 이 상자(`creds`) 하나만 받으면 6개 값을 다 쓸 수 있습니다.
- **각 필드의 의미**(주석을 그대로 신뢰 — 실제 코드 주석임):
  - `app_key`(36자) / `app_secret`(180자) — OAuth 토큰 발급용 **허가증 한 쌍**. 길이 주석은 "올바른 값인지 눈으로 검증"하는 힌트.
  - `cano`(8자리) — **종합계좌번호**. 어느 계좌로 거래/조회할지.
  - `acnt_prdt_cd`(2자리, 보통 "01") — **상품코드**. "01" = 일반 주식 위탁계좌. (kis_auth 가 `product` 가 "03"이면 선물옵션 등으로 분기하는 그 코드.)
  - `hts_id` — KIS HTS 로그인 ID. 주석의 *"eliana 등"* 은 예시 ID.
  - `is_paper` — **모의/실전 스위치**. `True`면 모의, `False`면 실전. 아래 `write_kis_devlp_yaml` 의 모든 분기가 이 한 불리언으로 갈립니다.
- **왜 이렇게 하나 (docstring 의 보안 포인트)**:
  - *"Mirror of BrokerAccount"* — 백엔드의 `BrokerAccount` 엔티티 필드를 그대로 본뜬 것. 양쪽이 같은 모양이라 매핑이 단순.
  - *"Spring decrypts appSecret with AES-GCM before sending; this dataclass never sees ciphertext"* — **암호 해독은 백엔드 책임**이고, 이 상자에는 **이미 평문**만 들어옵니다. 즉 Analytics 는 복호화 키(`APP_CRYPTO_KEY`)를 가질 필요가 없습니다. (보안상 복호화 권한을 한 곳에만 두는 설계.)
- **헷갈리는 포인트**: 이건 KIS 의 **전체** 자격증명이 아니라 *"Subset"*(부분집합)입니다. kis_backtest 가 실제로 쓰는 6개만 추렸습니다. 더 많은 필드가 KIS 에 있어도 여기 없으면 안 받는다는 뜻.

> 💡 초보 포인트: dataclass 필드에 기본값(`= ...`)이 하나도 없으므로, `KisCredentials(...)` 를 만들 때 **6개를 전부** 넣어야 합니다(생략 불가).

---

### D. 핵심 받아쓰기 함수 `write_kis_devlp_yaml()` — `L44-L84`

이 파일의 알맹이입니다. "상자 → yaml 파일"로 바꾸는 실제 일꾼.

#### D-1. 함수 머리 + 설명서 — `L44-L53`
```python
# L44-L53
def write_kis_devlp_yaml(creds: KisCredentials, dest_root: Path) -> Path:
    """Writes a kis_devlp.yaml under {dest_root}/KIS/config/ in the format
    kis_auth.py expects.

    Sets paper_app/paper_sec if creds.is_paper, else my_app/my_sec — kis_auth
    reads different fields based on the auth() call's `svr` argument
    ("vps" = paper, "prod" = real).

    Returns the path to the written yaml.
    """
```
- **무엇을 하나**: `creds`(상자)와 `dest_root`(쓸 폴더의 뿌리)를 받아, `{dest_root}/KIS/config/kis_devlp.yaml` 을 만들고 그 **경로(Path)를 돌려줍니다**.
- **왜 `KIS/config/` 고정인가**: kis_auth 가 `config_root = ~/KIS/config/` 를 하드코딩하기 때문(원본 `kis_auth.py:37`). 우리가 맞춰줘야 함.
- **docstring 의 핵심**: kis_auth 의 `auth()` 가 `svr` 인자로 *"vps"(모의)/"prod"(실전)* 를 받고, 그에 따라 **다른 칸(paper vs my)** 의 키를 읽습니다. 그래서 우리가 yaml 을 쓸 때부터 **올바른 칸에 키를 넣어야** 합니다. (이게 D-3 분기의 근거.)

#### D-2. 폴더 만들기 — `L54-L55`
```python
# L54-L55
    cfg_dir = dest_root / "KIS" / "config"
    cfg_dir.mkdir(parents=True, exist_ok=True)
```
- `dest_root / "KIS" / "config"` — `Path` 의 `/` 연산자로 경로를 안전하게 이어붙임. 예: `dest_root=/home/u` 면 `/home/u/KIS/config`.
- `mkdir(parents=True, exist_ok=True)` — 그 폴더를 만듦.
  - `parents=True` — 중간 폴더(`KIS`)가 없어도 한 번에 다 생성(리눅스 `mkdir -p` 와 같음).
  - `exist_ok=True` — **이미 있어도 에러 내지 말 것**. (멱등성의 핵심 — 두 번 호출해도 안전.)
- **헷갈리는 포인트**: `exist_ok=True` 가 없으면 "두 번째 호출 시 폴더가 이미 있어서 `FileExistsError`" 가 납니다. 그래서 꼭 필요.

#### D-3. yaml 내용(dict) 구성 — `L57-L79` (이 함수의 두뇌)
```python
# L57-L79
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
```
- **무엇을 하나**: kis_auth 가 기대하는 **모든 칸을 채운 파이썬 dict** 를 만듭니다. 이 dict 가 곧 yaml 파일의 내용이 됩니다.
- **`dict[str, object]`** — "키는 문자열, 값은 무엇이든(object)"인 사전. 값에 문자열·빈문자열 등이 섞여서 `object`.

**(가) 키 칸 — `is_paper` 삼항 분기 (가장 중요)**
- `"my_app": "" if creds.is_paper else creds.app_key`
  - 읽는 법: **"is_paper 가 True 면 빈칸(""), 아니면(실전) app_key 를 넣어라"**.
  - 즉 **실전(my\_)** 칸은 실전일 때만 채우고, 모의면 비웁니다.
- `"paper_app": creds.app_key if creds.is_paper else ""`
  - 반대로 **모의(paper\_)** 칸은 모의일 때만 채우고, 실전이면 비웁니다.
- **왜 이렇게 갈라 넣나**: 사전지식 2번 + D-1 docstring 대로, kis_auth 의 `auth(svr=...)` 가 모의면 `paper_app/paper_sec`, 실전이면 `my_app/my_sec` 를 읽기 때문(원본 `kis_auth.py:208-213`). **쓸 칸에만 키를 넣고 나머지는 빈문자열**로 둬서, 실수로 반대 환경에 키가 새지 않게 합니다.
- **미니 표**(같은 `app_key="K"`, `app_secret="S"` 일 때):

  | 필드 | `is_paper=True`(모의) | `is_paper=False`(실전) |
  |---|---|---|
  | `my_app` / `my_sec` | `""` / `""` | `K` / `S` |
  | `paper_app` / `paper_sec` | `K` / `S` | `""` / `""` |

**(나) 계좌 칸 — `L64-L71`**
- `my_acct_stock` 와 `my_paper_stock` **둘 다 `creds.cano`** 로 채웁니다. 모의/실전 어느 쪽으로 auth 하든 같은 계좌번호를 쓰면 되도록 양쪽에 다 넣어둔 것(어차피 쓸 환경의 칸만 읽힘).
- `my_acct_future` / `my_paper_future` = `""` — **선물 계좌는 안 씀**(우리는 현물 주식만). 빈칸.
- `my_prod` = `creds.acnt_prdt_cd` — 상품코드("01" 등).
- `my_htsid` = `creds.hts_id` — HTS ID.
- `my_token` = `""` — **토큰은 비워둠**. 발급받은 OAuth 토큰을 캐시하는 칸인데, 처음엔 비고 kis_auth 가 `auth()` 때 채웁니다.

**(다) 도메인 URL 칸 — `L72-L76`**
- 4개 URL 은 **KIS 공식 고정 주소**입니다(외워서 넣은 게 아니라 KIS 가 정한 값):
  - `my_url` (실전 REST) : `openapi.koreainvestment.com:9443`
  - `my_paper_url` (모의 REST) : `openapivts.koreainvestment.com:29443`
  - `my_url_ws` (실전 웹소켓) : `ops.koreainvestment.com:21000`
  - `my_paper_url_ws` (모의 웹소켓) : `ops.koreainvestment.com:31000`
- **헷갈리는 포인트**: 모의 주소에 붙는 `vts`(virtual trading system)와 모의 포트(`29443`/`31000`)가 실전(`9443`/`21000`)과 다릅니다. 이걸 헷갈리면 "모의키로 실전서버 호출 → 인증 실패".

**(라) User-Agent 칸 — `L77-L78` (실전에서 데인 교훈)**
- `"my_agent": "Mozilla/5.0 (compatible) alpha-helix-analytics/1.0"`
- **왜 굳이?** 주석대로 *"KIS 게이트웨이가 기본 Java/Python UA 차단"*. KIS 의 `/oauth2/tokenP` 게이트웨이는 파이썬/자바 기본 User-Agent(`Java-http-client/...` 등)를 보면 **403(EGW00002)로 거부**합니다. 그래서 **브라우저처럼 보이는 UA** 를 강제로 박아둡니다.
- kis_auth 는 이 값을 `_cfg["my_agent"]` 로 읽어 모든 요청 헤더에 씁니다(원본 `kis_auth.py:72`).
- **이건 실제 사고 사례입니다** — 이 UA 한 줄이 없으면 토큰 발급부터 막힙니다.

#### D-4. 파일로 받아쓰기 — `L81-L84`
```python
# L81-L84
    yaml_path = cfg_dir / "kis_devlp.yaml"
    with open(yaml_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(cfg, f, allow_unicode=True, sort_keys=False)
    return yaml_path
```
- `yaml_path` — 최종 파일 경로(`.../KIS/config/kis_devlp.yaml`).
- `open(..., "w", encoding="utf-8")` — 쓰기 모드로 열기. `with` 블록이라 끝나면 자동으로 닫힘(파일 누수 방지).
- `yaml.safe_dump(cfg, f, ...)` — dict 를 yaml 텍스트로 변환해 파일에 씀.
  - `safe_dump`(`dump` 아님) — **안전 버전**. 임의 파이썬 객체를 직렬화하지 않아 보안상 권장.
  - `allow_unicode=True` — 한글 등 유니코드를 `\uXXXX` 로 깨뜨리지 않고 **그대로** 저장.
  - `sort_keys=False` — **우리가 쓴 순서 그대로** 유지(가나다 정렬 안 함). 사람이 읽기 좋고 위 주석(`# 실전`, `# 모의`)의 그룹 순서가 보존됨.
- `return yaml_path` — 쓴 파일 경로를 돌려줌(호출자가 위치를 알 수 있게).
- **헷갈리는 포인트**: 여기서 **민감한 키가 평문 파일로 디스크에 떨어진다**는 점. 이 파일의 보관/권한이 곧 보안 경계입니다(함정 섹션 참고).

---

### E. HOME 까지 세팅하는 래퍼 `configure_kis_home_once()` — `L87-L100`

```python
# L87-L100
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
```
- **무엇을 하나**: `write_kis_devlp_yaml` 로 yaml 을 쓰고, **추가로 `HOME`/`USERPROFILE` 환경변수를 그 폴더로 바꿔서** kis_auth 가 `~` 를 풀 때 우리 폴더를 가리키게 만듭니다. "yaml 쓰기 + 위치 지정"을 한 번에 해주는 **편의 래퍼**.

**(가) home 폴더 결정 — `L96`**
```python
    home = home_dir or Path(os.environ.get("ALPHA_LEAN_KIS_HOME", str(Path.home())))
```
- 우선순위(왼쪽이 먼저):
  1. **인자 `home_dir`** 가 주어지면 그것.
  2. 없으면 환경변수 **`ALPHA_LEAN_KIS_HOME`**.
  3. 그것도 없으면 **`Path.home()`**(현재 OS 의 실제 홈 폴더).
- `A or B` 관용구 — A 가 "참 같은 값(None/빈문자열이 아님)"이면 A, 아니면 B. 여기선 "인자가 None 이면 환경변수 경로로 폴백".
- **`ALPHA_LEAN_KIS_HOME`** = 이 파일이 읽는 **유일한 환경변수**. "yaml 을 어디에 깔까"를 운영 환경(EC2 등)에서 바꿀 수 있게 한 손잡이. 미설정이면 사용자 홈에 그냥 깔립니다.

**(나) yaml 쓰기 — `L97`**
```python
    write_kis_devlp_yaml(creds, home)
```
- D 함수를 그대로 호출. `home` 아래 `KIS/config/kis_devlp.yaml` 이 만들어짐.

**(다) HOME/USERPROFILE 덮어쓰기 — `L98-L99`**
```python
    os.environ["HOME"] = str(home)
    os.environ["USERPROFILE"] = str(home)
```
- **둘 다** 바꾸는 이유: **OS 호환성**. 리눅스/맥은 `HOME`, 윈도우는 `USERPROFILE` 을 봅니다. 어디서 돌아도 `~` 가 우리 폴더로 풀리도록 양쪽 다 세팅.
- ⚠️ **부작용 주의**: 이건 **프로세스 전체의 전역 상태**를 바꿉니다. 이 줄 이후 그 프로세스 안의 **모든** `~` 해석이 바뀝니다(KIS 와 무관한 코드 포함). 그래서 "한 프로세스 한 사용자(single-tenant)" 제약이 생깁니다.
- `return home` — 최종 결정된 home 경로를 돌려줌.

**(라) docstring 의 3대 경고(매우 중요)**
1. *"MUST be called BEFORE any import kis_auth"* — 사전지식 5번. import 가 yaml 을 읽으므로 **순서 절대 엄수**. 늦으면 옛 위치/없는 파일을 읽음.
2. *"Idempotent ... but kis_auth itself only loads once per process"* — 이 함수는 여러 번 불러도 yaml 을 다시 쓰지만, **kis_auth 는 이미 import 됐으면 다시 안 읽습니다**. 즉 **두 번째 사용자 키로 바꿔 써도 kis_auth 는 첫 키를 계속 씀** → 다중 사용자 전환이 안 되는 근본 원인.
3. *"For per-request multi-tenant use, prefer spawning a subprocess"* — 사용자별로 격리하려면 **별도 프로세스(subprocess)** 를 띄우라는 권고(각 프로세스가 자기 yaml 을 import 시 한 번 읽으므로 안전). 이 격리는 아직 구현 안 됨(deferred).

> 💡 초보 포인트: 함수 이름의 `_once`(한 번) 는 이 한계를 솔직히 드러낸 이름입니다 — "한 프로세스에서 사실상 한 번만 의미 있다".

---

## ⚠️ 함정·버그 주의 (코드·맥락에 박힌 교훈 모음)

1. **import 타이밍 (1순위 함정)** — kis_auth/kis_backtest.providers.kis 는 **import 순간** yaml 을 읽음. `configure_kis_home_once` 를 그 **import 보다 먼저** 호출하지 않으면, 옛 위치를 읽거나 파일이 없어 터짐. "함수만 호출하면 되겠지" 라고 늦게 부르면 실패.

2. **프로세스당 1회 로드 → 다중 사용자 불가** — kis_auth 는 프로세스 생애 첫 import 때 한 번만 yaml 을 읽음. yaml 을 새 키로 다시 써도 **이미 로드된 kis_auth 는 옛 키를 계속 사용**. 요청마다 다른 사용자를 처리하려면 **subprocess 격리**가 필수(미구현).

3. **HOME 전역 오염** — `os.environ["HOME"]` 변경은 **프로세스 전체**에 영향. KIS 와 무관한 라이브러리가 `~/.cache` 등을 다른 위치로 인식해 **예상 못 한 부작용**을 낼 수 있음. 같은 프로세스에서 이 함수를 쓰는 순간 "이 프로세스는 KIS 전용"이라고 봐야 함.

4. **평문 키가 디스크에 떨어짐** — `write_kis_devlp_yaml` 은 `app_key/app_secret`(허가증) 을 **평문 yaml** 로 파일에 씀. DB 는 AES-GCM 으로 보호하는데 이 파일은 평문이므로, **파일 권한/임시 폴더 정리**가 곧 보안 경계. 키 회수 후 yaml 삭제 로직은 **이 모듈에 없음**(호출자 책임 또는 미구현).

5. **모의/실전 칸 혼동** — `is_paper` 분기가 핵심. 실전 키를 모의 칸에 넣거나 그 반대면 인증이 조용히 실패하거나(빈칸) 엉뚱한 서버로 감. URL 도 모의/실전(`vts`·포트)이 다름.

6. **User-Agent 필수** — `my_agent` 한 줄이 없으면 KIS 게이트웨이가 기본 UA 를 403(EGW00002)으로 막아 **토큰 발급부터 실패**. 절대 지우지 말 것.

7. **docstring vs 코드 불일치(문서 부패)** — `__init__.py` 는 이걸 *"Pydantic models"* 라 부르지만 실제는 `@dataclass`. 코드를 믿고, 주석은 참고만. (강의에서 "주석은 거짓말할 수 있다"의 실사례로 좋음.)

8. **현재 미연결(dormant)** — `runner.py` 는 이 모듈을 **건너뜀**(yf/Polygon 데이터 사용, KIS 인증 안 함). 즉 지금 코드 경로에선 이 파일이 **호출되지 않음**. "있으니 동작하겠지"라고 가정하면 오해 — KRX/KIS 데이터 fetch 를 붙이는 미래 작업에서야 비로소 살아남.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **다중 사용자(multi-tenant) 격리**: docstring 권고대로 요청마다 **subprocess** 를 띄워 각자 자기 `HOME`/yaml 을 갖게 하기. 또는 kis_auth 를 포크해 "파일 대신 인자로 키 받기"로 리팩터(가장 깨끗하지만 vendored 수정 부담).
- **임시 폴더 + 자동 삭제**: `tempfile.mkdtemp()` 로 격리 폴더를 만들고, 작업 후 yaml 을 **즉시 삭제**(평문 키 잔존 시간 최소화). `try/finally` 로 보장.
- **파일 권한 강제**: 작성한 yaml 에 `os.chmod(path, 0o600)`(소유자만 읽기/쓰기) 적용해 같은 머신의 타 사용자 노출 차단.
- **메모리-only 경로**: 디스크 우회. kis_auth 를 살짝 감싸 yaml 내용을 **환경변수/메모리**로 주입하는 어댑터를 만들면 "평문 파일" 함정을 근본 제거.
- **검증(validation) 추가**: `KisCredentials` 생성 시 길이 체크(app_key 36자, app_secret 180자, cano 8자리). dataclass `__post_init__` 또는 Pydantic 전환(그러면 `__init__.py` 주석과도 일치!).
- **선물/연금 확장**: 지금 `my_acct_future` 등은 빈칸. `acnt_prdt_cd` 가 "03"(선물)·"29"(퇴직연금) 등일 때 해당 칸을 채우도록 분기 추가하면 kis_auth 의 다양한 product 분기를 활용 가능.
- **호출 가드**: "kis_auth 가 이미 import 됐는지"를 `sys.modules` 로 검사해, 늦게 호출하면 **명시적 에러**를 던지기(조용한 실패 → 시끄러운 실패로 전환).

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **shim** | 두 코드 사이의 규약 차이를 메우는 얇은 변환층(어댑터). vendored 코드를 안 고치려고 바깥에 끼움 |
| **vendored** | 외부 라이브러리(KIS open-trading-api)를 우리 저장소 안에 통째로 복사해 넣은 것 |
| **자격증명(credentials)** | API 신분증+비밀번호. 여기선 app_key/app_secret/계좌번호 등 |
| **app_key / app_secret** | KIS OAuth 토큰을 발급받기 위한 허가증 한 쌍(각 36자/180자) |
| **cano / acnt_prdt_cd** | 종합계좌번호(8자리) / 상품코드(2자리, "01"=주식위탁) |
| **is_paper / paper(vps) / real(prod)** | 모의투자 여부. True=모의(가짜돈), False=실전(진짜돈) |
| **kis_devlp.yaml** | kis_auth 가 import 시점에 읽는 고정 설정 파일. 이 모듈이 생성 |
| **HOME / USERPROFILE** | 홈 폴더 위치 환경변수(리눅스·맥 / 윈도우). `~` 해석의 기준 |
| **import 시점 로드** | 함수 호출이 아니라 모듈을 import 하는 순간 코드(yaml 읽기)가 실행됨 |
| **멱등(idempotent)** | 여러 번 호출해도 결과·부작용이 같아 안전 |
| **single-tenant / multi-tenant** | 한 프로세스에 한 사용자 / 여러 사용자. 이 모듈은 전자만 안전 |
| **User-Agent(UA)** | HTTP 요청자 신원 문자열. KIS 가 기본 Java/Python UA 를 차단해 브라우저풍 UA 강제 |
| **AES-GCM** | 백엔드가 app_secret 을 DB 에 암호화 저장하는 방식. 이 모듈은 복호화된 평문만 받음 |
| **ALPHA_LEAN_KIS_HOME** | yaml 을 깔 폴더를 지정하는 환경변수(이 파일이 읽는 유일한 env) |
| **dormant infrastructure** | 만들어 뒀지만 아직 호출되지 않는 예비 코드(미래 KIS 데이터 fetch 용) |
