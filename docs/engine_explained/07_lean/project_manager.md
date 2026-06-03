# `lean/kis_backtest/lean/project_manager.py` — Lean 작업장 세팅 담당 (완전 라인별 해설)

> 원본: `analytics/app/lean/kis_backtest/lean/project_manager.py` (554줄)
> 이 문서는 [교재 표준 예시](../01_backtest/vbt_engine.md) 형식을 따릅니다.

---

## 📌 이 파일 한눈에

이 파일은 **"Lean 작업장(워크스페이스) 세팅 담당"** 입니다. 우리 코드는 직접 백테스트를 "계산"하지 않습니다. 대신 **QuantConnect Lean 이라는 외부 백테스트 엔진**(Docker 컨테이너로 도는 진짜 큰 엔진)에게 일을 시킵니다. 그런데 Lean 엔진은 까다로워서, 일을 시키기 전에 **정해진 폴더 구조 + 설정 파일 + 데이터베이스 파일**이 정확히 갖춰져 있어야 부팅됩니다. 이 파일이 바로 그 **"현장 세팅 + 뒷정리 + 결과 회수"** 를 전담합니다.

비유하면, 이 파일은 **영화 촬영장의 "제작 코디네이터"** 입니다. 감독(Lean 엔진)이 와서 촬영(백테스트)만 하면 되도록, 미리 ① 세트장(폴더)을 짓고 ② 촬영 허가증(`lean.json`)을 위조해 붙이고 ③ 소품 카탈로그(데이터 db)를 준비하고 ④ 이번 촬영 대본 정보(`config.json`)를 비치합니다. 촬영이 끝나면 ⑤ 필름 통(결과 JSON)에서 명장면 통계를 뽑아내고 ⑥ 세트장을 철거합니다.

핵심 함수는 크게 3덩어리입니다:

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `init_workspace()` + `_ensure_lean_data()` | Lean 이 부팅 가능한 **빈 작업장**을 만든다 (lean.json + 폴더 + 데이터 db 다운로드) | 촬영장 부지 정리 + 허가증 위조 + 소품 카탈로그 비치 |
| `create_project()` | 한 번의 백테스트를 위한 **프로젝트 폴더 + config.json** 생성 | 이번 회차 촬영 세트 + 대본 비치 |
| `get_project()` / `list_projects_with_results()` / `get_project_result()` | 끝난 프로젝트를 **다시 읽어** 결과/히스토리로 복원 | 보관된 필름에서 명장면·통계 회수 |

나머지(`_extract_summary`, `_infer_strategy_type`, `_parse_percent`, `cleanup_*`)는 위 3덩어리를 돕는 보조 도구입니다.

**누가 호출하나?** → 같은 폴더의 **`runner.py`**(`run_lean_backtest`)가 백테스트 한 번을 돌릴 때 `LeanProjectManager.create_project(...)` 를 부릅니다. 그 다음 `executor.py`(`LeanExecutor.run`)가 여기서 만든 `lean.json`·`data/`·`projects/<run_id>/` 를 그대로 사용해 `lean backtest` CLI 를 실행합니다. 히스토리 조회 API 는 `list_projects_with_results` / `get_project_result` 를 부릅니다. 즉 이 파일은 **"runner 와 executor 사이의 무대 설치 + 사후 정리"** 를 책임지는 중간 관리자입니다.

**왜 이런 게 필요한가?** → vbt_engine(우리 자체 엔진)은 파이썬 함수 한 방으로 끝납니다. 하지만 Lean 은 **별도 프로세스(Docker)** 라서, 우리가 직접 메모리로 값을 넘길 수 없습니다. 대신 **파일 시스템(폴더·JSON·CSV)** 을 통해 소통합니다. 이 파일은 그 "파일 기반 인터페이스"를 책임집니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) Lean 이란? 왜 Docker 인가?

- **Lean** = QuantConnect 사의 오픈소스 백테스트 엔진. 우리 `vbt_engine` 보다 훨씬 정교하지만(주문 단위 체결, 수수료/세금 모델, 다종목 등), **C#/Python 으로 된 거대한 별도 프로그램**입니다.
- 직접 설치하면 의존성 지옥이라, 보통 **Docker 컨테이너**(`quantconnect/lean:latest` 이미지)로 격리 실행합니다. 우리는 `lean` CLI 를 호출하고, CLI 가 내부에서 컨테이너를 띄웁니다.
- 핵심: Lean 은 **우리 파이썬 프로세스 바깥**에서 돕니다. 그래서 소통이 전부 **파일**(입력: 폴더·JSON·CSV / 출력: 결과 JSON)로 이뤄집니다. 이 파일은 그 파일들을 깔아주는 역할.

#### 2) `lean init` 우회 = "더미 organization-id" 트릭 (이 파일의 가장 중요한 꼼수)

- 정상적으로 Lean 작업장을 만들려면 `lean init` 명령을 칩니다. 그런데 이 명령은 **QuantConnect 에 로그인(user-id + API 토큰)을 인터랙티브로 요구**합니다. 서버 자동화 환경에서는 사람이 키보드로 입력할 수 없으니 막힙니다.
- 해결: `lean init` 을 **아예 안 쓰고**, 작업장 설정 파일인 `lean.json` 을 **우리가 직접 손으로 써버립니다(스캐폴드)**.
- 단, `lean` CLI 는 `lean.json` 안에 `organization-id` 키가 없으면 "이건 옛날 버전 Lean 폴더야"라며 거부합니다. 그래서 **진짜 계정 없이도 통과하도록 가짜(더미) 값** — `"0" * 32`(0이 32개) — 을 넣어줍니다. 로컬 백테스트는 클라우드 계정이 필요 없으므로 이 가짜 값으로 충분히 동작합니다.
- (메모리 사실: "Lean CLI 운영 사실 — 로그인 회피(더미 org-id)"과 정확히 일치.)

#### 3) 데이터 폴더 구조 — Lean 이 기대하는 정해진 경로

- Lean 은 가격 데이터를 **`data/equity/<market>/daily/`** 같은 **고정된 폴더 규약**에서 찾습니다. 마음대로 둘 수 없습니다.
  - 한국 주식(KRX): `data/equity/krx/daily/`
  - 미국 주식(US): `data/equity/usa/daily/`  ← 코드에서 `market_type=="krx"` 가 아니면 폴더명이 `usa` 임에 주의
  - KRX 지수: `data/index/krx/daily/`
- 그리고 가격 데이터 외에 **두 개의 "데이터베이스(db) 파일"** 이 반드시 있어야 부팅됩니다:
  - `market-hours/market-hours-database.json` — 거래소별 개장 시간표
  - `symbol-properties/symbol-properties-database.csv` — 종목별 속성(틱 사이즈, 통화 등)
  - 이게 없으면 Lean 엔진이 **부팅 자체를 실패**합니다. 그래서 이 파일이 GitHub raw 에서 자동 다운로드합니다.

#### 4) 컨테이너 경로 vs 호스트 경로 — `data-folder: "data"` 가 상대경로인 이유

- `lean.json` 안의 `data-folder` 는 **`"data"` (상대경로)** 로 적습니다. 절대경로가 아닙니다.
- 왜? `executor.py` 가 `lean backtest` 를 실행할 때 **현재 작업 디렉토리(cwd)를 워크스페이스로 맞춰** 실행하기 때문입니다(`cwd=str(workspace)`). 그래서 `lean.json` 옆의 `data/` 폴더를 상대경로로 가리키면 됩니다.
- Lean 컨테이너 내부에서는 이 데이터가 `/Lean/Data` 같은 경로로 마운트되지만, **우리는 그걸 신경 쓸 필요 없이** 호스트의 `<workspace>/data` 만 잘 깔아두면 CLI 가 알아서 컨테이너에 연결합니다.

#### 5) `@dataclass` 와 `@classmethod`

- `@dataclass` (앞 `LeanProject`) = "설정값 묶음 상자"를 짧게 만드는 도구. `__init__` 을 자동 생성해줍니다 (vbt_engine 의 `BacktestParams` 와 같은 개념).
- `@classmethod` = 인스턴스(`obj`)를 만들지 않고 **클래스 이름으로 바로 부르는 함수**. `LeanProjectManager.create_project(...)` 처럼 씁니다. 첫 인자가 `self` 가 아니라 `cls`(클래스 자신). 이 매니저는 **상태 없는 유틸리티 모음**이라 인스턴스가 필요 없어서 전부 classmethod 입니다.

#### 6) `pathlib.Path` = "경로를 다루는 똑똑한 객체"

- `Path("a") / "b" / "c"` = `a/b/c` (OS 에 맞는 구분자 자동). `/` 연산자로 경로를 이어붙입니다.
- `.mkdir(parents=True, exist_ok=True)` = 폴더 생성. `parents=True`(없는 중간 폴더도 다 만듦), `exist_ok=True`(이미 있어도 에러 안 냄 = **멱등**).
- `.exists()` 존재 확인, `.read_text()/.write_text()` 텍스트 읽기/쓰기, `.iterdir()` 폴더 안 항목 순회, `.glob("*.json")` 패턴 검색.

---

## 🗺 전체 흐름도

```
runner.run_lean_backtest(req)   ← Spring 이 POST /lean/backtest 로 호출
        │
        │ ① LeanProjectManager.create_project(run_id, symbols, ...)
        ▼
┌────────────────────────────────────────────────────────────┐
│ create_project()                                            │
│   └─► init_workspace()  ─── 작업장 보장 (멱등) ──────────┐   │
│         ├ lean.json 스캐폴드 (더미 organization-id "0"*32) │   │
│         ├ data/{equity/usa,equity/krx,index/krx,           │   │
│         │       market-hours,symbol-properties}/ 폴더 생성  │   │
│         ├ projects/ 폴더 생성                              │   │
│         └ _ensure_lean_data() ─ db 2종 없으면 GitHub 다운로드│  │
│                                                          ◄─┘   │
│   ├ projects/<run_id>/ 폴더 생성                              │
│   ├ data/equity/<usa|krx>/daily/ 데이터 폴더 생성             │
│   ├ config.json 작성 (전략정보 + parameters)                 │
│   └ projects/<run_id>/backtests/ 폴더 생성                   │
│   → LeanProject 객체 반환                                    │
└────────────────────────────────────────────────────────────┘
        │  (runner 가 이어서)
        │ ② DataConverter.export(...)      → data_dir 에 가격 CSV
        │ ③ main.py 코드 생성              → projects/<run_id>/main.py
        │ ④ LeanExecutor.run(project)      → `lean backtest` (Docker)
        ▼
   결과 JSON 이 projects/<run_id>/result(또는 backtests) 에 기록됨
        │
        │ 나중에 히스토리/재조회 시
        ▼
   get_project() / list_projects_with_results() / get_project_result()
        └─► config.json 다시 읽어 LeanProject 복원
        └─► _extract_summary() 로 결과 JSON 에서 통계 파싱
```

---

## 📖 라인별 해설

### A. 파일 설명서 + import — `L1-L16`

```python
# L1-L16
"""Lean 프로젝트 관리자

Lean 워크스페이스와 프로젝트 디렉토리 구조를 관리.
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

# Lean 워크스페이스 기본 경로
DEFAULT_WORKSPACE = Path(".lean-workspace")
```

- 맨 위 `"""..."""` 는 **파일 설명서(docstring)**. "이 파일은 Lean 워크스페이스/프로젝트 디렉토리 구조를 관리한다"는 한 줄 요약.
- import 들:
  - `json` — `lean.json`, `config.json` 을 읽고 쓰기 위함. 이 파일의 주역.
  - `logging` — 진행 상황 로그. `logger = logging.getLogger(__name__)` 로 이 모듈 전용 로거를 만듦(`[Lean] ...` 메시지가 여기서 나옴).
  - `dataclass, field` — 아래 `LeanProject` 설정 묶음 클래스를 만드는 도구. `field` 는 기본값을 "함수로 계산"할 때 씀(아래 `created_at` 에서).
  - `datetime` — 생성 시각 기록·정렬용.
  - `Path` — 경로 다루기(사전지식 6번).
  - `List, Optional` — 타입힌트. `Optional[X]` = "X 이거나 None(없음)".
- `DEFAULT_WORKSPACE = Path(".lean-workspace")` — **작업장의 기본 위치**. 점(`.`)으로 시작하는 숨김 폴더. 현재 작업 디렉토리 아래에 `.lean-workspace/` 가 생깁니다. 이 안에 모든 Lean 관련 파일이 모입니다.

> 💡 초보 포인트: 여기서 `numpy`/`pandas` 가 안 보이죠? 이 파일은 **숫자 계산을 직접 하지 않습니다**. 폴더·파일·JSON 만 다루는 "무대 설치 담당"이라 표준 라이브러리만으로 충분합니다.

---

### B. 프로젝트 정보 상자 `LeanProject` — `L19-L45`

```python
# L19-L33
@dataclass
class LeanProject:
    """Lean 프로젝트 정보"""
    run_id: str
    project_dir: Path
    data_dir: Path
    symbols: List[str]
    start_date: str
    end_date: str
    initial_capital: float
    commission_rate: float = 0.00015  # 0.015%
    tax_rate: float = 0.0023  # 0.23% (매도시)
    market_type: str = "krx"  # "krx" | "us"
    currency: str = "KRW"  # "KRW" | "USD"
    created_at: datetime = field(default_factory=datetime.now)
```

- `@dataclass` 덕분에 이 클래스는 **"한 번의 백테스트를 설명하는 정보 묶음 상자"** 가 됩니다. 누가 `LeanProject(run_id=..., project_dir=..., ...)` 로 만들면, 적은 값은 채워지고 안 적은 값은 `= 기본값` 이 적용됩니다.
- 각 칸의 의미:
  - `run_id` — 이 백테스트의 고유 이름(예: `"sma_crossover-a1b2c3d4"`). runner 가 `전략id + 랜덤8자리` 로 만듦. 폴더 이름으로도 쓰임.
  - `project_dir` — 이 프로젝트의 폴더 경로(`<ws>/projects/<run_id>`).
  - `data_dir` — 가격 CSV 가 들어갈 폴더(`<ws>/data/equity/<usa|krx>/daily`).
  - `symbols` — 대상 종목 리스트(예: `["SPY"]`, `["005930"]`).
  - `start_date / end_date` — 백테스트 기간("YYYY-MM-DD" 문자열).
  - `initial_capital` — 시작 자본금.
  - `commission_rate=0.00015` — 거래 수수료율 0.015%(주석). KIS 국내주식 위탁수수료 수준.
  - `tax_rate=0.0023` — 거래세 0.23%, **매도 시에만** 부과(주석). 한국 주식 매도세.
  - `market_type="krx"` — 시장 구분("krx" 한국 / "us" 미국). 데이터 폴더가 갈림.
  - `currency="KRW"` — 통화("KRW"/"USD").
  - `created_at` — 생성 시각. `field(default_factory=datetime.now)` 가 핵심: **객체를 만드는 그 순간의 시각**을 기본값으로 넣음.

> 💡 초보가 헷갈리는 포인트: 왜 `created_at = datetime.now()` 가 아니라 `field(default_factory=datetime.now)` 일까? `= datetime.now()` 로 쓰면 **클래스가 처음 정의되는 순간 딱 한 번** 시각이 박혀, 이후 만드는 모든 객체가 같은 시각을 갖게 됩니다(파이썬 dataclass 의 유명한 함정). `default_factory` 는 "객체를 만들 때마다 `datetime.now()` 를 새로 호출"하라는 뜻이라 올바릅니다.

```python
# L35-L45
    @property
    def main_py(self) -> Path:
        return self.project_dir / "main.py"

    @property
    def config_json(self) -> Path:
        return self.project_dir / "config.json"

    @property
    def output_dir(self) -> Path:
        return self.project_dir / "backtests"
```

- `@property` = **"괄호 없이 부르는 계산된 속성"**. `proj.main_py` 라고 쓰면(괄호 없음!) 자동으로 `project_dir / "main.py"` 를 계산해 돌려줍니다.
- 셋 다 "프로젝트 폴더 기준 하위 경로 단축키":
  - `main_py` → Lean 이 실행할 알고리즘 코드 파일(`runner` 가 여기에 생성한 코드를 씀).
  - `config_json` → 이 프로젝트의 설정 파일.
  - `output_dir` → 결과가 떨어지는 `backtests` 폴더.
- 왜 property 로? 경로 조합을 한 곳에 모아두면, 폴더 규칙이 바뀌어도 여기만 고치면 됩니다(중복 방지).

---

### C. 매니저 클래스 + 데이터 db 원본 목록 — `L48-L60`

```python
# L48-L60
class LeanProjectManager:
    """Lean 프로젝트 관리자"""

    workspace: Path = DEFAULT_WORKSPACE

    # QuantConnect Lean 데이터 db 원본 (KIS setup_lean_data.sh 와 동일 소스).
    # 없으면 Lean 엔진 부팅이 실패하므로 워크스페이스 초기화 시 자동 다운로드한다.
    LEAN_DATA_FILES = {
        "market-hours/market-hours-database.json":
            "https://raw.githubusercontent.com/QuantConnect/Lean/master/Data/market-hours/market-hours-database.json",
        "symbol-properties/symbol-properties-database.csv":
            "https://raw.githubusercontent.com/QuantConnect/Lean/master/Data/symbol-properties/symbol-properties-database.csv",
    }
```

- `class LeanProjectManager` — 이 파일의 본체. 모든 메서드가 `@classmethod` 라 **인스턴스 없이** `LeanProjectManager.무엇()` 으로 부릅니다(사전지식 5번). 즉 "기능 모음 도구상자".
- `workspace: Path = DEFAULT_WORKSPACE` — **클래스 변수**. 모든 메서드가 공유하는 "현재 작업장 경로". 기본은 `.lean-workspace`. 아래 `set_workspace()` 로 바꿀 수 있음.
- `LEAN_DATA_FILES` — **반드시 있어야 하는 Lean db 2종의 {로컬 상대경로 → 다운로드 URL} 지도**:
  - `market-hours/market-hours-database.json` — 거래소 개장 시간표.
  - `symbol-properties/symbol-properties-database.csv` — 종목 속성표(틱 사이즈, 통화 등).
  - 둘 다 QuantConnect 공식 깃허브 **`master` 브랜치의 raw 파일**에서 받습니다. 주석이 정확히 말합니다: **"없으면 Lean 엔진 부팅이 실패하므로 자동 다운로드"**.

> ⚠️ 핵심: 이 두 파일은 "가격 데이터"가 아니라 **엔진이 종목/거래소를 해석하기 위한 메타데이터 사전**입니다. 종목 가격 CSV 를 아무리 잘 넣어도 이 사전이 없으면 Lean 은 "이 종목 단위가 뭔지, 언제 장 여는지 모르겠다"며 부팅을 멈춥니다.

---

### D. 작업장 경로 변경 `set_workspace()` — `L62-L65`

```python
# L62-L65
    @classmethod
    def set_workspace(cls, path: str) -> None:
        """워크스페이스 경로 설정"""
        cls.workspace = Path(path)
```

- 작업장 위치를 기본값(`.lean-workspace`) 대신 다른 곳으로 바꾸고 싶을 때 호출. 문자열 경로를 받아 `Path` 로 바꿔 클래스 변수 `cls.workspace` 에 저장.
- `cls.workspace = ...` 는 **클래스 전체**의 작업장을 바꿉니다(인스턴스별이 아님). 이후 모든 메서드가 새 경로를 씁니다.

---

### E. 작업장 초기화 `init_workspace()` — `L67-L106` (이 파일의 핵심 1)

함수 머리 + docstring:
```python
# L67-L77
    @classmethod
    def init_workspace(cls) -> Path:
        """lean CLI 호환 워크스페이스 초기화 (멱등).

        `lean init` 은 QuantConnect 로그인(user-id + API token)을 인터랙티브로 요구하므로
        사용하지 않고 lean.json 을 직접 스캐폴드한다. 더미 organization-id 만 있으면
        로컬 백테스트가 로그인 없이 동작한다. (organization-id 누락 시 lean CLI 가
        "old Lean CLI root folder" 로 거부함.)
        """
        ws = cls.workspace
        ws.mkdir(parents=True, exist_ok=True)
```

- **이 docstring 이 파일 전체의 철학을 담고 있습니다**(사전지식 2번 그대로). `lean init` 은 로그인을 강요하니 안 쓰고, `lean.json` 을 직접 만든다. 더미 `organization-id` 만 있으면 로컬 백테스트는 로그인 없이 돈다. 누락하면 CLI 가 **"old Lean CLI root folder"** 라며 거부한다.
- "(멱등)" = **여러 번 불러도 결과가 같고 안전**. 이미 작업장이 있으면 부수지 않고 그냥 보장만 함. 그래서 `create_project` 가 매번 불러도 괜찮습니다.
- `ws = cls.workspace` — 현재 작업장 경로를 지역변수로. `ws.mkdir(parents=True, exist_ok=True)` — 작업장 폴더 생성(이미 있으면 통과).

#### lean.json 스캐폴드 — `L79-L92` (더미 org-id 트릭)

```python
# L79-L92
        # lean.json — data-folder 는 ws 기준 상대경로 "data" (executor 가 cwd=ws 로 실행)
        lean_json = ws / "lean.json"
        needs_write = True
        if lean_json.exists():
            try:
                cfg = json.loads(lean_json.read_text(encoding="utf-8"))
                needs_write = "organization-id" not in cfg
            except (json.JSONDecodeError, OSError):
                needs_write = True
        if needs_write:
            lean_json.write_text(json.dumps({
                "data-folder": "data",
                "organization-id": "0" * 32,
            }, indent=2))
```

- 목표: 작업장 루트에 `lean.json` 을 만들되, **이미 올바른 것이 있으면 다시 안 쓴다**(멱등 + 사용자 수정 보존).
- 판단 로직 `needs_write`:
  - 파일이 **없으면** → 써야 함(`needs_write=True` 그대로).
  - 파일이 **있으면** → 읽어서 `organization-id` 키가 있는지 확인. **없으면 써야 함**(`needs_write = "organization-id" not in cfg`). 즉 "옛 형식/깨진 파일"이면 새로 씀.
  - 읽기가 깨지면(`JSONDecodeError`=내용 망가짐, `OSError`=파일 읽기 실패) → 안전하게 다시 씀.
- 실제 쓰는 내용(두 줄):
  - `"data-folder": "data"` — **상대경로**(사전지식 4번). executor 가 cwd 를 워크스페이스로 맞춰 실행하므로 `lean.json` 옆 `data/` 를 가리킴.
  - `"organization-id": "0" * 32` — **0이 32개인 더미 값**. `"0" * 32` 는 파이썬에서 문자열 반복 = `"00000000000000000000000000000000"`. 진짜 QuantConnect 계정 ID 자리에 가짜를 넣어 **로그인 우회**.
- `json.dumps(..., indent=2)` — 보기 좋게 2칸 들여쓰기로 직렬화. `.write_text(...)` 로 파일에 저장.

> ⚠️ 함정 주의: `organization-id` 가 없으면 `lean` CLI 가 작업장을 **"옛날 Lean 루트 폴더"** 로 오인하고 거부합니다. 이 32개의 0 이 그 거부를 막는 단 하나의 열쇠입니다. 강의에서 "외부 도구를 로그인 없이 길들이는 법"의 좋은 예.

#### 데이터 폴더 골격 생성 — `L94-L100`

```python
# L94-L100
        # data 디렉토리 (us/krx 주식 + krx 지수 + lean db 폴더)
        for sub in ("equity/usa/daily", "equity/krx/daily", "index/krx/daily",
                    "market-hours", "symbol-properties"):
            (ws / "data" / sub).mkdir(parents=True, exist_ok=True)

        # projects 디렉토리
        (ws / "projects").mkdir(parents=True, exist_ok=True)
```

- `for sub in (...)` — Lean 이 기대하는 **고정 하위 폴더 5종**을 한꺼번에 만듦(사전지식 3번):
  - `equity/usa/daily` — 미국 주식 일봉.
  - `equity/krx/daily` — 한국 주식 일봉.
  - `index/krx/daily` — 한국 지수 일봉.
  - `market-hours` — 개장 시간 db 가 들어갈 자리.
  - `symbol-properties` — 종목 속성 db 가 들어갈 자리.
- 각 폴더는 `parents=True, exist_ok=True` 로 **멱등 생성**(없으면 만들고, 있으면 통과).
- 마지막 줄: `projects/` 폴더도 생성. 모든 개별 백테스트 프로젝트가 이 아래에 모입니다.

#### 데이터 db 보장 → 종료 — `L102-L106`

```python
# L102-L106
        # Lean 데이터 db (symbol-properties / market-hours) 보장
        cls._ensure_lean_data(ws / "data")

        logger.info(f"[Lean] 워크스페이스 초기화: {ws}")
        return ws
```

- `_ensure_lean_data(ws / "data")` — 위에서 만든 빈 `market-hours/`·`symbol-properties/` 폴더에 **실제 db 파일을 채움**(다음 F 절). 폴더만 있고 파일이 없으면 부팅 실패하므로 필수.
- 로그 남기고 작업장 경로(`ws`)를 반환. 호출자(`create_project`)가 이 경로를 받아 이어서 씁니다.

---

### F. 데이터 db 다운로드 `_ensure_lean_data()` — `L108-L122`

```python
# L108-L122
    @classmethod
    def _ensure_lean_data(cls, data_dir: Path) -> None:
        """Lean 엔진이 요구하는 db 파일 보장 (없으면 GitHub raw 에서 다운로드)."""
        import urllib.request

        for rel, url in cls.LEAN_DATA_FILES.items():
            dest = data_dir / rel
            if dest.exists() and dest.stat().st_size > 0:
                continue
            try:
                dest.parent.mkdir(parents=True, exist_ok=True)
                logger.info(f"[Lean] 데이터 db 다운로드: {rel}")
                urllib.request.urlretrieve(url, dest)
            except Exception as e:
                logger.warning(f"[Lean] 데이터 db 다운로드 실패 ({rel}): {e} — Lean 부팅 실패 가능")
```

- 함수명 앞 `_` = **내부용**(밖에서 직접 부르지 마세요). `init_workspace` 가 부릅니다.
- `import urllib.request` — 파이썬 표준 HTTP 다운로드 도구. 함수 안에서 import 하는 이유: 이 함수가 실제로 불릴 때만 로드(불필요한 시작 비용 절약). 무거운 외부 라이브러리도 아니지만 "쓸 때 가져오기" 스타일.
- `for rel, url in cls.LEAN_DATA_FILES.items()` — C 절의 {상대경로 → URL} 지도를 하나씩 순회. `rel` = 로컬 상대경로, `url` = 다운로드 주소.
- `dest = data_dir / rel` — 저장할 최종 경로(예: `<ws>/data/symbol-properties/symbol-properties-database.csv`).
- **건너뛰기 조건** `if dest.exists() and dest.stat().st_size > 0: continue` — 파일이 **이미 있고 크기가 0보다 크면**(=빈 파일 아님) 다운로드 생략. `st_size > 0` 체크가 중요한 이유: 이전에 다운로드가 중간에 실패해 **0바이트 껍데기**만 남았을 수 있는데, 그건 다시 받아야 하니까. (멱등 + 자가치유)
- 다운로드:
  - `dest.parent.mkdir(parents=True, exist_ok=True)` — 저장 폴더 보장.
  - `urllib.request.urlretrieve(url, dest)` — URL 의 파일을 `dest` 로 내려받음.
- **실패해도 죽지 않음**: `except Exception` 으로 잡아 **경고만** 남기고 계속. 단 경고에 "Lean 부팅 실패 가능"을 명시 — 네트워크가 막힌 환경(예: 폐쇄망)에서 여기서 멈추기보다, 일단 진행하고 나중에 executor 가 명확한 에러를 내게 하는 설계.

> ⚠️ 함정 주의: 이 다운로드가 조용히 실패하면(경고만 남고 진행), 나중에 `executor.py` 의 방어 코드 `if not symbol_props.exists(): raise RuntimeError(...)` 에서 막힙니다. 즉 **두 군데에서 같은 전제(db 존재)를 지킵니다**. db 부재 → "부팅 실패"의 근본 원인이 바로 여기.

> 💡 초보 포인트: 왜 GitHub `master` raw 에서 받나? 이 db 들은 우리가 만들 수 없는 **QuantConnect 공식 메타데이터**입니다. 메모리의 "KIS setup_lean_data.sh 와 동일 소스" 주석대로, 원래 KIS open-trading-api 가 쓰던 것과 같은 출처를 그대로 씁니다.

---

### G. 프로젝트 생성 `create_project()` — `L124-L196` (이 파일의 핵심 2)

함수 머리(긴 인자 목록):
```python
# L124-L141
    @classmethod
    def create_project(
        cls,
        run_id: str,
        symbols: List[str],
        start_date: str,
        end_date: str,
        initial_capital: float,
        commission_rate: float = 0.00015,
        tax_rate: float = 0.0023,
        strategy_type: str = "unknown",
        strategy_params: Optional[dict] = None,
        strategy_id: Optional[str] = None,
        strategy_name: Optional[str] = None,
        market_type: str = "krx",
        currency: str = "KRW",
    ) -> LeanProject:
        """새 프로젝트 생성"""
```

- **runner 가 백테스트 1회마다 부르는 진입점**. 인자가 많지만 전부 "이번 백테스트의 명세":
  - `run_id` — 고유 ID(폴더명). `symbols`, `start_date`, `end_date`, `initial_capital` — 기본 백테스트 조건.
  - `commission_rate`, `tax_rate` — 수수료/세금율.
  - `strategy_type`(예: "sma_crossover"), `strategy_params`(파라미터 dict), `strategy_id`, `strategy_name` — 전략 식별 정보. `config.json` 에 기록되어 나중에 히스토리에서 무슨 전략이었는지 복원하는 데 씀.
  - `market_type`("krx"/"us"), `currency`("KRW"/"USD") — 시장/통화.
- 반환: 완성된 `LeanProject` 객체.

#### 작업장 + 프로젝트 폴더 — `L142-L147`

```python
# L142-L147
        # 워크스페이스 초기화
        ws = cls.init_workspace()

        # 프로젝트 디렉토리 생성
        project_dir = ws / "projects" / run_id
        project_dir.mkdir(parents=True, exist_ok=True)
```

- `ws = cls.init_workspace()` — **매번 작업장을 보장**. 멱등이라 비용 거의 없고, "혹시 작업장이 없거나 깨졌어도 여기서 복구"되는 안전망.
- `project_dir = ws / "projects" / run_id` — 이번 프로젝트의 전용 폴더(예: `.lean-workspace/projects/sma_crossover-a1b2c3d4`). 생성(멱등).

#### 마켓별 데이터 폴더 — `L149-L154`

```python
# L149-L154
        # 데이터 디렉토리 (마켓별 분리)
        # krx: /data/equity/krx/daily/
        # us: /data/equity/usa/daily/
        market_folder = "krx" if market_type == "krx" else "usa"
        data_dir = ws / "data" / "equity" / market_folder / "daily"
        data_dir.mkdir(parents=True, exist_ok=True)
```

- `market_folder = "krx" if market_type == "krx" else "usa"` — **여기 주의**: `market_type` 값은 "krx" 또는 "us" 인데, 폴더 이름은 "krx" 또는 **"usa"**(3글자!)입니다. Lean 의 폴더 규약이 미국을 `usa` 로 쓰기 때문. "krx 가 아니면 무조건 usa" 로 단순 매핑.
- `data_dir` — 이 마켓의 가격 CSV 가 들어갈 폴더. runner 가 이어서 `DataConverter.export(data_dict, str(project.data_dir), ...)` 로 여기에 CSV 를 씁니다.

#### config.json 작성 — `L156-L176` (Lean 과의 약속 파일)

```python
# L156-L176
        # config.json 생성 (strategy 정보 포함)
        config = {
            "algorithm-language": "Python",
            "strategy_type": strategy_type,
            "strategy_params": strategy_params or {},
            "strategy_id": strategy_id,
            "strategy_name": strategy_name,
            "market_type": market_type,
            "currency": currency,
            "parameters": {
                "symbols": ",".join(symbols),
                "start_date": start_date,
                "end_date": end_date,
                "initial_capital": str(int(initial_capital)),
                "commission_rate": str(commission_rate),
                "tax_rate": str(tax_rate),
            },
        }

        config_path = project_dir / "config.json"
        config_path.write_text(json.dumps(config, indent=2))
```

- `config.json` 은 **두 가지 독자**를 위한 파일입니다:
  1. **Lean CLI** — `"algorithm-language": "Python"` 으로 "이 프로젝트는 파이썬"임을 알리고, `"parameters"` 블록은 Lean 알고리즘이 런타임에 읽는 표준 파라미터 자리.
  2. **우리 코드(나중에)** — `strategy_type/params/id/name`, `market_type`, `currency` 는 Lean 이 안 쓰는 **우리만의 메타데이터**. 히스토리 조회(`get_project`, `list_projects_with_results`, `get_project_result`)에서 다시 읽어 "무슨 전략이었나"를 복원합니다.
- 세부 포인트:
  - `"strategy_params": strategy_params or {}` — `None` 이면 빈 dict 로(파이썬 `A or B` = A 가 거짓/None 이면 B). JSON 에 `null` 대신 `{}` 가 들어가 후속 처리가 안전.
  - `"parameters"` 안의 값은 **전부 문자열**입니다: `","".join(symbols)`(리스트→쉼표 문자열), `str(int(initial_capital))`(자본금을 정수로 만든 뒤 문자열로 — 소수점 제거), `str(commission_rate)`/`str(tax_rate)`. 왜 문자열? **Lean 의 `parameters` 규약이 문자열 키-값**이기 때문. 그래서 다시 읽을 때는 숫자로 변환해야 함(아래 `get_project` 의 `float(...)`).
- `config_path.write_text(json.dumps(config, indent=2))` — 들여쓰기 2칸으로 저장.

> 💡 초보가 헷갈리는 포인트: 같은 정보가 두 군데(`strategy_params` 와 `parameters`)에 비슷하게 들어가는 듯 보이지만 역할이 다릅니다. `parameters` = **Lean 표준**(문자열, 엔진이 읽음), `strategy_type/params/...` = **우리 앱 메타데이터**(원래 타입 보존, 우리가 읽음). 섞지 마세요.

#### backtests 폴더 + 객체 반환 — `L178-L196`

```python
# L178-L196
        # backtests 디렉토리 생성
        (project_dir / "backtests").mkdir(exist_ok=True)

        project = LeanProject(
            run_id=run_id,
            project_dir=project_dir,
            data_dir=data_dir,
            symbols=symbols,
            start_date=start_date,
            end_date=end_date,
            initial_capital=initial_capital,
            commission_rate=commission_rate,
            tax_rate=tax_rate,
            market_type=market_type,
            currency=currency,
        )

        logger.debug(f"[Lean] 프로젝트 생성: {project_dir} (market: {market_type})")
        return project
```

- `(project_dir / "backtests").mkdir(exist_ok=True)` — 결과가 떨어질 자리 미리 생성. (여기서는 `parents=True` 없이 `exist_ok=True` 만 — `project_dir` 가 이미 존재하므로 부모 생성 불필요.)
- 모은 정보로 `LeanProject` 상자를 만들어 반환. 이제 runner 가 이 객체로 데이터 CSV 작성 → main.py 생성 → executor 실행을 이어갑니다.
- 반환 시점에 디스크에는 이미 `lean.json`, `data/...` 폴더, `projects/<run_id>/config.json`, `projects/<run_id>/backtests/` 가 모두 준비됨. **무대 설치 완료.**

---

### H. 기존 프로젝트 조회 `get_project()` — `L198-L228`

```python
# L198-L228
    @classmethod
    def get_project(cls, run_id: str) -> Optional[LeanProject]:
        """기존 프로젝트 조회"""
        project_dir = cls.workspace / "projects" / run_id

        if not project_dir.exists():
            return None

        config_path = project_dir / "config.json"
        if not config_path.exists():
            return None

        config = json.loads(config_path.read_text(encoding="utf-8"))
        params = config.get("parameters", {})

        # 마켓/통화 정보 (기존 프로젝트 호환)
        market_type = config.get("market_type", "krx")
        currency = config.get("currency", "KRW")
        market_folder = "krx" if market_type == "krx" else "usa"

        return LeanProject(
            run_id=run_id,
            project_dir=project_dir,
            data_dir=cls.workspace / "data" / "equity" / market_folder / "daily",
            symbols=params.get("symbols", "").split(","),
            start_date=params.get("start_date", ""),
            end_date=params.get("end_date", ""),
            initial_capital=float(params.get("initial_capital", 100000000)),
            market_type=market_type,
            currency=currency,
        )
```

- **`create_project` 의 역방향**: 디스크에 저장된 `config.json` 을 읽어 `LeanProject` 객체를 **재구성**. 결과 재조회(`get_project_result`)가 이걸 씁니다.
- **방어적 None 반환 2단계**:
  - 프로젝트 폴더가 없으면 → `None`.
  - `config.json` 이 없으면 → `None`. (불완전한 프로젝트는 조용히 "없음" 처리.)
- `config.get("parameters", {})` — `parameters` 블록을 꺼냄(없으면 빈 dict). `.get(키, 기본값)` 은 키가 없어도 에러 없이 기본값을 줌.
- **타입 복원**(저장 때 문자열로 넣었던 걸 되돌림):
  - `params.get("symbols", "").split(",")` — 쉼표 문자열을 리스트로(예: `"SPY,QQQ"` → `["SPY","QQQ"]`).
  - `float(params.get("initial_capital", 100000000))` — 자본금 문자열을 실수로. 없으면 1억(기본값).
- `market_folder` 계산은 `create_project` 와 동일 규칙("krx" 아니면 "usa"). `data_dir` 을 그 규칙으로 재조립.
- "기존 프로젝트 호환" 주석: 옛날에 만들어진 config 에는 `market_type`/`currency` 가 없을 수 있어 기본값("krx"/"KRW")으로 보정.

> 💡 초보 포인트: 여기서 `commission_rate`/`tax_rate` 는 복원하지 않습니다(빠짐). `LeanProject` 의 기본값(0.00015 / 0.0023)이 자동 적용됩니다. 조회 용도에는 그 둘이 필요 없기 때문 — 실행이 아니라 "결과 보여주기"가 목적.

---

### I. 프로젝트 목록 `list_projects()` — `L230-L237`

```python
# L230-L237
    @classmethod
    def list_projects(cls) -> List[str]:
        """모든 프로젝트 목록"""
        projects_dir = cls.workspace / "projects"
        if not projects_dir.exists():
            return []

        return [p.name for p in projects_dir.iterdir() if p.is_dir()]
```

- `projects/` 아래의 **폴더 이름(=run_id)들**을 리스트로 반환. 폴더가 없으면 빈 리스트.
- `[p.name for p in projects_dir.iterdir() if p.is_dir()]` — `iterdir()` 로 항목을 순회하며 **디렉토리인 것**(`p.is_dir()`)만 골라 이름(`p.name`)을 모음. 결과 유무는 따지지 않는 단순 목록.

---

### J. 프로젝트 삭제 `cleanup_project()` — `L239-L251`

```python
# L239-L251
    @classmethod
    def cleanup_project(cls, run_id: str) -> bool:
        """프로젝트 삭제"""
        import shutil

        project_dir = cls.workspace / "projects" / run_id

        if project_dir.exists():
            shutil.rmtree(project_dir)
            logger.info(f"[Lean] 프로젝트 삭제: {run_id}")
            return True

        return False
```

- 한 프로젝트 폴더를 **통째로 삭제**. `shutil.rmtree(...)` = 폴더와 그 안의 모든 것을 재귀 삭제(rm -rf).
- 있으면 지우고 `True`, 없으면 `False`. `import shutil` 을 함수 안에서 한 것은 "삭제할 때만 필요"한 도구라 지연 로드.

> ⚠️ 주의: `shutil.rmtree` 는 **되돌릴 수 없는 삭제**입니다. `run_id` 가 정확해야 함. 디스크 용량 관리/정리용.

---

### K. 결과 있는 프로젝트 목록 `list_projects_with_results()` — `L253-L322` (히스토리 화면용)

함수 머리:
```python
# L253-L271
    @classmethod
    def list_projects_with_results(cls, limit: int = 20) -> List[dict]:
        """결과가 있는 프로젝트 목록 조회 (히스토리용)

        Returns:
            최근 실행 목록 (run_id, 전략, 종목, 날짜, 통계 요약)
        """
        projects_dir = cls.workspace / "projects"
        if not projects_dir.exists():
            return []

        results = []

        # 프로젝트 디렉토리 목록 (수정 시간 역순)
        project_dirs = sorted(
            [p for p in projects_dir.iterdir() if p.is_dir()],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )[:limit]
```

- `list_projects` 와 달리 **결과가 실제로 있는 것만**, 그리고 **통계 요약까지 붙여** 돌려줍니다. 프론트의 "최근 백테스트 히스토리" 화면이 쓰는 데이터.
- 정렬: `key=lambda p: p.stat().st_mtime` 로 **수정 시각** 기준, `reverse=True` 로 **최신순**, `[:limit]` 로 상위 N개(기본 20). `st_mtime` = 파일/폴더 마지막 수정 시각(유닉스 타임스탬프).

#### 각 프로젝트 처리 — `L273-L302`

```python
# L273-L302
        for project_dir in project_dirs:
            run_id = project_dir.name
            config_path = project_dir / "config.json"

            if not config_path.exists():
                continue

            # 결과 파일이 있는지 확인 (없으면 히스토리에서 제외)
            backtests_dir = project_dir / "backtests"
            has_result = (
                (backtests_dir / "Algorithm.json").exists() or
                any(backtests_dir.glob("*/Algorithm.json")) if backtests_dir.exists() else False
            )
            if not has_result:
                continue

            try:
                config = json.loads(config_path.read_text(encoding="utf-8"))
                params = config.get("parameters", {})

                # 전략 타입 (config에 없으면 main.py에서 추론)
                strategy_type = config.get("strategy_type")
                if not strategy_type or strategy_type == "unknown":
                    strategy_type = cls._infer_strategy_type(project_dir)

                # 사용자 정의 이름 (저장된 경우)
                display_name = config.get("display_name", "")

                # 통계 추출 (Algorithm-summary.json 우선)
                summary = cls._extract_summary(project_dir / "backtests")
```

- `config.json` 없으면 **건너뜀**(`continue`).
- **결과 존재 판정** `has_result`:
  - `(backtests_dir / "Algorithm.json").exists()` — `backtests/Algorithm.json` 이 바로 있거나,
  - `any(backtests_dir.glob("*/Algorithm.json"))` — `backtests/어떤폴더/Algorithm.json` 형태(하위 폴더에 결과)가 있거나.
  - 단, 전체가 `if backtests_dir.exists() else False` 로 감싸져 **`backtests` 폴더 자체가 없으면 False**. 결과 없으면 히스토리에서 제외.
- 전략 타입 보정: `config["strategy_type"]` 이 없거나 `"unknown"` 이면 → `_infer_strategy_type(project_dir)` 로 **main.py 코드를 들여다봐 추론**(M 절). 옛 프로젝트나 정보가 빠진 경우 대비.
- `display_name` — 사용자가 이름을 바꿔뒀으면 그 값(없으면 빈 문자열). `update_project_name` 으로 저장됨.
- `summary = cls._extract_summary(...)` — 결과 JSON 에서 핵심 통계 4종(수익률·샤프·MDD·거래수)을 뽑음(L 절).

> ⚠️ 연산자 우선순위 함정: `A or B if C else False` 는 파이썬에서 `(A or B) if C else False` 로 묶입니다. 즉 `backtests_dir.exists()` 가 False 면 통째로 False, True 면 `(직접 있거나 OR 하위에 있거나)`. 한 줄에 압축돼 헷갈리기 쉬운 자리 — 강의에서 괄호로 풀어 설명하면 좋습니다.

#### 결과 dict 조립 + 예외 처리 — `L304-L322`

```python
# L304-L322
                results.append({
                    "run_id": run_id,
                    "created_at": datetime.fromtimestamp(project_dir.stat().st_mtime).isoformat(),
                    "strategy_type": strategy_type,
                    "strategy_id": config.get("strategy_id"),  # 커스텀 전략 ID
                    "strategy_name": config.get("strategy_name"),  # 커스텀 전략 이름
                    "display_name": display_name,
                    "symbols": params.get("symbols", "").split(",") if params.get("symbols") else [],
                    "start_date": params.get("start_date", ""),
                    "end_date": params.get("end_date", ""),
                    "market_type": config.get("market_type", "krx"),
                    "currency": config.get("currency", "KRW"),
                    "summary": summary,
                })
            except (json.JSONDecodeError, KeyError) as e:
                logger.warning(f"[Lean] 프로젝트 파싱 실패: {run_id} - {e}")
                continue

        return results
```

- 한 프로젝트의 요약 카드 한 장을 `results` 에 추가. 프론트가 이 dict 리스트를 받아 히스토리 목록을 그립니다.
- 포인트:
  - `datetime.fromtimestamp(st_mtime).isoformat()` — 수정 시각을 "2026-06-01T13:45:00" 같은 **ISO 문자열**로(JSON 친화적).
  - `"symbols": ... if params.get("symbols") else []` — symbols 문자열이 비었으면 `"".split(",")` 가 `[""]`(빈 문자열 한 칸 리스트)을 주는 함정을 피하려고, 비었으면 **빈 리스트**로 명시.
- `except (json.JSONDecodeError, KeyError)` — 한 프로젝트가 깨져도(config JSON 망가짐/키 없음) **그 프로젝트만 경고 후 건너뛰고** 나머지는 계속. **부분 실패가 전체 목록을 죽이지 않게** 하는 방어.

---

### L. 통계 요약 추출 `_extract_summary()` — `L356-L413`

```python
# L356-L394
    @classmethod
    def _extract_summary(cls, backtests_dir: Path) -> dict:
        """백테스트 결과에서 통계 요약 추출"""
        summary = {
            "total_return_pct": 0,
            "sharpe_ratio": 0,
            "max_drawdown_pct": 0,
            "num_trades": 0,
        }

        if not backtests_dir.exists():
            return summary

        # Algorithm-summary.json 우선 (더 정확한 통계)
        summary_file = backtests_dir / "Algorithm-summary.json"
        if summary_file.exists():
            try:
                data = json.loads(summary_file.read_text(encoding="utf-8"))
                stats = data.get("statistics", {})

                # Net Profit 파싱 (예: "16.985%")
                net_profit = stats.get("Net Profit", "0%")
                summary["total_return_pct"] = cls._parse_percent(net_profit)

                # Sharpe Ratio 파싱 (예: "0.388")
                sharpe = stats.get("Sharpe Ratio", "0")
                summary["sharpe_ratio"] = cls._parse_float(sharpe)

                # Drawdown 파싱 (예: "15.900%")
                drawdown = stats.get("Drawdown", "0%")
                summary["max_drawdown_pct"] = cls._parse_percent(drawdown)

                # Total Orders 파싱 (예: "88")
                orders = stats.get("Total Orders", "0")
                summary["num_trades"] = int(cls._parse_float(orders))

                return summary
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning(f"[Lean] summary 파싱 실패: {e}")
```

- **목표**: Lean 이 떨군 결과 파일에서 화면에 보여줄 4개 숫자(총수익률·샤프·MDD·거래수)만 뽑아 깔끔한 dict 로.
- 기본값 0 으로 시작 — 결과가 없거나 파싱이 실패해도 **항상 같은 모양의 dict** 를 돌려줘 호출자가 안심하고 쓸 수 있게.
- **우선순위 1: `Algorithm-summary.json`** (Lean 이 요약해준 더 정확한 통계). 여기 `statistics` 안의 값들은 **사람이 읽는 문자열**입니다:
  - `"Net Profit": "16.985%"` → `_parse_percent` 로 `16.985` (퍼센트 기호 떼고 숫자).
  - `"Sharpe Ratio": "0.388"` → `_parse_float` 로 `0.388`.
  - `"Drawdown": "15.900%"` → `_parse_percent`.
  - `"Total Orders": "88"` → `_parse_float` 후 `int(...)` 로 정수 거래수.
- 파싱이 깨지면 경고만 남기고 아래 폴백으로 흘러감.

```python
# L396-L413
        # Algorithm.json 폴백
        result_file = backtests_dir / "Algorithm.json"
        if result_file.exists():
            try:
                data = json.loads(result_file.read_text(encoding="utf-8"))
                # rollingWindow에서 마지막 portfolioStatistics 사용
                rolling = data.get("rollingWindow", {})
                if rolling:
                    last_key = list(rolling.keys())[-1] if rolling else None
                    if last_key:
                        portfolio_stats = rolling[last_key].get("portfolioStatistics", {})
                        summary["total_return_pct"] = cls._parse_float(portfolio_stats.get("totalNetProfit", 0)) * 100
                        summary["sharpe_ratio"] = cls._parse_float(portfolio_stats.get("sharpeRatio", 0))
                        summary["max_drawdown_pct"] = cls._parse_float(portfolio_stats.get("drawdown", 0)) * 100
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning(f"[Lean] result 파싱 실패: {e}")

        return summary
```

- **폴백 2: `Algorithm.json`**(원본 전체 결과 파일). summary 파일이 없을 때 여기서 통계를 캠.
- 구조가 다름: `rollingWindow`(여러 기간 통계)에서 **마지막 키의 `portfolioStatistics`** 를 사용. `last_key = list(rolling.keys())[-1]` 로 마지막 윈도우를 고름.
- 단위 차이 주의: 여기 값들은 **비율(0.16)** 형태라 `* 100` 으로 퍼센트화(`totalNetProfit`, `drawdown`). 반면 summary 파일은 이미 퍼센트 문자열이었음. **두 소스의 단위 규약이 다르다**는 게 핵심.
- 두 경로 모두 실패하면 처음의 0-dict 가 그대로 반환됨.

> 💡 초보 포인트: 왜 두 파일을 보나? Lean 버전/실행 방식에 따라 `Algorithm-summary.json`(친절한 요약)이 있을 수도, 없을 수도 있습니다. "있으면 그걸, 없으면 원본을" — **있는 것을 최대한 쓰는** 견고한 폴백 설계.

---

### M. 전략 타입 추론 `_infer_strategy_type()` — `L324-L354`

```python
# L324-L354
    @classmethod
    def _infer_strategy_type(cls, project_dir: Path) -> str:
        """main.py에서 전략 타입 추론"""
        main_py = project_dir / "main.py"
        if not main_py.exists():
            return "unknown"

        try:
            content = main_py.read_text(encoding="utf-8")

            # 전략 패턴 매칭
            patterns = {
                "sma_crossover": ["SMA", "short_sma", "long_sma", "crossover"],
                "rsi": ["RSI", "rsi_indicator", "oversold", "overbought"],
                "macd": ["MACD", "macd_indicator", "Signal"],
                "bollinger": ["BollingerBands", "BB", "upper_band", "lower_band"],
                "momentum": ["MOMP", "momentum_indicator"],
                "breakout_high": ["MAX", "highest", "breakout"],
                "consecutive": ["consecutive", "up_days", "down_days"],
                "ma_divergence": ["divergence", "deviation"],
                "volatility_breakout": ["volatility", "ATR"],
                "mean_reversion": ["reversion", "mean"],
            }

            for strategy, keywords in patterns.items():
                if any(kw in content for kw in keywords):
                    return strategy

            return "custom"
        except Exception:
            return "unknown"
```

- `config.json` 에 전략 타입이 없을 때의 **최후 추론**: 실제 `main.py` 코드 내용을 읽어 **키워드가 있는지 검사**.
- `patterns` = {전략명 → 그 전략에서 나올 법한 키워드 리스트}. 예: `main.py` 에 "SMA" 나 "crossover" 같은 단어가 있으면 → `sma_crossover` 로 판정.
- `for ... : if any(kw in content for kw in keywords): return strategy` — 위에서부터 순서대로, 키워드가 **하나라도** 코드에 들어있는 첫 전략을 반환. `any(...)` = 하나라도 참이면 참.
- 어디에도 안 걸리면 `"custom"`(사용자 정의 코드로 봄), 파일이 없거나 읽기 실패면 `"unknown"`.

> ⚠️ 한계: 이건 **휴리스틱(어림짐작)** 입니다. 예컨대 `"Signal"` 은 macd 키워드인데 다른 전략 코드에도 흔히 나올 수 있어 오판 가능. 그래서 `config.json` 에 `strategy_type` 을 제대로 기록하는 게 1순위이고, 이 추론은 정보가 빠진 옛 프로젝트용 보조 수단입니다.

---

### N. 숫자 파싱 헬퍼 `_parse_percent()` / `_parse_float()` — `L415-L433`

```python
# L415-L433
    @classmethod
    def _parse_percent(cls, value: str) -> float:
        """퍼센트 문자열 파싱 (예: "16.985%" → 16.985)"""
        if isinstance(value, (int, float)):
            return float(value)
        try:
            return float(str(value).replace("%", "").replace(",", "").strip())
        except ValueError:
            return 0.0

    @classmethod
    def _parse_float(cls, value) -> float:
        """숫자 문자열 파싱"""
        if isinstance(value, (int, float)):
            return float(value)
        try:
            return float(str(value).replace("$", "").replace(",", "").strip())
        except ValueError:
            return 0.0
```

- 둘 다 **"지저분한 문자열을 안전하게 실수로"** 바꾸는 헬퍼(vbt_engine 의 `_f()` 와 같은 정신).
- 먼저 `isinstance(value, (int, float))` — 이미 숫자면 그냥 `float` 로(불필요한 문자열 처리 생략).
- 문자열이면 군더더기 제거 후 변환:
  - `_parse_percent` — `%` 와 `,`(천 단위 구분) 제거, 앞뒤 공백 `strip()`. 예: `"16.985%"` → `16.985`, `"1,234.5%"` → `1234.5`.
  - `_parse_float` — `$`(달러 기호)와 `,` 제거. 예: `"$1,000"` → `1000.0`.
- 변환 실패(`ValueError`)면 **0.0** 으로 폴백 — 깨진 값 하나가 전체를 멈추지 않게.

> 💡 초보 포인트: Lean 의 통계는 표시용이라 `"16.985%"`, `"$1,234"` 처럼 **사람이 읽는 형식**입니다. 차트/계산에 쓰려면 순수 숫자가 필요하니, 이 헬퍼들이 "기호 떼고 숫자로"를 담당합니다.

---

### O. 프로젝트 이름 변경 `update_project_name()` — `L435-L452`

```python
# L435-L452
    @classmethod
    def update_project_name(cls, run_id: str, display_name: str) -> bool:
        """프로젝트 이름 수정"""
        project_dir = cls.workspace / "projects" / run_id
        config_path = project_dir / "config.json"

        if not config_path.exists():
            return False

        try:
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["display_name"] = display_name
            config_path.write_text(json.dumps(config, indent=2))
            logger.info(f"[Lean] 프로젝트 이름 변경: {run_id} → {display_name}")
            return True
        except Exception as e:
            logger.error(f"[Lean] 이름 변경 실패: {run_id} - {e}")
            return False
```

- 사용자가 히스토리에서 백테스트에 별명을 붙일 때: **기존 `config.json` 을 읽어 `display_name` 키만 추가/수정 후 다시 저장**.
- 이 `display_name` 이 `list_projects_with_results` 에서 `config.get("display_name", "")` 로 다시 읽혀 화면에 표시됩니다(K 절과 짝).
- config 가 없으면 `False`, 성공하면 `True`, 실패하면 에러 로그 후 `False`. **읽기-수정-쓰기(read-modify-write)** 의 전형.

---

### P. 결과 전체 조회 `get_project_result()` — `L454-L532` (API 응답 조립)

함수 머리 + 결과 디렉토리 확인:
```python
# L454-L478
    @classmethod
    def get_project_result(cls, run_id: str) -> Optional[dict]:
        """프로젝트 결과 조회 (API 응답 형식)

        Returns:
            기존 RunCacheService와 동일한 형식의 결과
        """
        from .executor import LeanRun
        from .result_formatter import ResultFormatter

        project = cls.get_project(run_id)
        if not project:
            return None

        # 결과 디렉토리 확인
        output_dir = project.project_dir / "backtests"
        if not output_dir.exists():
            return None

        # LeanRun 객체 생성 (결과 로드용)
        run = LeanRun(
            project=project,
            success=True,
            output_dir=output_dir,
        )

        # 결과 로드
        raw_result = run.load_result()
        if not raw_result:
            return None
```

- **끝난 백테스트 하나의 전체 결과**를 프론트가 바로 쓸 수 있는 API 형식으로 돌려줍니다. 히스토리에서 항목을 클릭해 상세를 볼 때 등에 사용.
- `from .executor import LeanRun` / `from .result_formatter import ResultFormatter` — **함수 안에서 import**. 왜? 모듈 최상단에서 import 하면 `executor → project_manager` 와 `project_manager → executor` 가 서로를 import 하는 **순환 import**가 생깁니다. 필요한 순간에 늦게 import 해서 그 고리를 끊습니다. (executor.py 상단이 `from .project_manager import LeanProject` 하는 것과 짝.)
- `project = cls.get_project(run_id)` — H 절로 config 에서 프로젝트 복원. 없으면 `None`.
- `LeanRun(project=..., success=True, output_dir=...)` — executor 가 쓰는 결과 래퍼 객체를 **여기서 직접** 만들어(실행 없이) 결과 파일만 로드. `run.load_result()` 가 `backtests` 안의 `Algorithm.json` 을 읽어 dict 로. 비었으면 `None`.

```python
# L485-L501
        # API 응답 형식으로 변환
        config_path = project.project_dir / "config.json"
        strategy_type = "unknown"
        strategy_params = {}
        strategy_id = None
        strategy_name = None

        if config_path.exists():
            try:
                config = json.loads(config_path.read_text(encoding="utf-8"))
                strategy_type = config.get("strategy_type", "unknown")
                strategy_params = config.get("strategy_params", {})
                strategy_id = config.get("strategy_id")
                strategy_name = config.get("strategy_name")
            except json.JSONDecodeError:
                pass
```

- `config.json` 에서 **우리 메타데이터**(전략 타입/파라미터/id/이름)를 다시 꺼냄. 깨졌으면 `pass` 로 기본값 유지.
- 여기서 읽는 건 `strategy_params`(우리 원본 dict)이지, Lean 의 `parameters`(문자열) 가 아님 — G 절에서 강조한 두 블록의 구분이 그대로 이어집니다.

```python
# L502-L532
        # ResultFormatter 결과 (전체 API 응답)
        formatted_result = ResultFormatter.to_api_response(
            run=run,
            symbols=project.symbols,
            start_date=project.start_date,
            end_date=project.end_date,
            initial_capital=project.initial_capital,
            strategy_type=strategy_type,
            strategy_params=strategy_params,
            currency=project.currency,
        )

        # 기존 RunCacheService 형식과 호환되는 응답
        return {
            "run_id": run_id,
            "created_at": datetime.fromtimestamp(project.project_dir.stat().st_mtime).isoformat(),
            "market_type": project.market_type,
            "currency": project.currency,
            "request": {
                "symbols": project.symbols,
                "strategy_type": strategy_type,
                "strategy_params": strategy_params,
                "strategy_id": strategy_id,
                "strategy_name": strategy_name,
                "start_date": project.start_date,
                "end_date": project.end_date,
                "initial_capital": project.initial_capital,
            },
            # result 키 아래에 전체 formatted_result를 넣음 (UI 호환)
            "result": formatted_result,
        }
```

- `ResultFormatter.to_api_response(...)` — **결과 JSON 을 프론트가 그릴 표준 형식**(통계·자산곡선·거래내역)으로 가공(별도 파일 `result_formatter.py` 담당). runner 가 실행 직후 쓰는 것과 **같은 포매터**를 재사용 → 실행 직후든 나중 재조회든 형식이 동일.
- 최종 반환 dict 구조:
  - `request` — "어떤 요청이었나"(재현 정보). 종목·전략·기간·자본금 등.
  - `result` — `formatted_result` 전체. 주석대로 **"result 키 아래에 통째로"** 넣어 기존 `RunCacheService`(캐시 기반 결과)와 같은 모양으로 맞춤 → 프론트는 결과 출처(방금 실행 vs 디스크 재조회)를 몰라도 똑같이 처리.
- `created_at` 은 폴더 수정 시각 기반(ISO 문자열).

> 💡 초보 포인트: 이 함수의 묘미는 **"실행 없이 디스크만으로 실행 결과를 재현"** 한다는 점입니다. 백테스트는 무거우니, 한 번 돌린 결과를 파일로 남겨두고 나중에 이렇게 다시 읽어 보여주면 **재실행 비용 0**. 메모리의 "결과 JSON 동일" 사실과 통합니다.

---

### Q. 전체 삭제 `cleanup_all_projects()` — `L534-L554`

```python
# L534-L554
    @classmethod
    def cleanup_all_projects(cls) -> int:
        """모든 프로젝트 삭제

        Returns:
            삭제된 프로젝트 수
        """
        import shutil

        projects_dir = cls.workspace / "projects"
        if not projects_dir.exists():
            return 0

        count = 0
        for project_dir in projects_dir.iterdir():
            if project_dir.is_dir():
                shutil.rmtree(project_dir)
                count += 1

        logger.info(f"[Lean] 전체 프로젝트 삭제: {count}개")
        return count
```

- `projects/` 아래 **모든 프로젝트 폴더를 통째로 삭제**하고, 지운 개수를 반환. 대청소용.
- `projects` 폴더 자체나 `lean.json`·`data/`(db) 는 **안 건드림** — 작업장 골격은 유지하고 개별 결과만 비움. 그래서 다음 백테스트 때 다시 다운로드할 필요 없음.

> ⚠️ 주의: `cleanup_project` 와 마찬가지로 `rmtree` 는 **복구 불가**. 전체 히스토리가 날아가니 관리 작업으로만.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 모음)

1. **organization-id 누락 = lean 부팅 거부** — `lean.json` 에 `"organization-id": "0"*32` 더미가 없으면 CLI 가 "old Lean CLI root folder" 로 거부. 이 32개의 0 이 로그인 우회의 핵심(`L89-92`).
2. **데이터 db 부재 = 부팅 실패** — `market-hours-database.json` / `symbol-properties-database.csv` 가 없으면 Lean 이 종목/거래소를 해석 못 해 멈춤. `_ensure_lean_data` 가 GitHub raw 에서 자동 다운로드하되, **실패 시 경고만** 하고 진행하므로(`L121-122`) 폐쇄망에선 executor 의 방어 코드에서 막힐 수 있음.
3. **다운로드 0바이트 껍데기** — `dest.exists() and dest.stat().st_size > 0` 로 "있지만 빈 파일"을 재다운로드 대상으로 처리(`L115`). `exists()` 만 봤다면 깨진 0바이트 파일을 유효로 오인했을 것.
4. **`market_type`("us") vs 폴더명("usa")** — `"krx" if ... else "usa"` 매핑(`L152, L216`). "us" 를 그대로 폴더명으로 쓰면 Lean 이 못 찾음.
5. **`parameters`(문자열) vs `strategy_params`(원본 dict)** — 같은 정보가 두 블록에 다른 형식으로 들어감. 읽을 때 `parameters` 는 `float()`/`.split(",")` 로 복원해야 함(`L225`).
6. **빈 symbols → `[""]` 함정** — `"".split(",")` 는 `[""]`(빈 칸 1개)를 반환. `if params.get("symbols") else []` 로 빈 리스트 보정(`L311`).
7. **순환 import** — `get_project_result` 가 `executor`/`result_formatter` 를 **함수 안에서** import(`L461-462`). 최상단 import 시 `executor ↔ project_manager` 순환 충돌.
8. **`A or B if C else False` 우선순위** — `has_result` 한 줄(`L282-285`)은 `(A or B) if C else False` 로 묶임. 압축돼 오독하기 쉬움.
9. **`default_factory=datetime.now`** — `created_at = datetime.now()` 로 쓰면 모든 객체가 같은 시각을 공유하는 dataclass 함정. factory 로 회피(`L33`).
10. **두 결과 소스의 단위 차이** — `Algorithm-summary.json` 은 퍼센트 문자열(`"16.985%"`), `Algorithm.json` 은 비율(`0.16`, `*100` 필요). 섞으면 100배 오차(`L378, L407`).

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **db 다운로드 견고화**: 현재는 단발 `urlretrieve`. **타임아웃 + 재시도(backoff) + 체크섬 검증**을 더하고, 실패 시 경고 대신 `init_workspace` 가 명확히 신호하도록(예: 반환값에 `data_ready: bool`) 하면 폐쇄망 디버깅이 쉬워집니다.
- **오프라인/번들 db**: GitHub 접근이 막힌 환경 대비, 두 db 를 패키지에 동봉(vendoring)하고 다운로드는 "최신화" 용도로만. KIS `setup_lean_data.sh` 와 단일 소스로 통합.
- **`get_project` 정보 완전 복원**: 현재 `commission_rate`/`tax_rate` 를 복원하지 않음. config 의 `parameters` 에서 읽어 채우면 "재실행" 시 원래 비용 모델을 그대로 재현 가능.
- **`_infer_strategy_type` 정확도**: 키워드 휴리스틱은 오판 가능(`"Signal"`, `"mean"` 등 흔한 단어). config 에 `strategy_type` 을 강제 기록하고, 추론은 AST 파싱이나 코드 내 명시 마커(`# STRATEGY: sma_crossover`) 기반으로 승격.
- **삭제 안전장치**: `cleanup_*` 의 `rmtree` 에 "보관 N일 이내/결과 있는 것 제외" 같은 정책 옵션, 또는 휴지통(소프트 삭제)으로.
- **동시성**: 여러 백테스트가 동시에 `init_workspace`/db 다운로드를 하면 경쟁 가능. 파일 락(lock)으로 db 다운로드를 직렬화하면 안전.
- **요약 스키마 통일**: `_extract_summary` 의 두 폴백이 단위가 달라 위험. **공통 정규화 계층**(항상 퍼센트, 항상 float)을 두고 두 소스 모두 그걸 통과시키면 100배 오차 함정 제거.
- **`list_projects_with_results` 페이지네이션**: 지금은 상위 `limit`만. offset/커서 기반으로 확장하면 히스토리가 길어져도 안정적.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **워크스페이스(workspace)** | Lean 관련 모든 파일이 모이는 루트 폴더(`.lean-workspace`). lean.json + data/ + projects/ 포함 |
| **lean.json** | Lean CLI 의 작업장 설정 파일. `data-folder`(상대경로) + `organization-id`(더미) |
| **organization-id 더미** | `"0"*32`. 진짜 QuantConnect 계정 없이 로컬 백테스트를 돌리기 위한 가짜 ID. 없으면 CLI 가 작업장 거부 |
| **`lean init` 우회** | 로그인을 강요하는 `lean init` 대신 lean.json 을 직접 손으로 작성(스캐폴드)하는 트릭 |
| **데이터 db** | `market-hours-database.json`(개장시간) + `symbol-properties-database.csv`(종목속성). 없으면 엔진 부팅 실패 |
| **프로젝트(project)** | 백테스트 1회의 단위. `projects/<run_id>/` 폴더에 main.py·config.json·backtests/ 포함 |
| **run_id** | 프로젝트 고유 ID이자 폴더명(예: `sma_crossover-a1b2c3d4`). runner 가 생성 |
| **config.json** | 프로젝트 설정 파일. Lean 용 `parameters`(문자열) + 우리 앱 메타데이터(strategy_type 등) 공존 |
| **멱등(idempotent)** | 여러 번 실행해도 결과가 같고 안전(예: `mkdir(exist_ok=True)`, init_workspace) |
| **`@classmethod`** | 인스턴스 없이 클래스 이름으로 부르는 메서드(첫 인자 `cls`). 이 매니저는 전부 이 형태 |
| **`@property`** | 괄호 없이 부르는 계산된 속성(`proj.main_py`) |
| **`default_factory`** | dataclass 에서 "객체 생성 시마다" 기본값을 새로 계산(예: `datetime.now`) |
| **폴백(fallback)** | 1순위가 실패/부재 시 2순위로 대체(예: summary.json 없으면 Algorithm.json) |
| **휴리스틱(heuristic)** | 정확한 규칙 대신 어림짐작(예: main.py 키워드로 전략 추론) |
| **read-modify-write** | 파일을 읽고 → 일부만 고치고 → 다시 쓰기(예: update_project_name) |
| **순환 import** | 두 모듈이 서로를 import 해 충돌. 함수 안 지연 import 로 회피 |
