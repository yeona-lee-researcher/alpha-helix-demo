# `config.py` — 엔진의 설정 패널·계기판 (완전 라인별 해설)

> 원본: `analytics/app/config.py` (52줄)
> 이 문서는 교재 표준 형식(`01_backtest/vbt_engine.md`)을 따릅니다.

---

## 📌 이 파일 한눈에

이 파일은 **"엔진 설정 패널 / 계기판"** 입니다. 자동차로 치면 시동 버튼·연료 게이지·정비소 주소가 한 패널에 모여 있는 것과 같습니다. 엔진의 다른 모든 모듈(`vbt_engine`, `main.py`, `yf_client`, `xgb_signal` …)이 **숫자·경로·토큰을 직접 코드 안에 박지 않고**, 이 파일 한 곳에서 꺼내 씁니다.

핵심 원칙은 딱 하나입니다: **"바뀔 수 있는 값은 전부 여기 모아, 한 곳만 고치면 전체가 바뀌게 한다."** (매직넘버·매직경로 박제 금지.)

| 상수 | 한 줄 역할 | 누가 쓰나(검증됨) |
|---|---|---|
| `ROOT_DIR` | 프로젝트(analytics) 루트 폴더 위치 | 아래 모든 경로의 기준점 |
| `CACHE_DIR` | 주가 캐시(.parquet) 저장 폴더 | `data/yf_client.py` |
| `REPORTS_DIR` | QuantStats HTML 리포트 저장·서빙 폴더 | `main.py`(정적 서빙 + 저장) |
| `MODEL_DIR` | 학습된 XGBoost 모델(.joblib) 폴더 | `models/xgb_signal.py`, `retrain_scheduler.py` |
| `INTERNAL_TOKEN` | 백엔드↔엔진 사이드카 인증 토큰 | `main.py`(`require_internal_token`) |
| `PRICE_CACHE_TTL_MIN` | 주가 캐시 신선도 유효시간(분) | `data/yf_client.py` |
| `DEFAULT_UNIVERSE` | 기본 종목 화이트리스트 | `main.py`(시그널 기본 목록), `retrain_scheduler.py` |
| `DEFAULT_INITIAL_CAPITAL` | 백테스트 기본 시작자본(USD) | `backtest/vbt_engine.py` |
| `DEFAULT_FEES` | 거래 수수료 기본값(0.25%) | `backtest/vbt_engine.py` |
| `DEFAULT_SLIPPAGE` | 슬리피지 기본값(0.10%) | `backtest/vbt_engine.py` |

**누가 호출하나?** → 거의 **모든 모듈**이 `from app.config import ...` 로 가져갑니다. 그래서 이 파일은 "엔진의 단일 진실 공급원(single source of truth)" 역할을 합니다.

**왜 따로 파일로 빼나?** → 같은 값(예: 수수료 0.25%)을 여러 파일에 복붙해 두면, 나중에 한 군데만 고치고 다른 데를 빠뜨려 **버그**가 납니다. 한 곳(config)에 모으면 "여기만 고치면 끝"이 됩니다. (실제로 주석 `L44-L45` 에 "구버전 0.05% → 5배 낙관적 버그였다"는 교훈이 박혀 있습니다.)

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 환경변수(environment variable)와 `os.getenv`

- **환경변수** = 코드 밖(운영체제·실행환경)에 저장해 두는 "설정 쪽지". 비밀번호·토큰처럼 **코드에 적으면 안 되는 값**을 여기에 둡니다.
- `os.getenv("이름", "기본값")` = "환경변수 `이름`을 찾아봐. 있으면 그 값, **없으면 기본값**을 줘."
```
os.getenv("ANALYTICS_INTERNAL_TOKEN", "dev-internal-token-change-me")
        └ 환경에 이 키가 있으면 그 값 / 없으면 우측 기본값 사용
```
- 비유: 금고(환경)에 열쇠가 있으면 그걸 쓰고, 없으면 임시 마스터키(기본값)로 연다.

#### 2) 기본값(default)이 "있다 vs 없다"의 의미

- 기본값이 **있는** 값(`INTERNAL_TOKEN`, `PRICE_CACHE_TTL_MIN`)은 환경변수가 없어도 앱이 **그냥 뜹니다**(임시값으로). → 편하지만, 임시값이 운영에 그대로 새어 나가면 **보안 사고**(아래 함정 참고).
- 기본값이 **없는** 값(이 파일엔 없지만, 백엔드의 `APP_CRYPTO_KEY` 가 대표)은 환경변수가 없으면 앱이 **시동 실패**합니다. → 불편하지만 "비밀값 깜빡"을 원천 차단.

#### 3) `.env` 파일과 `load_dotenv()`

- `.env` = 프로젝트 폴더에 두는 "환경변수 모음 텍스트 파일"(`KEY=VALUE` 형식). 로컬 개발에서 매번 환경변수를 손으로 export 하지 않으려고 씁니다.
- `load_dotenv()` = 그 `.env` 파일을 읽어 **환경변수처럼 등록**해 주는 함수(라이브러리 `python-dotenv`). 그래서 이 줄이 **`os.getenv` 들보다 먼저** 실행돼야 합니다.
- 템플릿: `analytics/.env.example` (CLAUDE.md 기준). 실제 비밀값을 담은 `.env` 는 git 에 올리지 않습니다.

#### 4) 토큰(token) = "출입증"

- `INTERNAL_TOKEN` 은 비밀번호 같은 **출입증 문자열**입니다. 백엔드(Spring Boot)가 엔진에 요청할 때 이 출입증을 헤더에 넣어 보내고, 엔진은 "내가 아는 출입증과 같나?"를 비교해 통과시킵니다. 외부 사람이 엔진(:8001)에 직접 들어오는 걸 막는 장치.

#### 5) `Path`(pathlib) = "운영체제 독립 경로"

- `Path(...)` 는 윈도우(`\`)·리눅스(`/`) 차이를 자동 처리하는 경로 객체. `A / "cache"` 처럼 **나눗셈 기호로 경로를 잇습니다**(`os.path.join` 의 현대식 표기).
- `.resolve()` = 상대경로를 절대경로로 확정. `.parent` = 한 단계 위 폴더. `.mkdir(exist_ok=True)` = 폴더 만들되 이미 있으면 조용히 통과.

---

## 🗺 전체 흐름도

```
                         (앱 시동 시 config.py 가 가장 먼저 import 됨)
                                        │
                    ┌───────────────────┼─────────────────────────┐
                    ▼                                              ▼
        .env 읽기 (load_dotenv)                        ROOT_DIR 계산 (이 파일 위치 기준)
        └ KEY=VALUE 를 환경변수로 등록                  └ analytics/ 폴더를 가리킴
                    │                                              │
                    ▼                          ┌──────────────────┼──────────────────┐
        os.getenv(...) 로 토큰·TTL 읽기          ▼                  ▼                  ▼
                                          CACHE_DIR          REPORTS_DIR          MODEL_DIR
                                        (cache/ 생성)       (reports/ 생성)     (models_cache/ 생성)

  이렇게 만들어진 상수들을 각 모듈이 import 해서 사용:

   DEFAULT_FEES/SLIPPAGE/CAPITAL ─────────▶ backtest/vbt_engine.py  (BacktestParams 기본값)
   CACHE_DIR / PRICE_CACHE_TTL_MIN ───────▶ data/yf_client.py       (주가 캐시 경로·신선도)
   INTERNAL_TOKEN ────────────────────────▶ main.py                 (require_internal_token 인증)
   REPORTS_DIR ───────────────────────────▶ main.py                 (/reports 정적 서빙 + 저장)
   DEFAULT_UNIVERSE ──────────────────────▶ main.py(시그널 기본목록) + retrain_scheduler.py
   MODEL_DIR ─────────────────────────────▶ models/xgb_signal.py + retrain_scheduler.py
```

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) + import — `L1-L5`

```python
# L1-L5
"""
Configuration loaded from env vars (with .env support).
"""
import os
from pathlib import Path
```
- `"""..."""` = 파일 맨 위 **설명서(docstring)**. 실행되지 않고 사람이 읽는 용도. "환경변수에서 설정을 읽는다(.env 지원)"는 이 파일의 정체성을 한 줄로 선언.
- `import os` — 운영체제와 대화하는 표준 모듈. 여기선 **환경변수 읽기**(`os.getenv`)에 씁니다.
- `from pathlib import Path` — 현대식 **경로 다루기** 도구. 아래 폴더 경로 4개를 만들 때 사용.

> 💡 초보 포인트: `import A` 면 `A.기능()` 으로, `from A import B` 면 `B()` 로 바로 씁니다. `os` 는 통째로, `Path` 는 콕 집어 가져온 차이.

---

### B. `.env` 파일 로드 (있으면) — `L7-L11`

```python
# L7-L11
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass
```
- **무엇을 하나**: `.env` 파일을 읽어 그 안의 `KEY=VALUE` 들을 환경변수로 등록. 이걸 먼저 해 둬야 아래 `os.getenv(...)` 가 `.env` 값을 볼 수 있습니다.
- **왜 `try/except` 로 감싸나**: `python-dotenv` 라이브러리가 설치 안 된 환경(예: 운영서버는 환경변수를 직접 주입하므로 `.env` 불필요)에서도 **앱이 죽지 않게** 하려고. `ImportError`(라이브러리 없음)가 나면 `pass`(아무것도 안 함)로 조용히 넘어갑니다.
- **초보가 헷갈리는 포인트**: 이건 "`.env` 가 없어도 OK / `dotenv` 라이브러리가 없어도 OK" 라는 **이중 안전장치**입니다. 운영서버에서는 보통 `.env` 없이 진짜 환경변수로 동작.

> 💡 비유: 도시락(.env)을 챙겨 왔으면 펴서 먹고, 없으면 그냥 식당(실제 환경변수)에서 먹는다. 도시락통 자체(dotenv 라이브러리)가 없어도 굶지(앱 크래시) 않는다.

---

### C. 경로의 기준점 `ROOT_DIR` — `L13`

```python
# L13
ROOT_DIR = Path(__file__).resolve().parent.parent
```
- **무엇을 하나**: 이 `config.py` 파일의 위치를 기준으로 **`analytics/` 루트 폴더**를 계산.
- **한 단계씩**:
  - `__file__` = 지금 이 파일의 경로(`.../analytics/app/config.py`).
  - `.resolve()` = 절대경로로 확정.
  - `.parent` = `app/` 폴더 (config.py 의 부모).
  - `.parent` 한 번 더 = `analytics/` 폴더 (app 의 부모). ← 이게 `ROOT_DIR`.
- **왜 이렇게 하나**: 경로를 `"C:/Alpha_Helix/analytics"` 처럼 **직접 박으면**, 다른 사람 PC·서버에서 경로가 달라 깨집니다. "파일 위치 기준 상대 계산"은 **어디서 실행해도 올바른 루트**를 찾아줍니다(이식성).
- **바꾸면 생기는 일**: `.parent` 개수를 잘못 세면 아래 `CACHE_DIR`·`MODEL_DIR` 등이 **엉뚱한 폴더**를 가리킵니다. 가장 흔한 사고: 파일을 다른 깊이의 폴더로 옮기면 이 줄을 같이 고쳐야 함.

> 💡 초보 포인트: `.parent.parent` = "두 단계 위로". 마치 폴더 탐색기에서 '뒤로' 버튼을 두 번 누른 것.

---

### D. 주가 캐시 폴더 `CACHE_DIR` — `L14-L15`

```python
# L14-L15
CACHE_DIR = ROOT_DIR / "cache"
CACHE_DIR.mkdir(exist_ok=True)
```
- **무엇을 하나**: `analytics/cache/` 경로를 만들고(문자열 계산), 실제 폴더가 없으면 **생성**.
- `ROOT_DIR / "cache"` = 루트 밑 `cache` 폴더. (`/` 는 나눗셈이 아니라 **경로 잇기** — `Path` 의 기능.)
- `.mkdir(exist_ok=True)` = 폴더 만들기. `exist_ok=True` 덕분에 이미 있어도 에러 없이 넘어감(앱 재시작 시 안전).
- **어디서 쓰나(검증됨)**: `data/yf_client.py:25` — `_cache_path()` 가 `CACHE_DIR / f"{ticker}_{interval}_{period}.parquet"` 로 종목별 주가 캐시 파일 경로를 만듭니다. 즉 야후 파이낸스에서 받은 주가를 **여기에 .parquet 으로 저장**해 두고 재사용.
- **바꾸면 생기는 일**: 경로를 옮기면 기존 캐시를 못 찾아 전부 재다운로드(느려짐). 폴더를 지우면 캐시 초기화(다음 호출 때 다시 받음).

---

### E. 리포트 폴더 `REPORTS_DIR` — `L17-L19`

```python
# L17-L19
# QuantStats가 생성하는 HTML tearsheet 저장 경로 (정적 서빙)
REPORTS_DIR = ROOT_DIR / "reports"
REPORTS_DIR.mkdir(exist_ok=True)
```
- **무엇을 하나**: `analytics/reports/` 폴더를 만들고 보장. QuantStats 가 만든 **HTML 성적표(tearsheet)** 를 여기에 저장합니다.
- **어디서 쓰나(검증됨)** — 두 곳, `main.py`:
  - `main.py:60` — `app.mount("/reports", StaticFiles(directory=str(REPORTS_DIR)), ...)`: 이 폴더를 **웹에 정적 서빙**. 그래서 브라우저가 `GET /reports/파일명.html` 로 리포트를 바로 열 수 있습니다.
  - `main.py:445` — `out_path = REPORTS_DIR / fname`: 새 리포트 HTML 을 이 폴더에 **저장**할 때의 경로.
- **초보가 헷갈리는 포인트**: 주석 `(정적 서빙)` + `main.py` 의 mount 코드를 보면, 이 폴더는 인증 없이 공개됩니다(`main.py:59` 주석 "no auth — 공개 링크"). 즉 파일명을 아는 사람은 누구나 리포트를 볼 수 있음 → 민감정보를 리포트에 넣지 않도록 주의(아래 함정 참고).

---

### F. 내부 인증 토큰 `INTERNAL_TOKEN` — `L21-L22`

```python
# L21-L22
# Service auth: Spring Boot calls this with this token
INTERNAL_TOKEN = os.getenv("ANALYTICS_INTERNAL_TOKEN", "dev-internal-token-change-me")
```
- **무엇을 하나**: 백엔드↔엔진 사이의 **출입증**. 환경변수 `ANALYTICS_INTERNAL_TOKEN` 이 있으면 그 값, 없으면 기본값 `"dev-internal-token-change-me"`(개발용 임시).
- **어디서 쓰나(검증됨)**: `main.py:64-66` 의 인증 함수
  ```python
  def require_internal_token(x_internal_token: str = Header(default="")) -> None:
      if x_internal_token != INTERNAL_TOKEN:
          raise HTTPException(status_code=401, detail="invalid internal token")
  ```
  요청 헤더 `X-Internal-Token` 이 이 값과 다르면 **401(거부)**. 즉 백엔드는 모든 호출에 이 헤더를 붙여야 하고, 외부인은 이 토큰을 모르므로 엔진 API 에 직접 못 들어옵니다. (CLAUDE.md "Analytics 내부 토큰으로 외부 직접 접근 차단"의 실제 구현 지점.)
- **바꾸면 생기는 일**: 운영에서 환경변수를 안 주면 기본값 `dev-internal-token-change-me` 가 그대로 쓰여 **누구나 추측 가능한 출입증**이 됩니다(보안 구멍). 반드시 운영 환경변수로 강한 랜덤값 주입. 백엔드와 엔진의 토큰이 **불일치**하면 모든 호출이 401 로 막힙니다.

> ⚠️ 이 기본값 `"...change-me"` 는 이름부터 "바꿔라"라는 경고입니다. 함정 섹션에서 다시 강조합니다.

---

### G. 캐시 신선도 `PRICE_CACHE_TTL_MIN` — `L24-L25`

```python
# L24-L25
# Cache TTL (minutes)
PRICE_CACHE_TTL_MIN = int(os.getenv("PRICE_CACHE_TTL_MIN", "60"))
```
- **무엇을 하나**: 주가 캐시가 "몇 분까지 신선한가"를 정하는 값. 기본 **60분**.
- **왜 `int(...)` 로 감싸나**: 환경변수는 **항상 문자열**로 들어옵니다. `"60"`(문자) 그대로면 숫자 비교가 안 되니 `int()` 로 **정수 변환**. (`os.getenv` 의 기본값도 `"60"` 문자열인 이유.)
- **TTL 이란**: Time-To-Live, "이 값이 살아있는 시간". 캐시가 만들어진 지 60분이 안 됐으면 "신선" → 재사용, 넘으면 "오래됨" → 새로 다운로드.
- **어디서 쓰나(검증됨)**: `data/yf_client.py:150` — `_is_fresh(path, PRICE_CACHE_TTL_MIN)`. `_is_fresh` 는 파일의 수정시각과 현재시각 차이가 TTL(분) 이내인지 검사합니다(`yf_client.py:28-32`).
- **바꾸면 생기는 일**:
  - 값을 **늘리면**(예: 1440=하루): API 호출 줄어 빠르지만, 장중 가격 변화를 늦게 반영.
  - **줄이면**(예: 1): 거의 매번 새로 받아 최신이지만 느리고 야후 호출 제한에 걸릴 수 있음.

---

### H. 기본 종목 화이트리스트 `DEFAULT_UNIVERSE` — `L27-L40`

```python
# L27-L40
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
```
- **무엇을 하나**: 엔진이 **기본으로 다루는 종목 목록(화이트리스트)**. 각 줄의 주석이 종목 분류를 설명합니다.
  - **3X 레버리지 ETF**(SOXL·TQQQ·UPRO 등): 하루 변동의 3배로 움직이는 고위험 ETF. 무한매수법(분할매수) 후보.
  - **2X/벤치마크**(QLD·QQQ·SPY): 비교 기준 + 2배 ETF.
  - **방어/리스크오프/인컴**(SCHD·SHY·TLT·GLD): 하락장 대비 자산(배당주·단기채·장기채·금).
  - **`^VIX`**: 공포지수. `regime`(시장 국면) 분류에 쓰는 변동성 지표(주가 종목이 아님).
  - **`BTC-USD`·`ETH-USD`**: 암호화폐. yfinance 형식의 티커 표기.
- **왜 "화이트리스트"인가**: 아무 종목이나 받지 않고 **검증된 목록만** 허용 → 오타·존재하지 않는 티커·악의적 입력 차단. 주석이 강조하듯 **백엔드의 `ALLOWED_TICKERS` 와 똑같이 유지**해야 BE/엔진 양쪽 검증이 일치합니다.
- **어디서 쓰나(검증됨)** — 두 곳:
  - `main.py:97` — `SignalReq.tickers` 의 **기본값**: `Field(default_factory=lambda: list(DEFAULT_UNIVERSE))`. 시그널 요청에 종목을 안 적으면 이 전체 목록이 대상이 됩니다. (`default_factory` 로 매 요청마다 **새 리스트 복사**를 만드는 이유는 함정 섹션 참고.)
  - `retrain_scheduler.py:23,14` — XGBoost 자동 재학습 시 "항상 기본 우주의 주요 종목도 포함"(주석 `retrain_scheduler.py:14`).
- **바꾸면 생기는 일**: 종목을 추가/삭제하면 시그널 기본 대상·재학습 대상이 함께 바뀝니다. **백엔드 화이트리스트와 어긋나면** 한쪽에선 허용·다른쪽에선 거부되어 혼란이 생깁니다(반드시 동기화).

---

### I. 백테스트 기본값 3종 — `L42-L47`

```python
# L42-L47
# Backtest defaults
DEFAULT_INITIAL_CAPITAL = 10_000.0  # USD
# KIS 해외주식 실제 수수료: 약 0.25% (매수/매도 각각)
# 구버전 0.05%는 실제보다 5배 낙관적 → 백테스트 결과 과대평가됨
DEFAULT_FEES = 0.0025  # 0.25% per trade (KIS 해외주식 실수수료)
DEFAULT_SLIPPAGE = 0.001  # 0.10% 슬리피지 (레버리지 ETF 유동성 감안)
```
- **무엇을 하나**: 백테스트의 3대 기본 손잡이.
  - `DEFAULT_INITIAL_CAPITAL = 10_000.0` — 시작 자본 **1만 달러**. (`10_000` 의 `_` 는 자릿수 가독성용 구분자. 값은 `10000.0`.)
  - `DEFAULT_FEES = 0.0025` — 거래 1회당 **0.25%** 수수료.
  - `DEFAULT_SLIPPAGE = 0.001` — **0.10%** 슬리피지(원하는 가격보다 불리하게 체결되는 정도).
- **왜 이 값인가(주석의 교훈)**: 주석 `L44-L45` 가 핵심입니다. 예전엔 수수료를 `0.05%` 로 뒀는데, KIS 해외주식 실제 수수료(약 0.25%)보다 **5배 낙관적**이라 백테스트 성적이 부풀려졌습니다. 그래서 **현실값 0.25% 로 교정**. 슬리피지 0.10% 도 "레버리지 ETF 는 유동성이 낮아 체결오차가 크다"는 현실을 반영.
- **어디서 쓰나(검증됨)**: `backtest/vbt_engine.py:19,42-44`. `BacktestParams` 의 기본값으로 들어갑니다:
  ```python
  initial_capital: float = DEFAULT_INITIAL_CAPITAL
  fees: float = DEFAULT_FEES
  slippage: float = DEFAULT_SLIPPAGE
  ```
  그리고 이 값들이 `vbt.Portfolio.from_signals(..., init_cash=, fees=, slippage=)` 로 전달돼 **실제 가상 매매 비용**이 됩니다(상세는 `01_backtest/vbt_engine.md` E절).
  - 참고: `main.py:91-93` 의 `BacktestReq` 는 이 상수를 import 하지 않고 **같은 숫자(10000.0/0.0025/0.001)를 따로 적어** API 기본값으로 둡니다. 즉 "두 군데에 같은 값"이 존재 — 한쪽만 바꾸면 어긋날 수 있으니 주의(아래 함정).
- **바꾸면 생기는 일**: 수수료를 낮추면 백테스트 성적이 **비현실적으로 좋아지고**(과거 그 버그), 높이면 보수적으로 나옵니다. 자본금은 절대 수익률 금액에만 영향(수익률 %에는 영향 거의 없음). 슬리피지는 자주 거래하는 전략(예: sma_cross)일수록 성적을 크게 깎습니다.

---

### J. 모델 저장 폴더 `MODEL_DIR` — `L49-L51`

```python
# L49-L51
# Model artifacts
MODEL_DIR = ROOT_DIR / "models_cache"
MODEL_DIR.mkdir(exist_ok=True)
```
- **무엇을 하나**: 학습된 XGBoost 모델 파일(`.joblib`)을 저장하는 `analytics/models_cache/` 폴더. ("artifacts" = 학습이 만들어 낸 산출물.)
- **어디서 쓰나(검증됨)** — 두 곳:
  - `models/xgb_signal.py:113,126` — `MODEL_DIR / f"xgb_{ticker.upper()}.joblib"`: 종목별 모델을 **저장/로드**하는 경로(예: `xgb_TQQQ.joblib`).
  - `retrain_scheduler.py:23,49` — `MODEL_DIR.glob("xgb_*.joblib")` 로 "이미 학습된 티커 목록"을 폴더에서 스캔(`_get_trained_tickers`). 매일 22:30 KST 재학습 시 어떤 종목을 다시 학습할지 결정.
- **바꾸면 생기는 일**: 경로를 옮기면 기존 학습 모델을 못 찾아 다시 학습해야 합니다(시간·자원 소모). 폴더를 비우면 모델 초기화 → 다음 재학습 때 처음부터.

> 💡 초보 포인트: `CACHE_DIR`(주가 캐시), `REPORTS_DIR`(HTML 리포트), `MODEL_DIR`(ML 모델) — **셋 다 "엔진이 만들어 내는 산출물 폴더"** 입니다. 모두 `ROOT_DIR /` 기준으로 만들고 `.mkdir(exist_ok=True)` 로 없으면 생성. 패턴이 똑같다는 걸 보면 이해가 쉽습니다.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 모음)

1. **기본 토큰 `dev-internal-token-change-me` 운영 유출** — `INTERNAL_TOKEN`(`L22`)은 환경변수가 없으면 누구나 아는 임시값이 됩니다. 운영에서 `ANALYTICS_INTERNAL_TOKEN` 을 안 주면 엔진 API 가 사실상 무방비. **운영 필수 환경변수**(CLAUDE.md 의 필수 키 목록에도 등재). 백엔드 토큰과 **정확히 일치**해야 401 이 안 납니다.

2. **수수료 5배 낙관 버그(역사적)** — `L44-L45` 주석. 과거 `0.05%` → 현실 `0.25%` 의 1/5 → 백테스트가 거짓으로 좋아짐. **거래비용 상수를 함부로 낮추지 말 것.** 백테스트 신뢰성의 핵심.

3. **값 중복 정의(드리프트 위험)** — 백테스트 기본값(자본/수수료/슬리피지)이 `config.py`(`L43-L47`)와 `main.py` 의 `BacktestReq`(`main.py:91-93`)에 **각각** 적혀 있습니다. 한쪽만 고치면 API 기본값과 엔진 기본값이 어긋납니다. (사용자 메모리의 "Env priority changes need duplicate-key audit" 와 같은 교훈 — 값을 바꿀 땐 **양쪽을 동시에** 확인.)

4. **화이트리스트 비동기화** — `DEFAULT_UNIVERSE`(`L27`) 주석이 명시하듯 백엔드 `ALLOWED_TICKERS` 와 **동일하게 유지**해야 합니다. 한쪽에만 추가하면 BE 는 허용/엔진은 거부(또는 반대)되어 혼란.

5. **공개 리포트 폴더** — `REPORTS_DIR`(`L18`)은 `main.py:59-60` 에서 **인증 없이 공개 서빙**됩니다(주석 "no auth — 공개 링크"). 파일명을 아는 사람은 누구나 열 수 있으니 **민감정보를 리포트에 넣지 말 것**, 파일명에 예측 어려운 토큰을 섞는 편이 안전.

6. **환경변수는 항상 문자열** — `PRICE_CACHE_TTL_MIN`(`L25`)을 `int(...)` 로 감싸지 않으면 `"60"`(문자)이 들어와 숫자 비교에서 오작동. 숫자형 환경변수는 **반드시 형변환**.

7. **`mkdir` 부작용(import 시 디렉터리 생성)** — 이 파일은 단순 상수 정의가 아니라, **import 되는 순간** `cache/`·`reports/`·`models_cache/` 폴더를 실제로 만듭니다(`L15/19/51`). 테스트에서 `config` 를 import 만 해도 폴더가 생기니, 임시 디렉터리에서 돌리거나 이 부작용을 감안할 것.

8. **`.parent.parent` 깊이 의존** — `ROOT_DIR`(`L13`)은 "config.py 가 `app/` 안에 있다"는 전제를 두 번의 `.parent` 로 박았습니다. 파일을 다른 깊이로 옮기면 모든 경로가 어긋나니 이 줄을 같이 수정해야 합니다.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **설정 검증(fail-fast)**: 앱 시동 시 "운영인데 `INTERNAL_TOKEN` 이 아직 기본값이면 즉시 종료" 같은 가드를 추가. (백엔드의 `APP_CRYPTO_KEY` 처럼 "기본값 없으면 시동 실패" 철학을 엔진에도.) 예: `if ENV=="prod" and INTERNAL_TOKEN.endswith("change-me"): raise SystemExit(...)`.
- **`pydantic-settings` 도입**: 흩어진 `os.getenv` 들을 `Settings` 클래스 하나로 묶어 **타입·필수여부·기본값**을 선언적으로 관리. 형변환(`int(...)`)·검증을 라이브러리가 자동 처리.
- **백테스트 기본값 단일화**: `main.py` 의 `BacktestReq` 가 `config` 상수를 **직접 import** 하도록 바꿔 "값 중복(함정 3)"을 제거. 한 곳만 고치면 끝.
- **유니버스 분리·태그화**: `DEFAULT_UNIVERSE` 를 `LEVERAGED_ETF`, `BENCHMARK`, `DEFENSIVE`, `CRYPTO` 같은 **그룹 dict** 로 나눠, 전략별로 "이 그룹만" 쓰게. 백엔드 화이트리스트와의 동기화를 **단일 JSON 파일 공유**로 자동화하면 함정 4 해소.
- **캐시 TTL 자산별 차등**: 크립토(24시간 시장)와 미국주식(장중만)에 다른 TTL 을 줄 수 있게 dict 화.
- **경로 환경변수화**: `CACHE_DIR`·`MODEL_DIR`·`REPORTS_DIR` 도 환경변수로 덮어쓸 수 있게(`os.getenv("CACHE_DIR", ROOT_DIR/"cache")`) 해 컨테이너·다중인스턴스 배포에서 외부 볼륨을 가리키게.
- **리포트 폴더 접근 제어**: 공개 서빙 대신 서명된 임시 URL(HMAC+TTL, 백엔드 승인 링크와 동일 패턴)로 전환해 함정 5 보강.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| 환경변수(env var) | 코드 밖(OS·실행환경)에 두는 설정값. 비밀값을 코드에 안 박기 위함 |
| `os.getenv("키", "기본값")` | 환경변수를 읽되, 없으면 기본값을 돌려줌 |
| `.env` / `load_dotenv()` | 로컬 개발용 환경변수 모음 파일과 그걸 읽어 등록하는 함수(python-dotenv) |
| 기본값(default) | 환경변수가 없을 때 대신 쓰는 값. "있다=조용히 동작", "없다=시동 실패"의 차이가 큼 |
| 토큰(token) | 인증용 출입증 문자열. 여기선 백엔드↔엔진 사이드카 인증 |
| TTL (Time-To-Live) | 캐시가 신선하다고 보는 유효시간(여기선 분 단위) |
| 화이트리스트 | 허용 목록. 목록에 있는 것만 통과시켜 오타·악성 입력 차단 |
| `Path` (pathlib) | OS 독립 경로 객체. `/` 로 경로를 잇고 `.parent`·`.mkdir` 등 제공 |
| `.mkdir(exist_ok=True)` | 폴더 생성하되 이미 있으면 에러 없이 통과 |
| artifacts(아티팩트) | 학습/실행이 만들어 낸 산출물 파일(여기선 .joblib 모델) |
| 슬리피지(slippage) | 원하던 가격과 실제 체결가의 차이(불리한 정도) |
| `default_factory` | (pydantic) 매 요청마다 기본값을 **새로 만들어** 주는 방식 — 리스트 공유 버그 방지 |
