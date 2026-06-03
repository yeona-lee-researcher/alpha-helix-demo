# `lean/jobs.py` — Lean 백테스트 진행상황 보드 (완전 라인별 해설)

> 원본: `analytics/app/lean/jobs.py` (78줄)
> 역할: Lean 백테스트를 **백그라운드에서 돌리는 동안**, 그 진행 상황(단계·로그)과 최종 결과를 **메모리에 임시 저장**하고, 프론트가 그걸 **반복해서 물어볼(폴링)** 수 있게 해주는 작은 저장소.

---

## 📌 이 파일 한눈에

Lean 백테스트는 **오래 걸립니다**(Docker 컨테이너를 띄우고, 데이터를 변환하고, 엔진을 돌리니까 수십 초~수 분). 그래서 사용자가 "시작" 버튼을 누르면, 서버는 **즉시 "접수번호(job_id)"만 돌려주고** 실제 계산은 뒤에서(백그라운드 스레드) 합니다. 사용자는 그 접수번호로 **"지금 어디까지 됐어요?"를 계속 물어봅니다**.

이 파일은 바로 그 **"주문 진행상황 보드"** 입니다. 햄버거 가게에서 번호표를 받고 화면에서 "조리 중 → 포장 중 → 준비 완료"를 보는 것과 똑같습니다.

핵심은 클래스 1개 + 함수 2개뿐입니다:

| 이름 | 한 줄 역할 | 비유 |
|---|---|---|
| `LeanJob` (클래스) | **한 건의 주문표**. 상태·현재단계·로그·결과를 담는 상자 | 번호표 1장 + 그 주문의 조리 현황판 |
| `LeanJob.log/set_phase/finish_ok/finish_err` | 주문표에 진행 내용을 **기록**하는 손잡이들 | 주방이 "지금 굽는 중" / "완성" 을 보드에 적는 행위 |
| `LeanJob.snapshot(since)` | 주문표의 현재 상태를 **읽어가는** 창구 (증분 폴링) | 손님이 보드를 힐끗 보고 "새로 추가된 것만" 확인 |
| `create_job()` (함수) | 새 주문표 발급 + 전체 보드(`_JOBS`)에 등록 | 번호표 뽑기 |
| `get_job(job_id)` (함수) | 번호로 주문표 찾기 | 번호 대고 "내 거 어디 있어요?" |

**누가 호출하나?** → `app/main.py` 의 단 두 엔드포인트:
- `POST /lean/backtest/start` → `create_job()` 으로 주문표를 만들고, 백그라운드 스레드가 `set_phase / log / finish_ok / finish_err` 로 진행을 **적습니다**. 그리고 `{job_id, status}` 를 즉시 응답.
- `GET /lean/backtest/status/{job_id}` → `get_job()` 으로 주문표를 찾고 `snapshot(since)` 로 현재 상황을 **읽어** 프론트에 돌려줍니다.

**왜 이런 구조인가?** → HTTP 요청 하나로 수 분짜리 작업을 처리하면 **타임아웃**이 납니다(브라우저·Nginx 가 응답을 너무 오래 기다리다 끊음). 그래서 "시작은 즉시 OK, 진행은 따로 폴링"으로 쪼갰습니다. 이 파일은 그 두 요청을 잇는 **공용 메모장**입니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 비동기 잡(async job) = "접수증 먼저, 결과는 나중에"
- 오래 걸리는 작업은 **즉시 끝나는 척**(접수증 = `job_id` 반환)하고, 진짜 일은 뒤에서 합니다.
- 비유: 사진관에 필름 맡기면 그 자리에서 인화가 안 나오고 **"접수번호"** 를 줍니다. 나중에 그 번호로 찾으러 갑니다. 여기서 "사진관 카운터 장부"가 `jobs.py` 입니다.

#### 2) 폴링(polling) + `since` 커서 = "새로 추가된 줄만 가져오기"
- 프론트는 1~2초마다 `status/{job_id}` 를 **반복 호출**합니다(이게 폴링). 매번 **로그 전체**를 받으면 낭비입니다(같은 줄을 100번 받게 됨).
- 그래서 `since`(= "나 지금까지 N줄 봤어요") 라는 **읽음 표시(커서)** 를 보냅니다. 서버는 `logs[since:]`, 즉 **N번째 이후 새 줄만** 돌려줍니다.
- 서버는 응답에 `next`(= 현재 총 줄 수)를 같이 줍니다. 프론트는 다음 폴링 때 그 `next` 를 `since` 로 보냅니다. 이렇게 커서가 계속 앞으로 굴러갑니다.

```
1차 폴링: since=0  → 새 줄 0~4 (5개) + next=5
2차 폴링: since=5  → 새 줄 5~8 (4개) + next=9     ← 0~4 는 다시 안 받음
3차 폴링: since=9  → 새 줄 없음(0개) + next=9, status=done + result
```
- 비유: 단체 채팅방에 늦게 들어와도 "안 읽은 메시지부터" 보여주는 것과 같은 원리. `since` 가 "마지막으로 읽은 위치".

#### 3) 인메모리 저장(in-memory store)의 본질과 한계
- 이 파일의 모든 데이터(`_JOBS` 딕셔너리)는 **프로그램의 메모리(RAM)** 에만 있습니다. DB·파일이 아닙니다.
- **장점**: 매우 빠르고 단순. 의존성 없음.
- **한계**: 서버를 **재시작하면 전부 사라집니다**(진행 중이던 잡도, 완료 결과도). 또 서버를 **여러 대**로 늘리면(스케일 아웃) 각자 다른 메모리를 가져서, "1번 서버에서 시작한 잡을 2번 서버에 물어보면 못 찾습니다". → 자세한 건 ⚠️ 섹션.

#### 4) 스레드 안전성(thread-safe)과 `Lock`(자물쇠)
- 백그라운드 스레드가 로그를 **쓰는** 동시에, 폴링 요청 스레드가 같은 로그를 **읽으면** 데이터가 꼬일 수 있습니다(예: 리스트를 늘리는 도중에 읽어서 깨짐).
- `threading.Lock()` = **자물쇠**. `with self._lock:` 블록 안에서는 **한 번에 한 스레드만** 들어갑니다. 다른 스레드는 자물쇠가 풀릴 때까지 문 앞에서 대기.
- 비유: 1인용 화장실. 들어가면 잠그고(`with _lock:`), 나오면 풀고, 그동안 다음 사람은 기다림. → "동시에 건드려서 깨지는 일"을 막습니다.

#### 5) 콜백(callback) = "진행될 때마다 불러줘"
- `runner.py`(실제 Lean 실행기)는 단계가 바뀔 때마다 `progress_cb(level, msg)` 라는 **함수를 대신 호출**해 줍니다. main.py 가 그 콜백 안에서 이 파일의 `set_phase`/`log` 를 부릅니다.
- 비유: 택배기사에게 "출발/배송중/도착 때마다 문자 줘"라고 콜백을 등록하는 것. 기사가 단계마다 그 번호로 알림을 쏴줍니다.

---

## 🗺 전체 흐름도

```
[프론트엔드]                          [main.py 엔드포인트]                 [이 파일 jobs.py]            [runner.py]
   │                                                                                                   
   │  POST /lean/backtest/start                                                                        
   ├──────────────────────────────▶  lean_backtest_start()                                            
   │                                        │  create_job() ───────────────▶ _JOBS 에 새 LeanJob 등록  
   │                                        │                                  (job_id 발급)            
   │   ◀───── {job_id, "running"} ──────────┤  즉시 응답                                                
   │                                        │                                                          
   │                                        │  threading.Thread(_run) 시작 (백그라운드) ──────────────▶ run_lean_backtest(req, progress_cb=_cb)
   │                                        │       _cb(level,msg):                                            │
   │                                        │         level=="phase" → job.set_phase(msg) ◀── _emit("phase", …)
   │                                        │         level=="lean"  → job.log("info",…)  ◀── _emit("lean",  …)  (Lean stdout 한 줄씩)
   │                                        │         그 외          → job.log(level,msg)                       │
   │                                        │       끝나면 finish_ok(result) / finish_err(err) ◀───────── 성공/실패
   │                                                                          │ (LeanJob 안에 로그·결과 쌓임)   
   │  GET /lean/backtest/status/{id}?since=N                                                            
   ├──────────────────────────────▶  lean_backtest_status()                                            
   │                                        │  get_job(id) ───────────────▶ _JOBS 에서 찾기             
   │                                        │  job.snapshot(since=N) ─────▶ {status, phase,             
   │   ◀── {status,phase,logs[N:],next,…} ──┤        logs[N:], next, result, error}                     
   │   (1~2초마다 반복: since=next 로 갱신)                                                              
   ▼
```

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) — `L1-L5`

```python
# L1-L5
"""Lean 백테스트 비동기 잡 스토어 (in-memory, thread-safe).

/lean/backtest/start 가 백그라운드 스레드로 백테스트를 돌리며 진행 로그를 누적하고,
/lean/backtest/status/{job_id} 가 since 커서로 증분 폴링한다. (SSE 없이 견고한 진행 스트리밍)
"""
```
- **무엇을**: 이 파일의 정체성을 한 문단으로 요약 — "비동기 잡 스토어, 메모리에 있고, 스레드 세이프".
- **왜**: 이 한 줄만 읽어도 두 엔드포인트(`start`/`status`)가 어떻게 짝을 이루는지 보입니다.
- **헷갈리는 포인트 — "SSE 없이"란?**: SSE(Server-Sent Events)는 서버가 클라이언트에게 진행상황을 **실시간으로 밀어주는** 기술입니다. 그건 연결을 계속 열어둬야 해서 Nginx·프록시 환경에서 까다롭습니다. 여기서는 그 대신 **프론트가 주기적으로 물어보는(polling)** 방식을 택했습니다 — 더 단순하고 끊겨도 복구가 쉬워 "견고하다(robust)"고 표현한 것.

---

### B. 임포트 + 상한선 상수 — `L7-L11`

```python
# L7-L11
import threading
import uuid
from typing import Any, Dict, List, Optional

_MAX_LOGS = 2000      # 잡당 로그 상한 (lean stdout 폭주 방어)
_MAX_JOBS = 64        # 메모리 상한 — 초과 시 완료된 잡부터 정리
```
- `threading` — 자물쇠(`Lock`)를 쓰기 위해. (백그라운드 스레드 자체는 여기 말고 main.py 가 만듭니다.)
- `uuid` — 겹치지 않는 **고유 ID** 생성기. 접수번호(job_id) 만들 때 씀.
- `typing` 의 `Any/Dict/List/Optional` — 타입 힌트용(코드가 더 명확해지고 IDE 가 도와줌). `Optional[X]` = "X 이거나 None(없음)".
- **두 상수가 핵심 안전장치입니다:**
  - `_MAX_LOGS = 2000` — **잡 하나가 쌓을 수 있는 로그 줄 수의 상한**. Lean 엔진이 stdout 으로 수만 줄을 토해낼 수 있는데(특히 에러 폭주 시), 그걸 다 메모리에 담으면 RAM 이 터집니다. 2000줄에서 더 안 받습니다.
  - `_MAX_JOBS = 64` — **동시에 보관하는 잡 개수의 상한**. 64개를 넘으면 **이미 끝난 잡부터** 지워서 메모리를 비웁니다(아래 `create_job` 에서 실행).
- **헷갈리는 포인트 — 왜 이름 앞에 `_`?**: `_MAX_LOGS`, `_JOBS` 처럼 밑줄로 시작하면 "이건 이 모듈 **내부용**, 밖에서 직접 쓰지 마세요"라는 파이썬 관습 표시입니다. 강제는 아니고 약속.

---

### C. 주문표 한 장 = `LeanJob` 클래스 (생성자) — `L15-L23`

```python
# L15-L23
class LeanJob:
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.status = "running"          # running | done | error
        self.phase = "queued"            # 사람이 읽는 현재 단계
        self.logs: List[Dict[str, str]] = []   # [{type, msg}]
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None
        self._lock = threading.Lock()
```
- **무엇을**: `LeanJob` 은 **백테스트 한 건의 모든 상태를 담는 상자**입니다. `__init__` 은 그 상자를 처음 만들 때 칸들을 초기화하는 "생성자".
- 각 칸(필드)의 뜻:
  - `job_id` — 이 주문표의 고유 번호(밖에서 받아 저장).
  - `status` — **3가지 중 하나**: `"running"`(작업 중) / `"done"`(성공 완료) / `"error"`(실패). 프론트는 이 값으로 "계속 폴링할지, 멈출지"를 정합니다.
  - `phase` — **사람이 읽는 현재 단계** 문자열. 예: `"queued"` → `"전략 로드: …"` → `"Lean 엔진 실행 …"`. status 가 기계용 신호등이라면, phase 는 화면에 보여줄 한국어 설명.
  - `logs` — **로그 줄들의 리스트**. 각 줄은 `{"type": 레벨, "msg": 내용}` 딕셔너리. (예: `{"type": "info", "msg": "[lean] ..."}`)
  - `result` — **성공 시 결과** 딕셔너리(통계·자산곡선 등). 아직 없으면 `None`.
  - `error` — **실패 시 에러 메시지**. 없으면 `None`.
  - `_lock` — 이 주문표 **전용 자물쇠**. 이 잡의 칸을 읽고 쓸 때 동시 접근을 막습니다.
- **왜 `result`/`error` 를 둘 다 두나?**: 끝났을 때 둘 중 **하나만** 채워집니다. 성공이면 `result`, 실패면 `error`. 프론트는 `status` 를 보고 어느 칸을 읽을지 압니다.
- **헷갈리는 포인트 — `self` 란?**: 클래스 안에서 `self` 는 "이 상자 자신"입니다. `self.status = "running"` = "이 주문표의 status 칸에 running 적기". 주문표가 100장이면 각자 자기 `self` 를 가집니다.

#### C-1) 로그 한 줄 추가 — `log()` — `L25-L28`

```python
# L25-L28
    def log(self, level: str, msg: str) -> None:
        with self._lock:
            if len(self.logs) < _MAX_LOGS:
                self.logs.append({"type": level, "msg": str(msg)})
```
- **무엇을**: 로그 리스트에 **한 줄을 덧붙입니다**. `level`(= 종류: "info"/"error"/"phase" 등), `msg`(= 내용).
- **왜 `with self._lock:`**: 백그라운드 스레드가 여기서 `append`(추가) 하는 **바로 그 순간** 폴링 스레드가 `logs` 를 읽으면 충돌할 수 있어, 자물쇠로 잠그고 안전하게 추가.
- **`if len(self.logs) < _MAX_LOGS`**: 이미 2000줄이면 **그냥 버립니다**(추가 안 함). 이게 앞서 말한 stdout 폭주 방어. 에러 없이 조용히 무시하는 게 핵심 — 폭주해도 서버는 안 죽음.
- **`str(msg)`**: 들어온 게 문자열이 아닐 수도 있어(숫자·예외 객체 등) **강제로 문자열로** 변환. JSON 으로 내보낼 때 안전.
- `-> None`: "이 함수는 값을 돌려주지 않는다"는 타입 표기(부수효과만 있음 — 리스트에 추가).

#### C-2) 현재 단계 갱신 — `set_phase()` — `L30-L33`

```python
# L30-L33
    def set_phase(self, msg: str) -> None:
        with self._lock:
            self.phase = str(msg)
        self.log("phase", msg)
```
- **무엇을**: 두 가지를 동시에 합니다 — ① `phase` 칸을 새 단계로 **덮어쓰고**(현재 상태), ② 그 단계를 **로그에도 한 줄 남깁니다**(이력).
- **왜 둘 다?**: `phase` 는 "지금 이 순간"만 보여주는 **최신 한 줄**(덮어쓰니 이전 건 사라짐). `logs` 는 **지나온 모든 단계**를 보존(타임라인). 프론트는 큰 글씨로 phase 를, 작은 로그창에 전체 이력을 보여줄 수 있습니다.
- **헷갈리는 포인트 — 자물쇠 범위가 왜 한 줄만?**: `with self._lock:` 블록은 `self.phase = str(msg)` 한 줄만 감쌉니다. 그 다음 `self.log(...)` 는 **블록 밖**에 있죠. 왜냐하면 `log()` 안에서 **또 자물쇠를 잡기** 때문입니다. 만약 `log()` 를 `with self._lock:` **안에서** 부르면, 같은 스레드가 이미 잠근 자물쇠를 또 잠그려다 **영원히 멈춥니다(데드락)** — 파이썬 기본 `Lock` 은 재진입 불가(non-reentrant)이기 때문. 그래서 일부러 자물쇠를 먼저 풀고 나서 `log()` 를 호출하는 것. (이건 실수하기 매우 쉬운 동시성 함정 — ⚠️ 섹션 참조.)

#### C-3) 성공 마감 — `finish_ok()` — `L35-L38`

```python
# L35-L38
    def finish_ok(self, result: Dict[str, Any]) -> None:
        with self._lock:
            self.result = result
            self.status = "done"
```
- **무엇을**: 백테스트가 **성공**으로 끝났을 때 호출. 결과 딕셔너리를 `result` 칸에 저장하고, `status` 를 `"done"` 으로 바꿈.
- **왜 순서가 result → status?**: 먼저 `result` 를 채우고 **그 다음** `status="done"`. 만약 반대로 하면, 폴링이 `status=="done"` 을 보고 결과를 읽으려는 찰나에 `result` 가 아직 `None` 일 수 있습니다. "결과를 다 넣은 뒤에야 완료 깃발을 든다"는 안전한 순서. (단, 둘 다 같은 `with` 블록 안이라 폴링 스레드는 어차피 둘을 한꺼번에 보게 됩니다 — 그래도 코드 의도가 분명.)
- 여기 담기는 `result` 의 실제 모양(main.py L835-842): `{"success", "run_id", "statistics", "equity_curve", "trades_count", "elapsed_seconds"}`.

#### C-4) 실패 마감 — `finish_err()` — `L40-L43`

```python
# L40-L43
    def finish_err(self, error: str) -> None:
        with self._lock:
            self.error = str(error)
            self.status = "error"
```
- **무엇을**: 백테스트가 **실패**로 끝났을 때 호출. 에러 메시지를 `error` 칸에 저장하고 `status` 를 `"error"` 로.
- **`str(error)`**: 예외 객체가 들어와도 문자열로 변환해 저장(JSON 안전 + 사람이 읽을 메시지).
- **헷갈리는 포인트**: `finish_ok` 와 `finish_err` 는 **상호배타**입니다 — 한 잡은 둘 중 하나로만 끝납니다. main.py 는 `result.success` 가 False 면 `finish_err`, 예외가 나도 `finish_err`, 정상이면 `finish_ok` 를 부릅니다.

#### C-5) 현재 상태 읽어가기 — `snapshot()` (가장 중요) — `L45-L56`

```python
# L45-L56
    def snapshot(self, since: int = 0) -> Dict[str, Any]:
        with self._lock:
            since = max(0, min(since, len(self.logs)))
            return {
                "job_id": self.job_id,
                "status": self.status,
                "phase": self.phase,
                "logs": self.logs[since:],
                "next": len(self.logs),
                "result": self.result,
                "error": self.error,
            }
```
- **무엇을**: 폴링 요청이 올 때마다 호출되는 **읽기 창구**. 잡의 현재 상태를 통째로 떠서(스냅샷) 딕셔너리로 돌려줍니다. 이게 곧 `GET /status` 의 JSON 응답.
- **`since` 커서 처리 한 줄이 핵심**: `since = max(0, min(since, len(self.logs)))`
  - `min(since, len(self.logs))` — `since` 가 현재 로그 수보다 크면(있을 수 없는 위치) 로그 수로 깎음 → `logs[since:]` 가 빈 리스트가 되게.
  - `max(0, ...)` — `since` 가 음수면 0 으로. (프론트가 이상한 값을 보내도 **터지지 않게** 방어.)
  - 정리하면 **`since` 를 `0 ~ 로그수` 범위로 강제 보정**. 어떤 값이 와도 `logs[since:]` 가 안전하게 동작.
- 반환 딕셔너리의 각 칸:
  - `logs: self.logs[since:]` — **`since` 번째 이후의 새 로그만** 잘라서 보냄(증분). 1차 폴링(since=0)이면 전부, 이후엔 새 것만.
  - `next: len(self.logs)` — **현재 총 로그 줄 수**. 프론트는 이걸 **다음 폴링의 `since`** 로 씁니다. (그래서 매번 새 줄만 받게 됨.)
  - `status`/`phase` — 신호등 + 현재 단계.
  - `result`/`error` — 끝났으면 채워져 있고, 진행 중이면 `None`.
- **왜 자물쇠 안에서 통째로?**: 읽는 순간 다른 스레드가 `logs.append` 나 `status` 변경을 하면, 반쯤 바뀐 상태를 읽을 수 있습니다. `with self._lock:` 으로 **읽는 동안엔 못 쓰게** 막아, "일관된 한 시점의 스냅샷"을 보장.
- **헷갈리는 포인트 — `next` 라는 이름**: "다음(next)" 이라기보다 "**다음 번에 since 로 보낼 값**"입니다. 즉 "여기까지 다 줬으니 다음엔 여기서부터 달라고 해" 라는 북마크. 프론트 폴링 루프는 보통 이렇게 돕니다: `since = resp.next` 로 갱신 → 다음 요청.

---

### D. 전역 보드 + 발급/조회 함수 — `L59-L78`

#### D-1) 전체 주문표 보관소 — `L59-L60`

```python
# L59-L60
_JOBS: Dict[str, LeanJob] = {}
_JOBS_LOCK = threading.Lock()
```
- `_JOBS` — **모든 잡을 모아둔 딕셔너리**. 키 = `job_id`(문자열), 값 = `LeanJob` 객체. 이게 "전체 진행상황 보드". 모듈이 메모리에 살아있는 동안 유지됩니다(= 서버 떠 있는 동안).
- `_JOBS_LOCK` — **이 보드 전용 자물쇠**(개별 잡의 `self._lock` 과 **별개**). `_JOBS` 딕셔너리 자체를 추가/삭제할 때 동시 충돌을 막습니다.
- **헷갈리는 포인트 — 자물쇠가 왜 두 종류?**: ① `_JOBS_LOCK` 은 "보드에 표를 꽂거나 빼는" 작업용(딕셔너리 구조 변경), ② 각 `LeanJob._lock` 은 "그 표 한 장의 칸을 고치는" 작업용. 영역이 달라 서로 간섭하지 않습니다(잠금 범위를 좁게 나눠 성능·안전 둘 다 챙김).

#### D-2) 새 주문표 발급 — `create_job()` — `L63-L72`

```python
# L63-L72
def create_job() -> LeanJob:
    job = LeanJob(uuid.uuid4().hex[:12])
    with _JOBS_LOCK:
        if len(_JOBS) >= _MAX_JOBS:
            # 완료/에러 잡부터 오래된 순으로 정리
            stale = [k for k, v in _JOBS.items() if v.status != "running"]
            for k in stale[: max(1, len(_JOBS) - _MAX_JOBS + 1)]:
                _JOBS.pop(k, None)
        _JOBS[job.job_id] = job
    return job
```
- **무엇을**: 새 `LeanJob` 을 만들고, 보드(`_JOBS`)에 등록한 뒤 돌려줍니다. main.py 의 `/start` 가 맨 처음 부르는 함수.
- **`uuid.uuid4().hex[:12]`**: 랜덤 UUID 를 16진수 문자열로 바꾼 뒤(`.hex`) **앞 12자리만** 잘라 job_id 로 씀. 짧으면서도 사실상 안 겹침(12 hex 자리 = 약 16^12 가짓수).
- **메모리 정리(가비지 컬렉션) 로직 — `if len(_JOBS) >= _MAX_JOBS:`**:
  - 보드가 64개 가득 차면, 먼저 **끝난 잡들**을 골라냅니다: `stale = [k for k,v in _JOBS.items() if v.status != "running"]` → status 가 running 이 **아닌**(done/error) 것들의 키 목록.
  - `stale[: max(1, len(_JOBS) - _MAX_JOBS + 1)]` — 그중 **앞에서 N개**를 지웁니다. N = `현재개수 - 상한 + 1`(최소 1). 예: `_JOBS` 가 64개고 상한이 64면 `64-64+1 = 1` → 최소 1개 정리해 새 잡 자리 확보.
  - `_JOBS.pop(k, None)` — 그 키를 딕셔너리에서 제거(없으면 조용히 무시 — 그래서 두 번째 인자 `None`).
- **왜 running 은 안 지우나?**: **진행 중인 잡을 지우면** 사용자가 폴링할 때 404(없음)가 되어 결과를 영영 못 받습니다. 그래서 **이미 끝난 잡만** 정리 대상. (단, 끝난 잡이 하나도 없고 64개 전부 running 이면? → `stale` 이 비어 아무것도 못 지우고, 그냥 65번째가 추가되어 상한을 살짝 넘습니다. 이건 의도된 안전한 동작 — 진행 중인 걸 죽이느니 잠깐 초과를 허용.)
- **헷갈리는 포인트 — "오래된 순"이 보장되나?**: 주석은 "오래된 순"이라 적었고, 파이썬 3.7+ 딕셔너리는 **삽입 순서를 유지**하므로 `_JOBS.items()` 는 먼저 만든 잡부터 나옵니다. 따라서 `stale` 앞쪽 = 더 오래 전에 만들어진(그리고 이미 끝난) 잡 → 그것부터 지우는 게 맞습니다. (정확히는 "삽입 순서 중 먼저 들어온, 끝난 잡부터".)

#### D-3) 주문표 조회 — `get_job()` — `L75-L78`

```python
# L75-L78
def get_job(job_id: str) -> Optional[LeanJob]:
    with _JOBS_LOCK:
        return _JOBS.get(job_id)
```
- **무엇을**: 번호(`job_id`)로 보드에서 잡을 찾아 돌려줍니다. **없으면 `None`**(그래서 반환 타입 `Optional[LeanJob]`).
- **왜 `with _JOBS_LOCK:`**: 다른 스레드가 `create_job` 에서 `_JOBS` 를 정리/추가하는 도중에 읽으면 충돌할 수 있어 잠그고 읽음. (`.get()` 자체는 원자적이지만, 정리 로직과의 안전을 위해 일관되게 잠금.)
- **`.get(job_id)`** vs `_JOBS[job_id]`: `[]` 는 없으면 에러(KeyError)지만 `.get()` 은 **없으면 None** 을 줍니다. main.py 는 이 None 을 받아 `404 job not found` 로 응답(L857-858).

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 + 잠재 위험)

1. **서버 재시작 = 모든 잡 소실** — `_JOBS` 는 RAM 에만 있습니다. 배포·크래시·systemd 재시작이 일어나면 **진행 중이던 백테스트도, 완료 결과도 전부 사라집니다**. 사용자는 폴링하다 갑자기 404 를 받습니다. (운영 시 가장 큰 한계 — 영속화로 해결, 🚀 섹션.)

2. **수평 확장 불가(스케일 아웃 깨짐)** — 서버를 2대 이상 띄우면 각자 다른 `_JOBS` 를 가집니다. 로드밸런서가 `/start` 를 A 서버로, 그 잡의 `/status` 를 B 서버로 보내면 **"job not found"**. 현재는 단일 인스턴스 전제. (해결: 공유 저장소(Redis/DB) 또는 sticky session.)

3. **재진입 데드락 함정 (이미 코드가 피해 감)** — `set_phase` 가 `with self._lock:` 블록 **밖에서** `self.log()` 를 부르는 이유가 이것. 만약 누군가 리팩터링하며 `log()` 호출을 `with self._lock:` 안으로 옮기면, **같은 스레드가 같은 자물쇠를 두 번 잠그려다 영구 정지(deadlock)** 합니다. 파이썬 `threading.Lock` 은 재진입 불가이기 때문. → 잠금 안에서 다른 잠금 메서드를 부르지 말 것. (정 필요하면 `RLock`.)

4. **로그 2000줄 초과분은 조용히 버려짐** — Lean 이 2000줄을 넘기면 **그 이후 로그는 사라집니다**(에러 없이 무시). 디버깅 시 "로그가 중간에 끊긴" 것처럼 보일 수 있는데, 버그가 아니라 의도된 상한입니다. 정말 긴 에러 추적이 필요하면 상한을 늘리거나 파일 로그를 병행해야 함.

5. **`_MAX_JOBS` 초과 시 running 만 가득하면 상한을 넘김** — 64개가 전부 동시 실행 중이면 정리 대상이 없어 65, 66… 으로 늘 수 있습니다. 동시 백테스트가 폭증하는 환경이면 메모리 압박 가능. (현실적으로 Lean 은 무거워 동시 64개는 드물지만, 인지해 둘 것.)

6. **완료된 잡도 결국 밀려나 사라짐** — `_MAX_JOBS` 정리로 인해, 오래된 완료 잡은 새 잡이 들어오면서 지워집니다. 사용자가 결과를 **늦게** 보러 오면 404 가 날 수 있음(영구 기록이 아님). 결과를 오래 보관하려면 DB 영속화 필요.

7. **`result` 안의 `equity_curve` 가 크면 폴링마다 통째로 전송** — `snapshot` 은 완료 후 매 폴링마다 `result` 전체를 돌려줍니다. 자산곡선이 길면 트래픽 낭비. 프론트가 `status=="done"` 을 본 즉시 폴링을 멈추도록 구현돼 있어야 합니다.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **Redis 로 영속화 (수평 확장 + 재시작 생존)**: `_JOBS` 딕셔너리를 Redis 해시로 대체. `create_job` → `HSET job:{id} ...`, `snapshot` → Redis 읽기. 그러면 ① 서버 재시작해도 잡이 살고, ② 여러 서버가 같은 Redis 를 공유해 어느 서버로 폴링이 와도 찾습니다. 로그는 Redis List(`RPUSH`/`LRANGE since -1`)로 두면 `since` 증분도 자연스럽게 구현됨.
- **DB 영속화 (결과 영구 보관 + 이력 조회)**: 완료된 잡의 `result` 를 MySQL `lean_backtest_run` 테이블에 저장. 사용자가 며칠 뒤에도 과거 백테스트 결과를 다시 볼 수 있게(현재는 메모리라 곧 사라짐). 진행 중 로그는 메모리, 최종 결과는 DB 의 하이브리드도 가능.
- **TTL(만료 시간) 도입**: 끝난 잡에 "완료 후 N분 뒤 자동 삭제" 타임스탬프를 둬, `_MAX_JOBS` 개수 제한보다 더 직관적으로 정리. (개수 기반 → 시간 기반.)
- **SSE / WebSocket 으로 진짜 실시간**: 폴링 대신 서버가 진행을 밀어주면 지연이 줄고 트래픽이 절약됩니다. 단, 프록시 설정 복잡도가 올라가는 트레이드오프(그래서 현재는 일부러 폴링).
- **진척도(%) 추가**: 지금 `phase`(문자열)만 있는데, runner 의 단계 수를 알면 `progress: 0.0~1.0` 을 계산해 프로그레스바로 보여줄 수 있음. (예: 7단계 중 4단계 = 57%.)
- **`status` 에 `"cancelled"` 추가 + 취소 기능**: 사용자가 백테스트를 도중에 중단할 수 있게. 백그라운드 스레드/Docker 컨테이너에 취소 신호를 보내는 메커니즘 필요.
- **로그 레벨 필터링**: `snapshot(since, level="error")` 처럼 특정 레벨만 골라 받기. 긴 로그에서 에러만 빠르게 보기.
- **메트릭/관측성**: 생성된 잡 수·성공률·평균 소요시간을 Prometheus 로 노출해 운영 모니터링.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **잡(Job)** | 오래 걸리는 작업 한 건. 여기선 Lean 백테스트 1회 = `LeanJob` 1개 |
| **잡 스토어(Job Store)** | 잡들을 모아 보관·조회하는 저장소. 여기선 `_JOBS` 딕셔너리 |
| **in-memory(인메모리)** | 데이터를 DB·파일이 아닌 **프로그램 메모리(RAM)** 에만 두는 방식. 빠르지만 재시작하면 사라짐 |
| **폴링(polling)** | 클라이언트가 "다 됐어요?"를 **주기적으로 반복 질의**하는 방식 (서버가 밀어주는 push 의 반대) |
| **`since` 커서** | "여기까지 읽었어요" 표시. 서버는 그 이후 **새 로그만** 잘라 보냄(증분) |
| **`next`** | 현재 총 로그 수 = 프론트가 **다음 폴링 때 `since` 로 보낼 값**(북마크) |
| **스레드(thread)** | 한 프로그램 안에서 동시에 도는 실행 흐름. 여기선 "백그라운드 작업 스레드" vs "폴링 응답 스레드" |
| **`Lock`(자물쇠)** | 한 번에 한 스레드만 들어가게 막는 동기화 도구. `with _lock:` 블록으로 사용 |
| **thread-safe(스레드 세이프)** | 여러 스레드가 동시에 써도 데이터가 안 깨지게 설계됨 |
| **데드락(deadlock)** | 자물쇠를 풀지 못해 스레드들이 영원히 서로 기다리며 멈춤 |
| **재진입 불가(non-reentrant)** | 같은 스레드라도 이미 잡은 자물쇠를 또 못 잡음(파이썬 기본 `Lock`). 또 잡으면 데드락 |
| **콜백(callback / `progress_cb`)** | "진행될 때마다 대신 불러줘"라고 넘기는 함수. runner 가 단계마다 호출 |
| **UUID** | 사실상 겹치지 않는 고유 식별자. `uuid4().hex[:12]` 로 12자리 job_id 생성 |
| **status / phase** | status = 기계용 상태(`running/done/error`), phase = 화면용 한국어 단계 설명 |
| **stale(끝난 잡)** | status 가 running 이 아닌(done/error) 잡. `_MAX_JOBS` 초과 시 정리 대상 |
