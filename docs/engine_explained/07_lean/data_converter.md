# `lean/data_converter.py` — 가격 데이터를 "Lean 입맛 CSV"로 도시락 싸기 (완전 라인별 해설)

> 원본: `analytics/app/lean/kis_backtest/lean/data_converter.py` (186줄)
> 이 문서는 **교재 표준 예시**(`01_backtest/vbt_engine.md`)와 같은 형식을 따릅니다.

---

## 📌 이 파일 한눈에

이 파일은 **"데이터 도시락 싸는 사람"** 입니다. 우리가 가진 가격표(야후/KIS 에서 받은 `pandas DataFrame`)를 그대로 Lean 엔진에 줄 수는 없습니다. Lean(QuantConnect 의 백테스트 엔진)은 **자기만의 까다로운 CSV 형식**으로 된 밥만 먹습니다. 이 파일은 우리 데이터를 그 형식(`YYYYMMDD,시가,고가,저가,종가,거래량`, 헤더 없음)으로 **포장해서 정해진 폴더에 갖다 놓는** 역할만 합니다.

> 비유: 외국 손님(Lean)이 "나는 이 도시락통(파일명·폴더 규칙)에, 이 순서(컬럼 순서)로, 이 단위(원은 정수·달러는 소수 2자리)로 담긴 음식만 먹는다"고 고집부립니다. 이 파일은 우리 식재료(DataFrame)를 그 손님 입맛에 맞춰 통에 담는 **도시락 가게**입니다. 요리(백테스트 계산) 자체는 안 합니다 — **포장만** 합니다.

핵심 함수(메서드)는 4개입니다. 전부 `@classmethod` (인스턴스를 안 만들고 `DataConverter.export(...)` 처럼 클래스로 바로 호출).

| 메서드 | 한 줄 역할 | 비유 |
|---|---|---|
| `export(data_dict, output_dir, market_type)` | 여러 종목을 한꺼번에 변환 (바깥에서 부르는 정문) | 도시락 여러 개 한 번에 포장 주문 받기 |
| `_export_symbol(symbol, df, ...)` | **한 종목 DataFrame → CSV 1개** (진짜 일하는 알맹이) | 도시락 한 개를 실제로 싸기 |
| `get_date_range(data_dict)` | 여러 종목의 **공통 날짜 구간**(가장 늦은 시작 ~ 가장 이른 끝) 계산 | 모두가 음식이 있는 날짜만 고르기 |
| `bars_to_lean_csv(bars, symbol, ...)` | `Bar` 객체 리스트(DataFrame 아님) → CSV. 결국 `_export_symbol` 재사용 | 다른 재료 포맷(낱개 캔들)도 받아서 같은 포장으로 |

**누가 호출하나?** → 두 곳입니다.
- `analytics/app/lean/runner.py:173` — 우리 FastAPI 의 Lean 백테스트 경로. 야후/Polygon 으로 받은 데이터를 `DataConverter.export(...)` 로 변환해 Lean 워크스페이스에 떨굼.
- `analytics/app/lean/kis_backtest/client.py` (228·304·740줄) — 벤더링된 KIS open-trading-api 라이브러리 내부에서 같은 함수를 호출.

**왜 별도 변환기가 필요한가?** → vbt_engine 은 `pandas Series` 를 메모리에서 바로 계산합니다. 하지만 Lean 은 **별도 프로세스(도커 컨테이너)** 로 돌아가며, 메모리가 아니라 **디스크의 CSV 파일을 읽어** 백테스트합니다. 그래서 "우리 메모리 데이터 → 디스크 CSV(Lean 규격)" 다리가 반드시 있어야 하고, 그 다리가 이 파일입니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) Lean 의 "equity daily" CSV 포맷 — 헤더 없는 6칸
Lean 의 일봉(daily) 주식 데이터 한 줄은 **정확히 이 모양**입니다(이 파일 `L86` 주석·`L107` 출력이 근거):
```
20240102,100,101,99,100,12345
20240103,100,102,100,101,9876
└─날짜──┘ │  │  │  │   └ 거래량
        시가 고가 저가 종가
```
- **컬럼 순서 고정**: `날짜, open(시가), high(고가), low(저가), close(종가), volume(거래량)`.
- **날짜 형식**: `YYYYMMDD` (구분기호 없이 붙여 씀. 2024-01-02 → `20240102`).
- **헤더 줄 없음**: 첫 줄부터 곧바로 데이터. (그래서 `to_csv(header=False)`.)
- **정렬**: 날짜 오름차순(과거→최근). Lean 은 시간 순서대로 읽습니다.

> ⚠️ 진짜 QuantConnect 클라우드 Lean 은 이 CSV 를 다시 **zip 으로 압축**해서 `aapl.zip` 안에 `aapl.csv` 를 넣는 형식을 쓰기도 합니다. **하지만 이 코드는 압축하지 않고 `aapl.csv` 평문 그대로 저장합니다**(`L105`, `L107-L111`). 우리 셋업은 로컬 lean CLI 가 평문 CSV 를 읽도록 구성돼 있어 그대로 동작합니다. (메모리: "Lean CLI 운영 사실 — 컨테이너 데이터경로 /Lean/Data".)

#### 2) Lean 데이터 폴더 경로 규칙 — `data/equity/{시장}/daily/{종목}.csv`
이 파일은 **파일 내용**만 만들고, **어느 폴더에 둘지(`output_dir`)는 호출자가 정해서 넘깁니다**. 그 호출자(`project_manager.py:152-153`)가 만드는 경로 규칙은:
```
.lean-workspace/                         ← Lean 워크스페이스 루트
└── data/                                ← lean.json 의 "data-folder"
    └── equity/                          ← 자산군: 주식
        ├── usa/daily/aapl.csv           ← 미국 주식 (market_type="us" → 폴더는 "usa")
        └── krx/daily/005930.csv         ← 한국 주식 (market_type="krx")
```
- 도커 컨테이너 안에서는 이 `data/` 가 `/Lean/Data/` 로 마운트됩니다. 즉 컨테이너 입장의 경로는 `/Lean/Data/equity/usa/daily/aapl.csv`.
- **주의**: 코드에 쓰인 단어 `market_type` 값은 `"krx"` 또는 `"us"` 인데, **폴더 이름은 `"us"` 가 아니라 `"usa"`** 입니다. 이 폴더명 매핑(`"us" → "usa"`)은 이 파일이 아니라 `project_manager.py:152` 가 합니다. 이 파일(`data_converter.py`)은 이미 완성된 폴더 경로를 받기만 합니다.
- **파일명 = 종목코드 소문자 + `.csv`** (`L105`: `symbol.lower()`). `AAPL` → `aapl.csv`, `005930` → `005930.csv`.

#### 3) `pandas DataFrame` = "여러 칸짜리 표"
vbt_engine 의 `Series`(한 줄)와 달리, DataFrame 은 **여러 열을 가진 표**입니다.
```
   date        open  high  low  close  volume
0  2024-01-02   100   101   99    100   12345
1  2024-01-03   100   102  100    101    9876
```
- `df['close']` = close 열만 꺼낸 Series. `df.columns` = 열 이름 목록. `df.index` = 행 번호(또는 날짜 인덱스).
- 이 파일은 이 표를 받아 **열 이름 정리 → 날짜 형식 변환 → 중복·정렬 정리 → 6개 열만 골라 CSV 저장** 순으로 다룹니다.

#### 4) 가격 단위가 시장마다 다르다
- **한국 주식(KRX)**: 가격이 **원(₩) 단위 정수**입니다. 삼성전자 70,800원처럼 소수점이 없습니다 → `int` 로 반올림.
- **미국 주식(US)**: 가격이 **달러($) 소수점 2자리**입니다. 187.45달러처럼 센트가 있습니다 → 소수 2자리 `round`.
- 거래량(volume)은 둘 다 정수(주식 수).

#### 5) `@classmethod` 와 `cls` — "인스턴스 없이 클래스로 바로 호출"
```python
class DataConverter:
    @classmethod
    def export(cls, ...): ...
```
- `@classmethod` 가 붙으면 `DataConverter()` 객체를 만들지 않고 `DataConverter.export(...)` 로 바로 부릅니다. 첫 인자 `cls` 는 "이 클래스 자신"이라서, 안에서 `cls._export_symbol(...)` 처럼 같은 클래스의 다른 메서드를 부릅니다.
- 이 클래스는 **상태(저장된 데이터)가 전혀 없는 유틸리티 모음**이라 인스턴스가 필요 없습니다. (비유: 계산기 버튼 모음 — 굳이 "내 계산기 한 대"를 살 필요 없이 공용 버튼을 누르면 됨.)

---

## 🗺 전체 흐름도

```
  data_dict = {"AAPL": df1, "MSFT": df2, ...}   ← 종목별 DataFrame 묶음
  output_dir = ".../data/equity/usa/daily"        ← 호출자가 정해준 폴더
  market_type = "us"
                       │
                       ▼
        ┌──────────────────────────────┐
        │  export(...)  (정문)          │  폴더 생성 + 종목별 루프
        └──────────────────────────────┘
                       │  종목 하나씩
                       ▼
        ┌──────────────────────────────┐
        │  _export_symbol(...) (알맹이) │
        └──────────────────────────────┘
           1) 컬럼/날짜 정규화 (date 열 확보 → datetime)
           2) 필수 6열 존재 확인 (없으면 ValueError)
           3) date → 'YYYYMMDD' 문자열
           4) 날짜 중복 제거 + 오름차순 정렬
           5) 단위 변환 (KRX=정수원 / US=소수2자리달러)
           6) 6개 열만 골라 헤더 없는 CSV 저장
                       │
                       ▼
        .../usa/daily/aapl.csv  (한 줄: 20240102,187.4,188.1,186.9,187.45,55012345)
                       │
                       ▼
        반환: {"AAPL": Path(".../aapl.csv"), "MSFT": Path(...)}


  [별도 입구] bars_to_lean_csv(bars=[Bar, Bar, ...], symbol, ...)
        Bar 객체 리스트 → DataFrame 조립 → 같은 _export_symbol(...) 재사용

  [부가 도구] get_date_range(data_dict) → (공통 시작일, 공통 끝일)
        모든 종목에 데이터가 다 있는 안전한 구간만 골라줌 (변환과 독립)
```

---

## 📖 라인별 해설

### A. 파일 설명서 + import — `L1-L15`

```python
# L1-L15
"""데이터 변환기 - KIS DataFrame을 Lean CSV 포맷으로 변환

KIS OpenAPI 데이터를 Lean이 읽을 수 있는 CSV 포맷으로 변환.
"""

import logging
from pathlib import Path
from typing import Dict, List, TYPE_CHECKING

import pandas as pd

if TYPE_CHECKING:
    from ..models import Bar

logger = logging.getLogger(__name__)
```
- `"""..."""` 파일 맨 위 **설명서(docstring)**. "KIS DataFrame → Lean CSV" 라는 이 파일의 한 줄 정체성. (실제로는 야후 데이터도 같은 경로로 들어오지만, 원본 라이브러리가 KIS 용으로 만들어져 docstring 이 KIS 를 언급합니다.)
- `from pathlib import Path` — **경로(폴더·파일 위치)를 객체로 다루는** 도구. 문자열 `"a/b/c.csv"` 대신 `Path("a") / "b" / "c.csv"` 처럼 `/` 연산으로 경로를 조립합니다. OS(윈도우 `\` vs 리눅스 `/`) 차이를 알아서 처리해줘 안전합니다.
- `from typing import Dict, List, TYPE_CHECKING` — 타입 힌트용. `Dict[str, pd.DataFrame]` = "키는 문자열, 값은 DataFrame 인 딕셔너리".
- `import pandas as pd` — 표 데이터 라이브러리. 업계 관습 별명 `pd`.
- **`if TYPE_CHECKING:` 가 헷갈리는 포인트** ⚠️: `TYPE_CHECKING` 은 **평소(실행 중)에는 항상 False**, 타입 검사기(mypy 등)가 코드를 들여다볼 때만 True 인 특수 상수입니다. 즉 `from ..models import Bar` 는 **실제 실행 시엔 import 되지 않습니다**. 왜 이렇게 할까요?
  - 이유 1) **순환 import 방지**: `models` 가 이 파일을 다시 import 하면 무한 고리가 생길 수 있는데, 실행 시 import 를 빼면 고리가 끊깁니다.
  - 이유 2) **무거운 모듈 지연**: `Bar` 는 타입 힌트(`List["Bar"]`)에만 필요하지 실제 객체 생성은 호출자가 합니다. 굳이 import 비용을 안 치름.
  - 그래서 아래 `bars_to_lean_csv` 의 타입힌트는 `List["Bar"]` 처럼 **따옴표 문자열**로 씁니다(전방 참조, forward reference). 실행 시 `Bar` 라는 이름이 없어도 문자열이라 에러가 안 납니다.
- `logger = logging.getLogger(__name__)` — 이 모듈 전용 로그 출력기. `__name__` 은 모듈 경로(예: `...lean.data_converter`)라 로그에 어디서 찍힌 메시지인지 표시됩니다.

---

### B. 클래스 선언 — `L18-L19`

```python
# L18-L19
class DataConverter:
    """KIS DataFrame → Lean CSV 변환기"""
```
- 4개 메서드를 담는 **그릇**. 앞서 말했듯 상태가 없는 유틸리티라 전부 `@classmethod` 입니다. (인스턴스 변수도, `__init__` 도 없음.)

---

### C. 정문 `export()` — 여러 종목 일괄 변환 — `L21-L51`

함수 머리:
```python
# L21-L37 (시그니처 + docstring)
@classmethod
def export(
    cls,
    data_dict: Dict[str, pd.DataFrame],
    output_dir: str,
    market_type: str = "krx",
) -> Dict[str, Path]:
    """데이터를 Lean CSV 포맷으로 내보내기
    ...
    Returns:
        {symbol: Path} 형태의 생성된 파일 경로
    """
```
- **입력**:
  - `data_dict`: `{"AAPL": df, "MSFT": df, ...}` — 종목코드 → 그 종목 DataFrame.
  - `output_dir`: 문자열 경로. 호출자가 만든 `.../data/equity/usa/daily` 가 들어옵니다.
  - `market_type`: `"krx"`(국내) 또는 `"us"`(해외). **기본값 `"krx"`**.
- **출력**: `{"AAPL": Path(".../aapl.csv"), ...}` — 종목별로 **어디에 파일을 만들었는지** 경로를 돌려줍니다. 호출자가 "잘 만들어졌나"를 확인하거나 후속 작업에 쓸 수 있게.

폴더 준비:
```python
# L38-L39
output_path = Path(output_dir)
output_path.mkdir(parents=True, exist_ok=True)
```
- 문자열 `output_dir` 을 `Path` 객체로 바꾼 뒤, **그 폴더를 만듭니다**.
  - `parents=True` = 중간 폴더(`data/equity/usa/`)가 없으면 **부모까지 통째로** 만듦(리눅스 `mkdir -p` 와 같음).
  - `exist_ok=True` = 이미 폴더가 있어도 **에러 내지 말고 그냥 넘어가라**. (없으면, 두 번째 실행에서 "이미 있음" 에러로 죽음. **멱등성** 보장.)

종목별 루프:
```python
# L41-L51
exported = {}

for symbol, df in data_dict.items():
    try:
        csv_path = cls._export_symbol(symbol, df, output_path, market_type)
        exported[symbol] = csv_path
        logger.debug(f"  - {symbol}: {csv_path}")
    except Exception as e:
        logger.error(f"  - {symbol} 변환 실패: {e}")

return exported
```
- `data_dict.items()` 로 `(종목코드, DataFrame)` 쌍을 하나씩 꺼내 **실제 일꾼 `_export_symbol` 에 위임**합니다. 성공하면 만든 경로를 `exported` 에 기록.
- **`try/except` 가 핵심 설계 포인트** ⚠️: 한 종목 변환이 실패해도(예: 어떤 종목 데이터에 `close` 열이 없음) **에러를 잡아 로그만 남기고 다음 종목으로 넘어갑니다**. 즉 "10종목 중 1종목이 망가져도 나머지 9개는 정상 변환"되는 **부분 성공(graceful degradation)** 전략입니다.
  - 헷갈리는 포인트: 그래서 `export` 는 **예외를 절대 위로 던지지 않습니다**. 호출자는 "반환된 dict 에 내 종목이 들어있나?"로 성공/실패를 판단해야 합니다. (전체가 실패하면 빈 dict `{}` 가 반환됨.)

> 💡 초보 포인트: `export` 는 "오케스트라 지휘자"입니다 — 직접 연주(변환)는 안 하고, 종목마다 `_export_symbol` 연주자를 부르고, 한 명이 삑사리 나도 공연(나머지 종목)은 계속되게 합니다.

---

### D. 알맹이 `_export_symbol()` — 한 종목을 진짜 변환 — `L53-L113`

이 파일에서 **유일하게 실제 변환을 수행**하는 메서드입니다. 이름 앞 `_`(언더스코어) = "내부용, 바깥에서 직접 부르지 마세요" 관습 표시.

함수 머리:
```python
# L53-L68 (시그니처 + docstring 요약)
@classmethod
def _export_symbol(
    cls,
    symbol: str,
    df: pd.DataFrame,
    output_dir: Path,
    market_type: str = "krx",
) -> Path:
    """단일 종목 데이터 변환 ..."""
```
- 입력: 종목코드 1개, 그 종목 DataFrame 1개, (이미 Path 인) 출력 폴더, 시장구분. 출력: 만든 CSV 파일의 `Path` 1개.

#### 1) 원본 보호 (copy) — `L69-L70`
```python
# L69-L70
# 컬럼 정규화
df_out = df.copy()
```
- 받은 `df` 를 **복사**해서 `df_out` 으로 작업합니다.
- **왜?** 아래에서 열을 추가하고 값을 바꾸는데, 원본 `df` 를 직접 고치면 **호출자가 들고 있는 원본 데이터까지 오염**됩니다(파이썬은 DataFrame 을 참조로 넘김). `.copy()` 로 별도 사본을 떠서 작업하면 원본은 안전. (부작용 없는 함수 = 좋은 함수.)

#### 2) 'date' 열 확보 + datetime 변환 — `L72-L78`
```python
# L72-L78
# 날짜 컬럼 처리
if 'date' in df_out.columns:
    df_out['date'] = pd.to_datetime(df_out['date'])
elif df_out.index.name == 'date' or isinstance(df_out.index, pd.DatetimeIndex):
    df_out = df_out.reset_index()
    df_out.columns.values[0] = 'date'
    df_out['date'] = pd.to_datetime(df_out['date'])
```
- 들어오는 데이터의 "날짜가 어디 있는지"가 두 가지일 수 있어 분기합니다.
  - **경우 1) `date` 라는 열이 이미 있다** → 그 열을 `pd.to_datetime(...)` 으로 진짜 날짜 타입으로 변환(문자열 `"2024-01-02"` 든 뭐든 datetime 으로 통일).
  - **경우 2) 날짜가 열이 아니라 행 인덱스(index)에 있다** (index 이름이 `'date'` 이거나, index 자체가 `DatetimeIndex` 인 경우):
    - `reset_index()` — 인덱스를 **일반 열로 끄집어냅니다**. (인덱스에 있던 날짜가 표의 첫 번째 열이 됨.)
    - `df_out.columns.values[0] = 'date'` — 그 새로 생긴 **첫 번째 열의 이름을 `'date'` 로** 강제 지정. (reset_index 후 열 이름이 `'index'` 나 원래 인덱스 이름일 수 있어 통일.)
    - 다시 `pd.to_datetime` 으로 변환.
- **헷갈리는 포인트** ⚠️: 둘 다 아니면(= `date` 열도 없고 인덱스도 날짜가 아님) **이 블록은 아무것도 안 하고 통과**합니다. 그러면 `df_out['date']` 이 존재하지 않게 되고, 한참 뒤 `L87` 의 `df_out['date'].dt...` 에서 `KeyError` 가 나며 이 종목은 실패 처리됩니다. (필수 OHLCV 열은 `L80-L84` 에서 따로 검사하지만, `date` 의 존재 자체는 여기서만 암묵적으로 가정합니다. → "함정" 섹션 참고.)

> 💡 초보 포인트: `df_out.columns.values[0] = 'date'` 는 `df_out.rename(...)` 보다 거친 방식(numpy 배열을 직접 건드림)이지만, "첫 열 이름이 뭐든 무조건 date 로" 라는 의도를 단순하게 표현합니다.

#### 3) 필수 6열(중 5개) 존재 확인 — `L80-L84`
```python
# L80-L84
# 필수 컬럼 확인
required_cols = ['open', 'high', 'low', 'close', 'volume']
for col in required_cols:
    if col not in df_out.columns:
        raise ValueError(f"필수 컬럼 없음: {col}")
```
- Lean CSV 에 들어갈 OHLCV 5개 열이 모두 있는지 검사. 하나라도 없으면 **즉시 `ValueError`** 를 던집니다.
- 이 `ValueError` 는 위 `export` 의 `try/except` 가 잡아서 "이 종목만 건너뜀"으로 처리됩니다. (단독으로 `_export_symbol` 을 부른 `bars_to_lean_csv` 경로에서는 그대로 위로 전파됨.)
- **빠른 실패(fail fast)**: 잘못된 데이터를 CSV 로 만들어 Lean 까지 갔다가 거기서 알 수 없는 에러로 죽는 것보다, **여기서 명확한 메시지로 미리 죽는 게** 디버깅에 훨씬 낫습니다.

#### 4) 날짜 → 'YYYYMMDD' 문자열 — `L86-L87`
```python
# L86-L87
# Lean 포맷으로 변환 (YYYYMMDD,open,high,low,close,volume)
df_out['date_str'] = df_out['date'].dt.strftime('%Y%m%d')
```
- datetime 인 `date` 열을 **Lean 이 원하는 `YYYYMMDD` 문자열**로 변환해 `date_str` 이라는 **새 열**에 저장.
- `.dt` 는 "이 열의 각 날짜에 날짜 전용 기능을 적용해라"는 접근자(accessor). `.dt.strftime('%Y%m%d')` = 각 날짜를 `2024-01-02 → "20240102"` 로 포맷.
- 주석이 친절하게 **목표 형식 전체**(`YYYYMMDD,open,high,low,close,volume`)를 적어둠 — 이게 곧 Lean CSV 한 줄의 청사진.

#### 5) 날짜 중복 제거 + 오름차순 정렬 — `L89-L91`
```python
# L89-L91
# 중복 제거 (날짜 기준)
df_out = df_out.drop_duplicates(subset=['date_str'], keep='first')
df_out = df_out.sort_values('date_str')
```
- `drop_duplicates(subset=['date_str'], keep='first')` — **같은 날짜가 두 번 이상** 있으면 **첫 번째만 남기고** 나머지 행을 버림.
  - **왜?** 데이터 소스가 같은 날짜를 중복으로 줄 때가 있는데(API 페이지 겹침 등), Lean 은 한 날짜에 두 개의 바가 있으면 혼란스러워합니다. 하루 1줄 보장.
- `sort_values('date_str')` — `date_str`(문자열) 기준 오름차순 정렬.
  - **헷갈리는 포인트**: 문자열 정렬인데 왜 날짜 순서가 맞을까? → `YYYYMMDD` 형식은 **문자열로 정렬해도 날짜 순서와 일치**하기 때문입니다(`"20240102" < "20240103"`). 자리수가 고정되고 큰 단위가 앞에 오므로 사전식 정렬 = 시간순 정렬. (만약 `2024-1-2` 처럼 자리수가 들쭉날쭉했다면 깨졌을 것.)

#### 6) 가격 단위 변환 (KRX vs US) — `L93-L102`
```python
# L93-L102
# 가격 포맷: KRX는 정수(원), US는 소수점 2자리(달러)
if market_type == "krx":
    # 한국 주식: 원 단위 (정수)
    for col in required_cols:
        df_out[col] = df_out[col].astype(float).round(0).astype(int)
else:
    # 미국 주식: 달러 단위 (소수점 2자리)
    for col in ['open', 'high', 'low', 'close']:
        df_out[col] = df_out[col].astype(float).round(2)
    df_out['volume'] = df_out['volume'].astype(int)
```
- **KRX(한국)**: OHLCV **5개 열 전부**를 `float → 반올림(round 0) → int` 로. 즉 **정수 원 단위**. (삼성전자 70,815.0 → 70815.) 거래량도 당연히 정수.
- **US(미국)**: 가격 4개 열(O/H/L/C)만 `float → 소수 2자리 반올림`(달러·센트). 거래량은 따로 `int` 로.
  - 왜 거래량을 따로 처리? → 가격은 소수가 필요하지만 거래량은 "주식 수"라 항상 정수여야 하므로 `round(2)` 대상에서 빼고 `astype(int)` 로 분리.
- **변환 순서가 중요** ⚠️: `astype(float)` 를 먼저 합니다. 원본 데이터가 문자열(`"70815"`)이거나 다른 숫자 타입일 수 있어, **일단 float 로 통일한 뒤** 반올림/정수변환을 해야 안전합니다. 곧장 `astype(int)` 했다가 입력이 `"70815.0"` 문자열이면 에러가 날 수 있습니다.
  - `else` 가지: `market_type` 이 `"krx"` 가 아니면 무조건 US 처리. 즉 `"us"` 든 오타든 뭐든 KRX 가 아니면 달러 포맷. (호출자가 `"krx"`/`"us"` 만 넘긴다는 신뢰 전제.)

#### 7) 6개 열만 골라 헤더 없는 CSV 저장 — `L104-L113`
```python
# L104-L113
# CSV 출력 (헤더 없음)
csv_path = output_dir / f"{symbol.lower()}.csv"

df_out[['date_str', 'open', 'high', 'low', 'close', 'volume']].to_csv(
    csv_path,
    index=False,
    header=False,
)

return csv_path
```
- `csv_path = output_dir / f"{symbol.lower()}.csv"` — 파일 경로 조립. **종목코드를 소문자로** (`AAPL → aapl.csv`). Lean 의 파일명 규칙(소문자)을 따릅니다.
- `df_out[[...6개열...]]` — **딱 6개 열만, 그것도 정확한 순서**(`date_str, open, high, low, close, volume`)로 골라냅니다. 중간에 만든 `date`(datetime)나 다른 잡열은 빼고 Lean 규격 열만.
- `.to_csv(csv_path, index=False, header=False)`:
  - `index=False` — **행 번호(0,1,2…)를 파일에 쓰지 않음**. (Lean 은 행 번호가 없는 순수 데이터만 원함.)
  - `header=False` — **열 이름 줄을 쓰지 않음**. (사전지식 1번: Lean equity daily 는 헤더가 없음.)
- 최종 산출물 한 줄 예시: `20240102,187.45,188.1,186.9,187.45,55012345` (US) 또는 `20240102,70800,71000,70500,70815,12000000` (KRX).
- 만든 파일의 `Path` 를 반환 → `export` 가 이걸 모아 dict 로 돌려줌.

---

### E. `get_date_range()` — 모든 종목의 공통 날짜 구간 — `L115-L143`

변환과는 **독립된 보조 도구**입니다. "여러 종목을 같이 백테스트할 때, 모두에게 데이터가 다 있는 안전한 구간이 언제부터 언제까지냐"를 계산합니다.

```python
# L115-L123
@classmethod
def get_date_range(cls, data_dict: Dict[str, pd.DataFrame]) -> tuple:
    """데이터의 공통 날짜 범위 계산"""
    if not data_dict:
        return None, None

    min_date = None
    max_date = None
```
- 입력이 빈 딕셔너리면 `(None, None)` 으로 즉시 반환(빈 입력 방어).
- `min_date`/`max_date` 를 None 으로 초기화하고 루프에서 채워갑니다.

```python
# L124-L143
for df in data_dict.values():
    if df.empty:
        continue

    if isinstance(df.index, pd.DatetimeIndex):
        dates = df.index
    elif 'date' in df.columns:
        dates = pd.to_datetime(df['date'])
    else:
        continue

    df_min = dates.min()
    df_max = dates.max()

    if min_date is None or df_min > min_date:
        min_date = df_min
    if max_date is None or df_max < max_date:
        max_date = df_max

return min_date, max_date
```
- 각 종목 DataFrame 에서 **날짜 모음(`dates`)을 뽑습니다**: 인덱스가 날짜면 인덱스에서, 아니면 `date` 열에서. 빈 DF 나 날짜를 못 찾는 DF 는 `continue` 로 건너뜀.
- **핵심 논리 — "교집합"을 구합니다** ⚠️ (헷갈리기 쉬움):
  - `min_date` 는 각 종목 **시작일들 중 가장 늦은 것**으로 갱신됩니다 (`df_min > min_date` 일 때 교체 → **더 늦은** 시작일 채택).
  - `max_date` 는 각 종목 **끝일들 중 가장 이른 것**으로 갱신됩니다 (`df_max < max_date` 일 때 교체 → **더 이른** 끝일 채택).
  - 즉 결과는 "**모든 종목이 동시에 데이터를 가진** 구간" = **교집합**입니다.
- **왜 이렇게?** A 종목은 2010~2024, B 종목은 2015~2023 이면, 둘 다 있는 구간은 **2015~2023** 뿐입니다. 백테스트를 2010 부터 돌리면 B 데이터가 없어 비교가 불공정·오류. 그래서 "모두 있는 구간"만 고름.
  - 비유: 친구 3명이 다 시간 되는 약속 날짜 잡기 — 가장 늦게 가능해지는 사람 시작에 맞추고, 가장 먼저 빠지는 사람 끝에 맞춤.

> 💡 초보 포인트: 직관과 반대라 헷갈립니다. "범위(range)"라는 이름이지만 **합집합(가장 이른 시작~가장 늦은 끝)이 아니라 교집합**입니다. 부등호 방향(`>` for min, `<` for max)을 꼭 확인하세요. (현재 `runner.py`/`client.py` 변환 경로에서 이 함수를 직접 호출하지는 않습니다 — 데이터 구간을 사전에 맞추고 싶을 때 쓰는 유틸.)

---

### F. `bars_to_lean_csv()` — Bar 객체 리스트 입구 — `L145-L186`

`export` 가 **DataFrame** 을 받는다면, 이건 **`Bar` 객체 리스트**를 받는 또 다른 입구입니다. KIS 데이터 어댑터가 데이터를 `Bar`(pydantic 모델, 사전지식의 `market_data.py`) 낱개로 들고 있을 때 씁니다.

```python
# L145-L165
@classmethod
def bars_to_lean_csv(
    cls,
    bars: List["Bar"],
    symbol: str,
    output_dir: Path,
    market_type: str = "krx",
) -> Path:
    """Bar 리스트를 Lean CSV로 변환 ..."""
    if not bars:
        raise ValueError("빈 bars 리스트")
```
- 입력: `bars`(Bar 객체들), 종목코드, 출력 폴더, 시장구분. `List["Bar"]` 의 따옴표는 위 `TYPE_CHECKING` 때문(전방 참조).
- 빈 리스트면 `ValueError` 로 빠른 실패.

```python
# L167-L179
# Bar → DataFrame
data = []
for bar in bars:
    data.append({
        'date': bar.time,
        'open': bar.open,
        'high': bar.high,
        'low': bar.low,
        'close': bar.close,
        'volume': bar.volume,
    })

df = pd.DataFrame(data)
```
- 각 `Bar` 의 속성(`bar.time`, `bar.open` …)을 꺼내 **딕셔너리 한 줄씩** 만들어 리스트에 담고, 그 리스트로 `DataFrame` 을 조립합니다.
- 주의: `Bar` 모델의 날짜 속성 이름은 `time` 인데, 여기서 **`date` 열로 이름을 바꿔 담습니다**(`'date': bar.time`). 이렇게 해야 아래 `_export_symbol` 의 `date` 열 처리 로직(`L73`)과 맞아떨어집니다.

```python
# L181-L186
# output_dir이 str이면 Path로 변환
output_path = Path(output_dir)
output_path.mkdir(parents=True, exist_ok=True)

# 변환 실행
return cls._export_symbol(symbol, df, output_path, market_type)
```
- 폴더 보장(`mkdir`) 후, **결국 같은 알맹이 `_export_symbol` 에 위임**합니다.
- **설계의 묘** 👍: 입구는 두 개(`export`=DataFrame 묶음, `bars_to_lean_csv`=Bar 리스트)지만, **실제 CSV 를 만드는 규칙은 `_export_symbol` 한 곳**에만 있습니다. → 포맷 규칙을 바꿀 일이 생기면 한 곳만 고치면 됩니다(DRY 원칙, 중복 제거).
  - 단, `bars_to_lean_csv` 는 `export` 와 달리 `_export_symbol` 의 예외를 **try/except 로 감싸지 않습니다**. 즉 변환 실패 시 `ValueError` 등이 그대로 호출자에게 올라갑니다(단일 종목 변환이라 부분성공 개념이 없음).

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 모음)

1. **`date` 열이 없으면 늦게 터진다** — `L72-L78` 은 `date` 열도 없고 날짜 인덱스도 아니면 조용히 통과합니다. 그러면 `L87` 의 `df_out['date'].dt...` 에서 `KeyError`. OHLCV 5열은 `L80-L84` 에서 명시 검증하지만 **`date` 의 존재는 명시 검증이 없어** 에러 메시지가 덜 친절합니다. (개선: required 검사에 date 도 포함하면 더 명확.)
2. **`market_type` 의 else 는 전부 US** — `L98` 의 `else` 는 `"krx"` 가 아닌 **모든 값**(오타 `"usa"`, 빈 문자열, `"jp"` 등)을 US(달러 소수 2자리)로 처리합니다. 잘못된 시장구분이 들어와도 에러 없이 달러로 변환되니, 호출자가 `"krx"`/`"us"` 만 넘기는 규약을 지켜야 합니다.
3. **폴더명 `us` ≠ `usa`** — 이 파일의 인자 단어는 `"us"` 지만, 실제 데이터 폴더는 `equity/usa/daily` 입니다. 이 매핑은 `project_manager.py:152` 가 하며 이 파일 밖입니다. 경로를 직접 만들 때 `usa` 를 기억하세요.
4. **압축 안 함(zip 아님)** — 진짜 QuantConnect 포맷은 daily CSV 를 zip 으로 싸기도 하지만, 이 코드는 평문 `.csv` 를 그대로 둡니다. 로컬 lean CLI 가 평문을 읽도록 구성돼 동작하는 것이라, 정식 클라우드 포맷으로 옮기려면 압축 단계 추가가 필요합니다.
5. **`export` 는 예외를 삼킨다** — 한 종목 실패는 로그만 남기고 넘어갑니다(`L48-L49`). 전부 실패하면 빈 dict 반환. 호출자는 **반환 dict 의 키 개수로 성공 여부를 확인**해야지, 예외가 안 났다고 다 성공한 게 아닙니다.
6. **타임존 무시** — `strftime('%Y%m%d')` 는 날짜 부분만 씁니다. 입력 datetime 에 타임존/시각이 섞여 있으면 "날짜 경계"가 어긋날 수 있으나(예: UTC 자정 직전), 일봉 데이터에선 보통 문제 없습니다.
7. **문자열 정렬이 통하는 이유는 형식 덕분** — `sort_values('date_str')` 가 시간순이 되는 건 오직 `YYYYMMDD` 의 고정 자리수 덕분입니다. 날짜 포맷을 바꾸면 정렬이 깨질 수 있습니다.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **`date` 열을 required 검증에 추가**: `required_cols` 에 사실상 `date` 도 포함하거나, `L78` 직후 `if 'date' not in df_out.columns: raise ValueError(...)` 한 줄을 넣어 에러 메시지를 친절하게.
- **`market_type` 화이트리스트 검증**: `if market_type not in {"krx", "us"}: raise ValueError(...)` 로 오타를 조용히 US 처리하지 않고 명시적으로 거부.
- **QuantConnect 정식 zip 포맷 지원**: `aapl.csv` 를 `aapl.zip` 안에 넣는 옵션 추가 → 클라우드 Lean·LeanCLI 표준 데이터와 100% 호환.
- **분봉/틱 데이터 확장**: 지금은 daily 만. minute/second/tick 은 폴더(`.../minute/`)와 시간 포맷(밀리초 오프셋)이 달라, `resolution` 인자를 받아 포맷을 분기하면 고해상도 백테스트 가능.
- **거래정지·결측일 처리**: 중복 제거는 하지만 누락 거래일은 그대로 둡니다. Lean 의 fill-forward 정책과 맞추려면 거래일 캘린더로 reindex 하는 옵션을 추가.
- **데이터 검증 단계 추가**: 음수 가격, `high < low`, 0 거래량 등 이상치를 변환 전에 잡아 로그/예외 처리 → 쓰레기 데이터가 백테스트 결과를 오염시키는 것 방지.
- **`get_date_range` 를 변환 파이프라인에 연결**: 멀티 종목 백테스트 시 이 공통 구간으로 자동 클리핑해 "어떤 종목은 데이터 없음"으로 인한 불공정 비교를 차단.
- **반환 정보 강화**: `export` 가 경로뿐 아니라 종목별 (행 수, 시작/끝 날짜)를 함께 돌려주면 호출자가 데이터 품질을 즉시 점검 가능.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| Lean | QuantConnect 의 오픈소스 백테스트/실거래 엔진. 별도 프로세스(도커)로 돌며 **디스크 CSV** 를 읽어 백테스트 |
| equity daily CSV | Lean 의 일봉 주식 데이터 형식: `YYYYMMDD,open,high,low,close,volume`, **헤더 없음**, 날짜 오름차순 |
| `data/equity/{krx\|usa}/daily/{symbol}.csv` | Lean 데이터 폴더 경로 규칙. 컨테이너 안에선 `/Lean/Data/...`. 파일명은 **종목코드 소문자** |
| `market_type` | `"krx"`(한국·정수 원) 또는 `"us"`(미국·소수 2자리 달러). 폴더명은 us→**usa** 로 매핑(이 파일 밖) |
| `@classmethod` / `cls` | 인스턴스 없이 `클래스.메서드()` 로 호출. `cls` = 그 클래스 자신(다른 메서드 호출용) |
| `Path` (pathlib) | 경로를 객체로 다루는 도구. `Path("a") / "b.csv"` 로 OS 안전하게 조립 |
| `mkdir(parents=True, exist_ok=True)` | 중간 폴더까지 생성 + 이미 있어도 에러 안 냄(멱등) |
| `df.copy()` | DataFrame 사본 생성. 원본 오염 방지 |
| `reset_index()` | 행 인덱스를 일반 열로 끄집어냄 |
| `drop_duplicates(subset=['date_str'])` | 같은 날짜 중복 행 제거(첫 행만 유지) |
| `dt.strftime('%Y%m%d')` | datetime 열을 `YYYYMMDD` 문자열로 포맷 |
| `to_csv(index=False, header=False)` | 행번호·헤더 없이 순수 데이터만 CSV 로 저장 |
| `Bar` | OHLCV 한 캔들 pydantic 모델(`time/open/high/low/close/volume`). `bars_to_lean_csv` 입력 |
| `TYPE_CHECKING` / `List["Bar"]` | 실행 시엔 import 안 하고 타입 검사 때만. 따옴표 = 전방 참조(순환 import 방지) |
| 교집합 날짜 범위 | `get_date_range` 결과: 모든 종목이 **동시에** 데이터를 가진 구간(가장 늦은 시작~가장 이른 끝) |
