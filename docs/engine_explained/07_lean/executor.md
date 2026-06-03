# `lean/executor.py` — 외부 프로그램(lean CLI)을 대신 돌려주는 "리모컨" (완전 라인별 해설)

> 원본: `analytics/app/lean/kis_backtest/lean/executor.py` (351줄)
> 표준 형식은 `01_backtest/vbt_engine.md` 와 동일합니다.

---

## 📌 이 파일 한눈에

이 파일은 **"외부 프로그램(QuantConnect `lean` CLI)을 대신 실행해주는 리모컨"** 입니다.

`vbt_engine.py` 가 **우리 코드 안에서 직접** 백테스트를 계산했다면, 이 파일은 그렇게 하지 않습니다. 대신 **컴퓨터에 설치된 다른 프로그램(`lean`)을 명령어로 실행시키고**, 그 프로그램이 화면에 토해내는 글자(로그)를 받아서 모으고, 끝나면 그 프로그램이 만든 결과 파일(JSON)을 읽어옵니다.

비유: 당신은 세탁기(`lean`) 앞에 서서 직접 빨래를 비비지 않습니다. **버튼을 누르고(명령어 실행)**, 돌아가는 동안 **창으로 진행 상황을 지켜보고(stdout 스트리밍)**, 끝나는 소리가 나면(`returncode`) **빨래 바구니에서 결과를 꺼냅니다(결과 JSON 읽기)**. 이 파일이 바로 그 "세탁기 리모컨 + 감시창" 역할입니다.

핵심 구성요소는 다음과 같습니다:

| 이름 | 종류 | 한 줄 역할 | 비유 |
|---|---|---|---|
| `_resolve_lean_bin()` | 함수 | `lean` 실행파일이 컴퓨터 어디 있는지 찾기 | 리모컨이 켤 기계의 위치를 찾기 |
| `LeanRun` | dataclass | 실행 결과(성공여부·출력폴더)를 담는 상자 + 결과파일 읽는 도구들 | 빨래 끝난 뒤 결과를 담는 바구니 |
| `LeanExecutor.run()` | 메서드 | **이 파일의 심장.** `lean backtest`를 실제로 실행하고 로그를 받아 결과를 만든다 | 버튼 누르고 끝까지 지켜보기 |
| `LeanExecutor._locate_results()` | 메서드 | 결과 JSON이 실제로 어느 폴더에 떨어졌는지 찾기 | 빨래가 어느 칸에 들어갔는지 확인 |
| `check_lean_cli / pull_image / check_docker / check_image` | 메서드 | 사전 점검(설치됐나·도커 켜졌나·이미지 있나) | 기계 전원·물·세제 확인 |

**누가 호출하나?** → `app/lean/runner.py` 의 백테스트 실행 함수가 부릅니다. 구체적으로 (runner.py:193-194):

```python
lean_run = LeanExecutor.run(project, stream_logs=False, timeout=600,
                            on_line=lambda line: _emit("lean", line))
```

즉 runner 가 ① 데이터 CSV 준비 → ② `main.py`(Lean 알고리즘 코드) 생성 → ③ **이 `LeanExecutor.run()` 으로 lean 을 실행** → ④ 결과를 `ResultFormatter` 로 가공 → 백엔드에 응답, 이렇게 이어지는 파이프라인의 **"③ 실제 실행"** 한 칸을 이 파일이 담당합니다. 그리고 `on_line=lambda line: _emit("lean", line)` 으로 **lean 이 한 줄 출력할 때마다 그 줄을 프론트로 실시간 중계(SSE)** 하도록 콜백을 넘깁니다.

**왜 vbt 처럼 직접 안 하고 외부 프로그램을 부르나?** → `lean` 은 QuantConnect 의 본격 백테스트 엔진으로, 우리가 직접 재구현하기엔 너무 크고(수만 줄), 거래소 규칙·수수료·세금·체결 모델이 정교합니다. 그래서 **"바퀴를 다시 발명하지 않고"** 그 프로그램을 그대로 빌려 쓰되, 파이썬에서 깔끔히 호출·감시·수확하는 껍데기만 우리가 만든 것입니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) "프로세스를 띄운다" = 컴퓨터에게 다른 프로그램을 실행시키기
- 우리가 터미널에 `lean backtest ...` 를 치면 운영체제가 **새 프로그램(프로세스)** 을 하나 띄워줍니다.
- 파이썬에서 이 일을 코드로 시키는 도구가 `subprocess` 모듈입니다. **"파이썬이 터미널 명령을 대신 쳐준다"** 고 생각하면 됩니다.

#### 2) `subprocess.run` vs `subprocess.Popen` — "끝까지 기다리기" vs "켜두고 감시하기"
```
subprocess.run([...])     → 프로그램을 실행하고, "다 끝날 때까지 멈춰 서서 기다림". 결과만 한꺼번에 받음.
subprocess.Popen([...])   → 프로그램을 켜두기만 하고 바로 다음 줄로 넘어감. 내가 직접 "기다려/읽어/죽여"를 제어.
```
- 이 파일은 **`run()` 안에서는 `Popen`** 을 씁니다. 왜? lean 은 오래 걸리고(수십 초~수 분), 그동안 **로그를 한 줄씩 실시간으로 받아 프론트에 보여줘야** 하기 때문. `run` 은 다 끝나야 로그를 주므로 실시간이 안 됩니다.
- 반대로 `check_docker()`, `pull_image()` 같은 **짧은 점검**은 굳이 실시간이 필요 없어 `subprocess.run` 을 씁니다.

#### 3) stdout 파이프 = "프로그램의 입에 빨대 꽂기"
- 프로그램이 화면에 찍는 글자를 **stdout**(표준출력)이라 합니다.
- `stdout=subprocess.PIPE` = 그 출력을 화면 대신 **파이프(빨대)** 로 받아서 내가 코드로 읽겠다는 뜻.
- `stderr=subprocess.STDOUT` = 에러 메시지(stderr)도 **같은 빨대로 합쳐서** 받겠다는 뜻. (로그 순서가 안 꼬이고 한 줄기로 모임.)

#### 4) ⚠️ 파이프는 "양동이"라 안 비우면 넘쳐서 멈춘다 (이 파일의 핵심 위험)
- 파이프(빨대) 뒤에는 **작은 버퍼(양동이)** 가 있습니다. lean 이 글자를 계속 쏟는데, 우리가 그걸 **읽어서 비우지 않으면** 양동이가 가득 찹니다.
- 양동이가 가득 차면 lean 은 **"더 못 쓰겠다"며 글쓰기를 멈추고 그대로 얼어붙습니다(deadlock·행)**. 백테스트가 영원히 안 끝난 것처럼 보이죠.
- 그래서 이 파일은 **별도의 스레드(`_pump`)** 를 만들어 lean 이 출력하는 족족 빨대를 비웁니다. (코드 주석 L215 가 바로 이 경고: "리더 스레드가 죽으면 파이프 미배수 → lean write 블록 → 행".)

#### 5) 인코딩(encoding)·디코딩 — "바이트 ↔ 글자" 번역
- 프로그램은 글자를 **바이트(0/1 덩어리)** 로 뱉습니다. 그걸 사람이 읽는 글자로 바꾸려면 **"어떤 규칙표(인코딩)로 번역하나"** 를 정해야 합니다.
- **`utf-8`** = 전 세계 표준 글자표. **`cp949`** = 윈도우 한국어판의 옛날 기본 글자표.
- 문제: 윈도우 파이썬은 외부 프로그램 출력을 **무심코 `cp949` 로 번역**하려 합니다. 그런데 lean(도커 안의 리눅스)은 **`utf-8`** 로 뱉습니다. 규칙표가 다르면 번역이 깨지고(`UnicodeDecodeError`) 예외가 터져 **읽기 스레드가 죽고 → (4번) 파이프가 안 비워져 → lean 이 행** 합니다.
- 해결: 명시적으로 `encoding="utf-8", errors="replace"`. `errors="replace"` 는 "번역 못 하는 바이트가 나와도 예외 던지지 말고 `�` 같은 대체문자로 바꿔서 **읽기를 절대 멈추지 마라**"는 안전장치입니다.

#### 6) `lean backtest <project> --output <dir>` — 이 파일이 실제로 치는 명령
- `lean backtest projects/<run_id>` = "이 프로젝트 폴더의 알고리즘으로 백테스트 실행".
- `--output <dir>` = "결과 JSON 들을 이 폴더에 직접 써라". (이게 없으면 lean 이 자기 마음대로 타임스탬프 하위폴더를 만들어 결과를 숨김.)
- `cwd=<workspace>` = "이 작업 디렉터리에서 명령을 실행해라". lean 은 현재 폴더(와 상위)에서 `lean.json` 설정파일을 찾으므로, **워크스페이스에서 실행해야** 데이터 폴더·설정을 제대로 인식합니다.

#### 7) 도커(Docker)는 왜 등장하나?
- `lean` CLI 는 백테스트를 자기 손으로 계산하지 않고, **`quantconnect/lean` 도커 이미지(컨테이너)** 를 띄워 그 안에서 진짜 엔진을 돌립니다(파일 맨 위 docstring L3-L4).
- 그래서 이 파일에 `check_docker()`, `check_image()`, `pull_image()` 같은 **"도커가 켜져 있나 / 이미지가 있나"** 점검 함수가 함께 들어 있습니다. (단, `run()` 자체는 도커를 직접 다루지 않고 lean 에게 위임합니다. 도커는 lean 이 알아서 띄움.)

---

## 🗺 전체 흐름도

```
runner.py
   │  LeanExecutor.run(project, timeout=600, on_line=프론트로_중계)
   ▼
┌──────────────────────────── LeanExecutor.run() ────────────────────────────┐
│ 1) 경로 계산                                                                 │
│    project_dir = <ws>/projects/<run_id>                                      │
│    workspace   = project_dir.parent.parent  (= <ws>)                         │
│    results_path = <project_dir>/result        (없으면 mkdir)                 │
│                                                                              │
│ 2) precondition 체크                                                         │
│    data/symbol-properties/symbol-properties-database.csv 없으면 → RuntimeError│
│                                                                              │
│ 3) 명령 조립                                                                 │
│    lean_bin = _resolve_lean_bin()   (LEAN_BIN → PATH → venv/Scripts)         │
│    cmd = [lean, "backtest", "projects/<run_id>", "--output", <results_path>] │
│                                                                              │
│ 4) Popen 으로 lean 실행 (cwd=workspace, stdout=PIPE, stderr=STDOUT,          │
│                          encoding=utf-8, errors=replace, bufsize=1)          │
│         │                                                                    │
│         ├──► _pump 스레드: for raw in proc.stdout:                           │
│         │        line 저장(captured) + on_line(line)  ← 실시간 중계          │
│         │                                                                    │
│         └──► proc.wait(timeout) ── 초과시 ─► proc.kill() + RuntimeError      │
│                                                                              │
│ 5) returncode != 0 → RuntimeError (마지막 2000자 로그 첨부)                  │
│                                                                              │
│ 6) output_dir = _locate_results(results_path)  (직접기록 or timestamp 하위)  │
│                                                                              │
│ 7) LeanRun(success=True, output_dir=...) 생성 + load_result()               │
└──────────────────────────────────────────────────────────────────────────┘
   │  return LeanRun
   ▼
runner.py → ResultFormatter.to_api_response(lean_run, ...) → 백엔드 → 프론트
```

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) + import — `L1-L24`

```python
# L1-L5
"""Lean 실행기

공식 QuantConnect `lean` CLI 로 백테스트를 실행한다.
(CLI 가 내부적으로 quantconnect/lean Docker 이미지를 구동하므로 Docker 는 여전히 필요.)
"""
```
- 파일 맨 위 **설명서(docstring)**. 실행되지 않고 사람이 읽는 용도. 두 가지를 못박습니다: ① 우리가 직접 계산하지 않고 **공식 lean CLI 를 부른다**, ② 그 CLI 가 **도커 이미지를 돌리므로 도커가 필요**하다.

```python
# L7-L21
import json
import logging
import os
import shutil
import subprocess
import sys
import threading
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from .project_manager import LeanProject

logger = logging.getLogger(__name__)
```
- 표준 라이브러리 도구함을 꺼냅니다. 이 파일의 성격이 import 만 봐도 드러납니다:
  - `subprocess` — 외부 프로그램 실행(핵심).
  - `threading` — 별도 스레드로 stdout 을 빨아들이기 위함(사전지식 4번).
  - `shutil` — `shutil.which("lean")` 으로 실행파일 찾기.
  - `os`, `sys` — 환경변수(`LEAN_BIN`) 읽기·현재 파이썬 위치(`sys.executable`).
  - `pathlib.Path` — 경로를 객체로 안전하게 조립(`/` 연산자로 경로 합치기).
  - `json` — 결과 JSON 파싱.
  - `dataclass, field` — `LeanRun` 결과상자를 짧게 정의.
  - `Callable` — `on_line` 콜백의 타입(함수를 인자로 받는다는 뜻).
- `from .project_manager import LeanProject` — **같은 폴더(`.`)** 의 `project_manager.py` 에서 `LeanProject`(프로젝트 정보 상자)를 가져옴. `run()` 의 입력이 바로 이 타입입니다.
- `logger = logging.getLogger(__name__)` — 이 모듈 이름표가 붙은 로거. 이후 `logger.info(...)` 로 `[Lean]` 진행 로그를 남깁니다.

```python
# L23-L24
# Lean Docker 이미지 (lean CLI 가 구동; pull/존재확인 보조용으로만 사용)
LEAN_IMAGE = "quantconnect/lean:latest"
```
- 도커 이미지 이름 **상수**. `run()` 은 이걸 직접 안 쓰고(도커는 lean 이 띄움), 아래 `pull_image() / check_image()` 점검 함수만 사용합니다. 주석이 그 사실을 명시.

---

### B. lean 실행파일 위치 찾기 `_resolve_lean_bin()` — `L27-L46`

```python
# L27-L34
def _resolve_lean_bin() -> str:
    """`lean` CLI 실행 파일 경로 해석.

    우선순위: LEAN_BIN 환경변수 → PATH(shutil.which) → 현재 파이썬 venv 의 Scripts/bin.
    """
    env = os.environ.get("LEAN_BIN")
    if env and Path(env).exists():
        return env
```
- **무엇을:** "`lean` 이라는 프로그램이 이 컴퓨터 어디 있는지" 경로를 찾아 문자열로 돌려줍니다.
- **왜:** 환경마다 lean 설치 위치가 다릅니다(개발자 PC, 서버, 가상환경). 무작정 `"lean"` 만 치면 PATH 에 없을 때 실패하므로, **3단계 우선순위**로 차근차근 찾습니다.
- 1순위: 환경변수 `LEAN_BIN` 이 지정돼 있고 그 파일이 **실제 존재하면** 그걸 씀. (운영자가 직접 위치를 박아넣는 가장 확실한 방법.)

```python
# L36-L38
    found = shutil.which("lean")
    if found:
        return found
```
- 2순위: `shutil.which("lean")` — 터미널에서 `which lean`(윈도우 `where lean`)과 같은 일. **PATH 환경변수에 등록된 폴더들을 뒤져** lean 실행파일을 찾음. 있으면 그 경로 반환.

```python
# L40-L46
    exe_dir = Path(sys.executable).parent  # venv/Scripts (Windows) | venv/bin (POSIX)
    for name in ("lean.exe", "lean"):
        cand = exe_dir / name
        if cand.exists():
            return str(cand)

    return "lean"  # 최후: PATH 에 없으면 FileNotFoundError 로 이어짐
```
- 3순위: **현재 실행 중인 파이썬과 같은 가상환경(venv)** 안을 봅니다. `sys.executable` = 지금 돌고 있는 `python` 실행파일 경로, `.parent` = 그 폴더(윈도우면 `venv/Scripts`, 리눅스/맥이면 `venv/bin`). `pip install lean` 으로 깔면 보통 여기에 들어가므로 PATH 에 없어도 잡힙니다.
- `lean.exe`(윈도우) → `lean`(POSIX) 순으로 시도.
- **최후의 폴백:** 셋 다 실패하면 그냥 문자열 `"lean"` 을 반환. 이러면 나중에 `Popen` 이 실행을 시도하다 못 찾아 `FileNotFoundError` 를 던지고, `run()` 의 `except FileNotFoundError` 가 친절한 에러 메시지로 바꿔줍니다(아래 L218).
- **헷갈리는 포인트:** 반환값은 "lean 을 찾았다는 보장"이 아니라 **"가장 그럴듯한 경로 한 개"** 일 뿐입니다. 진짜 존재 보장은 호출부의 예외 처리가 담당합니다.

---

### C. 실행 결과 상자 `LeanRun` (dataclass) — `L49-L141`

#### 필드 정의 — `L49-L59`
```python
# L49-L59
@dataclass
class LeanRun:
    """Lean 백테스트 실행 결과"""
    project: LeanProject
    success: bool
    output_dir: Path
    raw_result: Optional[Dict] = None
    error: Optional[str] = None
    duration_seconds: float = 0
    started_at: datetime = field(default_factory=datetime.now)
    finished_at: Optional[datetime] = None
```
- **무엇을:** 한 번의 lean 실행 결과를 담는 **"결과 바구니"**. `@dataclass` 라서 `LeanRun(project=..., success=True, output_dir=...)` 처럼 간단히 만듭니다(`vbt_engine.md` 의 `BacktestParams` 와 같은 패턴).
- 각 칸:
  - `project` — 어떤 프로젝트였나(LeanProject).
  - `success` — 성공 여부.
  - `output_dir` — 결과 파일들이 떨어진 폴더(가장 중요. 아래 프로퍼티들이 여기서 파일을 찾음).
  - `raw_result` — 한 번 읽은 결과 JSON 을 **캐시**해두는 칸(기본 None). 두 번 안 읽게.
  - `error` — 에러 메시지(있다면).
  - `duration_seconds` — 걸린 시간(초).
  - `started_at` — `field(default_factory=datetime.now)`: 객체를 만든 그 순간 시각으로 자동 채움. (`= datetime.now()` 로 쓰면 모든 객체가 클래스 정의 시각을 공유하는 고전 버그가 생겨서, `default_factory` 로 매번 새로 호출.)
  - `finished_at` — 끝난 시각(있다면).

#### 결과 JSON 경로 찾기 `result_json` — `L61-L78`
```python
# L61-L78
    @property
    def result_json(self) -> Optional[Path]:
        """결과 JSON 파일 경로"""
        if not self.output_dir.exists():
            return None

        # Algorithm.json이 메인 결과 파일
        main_result = self.output_dir / "Algorithm.json"
        if main_result.exists():
            return main_result

        # 폴백: order, log, summary, monitor 제외한 첫 번째 json
        for f in self.output_dir.glob("*.json"):
            name_lower = f.name.lower()
            if not any(x in name_lower for x in ["order", "log", "summary", "monitor"]):
                return f

        return None
```
- **무엇을:** 출력 폴더에서 **"진짜 결과 JSON"** 한 개의 경로를 골라 돌려줍니다.
- `@property` — 메서드지만 `run.result_json` 처럼 **괄호 없이 속성처럼** 부릅니다(계산해서 값을 내놓는 읽기전용 속성).
- 1순위: lean 의 메인 결과 파일 이름은 `Algorithm.json`. 있으면 그걸 씀.
- 폴백: 없으면 폴더의 `*.json` 들을 훑되, 파일명에 `order`(주문내역)·`log`(로그)·`summary`(요약)·`monitor`(모니터)가 들어간 **곁다리 파일은 건너뛰고** 첫 본 결과 파일을 채택. lean 버전에 따라 메인 파일명이 `<backtestId>.json` 처럼 바뀔 수 있어 대비한 장치.
- **헷갈리는 포인트:** `glob("*.json")` 의 순서는 OS·파일시스템에 따라 보장되지 않습니다. 후보가 여러 개면 "첫 번째"가 어떤 것일지 단정 못 함(아래 고도화 참고).

#### 주문/로그 파일 경로 `orders_json`, `log_txt` — `L80-L102`
```python
# L80-L102
    @property
    def orders_json(self) -> Optional[Path]:
        """주문 내역 JSON 파일 경로"""
        if not self.output_dir.exists():
            return None
        for f in self.output_dir.glob("*order*.json"):
            return f
        return None

    @property
    def log_txt(self) -> Optional[Path]:
        """로그 파일 경로"""
        if not self.output_dir.exists():
            return None
        for f in self.output_dir.glob("*.log"):
            return f
        for f in self.output_dir.glob("*log*.txt"):
            return f
        return None
```
- `orders_json` — 파일명에 `order` 가 들어간 첫 JSON(주문 체결 내역). `for ...: return f` 패턴은 **"glob 결과의 첫 항목을 반환, 없으면 None"** 의 짧은 관용구.
- `log_txt` — `*.log` 를 먼저 찾고, 없으면 `*log*.txt` 를 찾음. lean 이 로그를 어떤 확장자로 남기든 잡으려는 2단 시도.

#### 결과 JSON 로드(+캐시) `load_result()` — `L104-L114`
```python
# L104-L114
    def load_result(self) -> Dict:
        """결과 JSON 로드"""
        if self.raw_result:
            return self.raw_result

        result_file = self.result_json
        if result_file and result_file.exists():
            self.raw_result = json.loads(result_file.read_text(encoding="utf-8"))
            return self.raw_result

        return {}
```
- **무엇을:** 결과 JSON 을 읽어 파이썬 딕셔너리로 돌려줍니다.
- **왜 이렇게:** 맨 위에서 `self.raw_result` 가 이미 있으면 그걸 즉시 반환(캐시) → 같은 파일을 **두 번 읽지 않음**. 처음이면 `result_json` 경로를 찾아 `read_text(encoding="utf-8")` 로 읽고 `json.loads` 로 파싱한 뒤, 그 결과를 `self.raw_result` 에 저장(다음번 캐시).
- 결과 파일이 없으면 빈 `{}` 반환(에러 대신 빈 결과).
- **헷갈리는 포인트:** `encoding="utf-8"` 명시가 중요. 윈도우 기본 `cp949` 로 읽으면 lean 이 utf-8 로 쓴 JSON 의 한글/특수문자에서 깨질 수 있음(이 파일 전반의 인코딩 일관성).

#### 통계/거래/자산곡선 추출 — `L116-L141`
```python
# L116-L125
    def get_statistics(self) -> Dict[str, Any]:
        """통계 추출"""
        result = self.load_result()
        return result.get("statistics", {})

    def get_trades(self) -> List[Dict]:
        """거래 내역 추출"""
        result = self.load_result()
        orders = result.get("orders", {})
        return list(orders.values()) if isinstance(orders, dict) else []
```
- `get_statistics` — 결과 JSON 의 `"statistics"` 묶음(총수익·Sharpe·MDD 등)을 꺼냄. 없으면 `{}`.
- `get_trades` — `"orders"` 는 보통 `{주문ID: 주문정보, ...}` 딕셔너리 형태. `.values()` 로 값들만 뽑아 리스트로. `isinstance(orders, dict)` 체크는 형식이 예상과 다를 때(리스트 등) 빈 리스트로 안전 처리.

```python
# L127-L141
    def get_equity_curve(self) -> Dict[str, float]:
        """자산 곡선 추출"""
        result = self.load_result()
        charts = result.get("charts", {})

        strategy_equity = charts.get("Strategy Equity", {})
        series = strategy_equity.get("series", {})
        equity_series = series.get("Equity", {})
        values = equity_series.get("values", [])

        # Lean format: [timestamp, open, high, low, close]
        return {
            str(point[0]): point[4] if len(point) > 4 else point[1]
            for point in values if isinstance(point, list) and len(point) >= 2
        }
```
- **무엇을:** 날짜별 자산가치(자산곡선)를 `{시각: 값}` 딕셔너리로 뽑습니다.
- **왜 이렇게 깊게 파나:** lean 결과 JSON 의 자산곡선은 `charts → "Strategy Equity" → series → "Equity" → values` 라는 **깊은 중첩** 안에 있습니다. 단계마다 `.get(..., {})`/`.get(..., [])` 로 **"중간 키가 없어도 KeyError 없이 빈 것으로"** 내려갑니다.
- `values` 의 각 점은 lean 의 캔들 형식 `[timestamp, open, high, low, close]`(주석 명시). 그래서 `point[4]`(종가)를 값으로 씀. 단 길이가 4보다 짧으면(`len(point) > 4` 거짓) `point[1]` 로 폴백.
- 딕셔너리 컴프리헨션의 필터 `if isinstance(point, list) and len(point) >= 2` — 점이 리스트가 아니거나 너무 짧으면 건너뜀(방어적).
- **헷갈리는 포인트:** `get_equity_curve` 는 이 파일 안에서는 직접 호출되지 않습니다 — `LeanRun` 을 받는 **외부(ResultFormatter 등)** 가 쓰라고 제공하는 도구. (이 파일의 `run()` 은 통계·곡선 가공을 하지 않고, 결과 로드까지만 합니다.)

---

### D. 실행기 본체 `LeanExecutor.run()` — `L144-L275` (이 파일의 심장)

#### 클래스 머리 + 시그니처 — `L144-L174`
```python
# L144-L154
class LeanExecutor:
    """공식 `lean` CLI 로 백테스트 실행"""

    @classmethod
    def run(
        cls,
        project: LeanProject,
        stream_logs: bool = False,
        timeout: int = 600,
        on_line: Optional[Callable[[str], None]] = None,
    ) -> LeanRun:
```
- `@classmethod` — 객체를 만들지 않고 `LeanExecutor.run(...)` 으로 바로 부르는 메서드. 첫 인자 `cls` 는 클래스 자신(여기선 끝의 `cls._locate_results(...)` 호출에 씀).
- 인자:
  - `project` — 실행할 Lean 프로젝트(경로·종목·기간 등 담긴 상자).
  - `stream_logs=False` — docstring(L165)에 **"(미사용 — 호환 유지)"** 라고 적힘. 옛 시그니처와의 호환을 위해 남겨둔 **죽은 인자**(코드 내부에서 안 씀).
  - `timeout=600` — 최대 600초(10분) 기다리고 초과하면 강제 종료.
  - `on_line` — **lean 이 한 줄 출력할 때마다 부를 콜백**. `Optional[Callable[[str], None]]` = "문자열 한 개를 받아 아무것도 안 돌려주는 함수, 또는 None". runner 가 `lambda line: _emit("lean", line)` 을 넘겨 실시간 중계. None 이면 캡처만 하고 중계는 안 함.
- 반환: `LeanRun`(C의 결과 상자).
- docstring(L162-L173)이 흐름·인자·예외(`RuntimeError` on 실패)를 요약합니다.

#### 경로 계산 — `L174-L185`
```python
# L174-L185
        started_at = datetime.now()

        # 경로: project_dir = <ws>/projects/<run_id>  → workspace = <ws>
        project_path = project.project_dir.resolve()
        workspace = project_path.parent.parent.resolve()
        data_path = (workspace / "data").resolve()
        results_path = (project_path / "result").resolve()
        results_path.mkdir(parents=True, exist_ok=True)

        logger.info(f"[Lean] workspace: {workspace}")
        logger.info(f"[Lean] project: {project_path}")
        logger.info(f"[Lean] results: {results_path}")
```
- `started_at` — 시작 시각 기록(끝나면 소요시간 계산용).
- `.resolve()` — 상대경로/심볼릭링크를 **절대경로**로 확정. 실행 위치에 흔들리지 않게.
- 핵심 경로 유도(주석이 그림으로 설명):
  - `project_path` = `<ws>/projects/<run_id>` (이 프로젝트 폴더).
  - `workspace = project_path.parent.parent` = 두 단계 위(`<run_id>` 의 부모 `projects` 의 부모 = `<ws>`). **lean 을 여기서(cwd) 실행**해야 `lean.json` 을 찾음(사전지식 6번).
  - `data_path` = `<ws>/data` (precondition 체크에 씀).
  - `results_path` = `<project_path>/result` — **결과를 쓸 폴더**. `mkdir(parents=True, exist_ok=True)` 로 미리 만들어 둠(이미 있으면 그냥 통과).
- **헷갈리는 포인트:** `project.output_dir`(project_manager 의 `<project_dir>/backtests`)과 여기 `results_path`(`<project_dir>/result`)는 **이름이 다른 별개 폴더**입니다. runner 경로에서는 `--output result` 로 쓰고, project_manager 의 히스토리 조회는 `backtests` 를 봅니다(둘은 다른 흐름).

#### precondition 체크 — `L187-L193`
```python
# L187-L193
        # 데이터 db precondition (init_workspace 가 보장하지만 방어적으로 확인)
        symbol_props = data_path / "symbol-properties" / "symbol-properties-database.csv"
        if not symbol_props.exists():
            raise RuntimeError(
                f"symbol-properties-database.csv가 없습니다. "
                f"LeanProjectManager.init_workspace() 로 데이터 스캐폴드 필요: {symbol_props}"
            )
```
- **무엇을:** lean 엔진이 부팅하려면 반드시 필요한 데이터 DB 파일(`symbol-properties-database.csv`, 종목 메타정보)이 있는지 **미리 확인**. 없으면 즉시 `RuntimeError` 로 친절히 알림.
- **왜:** 이게 없으면 lean 은 도커 부팅 중에 알 수 없는 에러로 죽습니다. **미리 잡아 명확한 원인**(워크스페이스 초기화 필요)을 알려주는 게 디버깅에 훨씬 낫기 때문. (`init_workspace()` 가 보통 채워주지만 "방어적으로" 재확인.)

#### lean 실행파일 + 프로젝트 인자 — `L195-L203`
```python
# L195-L203
        lean_bin = _resolve_lean_bin()
        # 프로젝트 경로는 워크스페이스 기준 상대 (lean 이 cwd 상위에서 lean.json 탐색)
        try:
            project_arg = str(project_path.relative_to(workspace))
        except ValueError:
            project_arg = str(project_path)

        cmd = [lean_bin, "backtest", project_arg, "--output", str(results_path)]
        logger.info(f"[Lean] CLI 실행: {' '.join(cmd)} (cwd={workspace})")
```
- `lean_bin` — B의 함수로 실행파일 경로 확정.
- `project_arg` — lean 에 넘길 프로젝트 경로를 **워크스페이스 기준 상대경로**(`projects/<run_id>`)로 만듦. `relative_to(workspace)` 가 실패하면(예: 다른 드라이브) 절대경로로 폴백(`except ValueError`).
- **왜 상대경로:** lean 은 cwd(=workspace)에서 프로젝트를 해석하므로 상대경로가 자연스럽고 안전.
- `cmd` — 실제 명령을 **리스트로** 조립: `[lean, "backtest", "projects/<run_id>", "--output", "<results_path>"]`.
- **헷갈리는 포인트:** 명령을 **리스트**로 넘기는 이유 → 공백 들어간 경로도 안전하게 한 인자로 전달(쉘 문자열 한 줄로 넘기면 공백에서 쪼개지거나 인젝션 위험). `' '.join(cmd)` 는 **로그에 보여주기 위한 문자열일 뿐**, 실제 실행엔 리스트를 씀.

#### Popen 으로 lean 실행 (인코딩 안전장치) — `L205-L223`
```python
# L205-L217
        # Popen + 리더 스레드: lean stdout 을 라인 단위로 캡처하며 on_line 콜백으로 실시간 스트리밍.
        # (기존 subprocess.run 블로킹을 대체 — returncode/타임아웃/에러 메시지 동작은 그대로 보존.)
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=str(workspace),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",   # Windows 기본 cp949 회피 — lean stdout 의 비-cp949 바이트로
                errors="replace",   # 리더 스레드가 죽으면 파이프 미배수 → lean write 블록 → 행
                bufsize=1,
            )
```
- **무엇을:** lean 프로세스를 띄웁니다. `Popen` 이라 **바로 다음 줄로 넘어가** 그동안 우리가 직접 로그를 빨아들이고 종료를 기다립니다(사전지식 2번).
- 인자 하나하나:
  - `cwd=str(workspace)` — 작업 디렉터리를 워크스페이스로(lean.json 탐색).
  - `stdout=subprocess.PIPE` — lean 출력을 빨대로 받음.
  - `stderr=subprocess.STDOUT` — 에러도 같은 빨대로 합쳐 순서 보존.
  - `text=True` — 바이트가 아니라 **문자열**로 주고받음(디코딩 자동).
  - `encoding="utf-8"` — ⚠️ 윈도우 기본 `cp949` 회피. lean(리눅스 컨테이너)이 utf-8 로 뱉으므로 일치시킴(사전지식 5번).
  - `errors="replace"` — ⚠️ 번역 못 하는 바이트가 와도 예외 던지지 말고 대체문자로. **이게 없으면 리더 스레드가 디코드 예외로 죽고 → 파이프가 안 비워져 → lean 이 write 에서 영원히 멈춤(행)**. 주석이 정확히 이 위험을 경고.
  - `bufsize=1` — **라인 버퍼링**: 한 줄 단위로 흘려보내 실시간성 확보(줄이 모이는 즉시 읽힘).
```python
# L218-L223
        except FileNotFoundError:
            error_msg = (
                f"lean CLI 실행 파일을 찾을 수 없습니다 (LEAN_BIN 환경변수로 지정 가능): {lean_bin}"
            )
            logger.error(f"[Lean] {error_msg}")
            raise RuntimeError(error_msg)
```
- B의 폴백(`"lean"` 문자열)이 실제로 실행 불가일 때 `Popen` 이 `FileNotFoundError` 를 던집니다. 이를 잡아 **해결법(`LEAN_BIN` 지정)을 알려주는** 메시지로 바꿔 `RuntimeError` 재발생. (원시 에러보다 운영자가 바로 조치 가능.)

#### 리더 스레드 `_pump` — `L225-L241`
```python
# L225-L241
        captured: List[str] = []

        def _pump() -> None:
            try:
                for raw in proc.stdout:  # type: ignore[union-attr]
                    line = raw.rstrip("\n")
                    captured.append(line)
                    if on_line:
                        try:
                            on_line(line)
                        except Exception:  # 콜백 오류가 백테스트를 죽이지 않도록 격리
                            pass
            except Exception:
                pass

        reader = threading.Thread(target=_pump, daemon=True)
        reader.start()
```
- **무엇을:** lean 출력을 **한 줄씩 끝없이 빨아들이는** 내부 함수 `_pump` 를 정의하고, 별도 스레드로 돌립니다.
- `captured` — 모든 라인을 모아 둘 리스트(나중에 실패 시 로그 첨부·전체 stdout 조립에 씀).
- `for raw in proc.stdout:` — 파이프를 **반복**하면 lean 이 줄을 뱉을 때마다 한 줄씩 받습니다. `proc` 이 끝나 파이프가 닫히면 반복도 자연히 종료.
- `line = raw.rstrip("\n")` — 줄 끝 개행 제거(깔끔한 라인).
- `captured.append(line)` — 저장. 그리고 `on_line` 이 있으면 그 콜백으로 **실시간 중계**.
- **이중 try/except 의 의미:**
  - 안쪽 `try: on_line(line) except: pass` — **콜백(중계)에서 오류가 나도 백테스트를 죽이지 않도록 격리**. 프론트 중계가 실패해도 백테스트는 계속.
  - 바깥 `try ... except: pass` — 파이프 읽기 중 어떤 예외가 나도 스레드가 조용히 끝나게(예: 프로세스 강제종료 시 파이프 깨짐).
- `threading.Thread(target=_pump, daemon=True)` — `_pump` 를 **데몬 스레드**로 실행. `daemon=True` 면 메인이 끝날 때 이 스레드가 발목을 잡지 않음(자동 정리).
- **왜 굳이 별도 스레드?** 메인 스레드는 `proc.wait()` 로 종료를 기다려야 하는데, **동시에** 파이프도 비워줘야 합니다(안 비우면 행). 한 스레드로 둘 다 못 하니, **읽기는 스레드에, 대기는 메인에** 나눠 맡깁니다(사전지식 4번의 정석 해법).

#### 종료 대기 + 타임아웃 — `L242-L254`
```python
# L242-L254
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            reader.join(timeout=5)
            error_msg = f"Lean 백테스트 타임아웃 ({timeout}초)"
            logger.error(f"[Lean] {error_msg}")
            raise RuntimeError(error_msg)
        reader.join(timeout=10)

        finished_at = datetime.now()
        duration = (finished_at - started_at).total_seconds()
        stdout = "\n".join(captured)
```
- `proc.wait(timeout=timeout)` — 메인 스레드는 여기서 lean 이 **끝날 때까지(최대 600초) 대기**. 그동안 리더 스레드가 파이프를 계속 비우는 중.
- 초과하면 `TimeoutExpired` → `proc.kill()` 로 lean 강제 종료 → `reader.join(timeout=5)` 로 리더 스레드 정리(최대 5초) → `RuntimeError` 로 "타임아웃" 알림.
- 정상 종료 시: `reader.join(timeout=10)` 로 리더 스레드가 **남은 출력까지 다 읽고 끝나길** 최대 10초 기다림(마지막 줄 유실 방지).
- `finished_at / duration` — 끝 시각·소요시간 계산. `stdout = "\n".join(captured)` — 모은 라인들을 하나의 전체 출력 문자열로 합침.
- **헷갈리는 포인트:** `wait(timeout)` 은 **프로세스 종료**만 기다립니다. 출력을 다 읽었다는 보장은 `reader.join()` 이 따로 해줍니다(그래서 둘 다 필요).

#### 종료코드 검사 + 결과 폴더 탐지 + LeanRun 생성 — `L256-L275`
```python
# L256-L259
        if proc.returncode != 0:
            error_msg = f"Lean 백테스트 실패 (exit code: {proc.returncode})\n{stdout[-2000:]}"
            logger.error(f"[Lean] {error_msg}")
            raise RuntimeError(error_msg)
```
- `proc.returncode` — 프로그램이 끝나며 남긴 **성적표 숫자**. 관례상 **0 = 성공, 그 외 = 실패**. 0이 아니면 실패로 보고 `RuntimeError`.
- `stdout[-2000:]` — **전체 로그의 마지막 2000자만** 에러 메시지에 첨부. 실패 원인은 보통 끝부분에 찍히고, 전체를 다 넣으면 너무 길어서 마지막 토막만.
```python
# L261-L275
        # --output 은 타임스탬프 하위폴더 없이 직접 기록하지만, 방어적으로 결과 폴더 탐지
        output_dir = cls._locate_results(results_path)

        run = LeanRun(
            project=project,
            success=True,
            output_dir=output_dir,
            duration_seconds=duration,
            started_at=started_at,
            finished_at=finished_at,
        )
        run.load_result()

        logger.info(f"[Lean] 완료: {duration:.1f}초 (output={output_dir})")
        return run
```
- `output_dir = cls._locate_results(results_path)` — 결과 JSON 이 실제로 떨어진 폴더 확정(아래 E).
- `LeanRun(...)` — 성공 결과 상자를 만들고, `run.load_result()` 로 **결과 JSON 을 미리 한 번 읽어 캐시**(이후 runner/ResultFormatter 가 바로 쓰게).
- 완료 로그 후 `return run` — runner 로 결과 반환.

---

### E. 결과 폴더 탐지 `_locate_results()` — `L277-L290`

```python
# L277-L290
    @staticmethod
    def _locate_results(results_path: Path) -> Path:
        """결과 JSON 이 있는 실제 폴더 반환.

        `--output` 은 보통 폴더에 직접 기록하지만, 버전에 따라 timestamp 하위폴더가
        생길 수 있으므로 둘 다 처리한다.
        """
        if any(results_path.glob("*.json")):
            return results_path
        subdirs = [d for d in results_path.iterdir() if d.is_dir()] if results_path.exists() else []
        for d in sorted(subdirs, key=lambda p: p.stat().st_mtime, reverse=True):
            if any(d.glob("*.json")):
                return d
        return results_path
```
- `@staticmethod` — `self`/`cls` 도 안 받는 순수 도우미 함수(클래스에 묶어둔 것뿐).
- **무엇을:** `--output` 으로 지정한 `results_path` 에 결과 JSON 이 직접 있는지 보고, 없으면 **하위 폴더(특히 timestamp 폴더)** 까지 뒤져 진짜 결과 폴더를 찾습니다.
- 1순위: `any(results_path.glob("*.json"))` — 그 폴더에 `.json` 이 하나라도 있으면 바로 그 폴더 반환. (`any(...)` 는 "하나라도 있나"를 빠르게 판정.)
- 2순위: 없으면 하위 디렉터리들을 모아 **수정시각 내림차순(최신순)** 정렬 후, JSON 이 든 첫(=가장 최근) 폴더를 반환. lean 버전이 `result/2026-06-01_12-00-00/...` 처럼 타임스탬프 하위폴더를 만들 때 대비.
- 최후: 둘 다 없으면 그냥 `results_path` 반환(빈 폴더라도 경로는 돌려줌 → 이후 `result_json` 이 None 처리).
- **헷갈리는 포인트:** 정렬 키 `p.stat().st_mtime` 는 **폴더의 수정시각**. 같은 results_path 에 과거 실행 잔재가 섞여 있으면 "최신 폴더"를 고르는 이 로직이 안전판이 됩니다.

---

### F. 사전 점검 함수 4종 (`subprocess.run` 사용) — `L292-L351`

`run()` 이 `Popen`(실시간) 인 것과 달리, 아래 점검들은 **짧고 결과만 필요**해서 `subprocess.run`(블로킹·간단)을 씁니다.

#### lean CLI 설치 확인 `check_lean_cli()` — `L292-L304`
```python
# L292-L304
    @classmethod
    def check_lean_cli(cls) -> bool:
        """lean CLI 설치 확인"""
        try:
            result = subprocess.run(
                [_resolve_lean_bin(), "--version"],
                capture_output=True,
                text=True,
                timeout=15,
            )
            return result.returncode == 0
        except Exception:
            return False
```
- `lean --version` 을 돌려 **종료코드 0이면 설치됨(True)**. `capture_output=True` 는 출력을 화면에 안 뿌리고 잡아둠(여기선 안 씀, returncode 만 봄). 어떤 예외든(미설치·타임아웃) `except: return False` 로 "없음".

#### 도커 이미지 다운로드 `pull_image()` — `L306-L320`
```python
# L306-L320
    @classmethod
    def pull_image(cls) -> bool:
        """Lean Docker 이미지 다운로드"""
        try:
            logger.info(f"[Lean] Docker 이미지 다운로드 중: {LEAN_IMAGE}")
            result = subprocess.run(
                ["docker", "pull", LEAN_IMAGE],
                capture_output=True,
                text=True,
                timeout=600,
            )
            return result.returncode == 0
        except Exception as e:
            logger.error(f"[Lean] 이미지 다운로드 실패: {e}")
            return False
```
- `docker pull quantconnect/lean:latest` 로 lean 엔진 이미지를 받음. 받는 데 오래 걸려 `timeout=600`(10분). 성공 여부를 bool 로.

#### 도커 실행 확인 `check_docker()` — `L322-L336`
```python
# L322-L336
    @classmethod
    def check_docker(cls) -> bool:
        """Docker 실행 확인"""
        try:
            result = subprocess.run(
                ["docker", "info"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        return False
```
- `docker info` 가 0을 내면 **도커 데몬이 살아 있음(True)**. `docker` 명령이 없거나(`FileNotFoundError`) 응답이 느리면(`TimeoutExpired`) False. (client.py 등 호출부가 `run` 전에 이 점검을 먼저 해서 "도커 꺼짐"을 사전에 안내.)

#### 이미지 존재 확인 `check_image()` — `L338-L351`
```python
# L338-L351
    @classmethod
    def check_image(cls) -> bool:
        """Lean 이미지 존재 확인"""
        try:
            result = subprocess.run(
                ["docker", "images", "-q", LEAN_IMAGE],
                capture_output=True,
                text=True,
                timeout=10,
            )
            return bool(result.stdout.strip())
        except Exception:
            return False
```
- `docker images -q <이미지>` 는 이미지가 있으면 **이미지 ID 문자열**을, 없으면 **빈 문자열**을 출력. 그래서 `bool(result.stdout.strip())` — **출력이 비어있지 않으면 True**(존재). 여기서는 returncode 가 아니라 **stdout 내용**으로 판정한다는 점이 다른 점검들과 구별됩니다.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 모음)

1. **파이프 미배수 → 데드락(행)** — lean 출력을 안 읽으면 OS 파이프 버퍼가 차서 lean 이 write 에서 영원히 멈춥니다. 해결: **별도 리더 스레드 `_pump`** 가 출력을 계속 비움(L227-L241). 이게 이 파일 설계의 핵심 이유.
2. **cp949 디코드 데드락** — 윈도우 기본 `cp949` 로 lean 의 utf-8 출력을 읽으면 `UnicodeDecodeError` 로 리더 스레드가 죽고 → (1번) 파이프가 안 비워져 → 행. 해결: `encoding="utf-8", errors="replace"`(L214-L215). `errors="replace"` 가 **번역 실패해도 읽기를 멈추지 않게** 막는 안전판.
3. **콜백 예외 격리** — `on_line` 콜백(프론트 중계)에서 예외가 나도 `try/except: pass` 로 격리(L235). 중계 실패가 백테스트를 죽이면 안 됨.
4. **타임아웃 후 정리** — 타임아웃이면 `proc.kill()` 만으로 끝내지 않고 `reader.join(timeout=5)` 로 스레드도 거둠(L245-L246). 좀비 스레드 방지.
5. **출력 다 읽기 보장** — `proc.wait()` 는 프로세스 종료만 기다리므로, 정상 종료 후 `reader.join(timeout=10)` 으로 **마지막 출력까지** 읽도록 함(L250). 둘은 다른 일.
6. **결과 폴더 위치 변동** — `--output` 이 보통 직접 쓰지만 lean 버전에 따라 timestamp 하위폴더가 생길 수 있어 `_locate_results` 로 양쪽 다 처리(L277-L290).
7. **lean 실행파일 못 찾음** — `_resolve_lean_bin` 최후 폴백은 그냥 `"lean"` 이라, 진짜 없으면 `Popen` 의 `FileNotFoundError` → `RuntimeError("LEAN_BIN 으로 지정 가능")` 로 변환(L218-L223).
8. **`stream_logs` 는 죽은 인자** — docstring 에 "(미사용 — 호환 유지)". 실제 실시간 제어는 `on_line` 이 함. 헷갈리지 말 것(L151, L165).

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **stderr 분리 옵션** — 지금은 `stderr=STDOUT` 으로 합칩니다(순서 보존엔 좋음). 디버깅용으로 에러만 따로 보고 싶으면 분리 모드를 둘 수 있음(단 두 파이프를 동시에 비울 리더 2개 필요).
- **결과 파일 후보 다중일 때 결정성** — `result_json`/`orders_json` 의 `glob(...)` "첫 번째"는 OS 정렬에 의존. **수정시각 최신** 또는 **이름 패턴 우선순위**로 명시 정렬하면 비결정성을 제거.
- **부분 진행률 파싱** — `on_line` 으로 들어오는 lean 로그에서 진행 퍼센트/현재 날짜를 정규식으로 뽑아 프론트에 **진행바**로 표시(지금은 원문 라인만 중계).
- **취소(cancel) 지원** — 외부에서 실행 중인 백테스트를 멈추도록 `proc` 핸들을 노출하거나 취소 토큰을 받아 `proc.kill()`. 현재는 타임아웃으로만 종료.
- **재시도/이미지 자동 pull** — `run()` 전에 `check_docker()/check_image()` 를 호출해 이미지 없으면 `pull_image()` 자동 실행하는 가드를 `run()` 안에 통합(현재는 호출부 책임).
- **구조화 로깅** — `captured` 를 단순 문자열 리스트 말고 `(timestamp, level, msg)` 로 파싱해 저장하면 사후 분석·필터링이 쉬움.
- **timeout 을 프로젝트 규모에 비례** — 기간·종목 수가 큰 백테스트는 600초가 부족할 수 있어, 입력 규모로 동적 타임아웃 산정.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| `subprocess.Popen` | 외부 프로그램을 띄우고 **켜둔 채 제어**(읽기/대기/종료)하는 객체. `run()` 에서 사용 |
| `subprocess.run` | 외부 프로그램을 실행하고 **끝날 때까지 기다려** 결과만 받는 간편 함수. 점검 함수들에서 사용 |
| stdout / stderr | 프로그램의 표준출력 / 표준에러. 여기선 `stderr=STDOUT` 으로 합쳐 한 줄기로 받음 |
| 파이프(PIPE) | 프로그램 출력을 화면 대신 코드로 받는 통로. 안 비우면 버퍼가 차서 프로그램이 멈춤(행) |
| 리더 스레드(`_pump`) | 파이프를 한 줄씩 끝없이 비우는 별도 실행 흐름. 데드락 방지의 핵심 |
| `encoding="utf-8"` / `errors="replace"` | 바이트를 utf-8 글자로 번역 / 번역 실패 시 예외 대신 대체문자로(읽기 중단 방지) |
| `bufsize=1` | 라인 버퍼링 — 한 줄 모이면 즉시 흘려보내 실시간성 확보 |
| `returncode` | 프로그램 종료 성적. **0=성공**, 그 외=실패 |
| `proc.wait(timeout)` | 프로세스가 끝날 때까지(최대 timeout) 대기. 초과 시 `TimeoutExpired` |
| `daemon=True` 스레드 | 메인이 끝나면 자동 정리되는(발목 안 잡는) 백그라운드 스레드 |
| `cwd` | 명령을 실행할 작업 디렉터리. lean 은 여기서 `lean.json` 을 찾음 |
| `--output <dir>` | lean 결과 JSON 을 쓸 폴더 지정 인자 |
| `@classmethod` / `@staticmethod` | 객체 없이 클래스로 직접 부르는 메서드 / `cls`·`self` 도 안 받는 순수 함수 |
| `on_line` 콜백 | lean 이 한 줄 출력할 때마다 부르는 함수(실시간 중계용). runner 가 SSE 중계 람다를 넘김 |
| `LEAN_IMAGE` | `quantconnect/lean:latest` — lean 이 백테스트를 실제로 돌리는 도커 이미지 |
| `LeanRun` | 한 번의 실행 결과 + 결과파일 읽기 도구(통계·거래·자산곡선)를 담은 dataclass |
