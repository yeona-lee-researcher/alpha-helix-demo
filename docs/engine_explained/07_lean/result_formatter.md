# `lean/kis_backtest/lean/result_formatter.py` — Lean 성적표 번역기 (완전 라인별 해설)

> 원본: `analytics/app/lean/kis_backtest/lean/result_formatter.py` (438줄)
> 이 문서는 `01_backtest/vbt_engine.md` 표준 형식을 따릅니다.

---

## 📌 이 파일 한눈에

이 파일은 **"외국 성적표를 우리 학교 양식으로 번역하는 번역기"** 입니다.

QuantConnect **Lean 엔진**(전 세계가 쓰는 오픈소스 백테스트 엔진)이 백테스트를 끝내면, `<backtestId>.json` 이라는 결과 파일을 토해냅니다. 그런데 이 JSON 은 **Lean 만의 양식**입니다 — 통계 키 이름이 `"Net Profit"`, `"Compounding Annual Return"` 처럼 영어이고, 퍼센트가 `"16.985%"` 같은 **문자열**로 들어있고, 자산곡선은 `[timestamp, open, high, low, close]` 같은 **5칸짜리 배열 리스트**입니다.

우리 프론트엔드(React Report 탭)는 그런 양식을 모릅니다. 우리 화면은 `total_return_pct`, `cagr`, `equity_curve` 같은 **우리 표준 키**, 그리고 **0~1 범위로 정규화된 숫자**를 기대합니다 (vbt_engine 과 같은 양식). 

이 파일이 바로 그 **번역(Lean 양식 → 우리 표준 양식)** 을 담당합니다.

핵심 함수는 다음과 같습니다:

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `parse_lean_value(...)` | `"16.985%"`, `"$1,000"` 같은 **문자열 숫자**를 깨끗한 `float` 로 | "16,985원" 라벨에서 숫자만 뽑기 |
| `ResultFormatter.to_api_response(...)` | **총괄 번역기.** Lean 결과 전체 → 우리 API 응답 한 덩어리 | 성적표 전체를 우리 양식 한 장으로 옮겨 적기 |
| `_convert_statistics(...)` | Lean 통계 키 → 우리 통계 키 + **퍼센트 0~1 정규화** | 영어 과목명·100점 만점을 우리 과목명·1.0 만점으로 |
| `_convert_equity_curve(...)` | `charts→Strategy Equity` → `{dates, values}` | 그래프용 좌표(날짜·금액)만 추려내기 |
| `_convert_drawdown_curve(...)` | `charts→Drawdown` → `{dates, values}` | 낙폭 그래프 좌표 추려내기 |
| `_convert_trades(...)` | `orders` → 체결된 거래 리스트 | 주문서 중 "체결됨"만 골라 표로 |
| `_calculate_symbol_results(...)` | 거래 → 종목별 수익률·승률(라운드트립) | 종목별 성적 합산 |
| `_error_response(...)` | 실패 시 **빈 값으로 채운 동일 구조** 반환 | 시험 못 봤어도 빈칸 성적표는 발급 |

**누가 호출하나?** → `app/lean/runner.py` 의 `_run` 흐름이 부릅니다. 순서는 이렇습니다:

```
runner.py
  → LeanExecutor.run(project)          # Lean CLI 로 실제 백테스트 실행 → LeanRun 반환
  → ResultFormatter.to_api_response(lean_run, ...)   # ★ 이 파일 — 결과를 우리 양식으로 번역
  → api_resp["result"]["statistics" / "equity_curve" / "trades"] 추출
```

즉 **Lean 이 일을 끝낸 직후, 결과를 프론트가 읽을 수 있게 다듬는 마지막 가공 단계**입니다. vbt_engine 의 `run_backtest()` 가 직접 dict 를 조립하는 것과 같은 역할이지만, 여기서는 **이미 만들어진 Lean JSON 을 다시 우리 양식으로 옮겨 적는다**는 점이 다릅니다.

> 💡 핵심 한 줄: vbt_engine 은 "처음부터 우리 양식으로 계산", 이 파일은 "남이 만든 결과를 우리 양식으로 번역". 그래서 이 파일에는 백테스트 **계산 로직이 없습니다** — 오직 **파싱·정규화·재배치**만 있습니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

### 1) Lean 결과 JSON `<backtestId>.json` 의 큰 구조

Lean 백테스트가 끝나면 만들어지는 결과 파일은 대략 이렇게 생겼습니다 (이 파일이 실제로 읽는 부분만):

```jsonc
{
  "statistics": {                       // ← _convert_statistics 가 읽음
    "Total Orders": "10",
    "Net Profit": "16.985%",            // 퍼센트가 문자열! (%, 콤마 포함)
    "Compounding Annual Return": "8.2%",
    "Sharpe Ratio": "1.34",
    "Sortino Ratio": "1.9",
    "Drawdown": "12.5%",                // 최대 낙폭(MDD)
    "Win Rate": "60%",
    "Profit-Loss Ratio": "1.8",
    "Total Fees": "$25.30",
    "Start Equity": "1000000",
    "End Equity": "1169850"
  },
  "charts": {                           // ← _convert_equity_curve / _convert_drawdown_curve 가 읽음
    "Strategy Equity": {
      "series": {
        "Equity": {
          "values": [
            [1704067200, 1000000, 1001000, 999000, 1000500],  // [ts, O, H, L, C]
            ...
          ]
        }
      }
    },
    "Drawdown": {
      "series": {
        "Equity Drawdown": {
          "values": [ [1704067200, 0.0], [1704153600, -1.2], ... ]  // [ts, value]
        }
      }
    }
  },
  "orders": {                           // ← _convert_trades 가 읽음
    "1": { "status": 3, "symbol": {"value": "AAPL"}, "direction": 0,
           "quantity": 10, "price": 150.0, "value": 1500.0, "time": "2024-01-02..." },
    "2": { ... }
  }
}
```

세 개의 큰 방(key)만 기억하면 됩니다:
- **`statistics`** — 숫자 성적표 (총수익·MDD·Sharpe…). **값이 `"16.985%"` 처럼 문자열**일 수 있다(그래서 `parse_lean_value` 가 필요).
- **`charts`** — 그래프용 시계열. `Strategy Equity`(자산곡선), `Drawdown`(낙폭곡선). 한 점이 **배열**(`[timestamp, ...]`).
- **`orders`** — 주문 내역. **dict**(키가 주문번호)이고, 각 주문엔 `status`(체결상태), `direction`(매수/매도) 등이 들어있음.

> 이 JSON 을 직접 읽어 dict 로 만들어 주는 것은 **이 파일이 아니라** `executor.py` 의 `LeanRun.load_result()` 입니다 (`json.loads(...)`). 이 파일은 그 dict 를 **받아서** 뒤지기만 합니다.

### 2) `status` 코드와 `direction` 코드 (Lean 내부 enum 숫자)

Lean 은 사람이 읽는 단어 대신 **숫자**로 상태를 표현합니다. 이 파일이 쓰는 두 가지:
- **`status == 3` = Filled(체결됨).** 그 외(미체결·취소 등)는 거래로 세지 않습니다.
- **`direction == 0` = Buy(매수), `1` = Sell(매도).**

> 💡 이 숫자들은 Lean 의 약속입니다. 코드 주석(`# status 3 = Filled`, `# 0=Buy, 1=Sell`)에 박혀 있습니다.

### 3) 퍼센트 "정규화" — 왜 100 으로 나누나?

Lean 은 `Net Profit = "16.985%"` 처럼 줍니다. `parse_lean_value` 가 `%` 를 떼면 **`16.985`** 라는 숫자가 됩니다. 그런데 우리 프론트/vbt_engine 양식은 **0~1 비율**(예: `0.16985`)을 기대합니다 — Python 의 `"{:.1%}".format(0.16985)` → `"17.0%"` 처럼 `%` 포매터에 바로 먹일 수 있는 형태이기 때문입니다.

그래서 이 파일은 **`16.985 / 100 = 0.16985`** 로 한 번 더 나눕니다. 이게 **정규화(normalization)** 입니다.

```
Lean:  "16.985%" ──parse_lean_value──▶ 16.985 ──÷100──▶ 0.16985  ←우리 양식
```

> ⚠️ 헷갈리는 포인트: `parse_lean_value` 는 `%` 기호만 떼지 **÷100 을 하지 않습니다**. ÷100 은 `_convert_statistics` 에서 따로 합니다. 둘을 혼동하면 100배 틀립니다.

### 4) `datetime.fromtimestamp(ts)` — Unix 타임스탬프 → 날짜

Lean 차트의 각 점은 `[timestamp, ...]` 로 시작하는데, 이 `timestamp` 는 **1970-01-01 부터 흐른 초(Unix epoch seconds)** 입니다. 사람이 못 읽으니 `datetime.fromtimestamp(1704067200)` → `2024-01-01` 처럼 날짜로 변환합니다.

### 5) 라운드트립(round-trip)과 FIFO — 승률 계산의 핵심

"승률"을 제대로 내려면 **매수 한 번 → 매도 한 번** 짝(라운드트립)을 만들어 "이 짝이 이익이었나?"를 봐야 합니다. 이 파일은 **FIFO(First-In-First-Out, 먼저 산 걸 먼저 판다)** 로 짝을 맞춥니다 — 매수가 들어오면 줄(`pending_buys`)에 세우고, 매도가 오면 **줄 맨 앞(가장 오래된 매수)** 을 꺼내 짝지웁니다.

```
매수 A → 줄: [A]
매수 B → 줄: [A, B]
매도   → A 와 짝! 라운드트립=(A_금액, 매도금액), 줄: [B]
```

---

## 🗺 전체 흐름도

```
        LeanRun (executor.py 가 만든 객체)
              │
              ▼
   ResultFormatter.to_api_response(run, symbols, ...)
              │
   ┌──────────┴───────────────────────────────────┐
   │  run.success == False?  ──예──▶ _error_response()  (빈 성적표, 동일 구조)
   │            │아니오
   ▼            ▼
 run.load_result()  →  result (전체 dict)
 run.get_statistics() → stats (statistics 방만)
              │
   ┌──────────┼──────────────┬─────────────┬──────────────┐
   ▼          ▼              ▼             ▼              ▼
_convert_   _convert_      _convert_     _convert_     _calculate_
statistics  equity_curve   drawdown_     trades        symbol_results
(키번역      (charts→        curve         (orders→      (trades→
 +÷100정규화) {dates,values}) (charts→...)  체결만 필터)   종목별 승률)
   │          │              │             │              │
   └──────────┴──────────────┴─────────────┴──────────────┘
              │
              ▼
   { currency, result:{ statistics, equity_curve, drawdown_curve,
                        trades, symbol_results, charts:{equity,drawdown} },
     data_range, cost_analysis, lean, strategy_name }
              │
              ▼
       runner.py 가 result.statistics / equity_curve / trades 추출 → 프론트
```

---

## 📖 라인별 해설

### A. 파일 설명서 + import — `L1-L12`

```python
# L1-L12
"""결과 포맷터

Lean 백테스트 결과를 API 응답 형식으로 변환.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from .executor import LeanRun

logger = logging.getLogger(__name__)
```

- **무엇을:** 파일 맨 위 docstring 이 "Lean 결과 → API 응답 변환" 이라는 이 파일의 한 줄 사명을 적습니다.
- `from datetime import datetime` — 타임스탬프를 날짜 문자열로 바꿀 때 씁니다(사전지식 4).
- `from typing import Any, Dict, List, Optional` — 타입힌트용. `Any`=아무 타입, `Optional[str]`=문자열이거나 None.
- **`from .executor import LeanRun`** — 같은 폴더 `executor.py` 의 `LeanRun` 클래스를 가져옵니다. 이게 입력의 정체: 이 파일은 `LeanRun` 객체를 받아 그 안의 `.load_result()`, `.get_statistics()`, `.success`, `.output_dir`, `.project.run_id`, `.started_at`, `.duration_seconds` 를 꺼내 씁니다.
- `logger = logging.getLogger(__name__)` — 로깅용. (이 파일에서는 실제로 로그를 남기진 않지만 관례적으로 둠.)

> 💡 초보 포인트: `from .executor` 의 맨 앞 점(`.`)은 **"같은 패키지(폴더) 안에서"** 라는 상대경로 표시입니다.

---

### B. 문자열 숫자 파서 `parse_lean_value()` — `L15-L27`

```python
# L15-L27
def parse_lean_value(val: Any) -> float:
    """Lean 값 파싱 (%, $, , 제거 후 float 반환)"""
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        val = val.replace("%", "").replace("$", "").replace(",", "").strip()
        try:
            return float(val)
        except ValueError:
            return 0.0
    return 0.0
```

- **무엇을:** 어떤 값이든 받아서 깨끗한 `float` 하나로 돌려주는 **만능 변환기**. Lean 통계 값이 숫자일 때도, `"16.985%"`·`"$1,234.50"` 같은 문자열일 때도 모두 안전하게 처리.
- **한 줄씩:**
  - `if val is None: return 0.0` — 값이 없으면 0.0 (KeyError·NoneType 에러 방지).
  - `if isinstance(val, (int, float)): return float(val)` — 이미 숫자면 그냥 float 로. (`int` 도 float 로 통일.)
  - `if isinstance(val, str):` — **문자열이면 청소.** `%`, `$`, `,`(천단위 콤마)를 모두 제거하고 양끝 공백(`strip()`)도 제거. 예: `"$1,234.50"` → `"1234.50"`.
    - `try: float(val) ... except ValueError: return 0.0` — 청소 후에도 숫자로 못 바꾸면(예: `"N/A"`) 0.0 으로 폴백.
  - `return 0.0` — 위 셋 중 아무것도 아니면(리스트·dict 등) 0.0.
- **왜 이렇게:** Lean JSON 의 통계 값 양식이 **일정하지 않기** 때문입니다. 어떤 키는 숫자, 어떤 키는 `"12.5%"` 문자열. 한 함수로 다 흡수해서 뒤 코드를 단순하게 만듭니다.

> ⚠️ 헷갈리는 포인트: 이 함수는 `%` 기호만 떼지 **÷100 을 하지 않습니다.** `"16.985%"` → `16.985`(여전히 "16.985 퍼센트"라는 뜻의 숫자). 진짜 비율 `0.16985` 로 만드는 건 `_convert_statistics` 의 몫입니다.

> 💡 docstring 의 "`%, $, ,` 제거"에서 세 번째 `,` 는 **천단위 콤마**를 뜻합니다(쉼표 나열이 아니라 실제 제거 대상).

---

### C. 클래스 머리 + 내부 파서 별칭 — `L30-L31, L142-L145`

```python
# L30-L31
class ResultFormatter:
    """Lean 결과 → API 응답 변환기"""
```

- **무엇을:** 번역 작업을 모은 클래스. 상태(인스턴스 변수)를 갖지 않고 전부 `@classmethod` 라서 **`ResultFormatter.to_api_response(...)` 처럼 객체 생성 없이** 바로 호출합니다(유틸리티 모음).

```python
# L142-L145
@classmethod
def _parse_value(cls, val: Any) -> float:
    """Lean 값 파싱 (%, $ 제거)"""
    return parse_lean_value(val)
```

- **무엇을:** 위 모듈함수 `parse_lean_value` 를 클래스 안에서 부르기 좋게 **얇게 감싼 별칭**. 본문은 단 한 줄(그대로 위임).
- **왜:** 클래스 메서드들이 `cls._parse_value(...)` 형태로 일관되게 쓰기 위함. 나중에 파싱 규칙을 바꿀 때 이 한 곳만 고치면 됩니다(간접층).

> 💡 초보 포인트: `@classmethod` 의 첫 인자 `cls` 는 **클래스 자신**입니다(인스턴스의 `self` 와 비슷). `cls._parse_value(x)` = "내 클래스의 _parse_value 를 부른다".

---

### D. 총괄 번역기 `to_api_response()` — `L33-L140` (이 파일의 지휘자)

#### D-1. 함수 머리 + 인자 — `L33-L58`

```python
# L33-L45
@classmethod
def to_api_response(
    cls,
    run: LeanRun,
    symbols: List[str],
    start_date: str,
    end_date: str,
    initial_capital: float,
    strategy_type: str,
    strategy_params: Dict[str, Any],
    currency: str = "KRW",
    strategy_name: Optional[str] = None,
) -> Dict:
```

- **무엇을:** 모든 번역의 입구. 받는 것:
  - `run` — Lean 실행 결과(`LeanRun`). 여기서 실제 통계·차트·주문이 나옴.
  - `symbols` — 종목 코드 리스트(예: `["AAPL"]`). 종목별 결과·data_range 에 씀.
  - `start_date / end_date` — 백테스트 기간(메타로 그대로 되돌려줌).
  - `initial_capital` — 초기 자본(통계 정규화 시 기준 금액으로 씀, 그리고 키 부재 폴백 기본값).
  - `strategy_type / strategy_params` — **인자로 받지만 응답에 직접 쓰이지 않습니다**(시그니처 호환·향후 확장용으로 받아둠). 실제 응답엔 `strategy_name` 만 들어감.
  - `currency` — "KRW"/"USD". 응답 상단에 표기(프론트가 ₩/$ 결정).
  - `strategy_name` — 커스텀 전략 이름(없으면 None). 응답 끝에 그대로 담김.

> ⚠️ 함정: `strategy_type`·`strategy_params` 는 시그니처에 있어 "쓰이겠지" 싶지만, 본문에서 **참조되지 않습니다**. runner.py 가 넘겨주긴 하나(L204-205) 번역 결과에 반영되진 않습니다. 향후 응답에 전략 메타를 넣으려는 자리로 이해하면 됩니다.

#### D-2. 실패 조기 탈출 — `L59-L60`

```python
# L59-L60
if not run.success:
    return cls._error_response(run.error, symbols, start_date, end_date, initial_capital, currency)
```

- **무엇을:** Lean 실행이 실패했으면(`run.success == False`) 더 파싱하지 말고 **빈 성적표(`_error_response`)** 를 즉시 반환.
- **왜:** 실패한 결과를 파싱하려다 `KeyError`·`NoneType` 에러로 이어지는 것을 막는 **가드(guard clause)**. 그리고 프론트가 항상 **같은 구조**를 받게 해 화면이 깨지지 않게 합니다.

#### D-3. 원본 로드 + 6대 변환 호출 — `L62-L79`

```python
# L62-L79
# Lean 결과 로드
result = run.load_result()
stats = run.get_statistics()

# 통계 변환
statistics = cls._convert_statistics(stats, initial_capital)

# 자산 곡선 변환
equity_data = cls._convert_equity_curve(result, initial_capital)

# 거래 내역 변환
trades = cls._convert_trades(result)

# 낙폭 곡선
drawdown_data = cls._convert_drawdown_curve(result)

# 종목별 결과
symbol_results = cls._calculate_symbol_results(trades, symbols)
```

- **무엇을:** 이 파일의 **뼈대**. 두 개의 원본을 꺼내고:
  - `result = run.load_result()` — **전체** JSON dict(`statistics`+`charts`+`orders` 모두). `executor.py` 가 `json.loads` 로 만든 것.
  - `stats = run.get_statistics()` — 그중 `statistics` 방만. (`result.get("statistics", {})` 와 동일.)
  그리고 5개의 전문 변환기에 각자 필요한 부분을 넘깁니다:
  - `_convert_statistics(stats, ...)` ← statistics 방 + 초기자본
  - `_convert_equity_curve(result, ...)` / `_convert_drawdown_curve(result)` ← charts 가 들어있는 전체 result
  - `_convert_trades(result)` ← orders 가 들어있는 전체 result
  - `_calculate_symbol_results(trades, symbols)` ← **이미 변환된 trades** 를 다시 입력으로 (원본이 아니라 D 단계의 산출물!).
- **왜 순서가 중요한가:** `symbol_results` 는 `trades` 의 결과에 **의존**합니다. 그래서 `_convert_trades` 가 먼저 와야 합니다.

> 💡 헷갈리는 포인트: `result` 와 `stats` 는 다릅니다. `result` = 집 전체, `stats` = 그 집의 statistics 방. equity/drawdown/trades 변환기는 charts·orders 방이 필요해서 **집 전체(`result`)** 를 받습니다.

#### D-4. 최종 응답 조립 — `L81-L140`

```python
# L81-L121 (요약)
return {
    "currency": currency,
    "result": {
        "id": f"bt_{run.project.run_id}",
        "ran_at": run.started_at.isoformat(),
        "duration_seconds": run.duration_seconds,
        "statistics": statistics,
        "equity_curve": equity_data["values"],
        "equity_dates": equity_data["dates"],
        "drawdown_curve": drawdown_data["values"],
        "trades": trades,
        "symbol_results": symbol_results,
        "charts": {
            "equity": { "type": "equity", "title": "자산 추이",
                        "labels": equity_data["dates"],
                        "datasets": [{ "label": "자산", "data": equity_data["values"],
                                       "color": "#00d4aa", "type": "line" }] },
            "drawdown": { "type": "drawdown", "title": "낙폭",
                          "labels": drawdown_data["dates"],
                          "datasets": [{ "label": "낙폭", "data": drawdown_data["values"],
                                         "color": "#ef4444", "type": "line" }] },
        },
    },
    ...
}
```

- **무엇을:** 변환 결과들을 **프론트가 기대하는 한 덩어리**로 조립.
- **`result` 방 내부:**
  - `"id": f"bt_{run.project.run_id}"` — 이 백테스트의 식별자(예: `bt_a1b2c3`). `run.project.run_id` 는 실행 폴더 식별자.
  - `"ran_at": run.started_at.isoformat()` — 실행 시각을 ISO 문자열(`2026-06-01T22:30:00`)로.
  - `"duration_seconds"` — 실행에 걸린 초.
  - `"statistics"` — D-3 의 번역된 통계 dict.
  - **`"equity_curve"` 는 값 배열, `"equity_dates"` 는 날짜 배열로 분리** 됩니다(같은 길이, 인덱스로 짝). vbt_engine 은 `[{date,value}]` 객체 리스트였는데, 여기선 **두 평행 배열**로 줍니다(Chart.js 류 친화).
  - `"drawdown_curve"` — 낙폭 값 배열(날짜는 charts 안에만 들어감).
  - `"trades" / "symbol_results"` — D-3 산출물 그대로.
  - **`"charts"`** — 프론트 차트 라이브러리가 바로 그릴 수 있는 형태로 한 번 더 포장: `labels`(x축 날짜) + `datasets`(선 하나: `label`·`data`·`color`·`type`). 자산은 청록(`#00d4aa`), 낙폭은 빨강(`#ef4444`).

> 💡 헷갈리는 포인트: 자산곡선이 **두 곳**에 들어갑니다 — 평평한 `equity_curve`/`equity_dates`(원시 배열, 가공용)와, 차트용으로 포장된 `charts.equity`(라벨+데이터셋). 같은 데이터의 두 표현입니다. 낙폭도 마찬가지(`drawdown_curve` + `charts.drawdown`).

```python
# L122-L140
    "data_range": {
        "start": start_date,
        "end": end_date,
        "symbols_used": len(symbols),
    },
    "cost_analysis": {
        "total_trades": statistics.get("num_trades", 0),
        "total_commission": statistics.get("total_commission", 0),
        "total_slippage": statistics.get("total_slippage", 0),
        "total_cost": statistics.get("total_cost", 0),
    },
    "lean": {
        "run_id": run.project.run_id,
        "output_dir": str(run.output_dir),
        "raw_statistics": stats,
    },
    # 커스텀 전략일 경우 이름 포함
    "strategy_name": strategy_name,
}
```

- `"data_range"` — 입력으로 받은 기간·종목 수를 **그대로 메아리**(프론트가 "몇 종목, 언제부터 언제까지"를 표시).
- `"cost_analysis"` — 비용 요약. **statistics 에서 다시 꺼내** 재배치(중복이지만 프론트가 비용 카드만 따로 읽기 편하라고). `total_slippage` 는 항상 0(아래 통계 변환에서 설명).
- `"lean"` — **디버그/원본 보존용**. `output_dir`(결과 폴더 경로), `raw_statistics`(번역 전 Lean 원본 통계 그대로). 번역이 의심스러울 때 원본과 대조 가능.
- `"strategy_name"` — 커스텀 전략 이름(없으면 None → JSON `null`).

---

### E. 통계 변환 `_convert_statistics()` — `L147-L187` (정규화의 핵심)

#### E-1. Lean 키 → 숫자 추출 — `L147-L162`

```python
# L147-L162
@classmethod
def _convert_statistics(cls, stats: Dict, initial_capital: float) -> Dict:
    """Lean 통계를 API 형식으로 변환"""
    # Lean 키 → 값 추출
    total_orders = int(cls._parse_value(stats.get("Total Orders", 0)))
    net_profit_pct = cls._parse_value(stats.get("Net Profit", 0))
    cagr = cls._parse_value(stats.get("Compounding Annual Return", 0))
    sharpe = cls._parse_value(stats.get("Sharpe Ratio", 0))
    sortino = cls._parse_value(stats.get("Sortino Ratio", 0))
    max_dd = cls._parse_value(stats.get("Drawdown", 0))
    win_rate = cls._parse_value(stats.get("Win Rate", 0))
    profit_loss_ratio = cls._parse_value(stats.get("Profit-Loss Ratio", 0))
    total_fees = cls._parse_value(stats.get("Total Fees", 0))

    start_equity = cls._parse_value(stats.get("Start Equity", initial_capital))
    end_equity = cls._parse_value(stats.get("End Equity", initial_capital))
```

- **무엇을:** Lean 의 **영어 키**를 하나씩 꺼내 `_parse_value` 로 깨끗한 숫자로. `stats.get("키", 기본값)` 패턴이라 **키가 없어도 기본값**으로 안전.
- 매핑(Lean → 우리 변수):
  - `"Total Orders"` → `total_orders` (정수로 변환, 거래 수)
  - `"Net Profit"` → `net_profit_pct` (총수익 %, 문자열일 수 있음)
  - `"Compounding Annual Return"` → `cagr` (연환산수익 %)
  - `"Sharpe Ratio"`/`"Sortino Ratio"` → 그대로(비율, %아님)
  - `"Drawdown"` → `max_dd` (MDD %, 보통 음수 또는 양수 표기)
  - `"Win Rate"` → `win_rate` (%), `"Profit-Loss Ratio"` → `profit_loss_ratio`(손익비)
  - `"Total Fees"` → `total_fees` (`$` 붙은 문자열 → 숫자)
  - `"Start Equity"`/`"End Equity"` → 시작/종료 자산. **없으면 `initial_capital`** 을 기본값으로(키 부재 방어).

> ⚠️ 함정: `Total Orders` 는 **주문 수**이지 "라운드트립(매수+매도 짝) 거래 수"가 아닙니다. 매수1·매도1 이면 라운드트립 1건이지만 `Total Orders=2`. 아래 `num_trades` 가 이 주문 수를 그대로 쓰므로 의미를 알고 봐야 합니다.

#### E-2. 총수익 금액 + 퍼센트 정규화 — `L164-L170`

```python
# L164-L170
total_return = end_equity - start_equity

# 퍼센트 값 정규화 (0.0~1.0 범위, Python % 포매터 호환)
total_return_pct_normalized = net_profit_pct / 100  # 16.985 → 0.16985
cagr_normalized = cagr / 100
max_drawdown_normalized = abs(max_dd) / 100
win_rate_normalized = win_rate / 100
```

- **무엇을:** 
  - `total_return = end_equity - start_equity` — **금액** 기준 순손익(예: 1,169,850 − 1,000,000 = 169,850).
  - `..._normalized = .../100` — 사전지식 3의 **÷100 정규화**. `16.985`(퍼센트 숫자) → `0.16985`(비율).
  - **`max_drawdown_normalized = abs(max_dd)/100`** — MDD 는 `abs()` 로 **부호 제거**. Lean 이 `-12.5` 든 `12.5` 든 항상 양의 비율 `0.125` 로 통일(낙폭 "크기"만 의미 있으므로).
- **왜 ÷100:** 프론트와 vbt_engine 양식이 0~1 비율을 쓰기 때문(주석 "Python % 포매터 호환" = `f"{0.16985:.1%}"` → `"17.0%"`).

> ⚠️ 핵심 함정: `cagr` 처럼 보이는 변수들은 정규화 **전**(예: `8.2`)이고, `_normalized` 가 붙은 것이 정규화 **후**(`0.082`)입니다. 응답에는 정규화된 값이 들어갑니다. 두 단계를 헷갈리면 100배 차이.

#### E-3. 우리 양식 dict 반환 — `L172-L187`

```python
# L172-L187
return {
    "total_return": total_return,
    "total_return_pct": total_return_pct_normalized,
    "cagr": cagr_normalized,
    "sharpe_ratio": sharpe,
    "sortino_ratio": sortino,
    "max_drawdown": initial_capital * max_drawdown_normalized if max_dd else 0,
    "max_drawdown_pct": max_drawdown_normalized,
    "num_trades": total_orders,
    "win_rate": win_rate_normalized,
    "profit_factor": profit_loss_ratio,
    "avg_trade_return": total_return_pct_normalized / total_orders if total_orders > 0 else 0,
    "total_commission": total_fees,
    "total_slippage": 0,
    "total_cost": total_fees,
}
```

- **무엇을:** 최종 통계 dict. 한 줄씩:
  - `"total_return"` — 금액 순손익.
  - `"total_return_pct"` / `"cagr"` / `"max_drawdown_pct"` / `"win_rate"` — **정규화된 비율**(0~1).
  - `"sharpe_ratio"` / `"sortino_ratio"` — 비율 지표 그대로(%아님, 정규화 안 함).
  - **`"max_drawdown"`** — MDD 를 **금액**으로 환산: `초기자본 × MDD비율`. 단 `if max_dd else 0` — MDD 가 0(또는 falsy)이면 0. (근사치: 실제 고점은 초기자본보다 클 수 있으나 초기자본 기준 추정.)
  - `"num_trades"` — `total_orders`(주문 수, E-1 함정 참고).
  - `"profit_factor"` — Lean 의 `Profit-Loss Ratio`(손익비) 를 그대로 매핑.
  - **`"avg_trade_return"`** — `총수익비율 ÷ 주문수`(주문 1건당 평균 수익). `total_orders > 0` 일 때만, 아니면 0 (0으로 나누기 방지).
  - **`"total_slippage": 0`** — Lean 결과에서 슬리피지를 따로 못 뽑아 **항상 0**. (`total_commission`·`total_cost` 는 둘 다 `total_fees` 로, 슬리피지가 0이라 수수료=총비용.)

> ⚠️ 함정: `avg_trade_return` 의 분모가 **주문 수(`num_trades`)** 라서, 매수1·매도1(라운드트립 1)이면 분모가 2가 됩니다 — "1거래당 평균"이라기보다 "1주문당 평균"입니다. 또한 분자가 **정규화된 비율**(0~1)이라 단위에 주의.

---

### F. 자산곡선 변환 `_convert_equity_curve()` — `L189-L221`

```python
# L189-L196
@classmethod
def _convert_equity_curve(cls, result: Dict, initial_capital: float) -> Dict:
    """자산 곡선 변환"""
    charts = result.get("charts", {})
    strategy_equity = charts.get("Strategy Equity", {})
    series = strategy_equity.get("series", {})
    equity_series = series.get("Equity", {})
    values = equity_series.get("values", [])
```

- **무엇을:** 깊이 4단계 중첩(`charts → Strategy Equity → series → Equity → values`)을 **`.get(키, {})` 사다리**로 안전하게 내려갑니다. 중간에 어떤 방이 없어도 `{}` 로 폴백해 `KeyError` 없이 끝까지 도달.
- `values` = 자산곡선 점들의 리스트. 각 점은 `[timestamp, open, high, low, close]`(또는 `[timestamp, value]`).
- `initial_capital` 인자는 받지만 **본문에서 쓰이지 않습니다**(시그니처 일관성용).

```python
# L198-L221
    if not values:
        return {"dates": [], "values": []}

    dates = []
    equity_values = []

    for point in values:
        # Lean format: [timestamp, open, high, low, close] or [timestamp, value]
        if not isinstance(point, list) or len(point) < 2:
            continue

        timestamp = point[0]
        # 마지막 값(close) 사용
        value = point[4] if len(point) > 4 else point[1]

        try:
            dt = datetime.fromtimestamp(timestamp)
            dates.append(dt.strftime("%Y-%m-%d"))
        except (ValueError, OSError, TypeError):
            dates.append(str(timestamp))

        equity_values.append(float(value))

    return {"dates": dates, "values": equity_values}
```

- `if not values: return {"dates": [], "values": []}` — 점이 없으면 빈 곡선(프론트가 빈 차트라도 그릴 수 있게 **구조는 유지**).
- `for point in values:` 각 점마다:
  - `if not isinstance(point, list) or len(point) < 2: continue` — **방어**: 점이 리스트가 아니거나 칸이 2개 미만이면 건너뜀(깨진 데이터 무시).
  - `timestamp = point[0]` — 첫 칸은 항상 시각.
  - **`value = point[4] if len(point) > 4 else point[1]`** — 칸이 5개 이상이면 **`point[4]`(close, 종가 자산)** 를, 아니면 `point[1]`(단순 값)을 자산값으로. OHLC 형식의 자산곡선에서 "그날 마감 자산"을 쓰겠다는 뜻.
  - `datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d")` — Unix 초 → `"2024-01-02"`. 실패하면(`ValueError/OSError/TypeError`) 타임스탬프를 **문자열 그대로** 넣어 최소한 깨지지 않게.
  - `equity_values.append(float(value))` — 자산값을 float 로.
- **반환:** `{"dates": [...], "values": [...]}` — 두 평행 배열(같은 길이). `to_api_response` 가 이걸 `equity_curve`/`equity_dates` 와 `charts.equity` 로 나눠 씁니다.

> 💡 헷갈리는 포인트: `point[4]`(close)를 쓰는 이유 — Lean 의 자산곡선 시리즈가 캔들(OHLC)처럼 5칸으로 올 때가 있고, 그중 의미 있는 건 **그날 마감 자산값=close** 이기 때문입니다.

---

### G. 낙폭곡선 변환 `_convert_drawdown_curve()` — `L223-L255`

```python
# L223-L235
@classmethod
def _convert_drawdown_curve(cls, result: Dict) -> Dict:
    """낙폭 곡선 변환"""
    charts = result.get("charts", {})
    drawdown_chart = charts.get("Drawdown", {})
    series = drawdown_chart.get("series", {})

    # Lean의 Drawdown 차트에서 직접 가져옴
    dd_series = series.get("Equity Drawdown", {})
    values = dd_series.get("values", [])

    if not values:
        return {"dates": [], "values": []}
```

- **무엇을:** 자산곡선과 거의 같은 구조지만 경로가 `charts → Drawdown → series → Equity Drawdown → values`. 똑같은 `.get` 사다리.
- `equity_curve` 와의 차이는 **차트 이름**(`Drawdown` vs `Strategy Equity`)과 **시리즈 이름**(`Equity Drawdown` vs `Equity`)뿐.

```python
# L237-L255
    dates = []
    dd_values = []

    for point in values:
        if not isinstance(point, list) or len(point) < 2:
            continue

        timestamp = point[0]
        value = point[1]

        try:
            dt = datetime.fromtimestamp(timestamp)
            dates.append(dt.strftime("%Y-%m-%d"))
        except (ValueError, OSError, TypeError):
            dates.append(str(timestamp))

        dd_values.append(float(value))

    return {"dates": dates, "values": dd_values}
```

- **자산곡선과 결정적 차이:** 여기선 **`value = point[1]`** (두 번째 칸). 낙폭 시리즈는 `[timestamp, value]` 2칸 형식이라 `point[4]`(close)를 쓰지 않습니다. 낙폭 값은 보통 **음수 %**(예: `-12.5`).
- 나머지(빈 값 폴백·방어·날짜 변환)는 자산곡선과 동일.

> ⚠️ 헷갈리는 포인트: equity 는 `point[4]`(있으면), drawdown 은 항상 `point[1]`. 두 곡선의 칸 인덱스가 다릅니다 — Lean 의 시리즈 형식이 다르기 때문.

---

### H. 거래내역 변환 `_convert_trades()` — `L257-L295`

```python
# L257-L263
@classmethod
def _convert_trades(cls, result: Dict) -> List[Dict]:
    """거래 내역 변환"""
    orders = result.get("orders", {})

    if isinstance(orders, dict):
        orders = list(orders.values())
```

- **무엇을:** `orders` 를 꺼냄. Lean 의 `orders` 는 **dict**(키=주문번호)일 때가 많아, `dict` 면 `.values()` 로 **값들만 리스트**로 변환(키 버림). 이미 리스트면 그대로.

```python
# L265-L295
    trades = []
    for order in orders:
        # status 3 = Filled
        if order.get("status") != 3:
            continue

        symbol_data = order.get("symbol", {})
        symbol_code = symbol_data.get("value", "") if isinstance(symbol_data, dict) else str(symbol_data)

        direction = order.get("direction", 0)  # 0=Buy, 1=Sell
        quantity = abs(order.get("quantity", 0))
        price = order.get("price", 0)
        value = order.get("value", quantity * price)

        # 수수료 추출 (Lean은 orderFee가 없을 수 있음)
        order_fee = 0

        trades.append({
            "datetime": order.get("time", ""),
            "symbol": symbol_code.upper(),
            "symbol_name": symbol_code.upper(),
            "side": "buy" if direction == 0 else "sell",
            "price": price,
            "quantity": int(quantity),
            "value": abs(value),
            "commission": order_fee,
            "slippage": 0,
            "pnl": None,
        })

    return trades
```

- **한 줄씩:**
  - **`if order.get("status") != 3: continue`** — **체결(Filled=3)된 주문만** 거래로 인정. 취소·미체결은 건너뜀.
  - **종목 코드 추출:** `symbol` 이 `{"value": "AAPL"}` dict 면 `symbol_data.get("value")`, 아니면 통째로 문자열화. (Lean 의 symbol 표현이 객체일 수 있어 방어.)
  - `direction` 0/1 → 아래에서 `"buy"/"sell"` 문자열로 변환.
  - `quantity = abs(...)` — 수량은 절대값(매도 시 음수일 수 있어 부호 제거 후 `int` 로).
  - **`value = order.get("value", quantity * price)`** — 거래 금액. 없으면 **수량×가격으로 직접 계산**(폴백).
  - **`order_fee = 0`** — 주석대로 Lean 주문에 수수료 필드가 없을 수 있어 **항상 0** 으로 둠(수수료는 통계의 `Total Fees` 로만 집계).
  - `trades.append({...})` — 우리 표준 거래 dict 로 재구성:
    - `datetime`=체결 시각(`time`, 없으면 빈 문자열), `symbol`/`symbol_name`=대문자 종목, `side`=`buy/sell`, `price`, `quantity`(정수), `value`=`abs(value)`(양수 금액), `commission`=0, `slippage`=0, `pnl`=None(개별 거래 손익은 계산 안 함).
- **반환:** 체결 거래들의 리스트. 이게 `to_api_response` 의 `trades` 가 되고, **`_calculate_symbol_results` 의 입력**도 됩니다.

> ⚠️ 함정: `commission`·`slippage`·`pnl` 이 거래 단위에서는 전부 0/None 입니다. 비용은 오직 통계의 `Total Fees`(전체 합)에서만 옵니다. "거래별 수수료"를 화면에 그리려 하면 0만 나옵니다.

---

### I. 종목별 결과 `_calculate_symbol_results()` — `L297-L378` (라운드트립 승률)

#### I-1. 종목별 누산기 초기화 — `L297-L318`

```python
# L297-L318
@classmethod
def _calculate_symbol_results(cls, trades: List[Dict], symbols: List[str]) -> List[Dict]:
    """종목별 결과 계산
    win_rate 계산 방식:
    1. 매수-매도 쌍을 매칭하여 라운드트립 생성
    2. 각 라운드트립의 수익 여부 판단
    3. 수익 라운드트립 / 전체 라운드트립 * 100
    """
    symbol_data = {}

    for symbol in symbols:
        symbol_data[symbol.upper()] = {
            "symbol": symbol.upper(),
            "symbol_name": symbol.upper(),
            "sector": "",
            "buy_amount": 0,
            "sell_amount": 0,
            "num_trades": 0,
            "round_trips": [],   # [(buy_value, sell_value), ...]
            "pending_buys": [],  # 아직 매도되지 않은 매수
        }
```

- **무엇을:** 입력 종목들마다 **빈 누산기(집계 상자)** 를 미리 만듭니다(거래가 0건이라도 종목이 결과에 나오게). 각 상자: 매수합·매도합·거래수·라운드트립 목록·대기 매수 큐.
- `pending_buys` = FIFO 큐(사전지식 5). `round_trips` = 완성된 매수-매도 짝.

#### I-2. 시간순 정렬 + FIFO 매칭 — `L320-L348`

```python
# L320-L348
    # 거래를 시간순으로 정렬
    sorted_trades = sorted(trades, key=lambda x: x.get("datetime", ""))

    for trade in sorted_trades:
        symbol = trade.get("symbol", "").upper()
        if symbol not in symbol_data:
            symbol_data[symbol] = {
                "symbol": symbol, "symbol_name": symbol, "sector": "",
                "buy_amount": 0, "sell_amount": 0, "num_trades": 0,
                "round_trips": [], "pending_buys": [],
            }

        symbol_data[symbol]["num_trades"] += 1
        value = trade.get("value", 0)

        if trade.get("side") == "buy":
            symbol_data[symbol]["buy_amount"] += value
            symbol_data[symbol]["pending_buys"].append(value)
        else:  # sell
            symbol_data[symbol]["sell_amount"] += value
            # FIFO 방식으로 매수와 매칭
            if symbol_data[symbol]["pending_buys"]:
                buy_value = symbol_data[symbol]["pending_buys"].pop(0)
                symbol_data[symbol]["round_trips"].append((buy_value, value))
```

- **`sorted(trades, key=lambda x: x.get("datetime", ""))`** — 거래를 **시각 문자열 순**으로 정렬(라운드트립 짝이 시간 순서대로 맞도록). ISO 문자열이라 사전식 정렬=시간순.
- `if symbol not in symbol_data:` — 입력 `symbols` 에 없던 종목이 거래에 등장하면 **즉석으로 누산기 추가**(방어).
- `num_trades += 1` — 거래 1건 카운트(매수·매도 각각 셈).
- **매수면:** `buy_amount` 에 금액 더하고 `pending_buys` 큐 **뒤에 추가**.
- **매도면:** `sell_amount` 더하고, 대기 매수가 있으면 **큐 맨 앞(`pop(0)`, 가장 오래된 매수)** 을 꺼내 `(buy_value, value)` 짝으로 `round_trips` 에 기록 → **FIFO**.

> 💡 헷갈리는 포인트: `pop(0)` 가 FIFO 의 핵심 — 리스트 맨 앞을 빼서 "먼저 산 걸 먼저 판다". 매도가 매수보다 많으면 큐가 비어 매칭 안 됨(그 매도는 라운드트립 미생성).

#### I-3. 종목별 수익률·승률 산출 — `L350-L378`

```python
# L350-L378
    results = []
    for data in symbol_data.values():
        buy = data["buy_amount"]
        sell = data["sell_amount"]

        if buy > 0:
            return_pct = (sell - buy) / buy * 100
        else:
            return_pct = 0

        # win_rate: 라운드트립 기반 정확한 계산
        round_trips = data["round_trips"]
        if round_trips:
            winning_trips = sum(1 for buy_val, sell_val in round_trips if sell_val > buy_val)
            win_rate = (winning_trips / len(round_trips)) * 100
        else:
            # 라운드트립이 없으면 전체 수익률 기반 추정
            win_rate = 100.0 if return_pct > 0 else 0.0 if return_pct < 0 else 0.0

        results.append({
            "symbol": data["symbol"],
            "symbol_name": data["symbol_name"],
            "sector": data["sector"],
            "total_return_pct": round(return_pct, 2),
            "num_trades": data["num_trades"],
            "win_rate": round(win_rate, 1),
        })

    return results
```

- **`return_pct = (sell - buy) / buy * 100`** — 종목 수익률 = (총매도금액 − 총매수금액) ÷ 총매수금액 × 100. **여기서는 ÷100 안 함** — 종목별 결과는 통계와 달리 **퍼센트 숫자 그대로**(예: `16.99`) 둡니다. `buy==0` 이면 0(0으로 나누기 방지).
- **승률:**
  - 라운드트립이 있으면: `이긴 짝(매도>매수) ÷ 전체 짝 × 100`. 정확한 거래 기반 승률.
  - 라운드트립이 없으면(매도 미발생 등): **전체 수익률 부호로 추정** — 수익률 양수면 100%, 음수면 0%, 0이면 0%.
- `total_return_pct` 는 소수 2자리, `win_rate` 는 1자리로 반올림.

> ⚠️ 일관성 함정: 종목별 `total_return_pct`·`win_rate` 는 **퍼센트 숫자(0~100)** 인데, E-3 의 전체 통계 `total_return_pct`·`win_rate` 는 **비율(0~1)** 입니다. **같은 키 이름이 두 곳에서 단위가 다릅니다** — 프론트에서 종목 표와 요약 카드를 다르게 포맷해야 합니다.

---

### J. 에러 응답 `_error_response()` — `L380-L438`

```python
# L380-L437 (요약)
@classmethod
def _error_response(cls, error, symbols, start_date, end_date, initial_capital, currency="KRW") -> Dict:
    """에러 응답 생성"""
    return {
        "error": True,
        "message": error or "백테스트 실행 실패",
        "currency": currency,
        "result": {
            "id": f"bt_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "ran_at": datetime.now().isoformat(),
            "duration_seconds": 0,
            "statistics": { ...모든 통계 0... },
            "equity_curve": [], "equity_dates": [], "drawdown_curve": [],
            "trades": [],
            "symbol_results": [ {symbol별 0 채운 결과} for symbol in symbols ],
            "charts": {},
        },
        "data_range": { "start": start_date, "end": end_date, "symbols_used": len(symbols) },
    }
```

- **무엇을:** Lean 실행 실패 시(`run.success==False`) 반환하는 **빈 성적표**. 성공 응답과 **구조가 똑같되 값만 0/빈 리스트**.
- **왜:** 프론트가 항상 동일한 키 구조를 받게 해서, 에러가 나도 화면이 `undefined` 로 깨지지 않게 합니다. `"error": True` + `"message"` 로 에러임을 알리되, `statistics`·`symbol_results` 등은 0/빈값으로 채워 안전하게 그려지게.
- `id` 는 성공 때(`run.project.run_id` 기반)와 달리 **현재 시각**(`%Y%m%d%H%M%S`)으로 생성(실패라 run_id 가 없을 수 있어서).
- `symbol_results` 는 입력 종목마다 0 채운 항목을 만들어 줌(comprehension).
- **차이점:** 성공 응답에 있던 `cost_analysis`·`lean`·`strategy_name` 키가 **여기엔 없습니다**(에러 시 생략).

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 모음)

1. **퍼센트 2단계 변환** — `parse_lean_value` 는 `%` 만 떼고(`"16.985%"`→`16.985`), `_convert_statistics` 가 `÷100` 으로 비율화(`0.16985`). 한 단계만 적용하거나 둘 다 빼먹으면 **100배 오차**.
2. **같은 키, 다른 단위** — 전체 통계의 `total_return_pct`/`win_rate` 는 **비율(0~1)**, 종목별 결과의 동명 키는 **퍼센트(0~100)**. 프론트 포맷 분리 필수.
3. **키 부재 방어가 곳곳에** — 모든 추출이 `dict.get(키, 기본값)` + `.get(키, {})` 사다리. 그래서 Lean JSON 구조가 조금 달라도 **터지지 않고 0/빈값**으로 흐름. 반대로 말하면 **잘못된 키를 써도 조용히 0** 이 되므로 키 오타를 에러로 못 잡음.
4. **`status==3`(Filled) 만 거래** — 미체결·취소 주문은 통째로 무시. 거래 수가 기대보다 적으면 체결 안 된 주문이 빠진 것.
5. **수수료/슬리피지/pnl 은 거래 단위로 0/None** — 비용은 통계 `Total Fees` 합계로만 존재. `total_slippage` 는 항상 0(Lean 에서 미추출).
6. **자산 vs 낙폭 칸 인덱스 차이** — equity 는 `point[4]`(close, 있으면), drawdown 은 `point[1]`. Lean 시리즈 형식이 달라서 그렇다.
7. **`num_trades` = 주문 수** — 라운드트립 수가 아님(매수·매도 각각 셈). `avg_trade_return` 분모도 이 주문 수.
8. **`max_drawdown`(금액) 은 근사** — `초기자본 × MDD비율`. 실제 고점은 초기자본보다 클 수 있어 약간의 과소추정 가능.
9. **타임스탬프 변환 실패 폴백** — `fromtimestamp` 실패 시 날짜 대신 **타임스탬프 문자열**이 들어감(차트 x축이 숫자로 보일 수 있음).
10. **`strategy_type`·`strategy_params` 미사용** — 인자로 받지만 응답에 반영 안 됨. 기대하고 넘기면 사라짐.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **단위 일관화:** 종목별 결과도 통계처럼 0~1 비율로 정규화(혹은 둘 다 퍼센트로 통일)해서 "같은 키=같은 단위" 원칙을 세우기. 현재 혼용이 가장 큰 학습/버그 포인트.
- **거래별 수수료/PnL 실제 채우기:** Lean 주문에 `orderFee`(또는 `OrderFee.Value.Amount`)가 있으면 파싱해 `commission` 을 진짜 값으로. 라운드트립별 실현손익(`pnl`)도 `(sell_value - buy_value)` 로 채우면 거래 테이블이 풍부해짐.
- **슬리피지 분리 집계:** `total_slippage=0` 하드코딩 대신, Lean 의 `Estimated Strategy Capacity`/체결가-시장가 차이로 슬리피지 근사.
- **MDD 금액 정확화:** 자산곡선에서 직접 고점-저점을 찾아 `peak_equity × MDD비율` 로 계산(초기자본 가정 제거).
- **방어 vs 침묵 균형:** 핵심 키(`statistics`·`charts`) 부재 시 조용한 0 대신 **경고 로그**를 남겨 "Lean 출력이 비었음"을 운영자가 알게.
- **라운드트립 부분 매도 처리:** 현재 FIFO 는 매수금액 한 덩어리만 짝지음. 부분 체결/부분 매도면 수량·잔량 기반 매칭으로 정밀화.
- **`raw_statistics` 활용:** 응답 `lean.raw_statistics` 에 원본이 보존돼 있으니, 프론트 "고급" 탭에서 Lean 원본 지표를 그대로 보여주는 디버그 뷰 추가.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **Lean** | QuantConnect 의 오픈소스 백테스트 엔진. 결과를 `<backtestId>.json` 으로 출력 |
| `LeanRun` | `executor.py` 의 실행결과 객체. `.load_result()`(전체 JSON)·`.get_statistics()`(통계방)·`.success` 등 제공 |
| `parse_lean_value` | `"16.985%"`·`"$1,234"` 같은 문자열 숫자를 `%`,`$`,`,` 떼고 float 로 |
| **정규화(normalize)** | 퍼센트 숫자(16.985)를 0~1 비율(0.16985)로 ÷100 |
| `statistics` (Lean) | 영어 키 통계방. `Net Profit`·`Drawdown`·`Sharpe Ratio` 등 |
| `charts` (Lean) | 그래프 시계열방. `Strategy Equity`(자산)·`Drawdown`(낙폭) |
| `series.values` | 차트 점 리스트. 한 점=`[timestamp, ...]` 배열 |
| `orders` (Lean) | 주문 dict. 각 주문에 `status`(3=체결)·`direction`(0=매수,1=매도) |
| **status 3 = Filled** | 체결된 주문만 거래로 인정 |
| **direction 0/1** | 0=Buy(매수), 1=Sell(매도) |
| **라운드트립(round-trip)** | 매수 1 + 매도 1 한 쌍. 승률 계산 단위 |
| **FIFO / `pop(0)`** | 먼저 산 매수를 먼저 매도와 짝지음(큐 맨 앞 꺼내기) |
| `datetime.fromtimestamp` | Unix 초(epoch) → 날짜 객체 |
| `equity_curve` / `equity_dates` | 자산값 배열 / 그에 대응하는 날짜 배열(평행 두 배열) |
| `_error_response` | 실패 시 구조는 같고 값만 0/빈 리스트인 안전 응답 |
| `.get(키, 기본값)` | 키가 없어도 기본값을 주는 안전 접근(이 파일 전체의 방어 패턴) |
