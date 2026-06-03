# `lean/kis_auth.py` — KIS 증권사 "출입증 발급/갱신 데스크" (완전 라인별 해설)

> 원본: `analytics/app/lean/kis_auth.py` (820줄)
> 한국투자증권(KIS) OpenAPI 의 **인증 토큰 발급·캐시·갱신 + 해시키 + REST/WebSocket 공통 호출** 래퍼.
> 이 문서는 교재 표준 형식(`01_backtest/vbt_engine.md`)을 그대로 따릅니다.
> ⚠️ 이 파일은 **KIS 가 배포한 공식 샘플을 벤더링(복사)** 한 코드입니다. 우리가 손댄 부분(Rate Limiter, `APIRespError` 등)이 섞여 있으니, "원본 vs 우리 수정"을 구분해서 봅니다.

---

## 📌 이 파일 한눈에

이 파일은 **"증권사 출입증(토큰) 발급·갱신 데스크"** 입니다.

KIS 의 모든 주식 API(시세 조회, 주문 등)는 **"너 누구냐"를 증명하는 출입증**이 있어야 부를 수 있습니다. 그 출입증이 바로 **접근 토큰(access token)** 입니다. 이 파일이 하는 일을 한 문장으로 줄이면:

> "앱키·앱시크리트(회원증)를 KIS 에 제출하고 → 하루짜리 출입증(토큰)을 받아 → 파일에 보관해두고 → 만료되면 새로 받아 → 모든 API 호출 헤더에 자동으로 붙여준다."

비유하면 **회사 로비의 출입증 발급 데스크**입니다. 사원증(앱키)을 보여주면 하루용 방문증(토큰)을 인쇄해주고, 그 방문증을 책상 서랍(로컬 파일)에 넣어뒀다가 다음에 또 오면 "아직 안 만료됐네요, 이거 쓰세요" 하고 재사용시키고, 자정이 지나 만료되면 새로 뽑아줍니다.

핵심 함수(공개 함수 전부는 아래 `📖 라인별 해설`의 매핑표에 있음). 가장 중요한 4개:

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `auth(svr, product)` | 토큰 발급(없거나 만료 시) + 헤더·환경(_TRENV) 세팅 | 출입증 새로 인쇄 + 책상에 비치 |
| `read_token()` / `save_token()` | 로컬 파일에서 토큰 읽기 / 저장 | 서랍에서 어제 방문증 꺼내기 / 넣기 |
| `_url_fetch(...)` | 모든 REST API 의 공통 호출구(헤더 조립·Rate Limit·응답 래핑) | 모든 출입을 통과시키는 회전문 |
| `set_order_hash_key(h, p)` | 주문 본문을 해시(hashkey)로 봉인 → 위변조 방지 | 주문서에 봉인 스탬프 찍기 |

**누가 호출하나?** → 이 파일은 직접 쓰이지 않고, **벤더링된 KIS 라이브러리(`kis_backtest/providers/kis/auth.py`)가 `import kis_auth as ka` 로 감싸서** 사용합니다. 그 위로 우리 코드 흐름은:

```
Spring(BE) ──AES-GCM 복호화한 KIS 자격증명──▶ analytics
   credentials.py(write_kis_devlp_yaml) → ~/KIS/config/kis_devlp.yaml 기록
   → kis_backtest/providers/kis/auth.py (KisAuth wrapper)
       → import kis_auth as ka  → ka.auth() / ka._url_fetch() ...   ← 이 파일
```

즉 이 파일은 **퀀트 엔진이 KIS 실계좌/모의계좌의 시세·주문 API 를 부를 때 신원을 증명하는 최하단 계층**입니다.

> ⚠️ 중요(아키텍처): `credentials.py` 주석에 따르면 **우리 MVP 의 기본 경로는 "KIS 데이터 fetch 없이" 야후/Polygon 으로 백테스트**합니다. 이 `kis_auth.py` 는 **KIS 에서 직접 데이터를 가져오거나 실주문할 때만** 임포트됩니다. 그래서 "항상 실행되는 핵심"이라기보다 **"KIS 직결이 필요할 때만 켜지는 인증 게이트"** 로 이해하세요.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) OAuth 토큰이란? — "하루짜리 방문증"
- KIS API 는 매번 비밀번호(앱시크리트)를 보내지 않습니다. 대신 한 번 인증하면 **시간제한 출입증(토큰)** 을 받고, 그걸 헤더에 넣어 호출합니다.
- KIS 토큰 유효기간은 **1일(86400초)**. 그 안에는 같은 토큰을 계속 재사용합니다.
- 헤더에 들어가는 형태: `Authorization: Bearer eyJ...(긴 토큰 문자열)`.

#### 2) `appkey` / `appsecret` = "회원증 + 비밀번호"
- KIS 개발자센터에서 발급받는 한 쌍의 비밀값. **이걸로 토큰을 발급**받습니다.
- 실전용 한 쌍(`my_app`/`my_sec`)과 모의투자용 한 쌍(`paper_app`/`paper_sec`)이 **따로** 존재합니다. 섞으면 인증 실패.
- 이 코드는 이 값들을 `~/KIS/config/kis_devlp.yaml` 이라는 **로컬 설정 파일**에서 읽습니다(코드 맨 위 `_cfg`).

#### 3) 모의투자(vps) vs 실전투자(prod) = "연습 서버 vs 진짜 서버"
- **도메인(URL)이 다름**: 실전 `openapi.koreainvestment.com:9443`, 모의 `openapivts.koreainvestment.com:29443`.
- **TR ID 접두어가 다름**: 실전 주문 TR 이 `T...`/`J...`/`C...` 로 시작하면, 모의에선 첫 글자를 `V` 로 바꿔야 함(아래 `_url_fetch` 의 핵심 트릭).
- 이 코드에서 `svr="prod"` = 실전, `svr="vps"` = 모의(virtual paper server).

#### 4) 해시키(hashkey) = "주문서 봉인 스탬프"
- POST 로 **주문**을 보낼 때, 본문(JSON)을 KIS 서버에 한 번 보내 **해시값**을 받아 헤더에 다시 넣는 절차. 전송 중 본문 위변조를 막는 용도.
- 코드 주석대로 **현재는 필수가 아니라 선택**입니다(실제로 `_url_fetch` 안에서 호출이 주석 처리돼 있음).

#### 5) 분당 발급 제한 + `EGW00002` = "출입증 발급 데스크의 줄 서기 규칙"
- KIS 는 **토큰 발급을 너무 자주 하면 거부**합니다(보통 "1분에 1회" 류 제한). 너무 빨리 또 요청하면 `EGW00002` 같은 에러가 옵니다.
- 그래서 이 코드는 **받은 토큰을 파일에 저장해두고 만료 전까지 재사용**합니다(불필요한 재발급 방지). 또 일반 API 호출에도 **초당 간격 제한(Rate Limiter)** 을 둡니다(모의 0.5초, 실전 0.05초).

#### 6) `namedtuple` = "이름표가 붙은 묶음"
- 파이썬 표준 도구. 딕셔너리처럼 값을 묶되 `env.my_app` 처럼 **점(.)으로 접근**하게 해줍니다. 이 파일은 환경값(`_TRENV`)·응답(헤더/바디)을 전부 namedtuple 로 만듭니다.

#### 7) AES-CBC 복호화 = "암호화된 실시간 데이터 풀기"
- WebSocket 실시간 시세 중 일부는 **암호화되어 옵니다(encrypt="Y")**. 그때 받은 key·iv 로 복호화해야 읽힙니다(`aes_cbc_base64_dec`). (주의: 이건 우리 KIS 키 보관용 AES-GCM 과 별개. 여기 CBC 는 KIS 실시간 데이터 복호화 전용.)

---

## 🗺 전체 흐름도

```
            kis_devlp.yaml (앱키/앱시크리트/계좌/도메인)
                     │  모듈 임포트 시 1회 로드 → _cfg
                     ▼
        ┌──────────────────────── auth(svr, product) ─────────────────────────┐
        │  1) read_token()  ── 로컬 파일에 살아있는 토큰 있나?                   │
        │        │ 있음 ───────────────▶ 그 토큰 재사용 (발급 안 함! 제한 회피) │
        │        │ 없음/만료                                                    │
        │        ▼                                                             │
        │  2) POST {도메인}/oauth2/tokenP  (User-Agent = my_agent 반드시!)      │
        │        │ 200 OK → access_token + 만료일시                            │
        │        ▼                                                             │
        │  3) save_token()  ── 로컬 파일에 저장(다음 실행 때 재사용)            │
        └────────────────────────────────┬────────────────────────────────────┘
                                          │
                                          ▼
        changeTREnv(): svr·product 에 맞는 앱키/계좌/도메인 골라 _TRENV 세팅
                                          │
        _base_headers 에 authorization·appkey·appsecret 박아둠
                                          │
        ┌─────────────────────────────────┴──────────────────────────────┐
        ▼                                                                 ▼
   REST 호출: _url_fetch()                              WebSocket: auth_ws() → KISWebSocket
   ├ Rate Limit(초당 간격)                               ├ /oauth2/Approval 로 approval_key
   ├ 헤더 조립(tr_id: 실전 T→ 모의 V 치환)                ├ 구독(open_map) → 수신 루프
   ├ POST/GET 전송                                        ├ 암호화 데이터면 AES-CBC 복호화
   └ 응답 → APIResp / APIRespError 로 래핑                └ PINGPONG 처리
                                          │
        reAuth(): 마지막 인증 후 1일 지났으면 auth() 다시 호출(만료 자동 갱신)
```

---

## 📖 라인별 해설

### 함수·심볼 전체 매핑표 (공개 함수 모두 포함)

| 심볼 | 라인 | 역할 | 우리 수정? |
|---|---|---|---|
| `clearConsole()` | L33-34 | 콘솔 화면 지우기(OS별 cls/clear) | 원본 |
| 모듈 상수·`_cfg` 로드 | L36-73 | 토큰 경로·yaml 로드·전역 상태·기본 헤더(User-Agent 포함) | 일부 우리(rate_lock) |
| `save_token(my_token, my_expired)` | L77-83 | 발급 토큰 + 만료일시를 로컬 파일에 기록 | 원본 |
| `read_token()` | L87-107 | 로컬 파일에서 만료 안 된 토큰 읽기(만료면 None) | 원본 |
| `_getBaseHeader()` | L111-114 | 기본 헤더 복사본 반환(필요 시 reAuth) | 원본 |
| `_setTRENV(cfg)` | L118-138 | 앱키/계좌/토큰/도메인을 namedtuple `_TRENV` 로 세팅 | 원본 |
| `isPaperTrading()` | L141-142 | 현재 모의투자 모드인지 True/False | 원본 |
| `changeTREnv(token_key, svr, product)` | L146-191 | svr·product 별 앱키/계좌/도메인 선택해 `_setTRENV` 호출 | 원본 |
| `_getResultObject(json_data)` | L194-197 | JSON dict → 점 접근 namedtuple 변환 | 원본 |
| `auth(svr, product, url)` | L202-251 | **REST 토큰 발급/재사용 핵심** + 헤더 세팅 | 원본 |
| `reAuth(svr, product)` | L256-259 | 마지막 인증 1일 경과 시 `auth()` 재호출 | 원본 |
| `getEnv()` | L262-263 | 설정(`_cfg`) 전체 반환 | 원본 |
| `smart_sleep()` | L266-270 | `_smartSleep` 초 만큼 대기(Rate 보조) | 원본 |
| `getTREnv()` | L273-274 | 현재 `_TRENV`(환경 namedtuple) 반환 | 원본 |
| `set_order_hash_key(h, p)` | L281-289 | 주문 본문 → hashkey 발급받아 헤더에 주입 | 원본 |
| `class APIResp` | L293-368 | 정상 응답 래퍼(헤더/바디/에러코드/성공판정) | 원본 |
| `class APIRespError(APIResp)` | L371-415 | **오류 응답 래퍼**(빈 바디/헤더로 안전화) | **우리 추가** |
| `_url_fetch(...)` | L421-475 | **모든 REST 호출 공통구**(Rate Limit·헤더·전송·래핑) | 우리 수정(Rate) |
| WS 기본 헤더 / `_getBaseHeader_ws()` | L484-493 | WebSocket 기본 헤더 | 원본 |
| `auth_ws(svr, product)` | L496-525 | **WebSocket 접속키(approval_key) 발급** | 원본 |
| `reAuth_ws(svr, product)` | L528-531 | WS 인증 1일 경과 시 재발급 | 원본 |
| `data_fetch(tr_id, tr_type, params, ...)` | L534-555 | WS 전송용 메시지(header+body) 구성 | 원본 |
| `system_resp(data)` | L559-610 | WS 수신 메시지 파싱(암호화키/PINGPONG/구독해제) | 원본 |
| `aes_cbc_base64_dec(key, iv, cipher)` | L613-618 | WS 암호화 데이터 AES-CBC 복호화 | 원본 |
| `open_map` / `add_open_map(...)` | L622-641 | 구독 목록 등록(최대 40) | 원본 |
| `data_map` / `add_data_map(...)` | L644-667 | TR별 컬럼·암호화키 보관 | 원본 |
| `class KISWebSocket` | L670-820 | WS 연결·구독·수신·재시도 전체 | 원본 |

> 💡 학습 우선순위: **REST 인증 경로(`auth`→`read_token`/`save_token`→`changeTREnv`→`_url_fetch`)** 가 80%입니다. WebSocket(`auth_ws`~`KISWebSocket`)은 실시간 시세용이라 우리 MVP 에선 부차적이니, 처음엔 REST 흐름만 확실히 잡으세요.

---

### A. 모듈 헤더 + 임포트 + 전역 상태 — `L1-L73`

```python
# L1-L3
# -*- coding: utf-8 -*-
# ====|  (REST) 접근 토큰 / (Websocket) 웹소켓 접속키 발급 에 필요한 API 호출 샘플 ...
# ====|  API 호출 공통 함수 포함                                  |==========
```
- 맨 위 `# -*- coding: utf-8 -*-` 는 **소스파일 인코딩 선언**(한글 주석 깨짐 방지). 파이썬3 에선 사실상 기본이지만 KIS 샘플이 관습으로 붙임.
- 주석이 곧 파일 목적서: **(REST) 토큰 + (WebSocket) 접속키 발급 + 공통 호출 함수**.

```python
# L36-L43
key_bytes = 32
config_root = os.path.join(os.path.expanduser("~"), "KIS", "config")
...
token_tmp = os.path.join(
    config_root, f"KIS{datetime.today().strftime('%Y%m%d')}"
)  # 토큰 로컬저장시 파일명 년월일
```
- `config_root` = **사용자 홈 아래 `~/KIS/config/`**. 여기에 설정 yaml 과 토큰 파일을 둡니다.
- `token_tmp` = 토큰을 저장할 **파일 경로**. 파일명이 `KIS20260601` 처럼 **날짜**로 끝남 → 즉 **하루마다 새 파일**. 토큰 유효기간(1일)과 맞물려, 날이 바뀌면 자연스럽게 새 파일에 새 토큰을 받습니다.
- 헷갈리는 포인트: 파일명에 토큰값 자체를 넣지 말라는 KIS 주석(L39)은 **보안 권고**(파일명만 봐도 토큰을 유추하지 못하게).

```python
# L46-L52
if not os.path.exists(token_tmp):
    f = open(token_tmp, "w+")
...
with open(os.path.join(config_root, "kis_devlp.yaml"), encoding="UTF-8") as f:
    _cfg = yaml.load(f, Loader=yaml.FullLoader)
```
- **모듈을 임포트하는 순간** 토큰 파일이 없으면 빈 파일을 만들고, **설정 yaml 을 읽어 `_cfg` 에 통째로 로드**합니다.
- ⚠️ 중요한 부작용: 이 `with open(...kis_devlp.yaml...)` 은 **함수 안이 아니라 모듈 최상단**에 있습니다. 즉 `import kis_auth` 하는 순간 **yaml 파일이 반드시 존재해야** 하고, 없으면 임포트 자체가 실패합니다. 그래서 우리 `credentials.py` 가 **임포트 전에** `write_kis_devlp_yaml()` 로 이 파일을 먼저 만들어 둡니다(아래 함정 섹션 참고).
- `key_bytes = 32` 는 AES 키 길이 관련 상수(WS 복호화 쪽에서 쓰는 관습값).

```python
# L54-L73
_TRENV = tuple()
_last_auth_time = datetime.now()
_autoReAuth = False
_DEBUG = False
_isPaper = False
_smartSleep = 0.1

import threading
_rate_lock = threading.Lock()
_last_api_call_time = 0.0

_base_headers = {
    "Content-Type": "application/json",
    "Accept": "text/plain",
    "charset": "UTF-8",
    "User-Agent": _cfg["my_agent"],
}
```
- **전역 상태(global state)** 모음입니다. 이 파일은 객체지향이 아니라 **모듈 전역 변수 + 함수**로 상태를 관리하는 옛 스타일 샘플 코드라는 점을 이해하면 전체가 쉬워집니다.
  - `_TRENV` — 현재 환경(앱키·계좌·도메인·토큰) 묶음. `auth()`/`changeTREnv()` 가 채웁니다.
  - `_last_auth_time` — 마지막으로 토큰을 받은 시각. `reAuth()` 가 "1일 지났나" 판단에 씀.
  - `_isPaper` — 지금 모의투자 모드인지. `changeTREnv` 가 svr 보고 설정.
  - `_smartSleep` — API 호출 사이 최소 간격(초). 기본 0.1, 실전 0.05, 모의 0.5 로 바뀜.
- `_rate_lock` + `_last_api_call_time` — **우리가 추가한 Rate Limiter**(주석 L61 "모든 REST API 호출을 직렬화"). 여러 스레드가 동시에 API 를 때려도 KIS 의 초당 제한을 넘지 않도록 직렬화합니다.
- ⭐ **`"User-Agent": _cfg["my_agent"]`** — 이 한 줄이 **메모리에 박힌 핵심 교훈**입니다. KIS `/oauth2/tokenP` 는 파이썬/자바 기본 User-Agent(`Java-http-client/...`)를 **403 + EGW00002 로 차단**합니다. 그래서 설정 yaml 의 `my_agent`(브라우저 스타일 UA)를 **모든 헤더에 기본 탑재**합니다. 이게 빠지면 인증 자체가 막힘.

> 💡 초보 포인트: `_` 로 시작하는 변수/함수(`_cfg`, `_TRENV`, `_url_fetch`)는 "내부용, 밖에서 직접 만지지 마세요"라는 파이썬 관습 표시입니다.

---

### B. 토큰 저장/읽기 — `save_token` / `read_token` — `L77-L107`

```python
# L77-L83
def save_token(my_token, my_expired):
    valid_date = datetime.strptime(my_expired, "%Y-%m-%d %H:%M:%S")
    with open(token_tmp, "w", encoding="utf-8") as f:
        f.write(f"token: {my_token}\n")
        f.write(f"valid-date: {valid_date}\n")
```
- 발급받은 **토큰 문자열**과 **만료일시 문자열**(`"2026-06-02 09:00:00"` 같은)을 받아, `token_tmp` 파일에 **yaml 형식 두 줄**로 저장합니다.
- `datetime.strptime(...)` = 문자열을 진짜 날짜객체로 파싱(형식 검증 겸).
- 왜 파일에 저장? → **프로세스를 껐다 켜도, 만료 전이면 다시 발급하지 않고 재사용** → KIS 분당 발급 제한 회피(사전지식 5).

```python
# L87-L107
def read_token():
    try:
        with open(token_tmp, encoding="UTF-8") as f:
            tkg_tmp = yaml.load(f, Loader=yaml.FullLoader)
        exp_dt = datetime.strftime(tkg_tmp["valid-date"], "%Y-%m-%d %H:%M:%S")
        now_dt = datetime.today().strftime("%Y-%m-%d %H:%M:%S")
        if exp_dt > now_dt:
            return tkg_tmp["token"]
        else:
            return None
    except Exception:
        return None
```
- 저장 파일을 읽어, **만료일시(`exp_dt`)가 현재(`now_dt`)보다 미래면 그 토큰을 반환**, 아니면 `None`(새로 받아야 함).
- 파일이 없거나 깨졌으면 `except` 로 조용히 `None` 반환 → 호출부(`auth`)는 그냥 "토큰 없음"으로 보고 새로 발급.
- ⚠️ 헷갈리는 포인트: 만료 비교를 **문자열 비교**(`exp_dt > now_dt`)로 합니다. `"YYYY-MM-DD HH:MM:SS"` 포맷은 사전식 정렬이 곧 시간순이라 **이 포맷에서만 우연히 안전**합니다(포맷 바꾸면 깨질 수 있는 위험 패턴).

---

### C. 환경 세팅 — `_setTRENV` / `changeTREnv` — `L118-L191`

```python
# L118-L138
def _setTRENV(cfg):
    nt1 = namedtuple("KISEnv",
        ["my_app", "my_sec", "my_acct", "my_prod", "my_htsid", "my_token", "my_url", "my_url_ws"])
    d = { "my_app": cfg["my_app"], ... "my_url_ws": cfg["my_url_ws"] }
    global _TRENV
    _TRENV = nt1(**d)
```
- 받은 `cfg` 딕셔너리를 **`KISEnv` namedtuple** 로 만들어 전역 `_TRENV` 에 박습니다. 이후 어디서든 `getTREnv().my_url`, `getTREnv().my_token` 처럼 점으로 꺼냅니다.
- 담기는 8개: 앱키·앱시크리트·계좌번호(8자리)·상품코드(2자리)·HTS ID·토큰·실전도메인·WS도메인.

```python
# L146-L191 (핵심만)
def changeTREnv(token_key, svr="prod", product=_cfg["my_prod"]):
    global _isPaper
    if svr == "prod":
        ak1 = "my_app"; ak2 = "my_sec"; _isPaper = False; _smartSleep = 0.05
    elif svr == "vps":
        ak1 = "paper_app"; ak2 = "paper_sec"; _isPaper = True; _smartSleep = 0.5
    cfg["my_app"] = _cfg[ak1]; cfg["my_sec"] = _cfg[ak2]

    if svr == "prod" and product == "01":   cfg["my_acct"] = _cfg["my_acct_stock"]
    elif svr == "prod" and product == "03": cfg["my_acct"] = _cfg["my_acct_future"]
    ...
    elif svr == "vps" and product == "01":  cfg["my_acct"] = _cfg["my_paper_stock"]
    ...
    cfg["my_url"] = _cfg[svr]                       # 실전/모의 도메인
    cfg["my_token"] = my_token if token_key else token_key
    cfg["my_url_ws"] = _cfg["ops" if svr == "prod" else "vops"]
    _setTRENV(cfg)
```
- **이 함수가 "실전이냐 모의냐"를 실제로 가르는 스위치**입니다.
  - `svr=="prod"` → 실전 앱키(`my_app`) + `_isPaper=False` + 호출간격 0.05초.
  - `svr=="vps"` → 모의 앱키(`paper_app`) + `_isPaper=True` + 호출간격 0.5초(모의가 더 느림).
- **계좌번호 선택**: `product`(상품코드 2자리)에 따라 주식/선물/연금 계좌번호를 골라 씁니다. `01`=주식, `03`=선물옵션, `08`=해외선물, `22`=연금저축, `29`=퇴직연금.
- **도메인 선택**: `cfg["my_url"] = _cfg[svr]` 한 줄이 곧 `_cfg["prod"]`(실전 URL) 또는 `_cfg["vps"]`(모의 URL)를 집어넣음. WS 도메인도 `ops`(실전)/`vops`(모의)로 선택.
- ⚠️ 버그성 헷갈림 포인트(L187): `cfg["my_token"] = my_token if token_key else token_key`. **`token_key` 가 참이면 `my_token`(기존 토큰), 거짓이면 `token_key`(=falsy 값)**. 즉 "토큰을 새로 안 받는 WS 흐름"에선 `None`/빈값을 넣으려는 의도로 보이지만, 표현식이 직관적이지 않습니다. `auth()` 는 직후에 헤더에 직접 토큰을 다시 박으므로 실사용엔 문제가 없습니다(원본 샘플의 어색한 코드).

---

### D. 토큰 발급 핵심 — `auth()` — `L202-L251` ⭐이 파일의 알맹이

```python
# L202-L217
def auth(svr="prod", product=_cfg["my_prod"], url=None):
    p = { "grant_type": "client_credentials" }
    if svr == "prod":
        ak1 = "my_app"; ak2 = "my_sec"
    elif svr == "vps":
        ak1 = "paper_app"; ak2 = "paper_sec"
    p["appkey"] = _cfg[ak1]
    p["appsecret"] = _cfg[ak2]
```
- OAuth 표준 본문 `grant_type=client_credentials`(= "내 앱 자격으로 토큰 주세요") + **앱키/앱시크리트**를 본문에 담습니다.
- 실전/모의에 따라 키 쌍을 정확히 고름(섞으면 인증 실패).

```python
# L219-L238
    saved_token = read_token()
    if saved_token is None:                         # 살아있는 토큰 없음 → 새로 발급
        url = f"{_cfg[svr]}/oauth2/tokenP"
        res = requests.post(url, data=json.dumps(p), headers=_getBaseHeader())
        rescode = res.status_code
        if rescode == 200:
            my_token = _getResultObject(res.json()).access_token
            my_expired = _getResultObject(res.json()).access_token_token_expired
            save_token(my_token, my_expired)
        else:
            print("Get Authentification token fail!\nYou have to restart your app!!!")
            return
    else:
        my_token = saved_token                      # 살아있는 토큰 재사용
```
- **이 if/else 가 토큰 캐시의 심장**입니다.
  - `read_token()` 이 살아있는 토큰을 주면 → **그대로 재사용**(발급 API 안 부름). 이게 분당 발급 제한 회피의 핵심.
  - 없으면 → `POST {도메인}/oauth2/tokenP` 로 **새로 발급** → `access_token`·만료일시 추출 → `save_token()` 으로 파일 저장.
- ⚠️ `headers=_getBaseHeader()` — 여기 헤더에 **`User-Agent: my_agent` 가 들어있어야** 토큰 발급이 통과합니다(기본 Java/Python UA 면 차단).
- ⚠️ 실패 시 동작: `print` 만 하고 **`return`**(예외를 던지지 않음). 호출부는 "성공한 줄 알고" 진행할 수 있어 위험(함정 섹션 참고). 우리 wrapper(`providers/kis/auth.py`)가 이 위에서 성공 여부를 따로 판정합니다.

```python
# L240-L251
    changeTREnv(my_token, svr, product)
    _base_headers["authorization"] = f"Bearer {my_token}"
    _base_headers["appkey"] = _TRENV.my_app
    _base_headers["appsecret"] = _TRENV.my_sec
    global _last_auth_time
    _last_auth_time = datetime.now()
    if _DEBUG:
        print(f"[{_last_auth_time}] => get AUTH Key completed!")
```
- 발급/재사용한 토큰으로 **환경(`changeTREnv`) 세팅** + **공통 헤더에 토큰·앱키·앱시크리트 박기**. 이후 모든 API 가 이 헤더를 복사해 씁니다.
- `_last_auth_time = now()` — 갱신 타이머 리셋. `reAuth()` 가 이걸 보고 1일 경과를 판단.

> 💡 핵심 통찰: `auth()` 는 **여러 번 불러도 안전(idempotent)** 하도록 설계됐습니다. 두 번째부터는 `read_token()` 이 살아있는 토큰을 줘서 발급 API 를 건너뜁니다.

```python
# L256-L259
def reAuth(svr="prod", product=_cfg["my_prod"]):
    n2 = datetime.now()
    if (n2 - _last_auth_time).seconds >= 86400:   # 유효시간 1일
        auth(svr, product)
```
- **자동 갱신기**. 마지막 인증 후 **86400초(1일)** 이상 지났으면 `auth()` 재호출. `_autoReAuth=True` 일 때 `_getBaseHeader()` 가 매 호출마다 이걸 부릅니다.
- ⚠️ 미묘한 함정: `(n2 - _last_auth_time).seconds` 는 **timedelta 의 '초 성분'만**(0~86399) 반환합니다. 정확히는 `.total_seconds()` 가 맞습니다. 24시간을 약간 넘긴 케이스에서 갱신을 놓칠 수 있는 원본 샘플의 알려진 약점입니다.

---

### E. 해시키 — `set_order_hash_key()` — `L281-L289`

```python
# L281-L289
def set_order_hash_key(h, p):
    url = f"{getTREnv().my_url}/uapi/hashkey"
    res = requests.post(url, data=json.dumps(p), headers=h)
    rescode = res.status_code
    if rescode == 200:
        h["hashkey"] = _getResultObject(res.json()).HASH
    else:
        print("Error:", rescode)
```
- 주문 본문(`p`)을 `/uapi/hashkey` 에 POST → 응답의 `HASH` 값을 **헤더(`h`)에 `hashkey` 로 주입**(전송 중 본문 위변조 방지, 사전지식 4).
- `h` 를 직접 수정(in-place)하므로 반환값이 없음(Output: None).
- 현재 위치: `_url_fetch` 안에서 이 호출은 **주석 처리**돼 있어(L463), 실제로는 hashkey 없이 주문이 나갑니다 → KIS 가 hashkey 를 필수로 요구하면 켜야 함.

---

### F. 응답 래퍼 — `APIResp` / `APIRespError` — `L293-L415`

```python
# L293-L317 (요약)
class APIResp:
    def __init__(self, resp):
        self._rescode = resp.status_code
        self._resp = resp
        self._header = self._setHeader()     # 소문자 헤더만 namedtuple 화
        self._body = self._setBody()         # 응답 JSON → namedtuple
        self._err_code = self._body.msg_cd
        self._err_message = self._body.msg1
```
- KIS 의 **정상(HTTP 200) 응답을 다루기 쉽게 감싼 클래스**입니다. 응답 JSON 을 namedtuple 로 바꿔 `getBody().rt_cd` 처럼 점 접근하게 함.
- `_setHeader` 가 **소문자 키 헤더만** 추리는 이유(L308): KIS 응답에서 의미있는 커스텀 헤더(`tr_cont`, `tr_id` 등)는 소문자라, 표준 대문자 헤더(Content-Type 등)와 구분하려는 것.

```python
# L328-L341
    def isOK(self):
        try:
            if self.getBody().rt_cd == "0":
                return True
            else:
                return False
        except Exception:
            return False
    def getErrorCode(self):  return self._err_code
    def getErrorMessage(self): return self._err_message
```
- **`isOK()` 가 진짜 성공 판정**입니다. HTTP 200 이어도 **본문의 `rt_cd == "0"` 이어야 정상**(KIS 는 200 으로 응답하면서 본문에 실패코드를 담는 경우가 많음). 이 이중 판정을 놓치면 "성공한 줄 알고" 잘못된 데이터를 씁니다.
- `msg_cd`/`msg1` = KIS 의 에러코드/메시지. 여기서 `EGW00002`(분당제한) 같은 코드가 옵니다.

```python
# L371-L415 (우리 추가, 요약)
class APIRespError(APIResp):
    def __init__(self, status_code, error_text):
        # 부모 생성자 호출하지 않고 직접 초기화
        self.status_code = status_code
        self.error_text = error_text
        ...
    def isOK(self): return False
    def getBody(self):
        class EmptyBody:
            def __getattr__(self, name): return None
        return EmptyBody()
    def getHeader(self):
        class EmptyHeader:
            tr_cont = ""
            def __getattr__(self, name): return ""
        return EmptyHeader()
```
- ⭐ **우리가 추가한 오류 응답 래퍼**. HTTP 가 200 이 아니어서 JSON 파싱조차 못 하는 경우, `APIResp` 를 만들면 `_body.msg_cd` 에서 터집니다. 그래서 **`isOK()`=False 이고, `getBody()`/`getHeader()` 가 어떤 속성을 물어도 None/""을 돌려주는 빈 객체**를 반환 → **호출부가 `resp.getBody().output` 같은 접근을 해도 AttributeError 로 죽지 않게** 합니다.
- `__getattr__` = "정의 안 된 속성에 접근하면 호출되는 마법 메서드" → 무엇을 물어도 None/"" 로 안전하게 흡수.

---

### G. REST 공통 호출구 — `_url_fetch()` — `L421-L475` ⭐모든 REST 의 관문

```python
# L421-L435
def _url_fetch(api_url, ptr_id, tr_cont, params,
               appendHeaders=None, postFlag=False, hashFlag=True):
    global _last_api_call_time
    with _rate_lock:                                  # 우리 추가 Rate Limiter
        now = time.monotonic()
        elapsed = now - _last_api_call_time
        if elapsed < _smartSleep:
            wait_time = _smartSleep - elapsed
            time.sleep(wait_time)
        _last_api_call_time = time.monotonic()
    url = f"{getTREnv().my_url}{api_url}"
```
- **모든 REST API 가 이 함수 하나로 모입니다**(공통 관문).
- 첫 블록이 **Rate Limiter(우리 추가)**: `_rate_lock` 으로 한 번에 한 호출만 통과시키고, 직전 호출과 **최소 `_smartSleep` 초 간격**을 강제(모의 0.5/실전 0.05). `time.monotonic()` 은 시스템 시계 변경에 영향 안 받는 단조 증가 시계 → 간격 측정에 정확.
- `url = my_url + api_url` — 도메인(실전/모의) + 엔드포인트 경로 합체.

```python
# L437-L454
    headers = _getBaseHeader()
    tr_id = ptr_id
    if ptr_id[0] in ("T", "J", "C"):       # 실전용 TR id
        if isPaperTrading():
            tr_id = "V" + ptr_id[1:]        # 모의면 첫 글자 V 치환
    headers["tr_id"] = tr_id
    headers["custtype"] = "P"               # 개인고객
    headers["tr_cont"] = tr_cont            # 연속조회 구분
    if appendHeaders is not None:
        for x in appendHeaders.keys():
            headers[x] = appendHeaders.get(x)
```
- ⭐ **모의/실전 TR ID 자동 변환의 핵심**: 실전 거래 TR(`T`/`J`/`C` 시작)인데 지금 모의 모드면 **첫 글자를 `V` 로 교체**(`TTTC8434R` → `VTTC8434R`). KIS 는 모의 TR ID 가 따로라서, 같은 코드로 실전/모의를 오갈 수 있게 하는 트릭.
- `custtype="P"` 개인, `tr_cont` 연속조회 플래그(페이징). `appendHeaders` 로 호출별 추가 헤더 주입.

```python
# L462-L475
    if postFlag:
        # if (hashFlag): set_order_hash_key(headers, params)   ← 주석 처리됨
        res = requests.post(url, headers=headers, data=json.dumps(params))
    else:
        res = requests.get(url, headers=headers, params=params)

    if res.status_code == 200:
        ar = APIResp(res)
        return ar
    else:
        print("Error Code : " + str(res.status_code) + " | " + res.text)
        return APIRespError(res.status_code, res.text)
```
- `postFlag` 로 POST(주문 등)/GET(조회) 분기. **GET 은 `params=`(쿼리스트링), POST 는 `data=json.dumps(params)`(본문 JSON)** — 자리가 다름에 주의.
- 주석 처리된 `set_order_hash_key` — 켜면 POST 마다 hashkey 를 먼저 발급해 봉인. 지금은 꺼져 있음.
- 응답 200 → `APIResp`, 아니면 **우리 추가 `APIRespError`** 로 안전하게 래핑. **이 분기 덕분에 상위 코드는 항상 `.isOK()`/`.getBody()` 를 안전하게 부를 수 있음**.

---

### H. WebSocket 영역 — `auth_ws` ~ `KISWebSocket` — `L484-L820`

> 실시간 체결/호가 스트리밍용. 우리 MVP 의 핵심 경로는 아니므로 **개념 위주**로 요약합니다.

```python
# L496-L519 (요약)
def auth_ws(svr="prod", product=_cfg["my_prod"]):
    p = {"grant_type": "client_credentials"}
    ... ak1/ak2 선택 ...
    p["appkey"] = _cfg[ak1]; p["secretkey"] = _cfg[ak2]
    url = f"{_cfg[svr]}/oauth2/Approval"
    res = requests.post(url, data=json.dumps(p), headers=_getBaseHeader())
    if res.status_code == 200:
        approval_key = _getResultObject(res.json()).approval_key
    ...
    changeTREnv(None, svr, product)
    _base_headers_ws["approval_key"] = approval_key
```
- REST 토큰과 **다른 출입증**: WebSocket 은 `/oauth2/Approval` 로 **`approval_key`(웹소켓 접속키)** 를 받습니다. 본문 키 이름도 다름(`appsecret` 아님 → `secretkey`).
- 받은 `approval_key` 를 WS 기본 헤더에 박아 이후 구독에 사용. `reAuth_ws` 는 REST 와 동일하게 1일 경과 시 재발급.

```python
# L613-L618
def aes_cbc_base64_dec(key, iv, cipher_text):
    if key is None or iv is None:
        raise AttributeError("key and iv cannot be None")
    cipher = AES.new(key.encode("utf-8"), AES.MODE_CBC, iv.encode("utf-8"))
    return bytes.decode(unpad(cipher.decrypt(b64decode(cipher_text)), AES.block_size))
```
- 암호화된 실시간 데이터(`encrypt="Y"`)를 **AES-CBC + Base64** 로 복호화. key·iv 는 `system_resp()` 가 수신 메시지 헤더에서 뽑아 `data_map` 에 보관해뒀던 값(L577-579, L702-703).

```python
# L559-L610 (요약) system_resp
#  수신 raw → tr_id / tr_key / encrypt 추출
#  PINGPONG 이면 그대로, body 있으면 rt_cd=="0" 로 isOk, msg1[:5]=="UNSUB" 면 구독해제
#  → SysMsg namedtuple 반환 (iv, ekey, encrypt 포함)
```
- WS 로 들어온 **제어 메시지**(구독성공/해제/하트비트/암호화키)를 파싱하는 함수. 데이터 메시지(`raw[0] in "01"`)가 아닌 나머지를 여기서 해석.

```python
# L670-L820 (요약) class KISWebSocket
#  __init__       : api_url, max_retries
#  subscribe()    : open_map 에 구독 요청 등록(클래스메서드)
#  send/send_multiple : 구독 메시지 전송 + smart_sleep()
#  __subscriber   : 무한 수신 루프 — 데이터면 복호화·DataFrame 화 → on_result 콜백
#  __runner       : 연결·구독·수신, 예외 시 max_retries 까지 1초 간격 재연결
#  start(on_result, result_all_data) : asyncio.run(__runner)  진입점
```
- **구독 모델**: `subscribe()` 로 받고 싶은 TR·종목을 `open_map`(최대 40개, L731)에 쌓아둔 뒤 `start()` 로 연결 → 들어오는 메시지를 `on_result` 콜백으로 넘김.
- 데이터 메시지는 `^` 구분 CSV 라서 `pd.read_csv(StringIO(...), sep="^")` 로 DataFrame 변환(L705). `PINGPONG` 은 `ws.pong()` 으로 응답해 연결 유지(L719-722).
- `__subscriber`/`__runner` 가 **이름 앞 `__`(이중 언더스코어)** = 클래스 외부에서 못 부르는 진짜 private. 비동기(`async`/`await`) 기반.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 모음)

1. **기본 Java/Python User-Agent 차단 (가장 치명적)** — KIS `/oauth2/tokenP` 는 기본 UA 를 **403 + `EGW00002`** 로 거부합니다. `_base_headers["User-Agent"] = _cfg["my_agent"]`(브라우저 스타일 UA)가 **반드시** 설정 yaml 에 있어야 함. (메모리 `project_kis_useragent_block` 참조.) 빠지면 인증 자체가 불가.

2. **분당/초당 토큰 발급 제한 + `EGW00002`** — 토큰을 너무 자주 재발급하면 거부됩니다. 그래서 `read_token()`→`save_token()` **파일 캐시**로 만료 전 재사용이 필수. 토큰 파일을 매번 지우거나, 여러 프로세스가 각자 발급하면 제한에 걸립니다.

3. **토큰 race(경쟁) — 멀티프로세스/멀티유저 위험** — 토큰 파일 경로가 **날짜 1개 고정**(`KIS{날짜}`)이라, 한 머신에서 **여러 KIS 계정**을 동시에 쓰면 서로의 토큰을 덮어씁니다. `credentials.py` 주석도 "single-tenant per process"라 못박고, 멀티테넌트는 **서브프로세스 격리로 미뤄둠**. 동시에 두 계정 인증 금지.

4. **모듈 임포트 시 yaml 강제 로드** — `import kis_auth` 하는 순간 `~/KIS/config/kis_devlp.yaml` 을 읽습니다(L51). 파일이 없으면 **임포트 자체가 예외로 실패**. 반드시 임포트 전에 `credentials.write_kis_devlp_yaml()` 로 파일을 먼저 만들고 `HOME` 을 맞춰야 합니다.

5. **`auth()` 실패가 조용함** — 토큰 발급 실패 시 `print` 후 `return` 만 합니다(예외 없음). 호출부가 실패를 모르고 진행할 수 있어, 우리 wrapper 가 별도로 성공을 검증해야 합니다.

6. **`isOK()` 이중 판정 필수** — HTTP 200 ≠ 성공. **본문 `rt_cd=="0"`** 까지 봐야 진짜 성공. 200 만 보고 데이터를 쓰면 에러 본문을 정상으로 오인합니다.

7. **`reAuth` 의 `.seconds` 약점** — `(now - last).seconds` 는 0~86399 만 반환(일 성분 무시). 24h 를 약간 넘긴 경계에서 갱신을 놓칠 수 있음 → `.total_seconds()` 가 정석.

8. **만료 비교가 문자열 비교** — `read_token` 의 `exp_dt > now_dt` 는 `"YYYY-MM-DD HH:MM:SS"` 포맷에서만 우연히 안전. 포맷을 바꾸면 만료 판정이 깨질 수 있음.

9. **모의 TR ID 변환(`T/J/C`→`V`)** — 실전 코드를 모의로 돌릴 때 `_url_fetch` 가 자동 치환하지만, **그 외 접두어 TR 은 변환 안 됨**. 새 TR 추가 시 모의 동작을 따로 확인해야 함.

10. **전역 상태 공유** — `_TRENV`, `_isPaper`, `_smartSleep`, `_base_headers` 가 전부 **모듈 전역**. 한 프로세스에서 실전↔모의를 번갈아 `auth()` 하면 마지막 호출이 전역을 덮어써, 진행 중이던 다른 작업이 의도와 다른 도메인/키로 나갈 수 있음.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **멀티테넌트 격리**: 토큰 파일 경로에 **계정/유저 식별자**를 포함(`KIS_{userId}_{날짜}`)하거나, `credentials.py` 가 예고한 대로 **계정별 서브프로세스**로 격리 → 함정 3 해소.
- **전역 상태 → 컨텍스트 객체**: `_TRENV`·`_base_headers` 같은 전역을 `KisSession` 클래스 인스턴스로 캡슐화 → 동시 멀티세션 안전, 테스트 용이.
- **`auth()` 실패를 예외로**: `print+return` 대신 `raise KisAuthError` 로 바꿔 호출부가 반드시 처리하게(함정 5).
- **`reAuth` 정확화**: `.seconds` → `.total_seconds()`, 그리고 **만료 5분 전 선제 갱신**(여유 버퍼)으로 경계 실패 방지.
- **만료 비교를 datetime 객체로**: 문자열 비교 대신 `datetime` 끼리 비교 → 포맷 의존성 제거(함정 8).
- **토큰 파일 잠금**: 파일 캐시에 `filelock` 적용 → 동시 발급 race 시 한 프로세스만 발급하고 나머지는 대기·재사용.
- **hashkey 자동화 토글**: `hashFlag` 가 실제로 동작하도록 `_url_fetch` 의 주석을 풀고, KIS 요구 시 설정으로 켜기.
- **구조화 로깅**: 곳곳의 `print` 를 `logging` 으로 교체(이미 WS 쪽은 logging 사용) → 운영에서 인증 실패 추적 가능.
- **WS 자동 재인증**: `reAuth_ws` 를 수신 루프와 엮어, 장중 토큰 만료 시 끊김 없이 재연결.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| `access_token` | KIS REST API 출입증(Bearer 토큰). 유효 1일 |
| `approval_key` | KIS WebSocket 접속키(`/oauth2/Approval` 로 발급) |
| `appkey` / `appsecret` | KIS 앱 인증용 키 쌍(실전 `my_app/my_sec`, 모의 `paper_app/paper_sec`) |
| `prod` / `vps` | 실전 서버 / 모의(virtual paper) 서버 구분값 |
| `_TRENV` | 현재 환경(앱키·계좌·도메인·토큰) namedtuple, `getTREnv()` 로 접근 |
| `_cfg` | `kis_devlp.yaml` 전체 설정(임포트 시 1회 로드) |
| `my_agent` | 설정의 User-Agent 문자열. **기본 UA 차단 회피용**(필수) |
| `tr_id` | KIS 거래 식별코드. 실전 `T/J/C…`, 모의는 첫 글자 `V` |
| `tr_cont` | 연속조회(페이징) 구분 헤더 |
| `rt_cd` / `msg_cd` / `msg1` | 응답 본문의 처리결과코드("0"=성공) / 에러코드 / 메시지 |
| `EGW00002` | 토큰 발급 제한·UA 차단 등에서 나오는 대표 KIS 에러코드 |
| `hashkey` | 주문 본문 위변조 방지용 해시(현재 선택, 코드상 비활성) |
| `Rate Limiter` | 우리 추가: `_rate_lock`+`_smartSleep` 로 호출 간격 강제(모의 0.5/실전 0.05초) |
| `APIResp` / `APIRespError` | 정상 / 오류 응답 래퍼(후자는 우리 추가, 안전한 빈 객체 반환) |
| `namedtuple` | 점(.)으로 접근하는 이름표 달린 묶음(환경·응답에 사용) |
| AES-CBC 복호화 | WS 암호화 실시간 데이터(`encrypt="Y"`) 해독(`aes_cbc_base64_dec`) |
| PINGPONG | WS 연결 유지용 하트비트(받으면 `pong` 응답) |
