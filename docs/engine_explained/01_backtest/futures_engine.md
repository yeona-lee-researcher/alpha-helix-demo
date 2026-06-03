# `backtest/futures_engine.py` — 선물(레버리지·청산) 백테스트 완전 라인별 해설

> 원본: `analytics/app/backtest/futures_engine.py` (362줄)
> 형식은 [표준 예시 `vbt_engine.md`](vbt_engine.md) 와 동일합니다. 먼저 그 문서를 읽고 오면 이해가 훨씬 빠릅니다.
> 이 파일은 `vbt_engine.py` 와 달리 **vectorbt 를 쓰지 않고, 직접 `for` 루프로 하루하루** 매매를 시뮬레이션합니다. 그래서 "백테스트 내부가 실제로 어떻게 돌아가는지"를 가장 적나라하게 보여주는 교재용 코드입니다.

---

## 📌 이 파일 한눈에

이 파일은 **"코인 선물(레버리지 매매) 시뮬레이터"** 입니다. 비트코인·이더리움 같은 **USDT 영구선물**을 대상으로, 레버리지(빚을 내서 키운 베팅)·스탑로스(손절)·테이크프로핏(익절)·펀딩비용(선물 특유의 보유 비용)까지 반영해 "과거에 이 전략으로 매매했다면 결과가 어땠을지"를 계산합니다.

`vbt_engine.py` 와의 가장 큰 차이 3가지:

| 구분 | `vbt_engine.py` (현물) | `futures_engine.py` (선물) |
|---|---|---|
| 매매 방향 | **롱(매수)만** (사거나 안 사거나) | **롱 + 숏 양방향** (오를 때도 내릴 때도 베팅) |
| 엔진 | vectorbt (벡터 한 방) | **직접 `for` 루프** (하루씩 손으로 계산) |
| 선물 고유 요소 | 없음 | **레버리지 · 펀딩비용 · 스탑/익절** |

핵심 함수는 크게 5묶음입니다:

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `_load_ohlcv(...)` | 가격(시가/고가/저가/종가/거래량) 데이터를 DB→바이낸스→야후 순으로 구해옴 | 재료를 냉장고→마트→편의점 순으로 찾기 |
| `_sma_cross_signal / _rsi_signal / _momentum_signal` | 전략별로 날짜마다 +1(롱)/-1(숏)/0(중립) 신호 생성 | "이 날엔 오른다/내린다/모르겠다" 판정표 |
| `_get_funding_cost(...)` | 선물 보유 시 8시간마다 떼이는 펀딩비를 일별로 집계 | 선물을 들고 있으면 내는 "방세" |
| `backtest_futures(...)` | 위를 합쳐 하루씩 루프 돌며 진입·청산·손익 계산 → 성적표 | 레시피대로 실제 요리해서 맛 평가 |
| `get_futures_signal(...)` | 오늘 당장 롱/숏/중립 중 뭘 할지 + 주문 초안 | 지금 이 순간 베팅 방향 |

**누가 호출하나?** → `app/main.py` 의 두 엔드포인트:
- `POST /futures/backtest` → `backtest_futures()` (231~362줄 주변, `main.py:666`)
- `GET /futures/signal` → `get_futures_signal()` (`main.py:699`)

둘 다 `Depends(require_internal_token)` 로 보호됩니다 — 즉 **백엔드(Spring)만** 내부 토큰을 들고 부를 수 있습니다. (외부 직접 호출 차단.)

> 📌 메모리 참조: 이 엔진은 "Binance 통합(완료·E2E검증)" 의 일부입니다. SPOT(현물) 매매와 함께 선물(FUTURES)까지 KIS 와 같은 파이프라인으로 묶는 작업의 산물이며, 자동매매가 가능해도 **실주문은 항상 승인 게이트(BrokerAccount.tradingEnabled + lastVerifiedAt)** 를 거칩니다. 이 파이썬 파일 자체는 **신호·시뮬레이션만** 하고, 실제 집행은 Spring Boot 측이 합니다(파일 상단 docstring 3번, 그리고 `get_futures_signal` 의 "정보용" 주석 참고).

---

## 🧠 사전 지식 (이거 모르면 막힘)

선물은 현물보다 개념이 몇 겹 더 쌓여 있습니다. 아래 7개만 잡으면 이 파일이 술술 읽힙니다.

#### 1) 선물(Futures)·영구선물(Perpetual) 이란?
- **현물(Spot)**: 코인을 진짜로 사서 지갑에 보유. 가격이 오른 만큼만 번다.
- **선물(Futures)**: 코인을 직접 사지 않고 "오를지/내릴지에 **베팅**"하는 계약. 만기가 없는 게 **영구선물(Perpetual)** = 바이낸스 USDT-M 선물.
- 핵심 이점: **숏(공매도)** 이 가능 — 가격이 **내려도 돈을 번다**. (이 파일이 `+1 롱 / -1 숏` 양방향을 다루는 이유.)

#### 2) 레버리지(Leverage) = "빌린 돈으로 키운 베팅"
- 레버리지 5배(`leverage=5`)는 내 돈 100달러로 **500달러어치** 포지션을 잡는 것.
- 가격이 1% 오르면 내 손익은 **5%**. 반대로 1% 내리면 **-5%**. **수익도 손실도 N배**로 커진다.
- 그래서 선물은 "고위험 고수익". 레버리지가 클수록 **조금만 반대로 가도 전 재산이 날아가는(청산)** 거리가 가까워진다.

#### 3) 청산(Liquidation) = "증거금이 다 녹으면 강제 종료"
- 레버리지 매매는 거래소가 빌려준 돈으로 한다. 손실이 내가 맡긴 증거금(margin)을 다 까먹기 직전에 거래소가 **강제로 포지션을 닫아버린다** = 청산.
- 비유: 전세 끼고 집 산 사람이 집값이 전세금 밑으로 떨어지면 집을 강제 처분당하는 것.
- ⚠️ **이 파일은 진짜 "청산가" 계산을 하지 않습니다.** 대신 `stop_loss_pct`(예: -5%) 로 손절해서 청산 전에 빠져나오는 방식으로 **근사**합니다. (고도화 아이디어에서 다룹니다.)

#### 4) 펀딩레이트(Funding Rate) = "선물 보유의 방세"
- 영구선물은 만기가 없어서, 선물 가격이 현물 가격에 붙어있도록 **8시간마다 롱↔숏이 서로 돈을 주고받습니다**(하루 3회).
- **펀딩레이트가 양수(+)** 면 롱이 과열 → **롱이 숏에게 지불**. 음수(-)면 그 반대.
- 즉 포지션을 오래 들고 있으면 방향에 따라 **돈이 줄줄 새거나(비용) 들어옵니다(수취)**. 현물 백테스트엔 없는 선물 고유 비용. (`_get_funding_cost`, 그리고 루프 안 220~227줄이 이걸 처리.)

#### 5) 노셔널(Notional) = "실제로 베팅한 총액"
- 내 자본이 아니라 **레버리지까지 곱한 포지션의 명목 가치**.
- 이 파일 공식: `노셔널 = 자본 × max_position_pct × leverage`.
  예) 자본 10,000 × 0.5(절반만 사용) × 5배 = **25,000 USD** 포지션. 수수료·펀딩·손익은 전부 이 25,000 기준으로 계산.

#### 6) 롱/숏과 손익 부호 — 이 파일 최대의 "헷갈림 포인트"
- **롱(position=+1)**: 가격이 오르면 이익. 손익률 = `(현재가 - 진입가) / 진입가`.
- **숏(position=-1)**: 가격이 **내리면** 이익. 그래서 위 식에 `× position(-1)` 을 곱해 부호를 뒤집는다.
- 이 파일 231줄의 `pnl_pct = (price - entry_px) / entry_px * position` 한 줄이 **롱·숏을 동시에 처리하는 마법**입니다. (롱이면 ×1, 숏이면 ×-1.)

#### 7) `pandas DataFrame` = "여러 열을 가진 표"
- `vbt_engine` 은 종가 한 줄(Series)만 썼지만, 선물은 시가/고가/저가/종가/거래량이 모두 있는 **표(DataFrame)** 를 씁니다.
- `df["close"]` = 종가 열 한 줄(Series), `df.iterrows()` = 표를 **한 행(=하루)씩** 꺼내는 반복.

---

## 🗺 전체 흐름도

```
                FuturesParams (symbol, leverage, strategy, 손절/익절, 기간...)
                                   │
            ┌──────────────────────┴───────────────────────┐
            ▼                                               ▼
   backtest_futures()                              get_futures_signal()
            │                                               │ (최근 3개월만)
   ① _load_ohlcv(symbol, period)  ←── DB → Binance → Yahoo (3중 폴백)
            │  df = [시가·고가·저가·종가·거래량] 표
            ▼
   ② _get_signal_series()  →  날짜별 +1/-1/0  (sma_cross / rsi_reversal / momentum)
            │
            ▼
   ③ _get_funding_cost()   →  날짜별 펀딩비용 Series
            │
            ▼
   ④ for ts, row in df.iterrows():     ← 하루씩 직접 루프 (vectorbt 없음!)
        ├ 펀딩비용 차감/수취 (보유 중일 때만)
        ├ 청산 판정:  스탑로스 / 테이크프로핏 / 신호반전  → trades 기록
        ├ 신규 진입:  position==0 이고 신호 있으면 진입(수수료·슬리피지)
        └ equity_curve 적립 + max_drawdown 갱신
            │
            ▼
   ⑤ 통계 집계 (총수익·연환산·MDD·Sharpe·승률) → dict 반환 → main.py → 백엔드
```

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) + import — `L1-L26`

```python
# L1-L15
"""
Phase 4: Binance Futures 자동매매 엔진.

기능:
  1. BTCUSDT / ETHUSDT 등 USDT-M 영구 선물 전략 백테스트 (펀딩레이트 비용 포함)
  2. 실시간 신호 생성 (SMA 크로스, RSI 반전, 모멘텀)
  3. 자동주문 실행 (단, BrokerAccount.tradingEnabled=true + lastVerifiedAt 확인 필요)
  4. 리스크 관리 (최대 포지션, 스탑로스, 레버리지 제한)

사용 방법:
  from app.backtest.futures_engine import FuturesParams, backtest_futures, get_futures_signal
  params = FuturesParams(symbol="BTCUSDT", leverage=5, strategy="sma_cross")
  result = backtest_futures(params)
  signal = get_futures_signal(params)
"""
```
- **무엇을**: 파일 맨 위 설명서(docstring). 실행되지 않고 사람이 읽는 안내문입니다. "이 파일은 바이낸스 선물 백테스트·신호·(승인 전제) 자동주문·리스크관리를 한다"고 요약.
- **헷갈리는 포인트**: 3번 "자동주문 실행"이 적혀 있다고 이 파이썬 파일이 진짜 주문을 쏘는 건 **아닙니다**. 실제 집행 코드는 여기 없고(파일 전체에 주문 전송 함수 없음), Spring Boot 가 승인 게이트를 거쳐 합니다. 이 파일은 **시뮬레이션 + 신호 + "주문 초안"** 까지만.
- "사용 방법" 4줄은 이 파일을 어떻게 쓰는지 보여주는 **예제 코드**(import → 파라미터 만들기 → 백테스트/신호 호출).

```python
# L16-L26
from __future__ import annotations
import logging
import os
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)
```
- `from __future__ import annotations` — 타입힌트를 늦게 평가하게 하는 파이썬 주문(초보는 "최신 타입표기 허용" 정도로). `vbt_engine` 과 동일.
- `import logging` + `log = logging.getLogger(__name__)` — 이 파일 전용 **로그 기록기**. 뒤에서 "바이낸스 실패 → 야후로 폴백" 같은 상황을 `log.info/log.warning` 으로 남깁니다. (운영 중 무슨 일이 있었는지 추적용.)
- `from datetime import date, timedelta` — **날짜 계산**용. "오늘로부터 365일 전"을 구할 때 씀(`_load_ohlcv`).
- `dataclass, field` — 설정 묶음 클래스를 짧게 만드는 도구. (`field` 는 import 됐지만 실제로는 안 쓰입니다 — 일종의 미사용 import.)
- `numpy(np)`, `pandas(pd)` — 숫자/표 계산. **여기엔 `vectorbt` 가 없습니다.** 그래서 매매 루프를 직접 손으로 짭니다.
- `import os` 도 상단에 있지만 이 파일에서 실제 사용처가 없습니다(미사용 import).

> 💡 초보 포인트: `vbt_engine` 은 `import vectorbt as vbt` 로 백테스트를 라이브러리에 통째로 맡겼습니다. 이 파일은 그게 없어서 **포트폴리오 회계(자본 증감·손익·MDD)를 전부 직접** 합니다. 그래서 "백테스트 엔진의 속살"을 배우기 가장 좋은 코드예요.

---

### B. 파라미터 묶음 `FuturesParams` — `L31-L53`

```python
# L31-L53
@dataclass
class FuturesParams:
    symbol: str = "BTCUSDT"
    strategy: str = "sma_cross"        # sma_cross | rsi_reversal | momentum | funding_arb
    leverage: int = 5                   # 레버리지 (1~20 권장, 최대 125)
    initial_capital: float = 10_000.0  # USD
    fees: float = 0.0004               # Binance Maker/Taker (0.04%)
    slippage: float = 0.001            # 0.1%
    # SMA 크로스
    sma_fast: int = 20
    sma_slow: int = 50
    # RSI
    rsi_period: int = 14
    rsi_long: float = 30.0             # 과매도 → 롱 진입
    rsi_short: float = 70.0            # 과매수 → 숏 진입
    # 모멘텀
    momentum_days: int = 20
    # 리스크
    max_position_pct: float = 0.5      # 자본의 최대 50% 포지션
    stop_loss_pct: float = 0.05        # 5% 스탑로스
    take_profit_pct: float = 0.15      # 15% 테이크프로핏
    # 기간
    period: str = "1y"                 # "1y" | "2y" | "6m"
```
- **무엇을**: 백테스트의 모든 손잡이(다이얼)를 한 상자에 모은 설정 클래스. `vbt_engine` 의 `BacktestParams` 와 같은 역할.
- 줄별 의미:
  - `symbol="BTCUSDT"` — 대상 종목. 바이낸스 표기(BTC/USDT 영구선물).
  - `strategy="sma_cross"` — 어떤 신호 규칙을 쓸지. 주석엔 4개(`sma_cross | rsi_reversal | momentum | funding_arb`)가 적혀 있지만, **실제 구현은 앞 3개뿐**입니다. `funding_arb` 는 주석에만 있고 코드에 없어 호출하면 에러(아래 `_get_signal_series` 참고). ⚠️
  - `leverage=5` — 레버리지 배수. 주석은 "최대 125"라지만, 실제로 `main.py:677` 이 `max(1, min(req.leverage, 20))` 로 **20배에서 자릅니다**(안전장치). 즉 API 로 들어오면 1~20 사이로 강제.
  - `initial_capital=10_000.0` — 시작 자본(USD). `10_000` 의 밑줄은 가독성용 천 단위 구분(파이썬 문법, 값은 10000).
  - `fees=0.0004` — 바이낸스 선물 수수료 0.04% (현물 vbt_engine 의 0.25%보다 훨씬 쌈 — 선물 수수료가 낮다).
  - `slippage=0.001` — 체결 오차 0.1%.
  - `sma_fast=20, sma_slow=50` — 단기/장기 이동평균 기간.
  - `rsi_period/long/short=14/30/70` — RSI 기간과 과매도(30)/과매수(70) 기준.
  - `momentum_days=20` — 모멘텀을 볼 기간(20일).
  - `max_position_pct=0.5` — 한 번에 자본의 **절반만** 베팅에 사용(노셔널 계산에 들어감).
  - `stop_loss_pct=0.05` — 손익이 -5% 되면 손절. `take_profit_pct=0.15` — +15% 되면 익절.
  - `period="1y"` — 백테스트 기간(1년치 데이터).

> 💡 초보 포인트: 손절·익절은 **포지션 손익률 기준**(레버리지 적용 후의 `pnl_pct`)입니다. 레버리지 5배에서 가격이 1% 빠지면 `pnl_pct` 는 -1%가 아니라... 잠깐, 여기 함정이 있습니다. 이 파일의 `pnl_pct` 는 **가격 변화율 그대로**이고 레버리지는 손익 "금액(노셔널)"에만 곱해집니다. 즉 손절은 "가격이 5% 빠지면"으로 작동합니다. (자세한 건 ⚠️ 섹션 참고.)

> ⚠️ `funding_arb` 함정: 주석엔 4번째 전략으로 적혀 있지만 `_get_signal_series` 에 해당 분기가 없어, `strategy="funding_arb"` 로 호출하면 `ValueError: Unknown strategy` 가 납니다. 주석과 코드 불일치.

---

### C. 데이터 로더 `_load_ohlcv()` — `L56-L117`

이 파일의 "재료 조달" 담당. **3중 폴백**(DB → 바이낸스 → 야후)이 핵심입니다.

#### 야후 심볼 매핑 표 — `L56-L66`
```python
# L56-L66
# Yahoo Finance fallback 심볼 매핑 (Binance 선물 API가 미국 AWS에서 차단될 때 사용)
_YF_SYMBOL_MAP: dict[str, str] = {
    "BTCUSDT":  "BTC-USD",
    "ETHUSDT":  "ETH-USD",
    "SOLUSDT":  "SOL-USD",
    "BNBUSDT":  "BNB-USD",
    "DOGEUSDT": "DOGE-USD",
    "XRPUSDT":  "XRP-USD",
    "ADAUSDT":  "ADA-USD",
    "AVAXUSDT": "AVAX-USD",
}
```
- **무엇을**: 바이낸스 표기(`BTCUSDT`)를 야후 파이낸스 표기(`BTC-USD`)로 바꾸는 **번역 사전**.
- **왜**: 바이낸스 선물 API(`fapi.binance.com`)는 미국 AWS IP에서 **HTTP 451**(법적 차단)로 막힐 수 있습니다. 우리 서버가 미국 EC2 라서, 바이낸스가 막히면 야후에서 같은 코인의 가격을 대신 받아옵니다. (야후는 선물이 아닌 현물 가격이지만, 백테스트 신호 계산엔 종가만 필요해서 근사로 충분.)
- **헷갈리는 포인트**: 이 표에 없는 심볼(예: 듣보 코인)은 야후 폴백이 불가 → 바이낸스도 막히면 데이터 없음 에러로 끝납니다.

#### 함수 머리 + 기간 계산 — `L71-L80`
```python
# L71-L80
def _load_ohlcv(symbol: str, period: str) -> pd.DataFrame:
    """DB 또는 Binance에서 선물 OHLCV 로드. Binance 차단 시 Yahoo Finance fallback."""
    from app.data import market_db, binance_client

    days_map = {"6m": 180, "1y": 365, "2y": 730, "3y": 1095, "5y": 1825}
    days_back = days_map.get(period, 365)
    start = (date.today() - timedelta(days=days_back)).isoformat()

    # DB에서 먼저 조회
    df = market_db.query_ohlcv(symbol, tf="1d", source="binance", start=start, limit=days_back + 10)
```
- **무엇을**: 데이터를 가져오는 함수. 반환은 `DataFrame`(OHLCV 표).
- `from app.data import ...` 가 **함수 안에** 있는 이유: 모듈을 처음 부를 때만 로드하는 **지연 임포트(lazy import)**. 파일 맨 위에 두면 import 시점에 DB·바이낸스 모듈이 다 끌려와 무거워지고, 순환참조 위험도 있어서 함수 안으로 미룹니다. (파이썬에서 흔한 패턴.)
- `days_map` — 기간 문자열을 일수로 번역. `.get(period, 365)` = 표에 없는 값이면 **기본 365일**.
- `start = (오늘 - days_back일).isoformat()` — 조회 시작 날짜를 `"2025-06-01"` 같은 문자열로.
- 첫 시도: `market_db.query_ohlcv(...)` 로 **로컬 DB(MySQL)** 에서 먼저 찾는다. (`market_db.py:158` 의 실제 함수 — `ts, open, high, low, close, volume` 등을 가진 DataFrame 반환.) `limit=days_back + 10` 의 `+10` 은 여유분.

#### 폴백 1: 바이낸스 직접 호출 — `L82-L91`
```python
# L82-L91
    if df.empty:
        log.info("futures_engine: fetching %s from Binance", symbol)
        try:
            df = binance_client.get_klines_full(symbol, interval="1d", start_date=start)
            if not df.empty:
                market_db.upsert_ohlcv(df, tf="1d")
                df = market_db.query_ohlcv(symbol, tf="1d", source="binance", start=start)
        except Exception as e:
            log.warning("Binance fetch failed (%s) — trying Yahoo Finance fallback", e)
            df = pd.DataFrame()
```
- **무엇을**: DB가 비었으면(`df.empty`) 바이낸스 API 에서 일봉 전체를 받아온다(`get_klines_full`, `binance_client.py:109` — 페이지네이션으로 긴 기간 수집).
- 받아온 데이터를 `upsert_ohlcv` 로 **DB에 저장(캐싱)** 한 뒤, 다시 DB에서 표준 형태로 읽어옵니다(`query_ohlcv`). → 다음 호출부턴 DB에서 바로 나오게 함.
- **왜 try/except**: 바이낸스가 451 차단·네트워크 오류 등으로 실패하면 예외가 납니다. 그걸 잡아 로그만 남기고 `df` 를 빈 표로 두어 **다음 폴백(야후)** 으로 넘어가게 합니다. (실패해도 죽지 않게.)

#### 폴백 2: 야후 파이낸스 — `L93-L110`
```python
# L93-L110
    # Yahoo Finance fallback: Binance.com fapi가 미국 AWS IP에서 HTTP 451 차단될 때
    if df.empty:
        yf_symbol = _YF_SYMBOL_MAP.get(symbol.upper())
        if yf_symbol:
            log.info("futures_engine: Yahoo Finance fallback %s → %s", symbol, yf_symbol)
            try:
                import yfinance as yf
                yf_df = yf.download(yf_symbol, start=start, auto_adjust=True, progress=False)
                if not yf_df.empty:
                    yf_df.columns = [
                        c[0].lower() if isinstance(c, tuple) else c.lower()
                        for c in yf_df.columns
                    ]
                    yf_df.index = pd.to_datetime(yf_df.index, utc=True)
                    yf_df.index.name = "ts"
                    return yf_df[["open", "high", "low", "close", "volume"]].copy()
            except Exception as yf_err:
                log.warning("Yahoo Finance fallback also failed: %s", yf_err)
```
- **무엇을**: 여전히 데이터가 없으면 야후에서 받아온다.
- `yf_symbol = _YF_SYMBOL_MAP.get(...)` — 위 번역 사전으로 야후 심볼을 구함. 사전에 없으면 `None` → 이 블록 통째로 건너뜀.
- `yf.download(..., auto_adjust=True, progress=False)` — 야후에서 일봉 다운로드. `progress=False` 는 진행바 끔.
- **컬럼 정리 트릭**(`yf_df.columns = [...]`): 야후가 종종 컬럼을 `("Close", "BTC-USD")` 같은 **튜플(멀티인덱스)** 로 주거나 `"Close"`(대문자)로 줍니다. 이 한 줄이 튜플이면 첫 요소를, 아니면 그대로 받아 **전부 소문자로** 통일(`close`, `open`...). → 뒤 코드가 `df["close"]` 로 일관되게 접근하도록.
  - `isinstance(c, tuple)` = "이 컬럼명이 튜플이냐?" 판정. 비유: 택배 송장이 2단(상자/내용물)이면 상자 라벨만, 1단이면 그대로 읽기.
- `yf_df.index = pd.to_datetime(..., utc=True)` — 날짜 인덱스를 UTC 시간대로. `index.name = "ts"` — 인덱스 이름을 `ts`(timestamp)로 맞춤(DB 경로와 동일하게).
- **여기서 바로 `return`** 합니다. 야후 경로는 이미 인덱스가 날짜라서, 아래 DB용 후처리(`set_index("ts")`)를 거치지 않고 곧장 반환.
- ⚠️ **헷갈리는 포인트**: 야후 폴백에는 `funding`(펀딩) 데이터가 없습니다. 야후는 현물 가격이라 선물 펀딩 개념이 없죠. 펀딩비용은 뒤 `_get_funding_cost` 가 별도로 바이낸스에서 받아오는데, 야후 폴백 상황(=바이낸스 막힘)에선 그것도 실패해 **펀딩비용이 0으로** 처리됩니다(그 함수의 except 폴백). 즉 폴백 모드에선 펀딩이 빠진 약식 백테스트가 됩니다.

#### 최종 정리 + 실패 처리 — `L112-L117`
```python
# L112-L117
    if df.empty:
        raise ValueError(f"No OHLCV data for {symbol}")

    df = df.set_index("ts").sort_index()
    df.index = pd.to_datetime(df.index)
    return df
```
- 야후까지 실패하면 `df` 가 여전히 비어 있어 `ValueError` → 호출자(main.py)가 500 에러로 변환.
- DB 경로로 온 데이터는 `ts`(날짜) 컬럼을 **인덱스로 세우고**(`set_index`), 시간순 정렬(`sort_index`), 날짜 타입 보장(`to_datetime`) 후 반환. → 이제 `df.index` 가 날짜축이 됩니다.

> 💡 초보 포인트: 폴백 순서를 "냉장고(DB) → 마트(바이낸스) → 편의점(야후)"로 외우세요. 가장 빠르고 싼 곳(이미 저장된 DB)부터, 안 되면 점점 외부로 나갑니다. 그리고 **외부에서 받으면 DB에 저장**해 다음엔 빠르게.

---

### D. 신호 생성기들 — `L122-L163`

전략별로 **날짜마다 +1(롱)/-1(숏)/0(중립)** 한 줄을 만듭니다. `vbt_engine` 은 `entries/exits` 두 장의 boolean 표였지만, 여기선 **방향이 들어간 정수 한 장**(롱·숏·중립)이라는 게 차이.

#### SMA 크로스 — `L122-L129`
```python
# L122-L129
def _sma_cross_signal(df: pd.DataFrame, fast: int, slow: int) -> pd.Series:
    """1=롱, -1=숏, 0=중립."""
    sma_fast = df["close"].rolling(fast).mean()
    sma_slow = df["close"].rolling(slow).mean()
    signal = pd.Series(0, index=df.index)
    signal[sma_fast > sma_slow] = 1
    signal[sma_fast < sma_slow] = -1
    return signal
```
- `df["close"].rolling(20).mean()` — 종가의 **20일 이동평균**. `rolling(n)` = "n개씩 창을 미끄러뜨리며" + `.mean()` = 그 창의 평균. (vectorbt 의 `vbt.MA.run` 을 순수 pandas 로 직접 한 것.)
- `signal = pd.Series(0, index=df.index)` — 일단 전부 0(중립)으로 깔고 시작.
- `signal[sma_fast > sma_slow] = 1` — 단기선이 장기선보다 **위에 있는 모든 날** 을 롱(+1). 아래면 숏(-1).
- **`crossed_above` 와의 결정적 차이**: `vbt_engine` 은 "교차하는 **순간**"만 신호였지만, 여기는 "**위에 있는 내내**" +1 입니다. 즉 이건 "교차 이벤트"가 아니라 **"상태(state)"** 신호. → 그래서 백테스트 루프에서 진입/청산은 "상태가 바뀌는 순간(`position != sig`)"으로 따로 잡습니다(아래 backtest 루프 참고).

```
   sma_fast(20) ───╮          ╭──────  +1 구간(롱)
   sma_slow(50) ───┼──────────┼──────
                   ▼          ▲
              여기부터 -1(숏)  여기부터 +1(롱)
   ※ "위/아래 구간 전체"가 신호 (교차 순간만이 아님)
```

#### RSI 반전 — `L132-L142`
```python
# L132-L142
def _rsi_signal(df: pd.DataFrame, period: int, long_th: float, short_th: float) -> pd.Series:
    """RSI 기반 신호. 과매도→롱, 과매수→숏."""
    delta = df["close"].diff()
    gain  = delta.clip(lower=0).rolling(period).mean()
    loss  = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    signal = pd.Series(0, index=df.index)
    signal[rsi < long_th]  = 1   # 과매도 → 롱
    signal[rsi > short_th] = -1  # 과매수 → 숏
    return signal, rsi
```
- **무엇을**: RSI(상대강도지수)를 **직접 계산**하고, 과매도(<30)면 롱, 과매수(>70)면 숏. `vbt_engine` 은 `vbt.RSI.run` 한 줄이었지만 여기선 공식 그대로 손으로 짭니다 — RSI 정의를 배우기 좋은 코드.
- 한 줄씩:
  - `delta = df["close"].diff()` — 전일 대비 가격 변화(오늘 - 어제).
  - `gain = delta.clip(lower=0).rolling(period).mean()` — 오른 날의 상승폭만 남기고(`clip(lower=0)` = 음수는 0으로) 평균 → **평균 상승폭**.
  - `loss = (-delta.clip(upper=0)).rolling(period).mean()` — 내린 날의 하락폭만(양수는 0으로 자른 뒤 부호 뒤집어 양수화) 평균 → **평균 하락폭**.
  - `rs = gain / loss.replace(0, np.nan)` — 상승/하락 비율. `loss` 가 0이면 0으로 나누기가 되니 `replace(0, np.nan)` 로 NaN 처리(에러 방지).
  - `rsi = 100 - 100/(1+rs)` — RSI 표준 공식. 결과는 0~100.
- `signal[rsi < 30] = 1` (과매도면 반등 기대 → 롱), `signal[rsi > 70] = -1` (과매수면 하락 기대 → 숏). **이름 그대로 "반전(reversal)" 전략** = 평균회귀 철학.
- **반환이 튜플** `return signal, rsi` 인 점 주의: 신호뿐 아니라 **rsi 값 자체**도 돌려줍니다. `get_futures_signal` 이 화면에 "현재 RSI 값"을 표시하려고 받아 쓰기 때문(아래 참고).

> ⚠️ 타입힌트 함정: 함수 시그니처는 `-> pd.Series` 라고 적혀 있지만 실제로는 `(signal, rsi)` **튜플**을 반환합니다. 타입힌트와 실제 반환이 불일치(동작엔 문제 없지만 정적분석기는 경고).

#### 모멘텀 — `L145-L151`
```python
# L145-L151
def _momentum_signal(df: pd.DataFrame, days: int) -> pd.Series:
    """모멘텀: N일 수익률 양수→롱, 음수→숏."""
    mom = df["close"].pct_change(days)
    signal = pd.Series(0, index=df.index)
    signal[mom > 0] = 1
    signal[mom < 0] = -1
    return signal
```
- `df["close"].pct_change(20)` — "20일 전 대비 몇 % 변했나"(20일 수익률).
- 양수면 추세추종으로 롱, 음수면 숏. SMA 와 마찬가지로 **상태 신호**(구간 전체).

#### 전략 디스패처 `_get_signal_series()` — `L154-L163`
```python
# L154-L163
def _get_signal_series(df: pd.DataFrame, params: FuturesParams) -> pd.Series:
    if params.strategy == "sma_cross":
        return _sma_cross_signal(df, params.sma_fast, params.sma_slow)
    elif params.strategy == "rsi_reversal":
        sig, _ = _rsi_signal(df, params.rsi_period, params.rsi_long, params.rsi_short)
        return sig
    elif params.strategy == "momentum":
        return _momentum_signal(df, params.momentum_days)
    else:
        raise ValueError(f"Unknown strategy: {params.strategy}")
```
- **무엇을**: 전략 이름에 따라 위 3개 함수 중 하나로 **연결(라우팅)**. `vbt_engine._signals` 의 if/elif 분기와 같은 역할.
- `sig, _ = _rsi_signal(...)` — RSI 는 `(signal, rsi)` 튜플을 주므로 신호만 받고 rsi 값은 `_`(버림 변수)로 무시. (백테스트엔 rsi 값 자체가 필요 없음.)
- 셋 중 어디에도 안 걸리면 `ValueError`. → 앞서 말한 `funding_arb` 가 여기서 걸려 에러 납니다.

---

### E. 펀딩비용 집계 `_get_funding_cost()` — `L168-L182`

```python
# L168-L182
def _get_funding_cost(symbol: str, index: pd.DatetimeIndex) -> pd.Series:
    """펀딩레이트를 일봉 인덱스로 집계 (1일 3회 → 일별 합계)."""
    try:
        from app.data import binance_client
        df_f = binance_client.get_funding_rate(symbol, limit=1000)
        if df_f.empty:
            return pd.Series(0.0, index=index)
        df_f["date"] = pd.to_datetime(df_f["timestamp"]).dt.date
        df_f["fundingRate"] = pd.to_numeric(df_f["fundingRate"], errors="coerce").fillna(0)
        daily = df_f.groupby("date")["fundingRate"].sum()
        daily.index = pd.to_datetime(daily.index)
        return daily.reindex(index, fill_value=0.0)
    except Exception as e:
        log.warning("funding rate fetch failed: %s", e)
        return pd.Series(0.0, index=index)
```
- **무엇을**: 선물 보유 비용(펀딩)을 **일별 시리즈**로 만들어 백테스트가 차감/수취할 수 있게 함. 펀딩은 하루 3회(8시간마다)라서, **하루치를 합산**(`groupby("date").sum()`)합니다.
- 한 줄씩:
  - `get_funding_rate(symbol, limit=1000)` — 바이낸스에서 최근 펀딩레이트 1000건(`binance_client.py:177`).
  - `df_f.empty` → 빈 표면 전부 0인 시리즈 반환(펀딩 무시).
  - `df_f["date"] = pd.to_datetime(df_f["timestamp"]).dt.date` — 타임스탬프에서 **날짜만** 추출(시각 버림).
  - `groupby("date")[...].sum()` — 같은 날의 3회 펀딩을 더해 일별 합계.
  - `daily.reindex(index, fill_value=0.0)` — 일봉 가격 인덱스에 맞춰 정렬하고, 펀딩이 없는 날은 0으로 채움.
- `try/except` 전체 감싸기: 펀딩 조회가 실패해도(바이낸스 차단 등) **0 시리즈로 폴백**해 백테스트가 죽지 않게.

> 🐛 **여기 실제 버그가 있습니다 (확인됨).** `get_funding_rate`(`binance_client.py:194-196`)가 반환하는 DataFrame 의 컬럼명은 `timestamp`, **`funding_rate`**(스네이크), `symbol` 입니다. 그런데 이 함수는 `df_f["fundingRate"]`(카멜)로 접근합니다. → 실제로는 `KeyError: 'fundingRate'` 가 나고, 그게 `except` 에 잡혀 **항상 0 펀딩으로 폴백**됩니다. 즉 **펀딩비용 기능이 사실상 동작하지 않고**, 조용히 0 처리되어 `funding_cost_total_usd` 가 늘 0.0 으로 나옵니다.
> - 올바른 수정: `df_f["funding_rate"]` 로 컬럼명을 맞추거나, `get_funding_rate` 의 반환 컬럼을 `fundingRate` 로 바꾸기. (메모리의 "Binance 통합 E2E 검증 통과"는 주문/시그널 경로 검증이라, 이 펀딩 회계 버그까지는 잡히지 않은 것으로 보입니다.)
> - ⚠️ `pd.to_datetime(df_f["timestamp"])` 의 `timestamp` 컬럼은 실제 반환에 존재하므로 그 줄은 정상. 문제는 `fundingRate` 한 군데뿐.

---

### F. 백테스트 엔진 `backtest_futures()` — `L187-L313` (이 파일의 알맹이)

#### 함수 머리 + 데이터/신호/펀딩 준비 — `L187-L199`
```python
# L187-L199
def backtest_futures(params: FuturesParams) -> dict:
    """
    선물 전략 백테스트.
    ...
    """
    df = _load_ohlcv(params.symbol, params.period)
    signal = _get_signal_series(df, params)
    funding_cost_series = _get_funding_cost(params.symbol, df.index)
```
- 세 재료를 차례로 준비: ① 가격표 `df`, ② 방향신호 `signal`(+1/-1/0), ③ 펀딩비용 `funding_cost_series`.
- docstring 에 반환 구조가 적혀 있습니다(stats / equity_curve / trades / funding_cost_total).

#### 회계 상태변수 초기화 — `L201-L213`
```python
# L201-L213
    capital   = params.initial_capital
    position  = 0       # 현재 포지션: +1 롱, -1 숏, 0 없음
    entry_px  = 0.0
    entry_date = None
    equity_curve = []
    trades = []
    max_equity = capital
    max_drawdown = 0.0
    total_funding_cost = 0.0

    # position_size = 자본 × max_position_pct × leverage (USD 노셔널)
    def notional(cap):
        return cap * params.max_position_pct * params.leverage
```
- **무엇을**: 루프를 돌며 갱신할 "장부" 변수들을 세팅. vectorbt 가 내부에서 자동으로 해주던 회계를 여기선 **손으로 직접** 합니다.
  - `capital` — 현재 잔고(USD). 손익·비용이 여기 더해지고 빠짐.
  - `position` — 지금 롱(+1)/숏(-1)/없음(0).
  - `entry_px` — 진입 가격. `entry_date` — 진입 날짜.
  - `equity_curve` — 날짜별 잔고 기록(자산곡선). `trades` — 청산된 거래 내역.
  - `max_equity` / `max_drawdown` — 최고점 잔고와 그 대비 최대 낙폭(MDD) 추적용.
  - `total_funding_cost` — 누적 펀딩비용.
- `notional(cap)` — 내부 헬퍼. "현재 자본 기준 베팅 명목액". 사전지식 5번의 공식. **자본이 변하면 베팅 크기도 변하는** 복리식 사이징(자본이 늘면 더 크게 베팅).

#### 메인 루프 시작 — `L215-L217`
```python
# L215-L217
    for ts, row in df.iterrows():
        price = float(row["close"])
        sig = int(signal.loc[ts] if ts in signal.index else 0)
```
- **무엇을**: 가격표를 **하루(`ts`=날짜, `row`=그날 OHLCV)씩** 순회. 이게 vectorbt 없이 직접 도는 백테스트의 핵심.
- `price` — 그날 종가. `sig` — 그날 신호(+1/-1/0). `if ts in signal.index else 0` 는 혹시 신호 인덱스에 그 날짜가 없으면 안전하게 0(중립)으로.
- ⚠️ **헷갈리는/중요 포인트 (look-ahead)**: `vbt_engine` 은 `fshift(1)` 로 신호를 하루 미뤄 미래참조를 막았습니다. **이 파일엔 그 shift 가 없습니다.** 같은 날의 `price`(종가)와 `sig`(그 종가로 만든 신호)로 같은 날 진입합니다. → **미세한 look-ahead 가능성**(종가를 보고 그 종가에 산다). 일봉·근사 백테스트라 영향이 작지만, 엄밀히는 다음 날 시가 체결로 바꾸는 게 정확합니다(⚠️ 섹션 참고).

#### 펀딩비용 적용 — `L219-L227`
```python
# L219-L227
        # 펀딩 비용 (보유 포지션에만 적용)
        if position != 0:
            rate = float(funding_cost_series.loc[ts]) if ts in funding_cost_series.index else 0.0
            cost = notional(capital) * abs(rate)  # 롱=비용 지불, 숏=수취 (방향에 따라 다름)
            if position == 1:
                capital -= cost
            else:
                capital += cost  # 숏은 펀딩 수취
            total_funding_cost += cost
```
- **무엇을**: 포지션을 **들고 있는 날만**, 노셔널 × 펀딩레이트만큼 자본을 깎거나(롱) 더한다(숏).
- **헷갈리는 포인트 (단순화)**: 실제 펀딩은 레이트의 **부호**(양/음)에 따라 롱이 내기도/받기도 합니다. 그런데 이 코드는 `abs(rate)`(절댓값)를 써서 **"롱은 항상 지불, 숏은 항상 수취"** 로 단순화했습니다. 즉 펀딩 부호 방향을 무시한 근사 모델. (게다가 앞 E 의 버그로 `rate` 가 사실상 늘 0이라 이 블록은 현재 실효가 없습니다.)
- 비유: "선물을 들고 있으면 롱은 매일 방세를 내고, 숏은 매일 방세를 받는다"는 **고정 규칙**으로 단순화한 셈.

#### 청산 판정 — `L229-L267`
```python
# L229-L231
        # 포지션 청산 조건
        if position != 0:
            pnl_pct = (price - entry_px) / entry_px * position  # 방향 반영
```
- **핵심 한 줄**: 진입가 대비 현재가 변화율에 `× position` 을 곱해 **롱/숏 공통 손익률**을 만든다. 롱(+1)이면 오르면 +, 숏(-1)이면 내리면 + (부호 뒤집힘). 사전지식 6번.

```python
# L232-L243  (스탑로스)
            if pnl_pct <= -params.stop_loss_pct:
                # 스탑로스
                exit_pnl = notional(capital) * pnl_pct - notional(capital) * params.fees
                capital += exit_pnl
                trades.append({
                    "entry_date": str(entry_date.date()),
                    "exit_date": str(ts.date()),
                    "side": "LONG" if position == 1 else "SHORT",
                    "entry_price": entry_px, "exit_price": price,
                    "pnl_usd": round(exit_pnl, 2), "reason": "stop_loss",
                })
                position = 0
```
- **무엇을**: 손익률이 -5%(`stop_loss_pct`) 이하로 떨어지면 **손절 청산**.
- `exit_pnl = notional × pnl_pct - notional × fees` — **레버리지가 손익에 곱해지는 지점**: 손익은 노셔널(자본×0.5×레버리지) 기준이라, 같은 가격변화라도 레버리지가 크면 손익 금액이 큽니다. 여기서 청산 수수료도 한 번 더 뗌.
- `capital += exit_pnl` — 손익을 자본에 반영(손절이면 음수라 자본 감소).
- `trades.append({...})` — 거래 내역 기록(진입/청산 날짜, 방향, 가격, 손익, 사유 `"stop_loss"`).
- `position = 0` — 포지션 비움.

```python
# L244-L255  (테이크프로핏)
            elif pnl_pct >= params.take_profit_pct:
                # 테이크프로핏
                exit_pnl = notional(capital) * pnl_pct - notional(capital) * params.fees
                ...  "reason": "take_profit",
                position = 0
```
- 손익률이 +15%(`take_profit_pct`) 이상이면 **익절 청산**. 구조는 스탑로스와 동일, 사유만 `"take_profit"`.

```python
# L256-L267  (신호 반전)
            elif position != sig and sig != 0:
                # 신호 반전 → 청산
                exit_pnl = notional(capital) * pnl_pct - notional(capital) * params.fees
                ...  "reason": "signal_flip",
                position = 0
```
- **무엇을**: 손절·익절에 안 걸렸어도, **신호가 현재 포지션과 반대로 바뀌면**(`position != sig`) 청산. 예: 롱 보유 중인데 신호가 -1(숏)로 바뀜.
- `sig != 0` 조건: 신호가 0(중립)으로 바뀐 것만으로는 청산 안 함 — **반대 방향 신호**가 떠야 청산. (중립은 "관망"이지 "반대 베팅"이 아니므로 포지션 유지.)
- 이 줄이 앞서 "상태 신호"를 "교차 이벤트"로 바꾸는 부분: SMA 가 위/아래 구간 전체를 신호로 줘도, **방향이 실제로 뒤집히는 날**에만 청산이 일어납니다.

> 💡 초보 포인트: 세 청산 조건은 `if/elif/elif` 라서 **하루에 하나만** 발동합니다. 우선순위: ① 손절 → ② 익절 → ③ 신호반전. 손절이 가장 먼저 체크되어 리스크 관리를 우선합니다.

#### 신규 진입 — `L269-L275`
```python
# L269-L275
        # 신규 진입
        if position == 0 and sig != 0:
            # 진입 수수료
            capital -= notional(capital) * params.fees * (1 + params.slippage)
            position = sig
            entry_px = price * (1 + params.slippage * sig)  # 슬리피지 반영
            entry_date = ts
```
- **무엇을**: 포지션이 없고(`position == 0`) 신호가 있으면(`sig != 0`) 새로 진입.
- `capital -= notional × fees × (1 + slippage)` — **진입 수수료**(+슬리피지 가산)를 자본에서 차감.
- `position = sig` — 신호 방향대로 롱/숏 설정. `entry_date = ts` — 진입일 기록.
- `entry_px = price × (1 + slippage × sig)` — **슬리피지를 진입가에 불리하게 반영**: 롱(sig=+1)이면 `price × 1.001`(더 비싸게 삼), 숏(sig=-1)이면 `price × 0.999`(더 싸게 팖). 양방향 모두 "내게 불리한 쪽"으로 체결되는 현실 모사.
- ⚠️ **헷갈리는 포인트**: 청산은 if/elif 체인에 있지만 **진입은 별도 `if`** 입니다. 그래서 같은 날 청산하고(position→0) **바로 같은 날 반대로 재진입**할 수 있습니다(신호반전 청산 직후). 즉 "신호가 뒤집힌 날 = 청산 + 즉시 반대 진입"이 한 루프에서 일어납니다.

#### 자산곡선·MDD 갱신 — `L277-L280`
```python
# L277-L280
        equity_curve.append({"date": str(ts.date()), "equity": round(capital, 2)})
        max_equity = max(max_equity, capital)
        dd = (max_equity - capital) / max_equity
        max_drawdown = max(max_drawdown, dd)
```
- 매일 끝에 현재 자본을 자산곡선에 기록.
- `max_equity` — 지금까지의 **최고 잔고** 갱신.
- `dd = (최고점 - 현재) / 최고점` — 현재 낙폭(고점 대비 얼마나 빠졌나). `max_drawdown` 에 그 최댓값을 누적 → **MDD**.
- ⚠️ 미세 함정: `dd` 는 **종가 기준 자본**으로 계산하므로 포지션 미실현 손익이 자본에 즉시 반영되지 않습니다. 이 파일은 청산 시에만 `capital` 이 바뀌므로, **보유 중 평가손익이 MDD/자산곡선에 안 잡힙니다**(보유 기간엔 자본이 평평). 즉 자산곡선이 계단식이고 MDD가 실제보다 낮게 나올 수 있습니다(고도화 항목).

#### 통계 집계 — `L282-L293`
```python
# L282-L293
    # 통계
    total_ret = (capital - params.initial_capital) / params.initial_capital
    days = (df.index[-1] - df.index[0]).days or 1
    ann_ret = (1 + total_ret) ** (365 / days) - 1

    returns = pd.Series([t["pnl_usd"] for t in trades])
    win_rate = (returns > 0).mean() if len(returns) > 0 else 0.0

    # 일별 수익률로 Sharpe 계산
    eq_series = pd.Series([e["equity"] for e in equity_curve])
    daily_ret = eq_series.pct_change().dropna()
    sharpe = (daily_ret.mean() / daily_ret.std() * np.sqrt(365)) if daily_ret.std() > 0 else 0.0
```
- `total_ret` — 총수익률 = (끝자본 - 시작자본)/시작자본.
- `days = (마지막날 - 첫날).days or 1` — 전체 기간 일수. `or 1` 은 0일(데이터 1개)일 때 0으로 나누기 방지.
- `ann_ret = (1+총수익)^(365/일수) - 1` — **연환산 수익률(CAGR)**. 복리로 1년당 환산. (크립토는 365일 거래라 주식의 252 대신 **365**를 씀.)
- `win_rate` — 청산된 거래 중 손익(`pnl_usd`)이 양수인 비율. 거래가 없으면 0.
- Sharpe: 자산곡선의 일별 수익률 평균/표준편차 × √365(연율화). 변동성이 0이면 0으로 폴백. (주식 √252 대신 크립토라 **√365**.)
- ⚠️ 무위험수익률(risk-free) 차감 없이 단순 평균/표준편차라 **간이 Sharpe**입니다. 또 자산곡선이 보유 중 평평해서(위 미세 함정) 실제 변동성과 다를 수 있음.

#### 결과 dict 반환 — `L295-L313`
```python
# L295-L313
    return {
        "symbol": params.symbol,
        "strategy": params.strategy,
        "leverage": params.leverage,
        "period": params.period,
        "stats": {
            "initial_capital": params.initial_capital,
            "final_capital": round(capital, 2),
            "total_return_pct": round(total_ret * 100, 2),
            "annualized_return_pct": round(ann_ret * 100, 2),
            "max_drawdown_pct": round(max_drawdown * 100, 2),
            "sharpe_ratio": round(float(sharpe), 3),
            "win_rate_pct": round(float(win_rate) * 100, 1),
            "num_trades": len(trades),
            "funding_cost_total_usd": round(total_funding_cost, 2),
        },
        "equity_curve": equity_curve[-500:],  # 최근 500개
        "trades": trades[-100:],               # 최근 100건
    }
```
- **무엇을**: 성적표를 dict 로 묶어 반환 → `main.py` → 백엔드 → 프론트.
- `stats` 8개 + 펀딩총액이 프론트 카드 숫자가 됩니다.
- `equity_curve[-500:]` / `trades[-100:]` — **마지막 N개만** 잘라 전송량 제한(`vbt_engine` 의 다운샘플링과 같은 취지지만, 여기는 **솎기가 아니라 잘라내기(tail)** 라 초반 이력은 버려집니다 — 1년치(365일)는 500 안에 들어와 무방).
- ⚠️ JSON 안전성: `vbt_engine` 의 `_f()` 같은 NaN/Inf→None 변환이 **없습니다**. `round()` 만 합니다. 보통은 위 0-나눗셈 방어 덕에 NaN 이 안 나오지만, 극단 입력에서 NaN/Inf 가 새면 JSON 직렬화가 깨질 여지가 있습니다(고도화 항목).

---

### G. 실시간 신호 `get_futures_signal()` — `L318-L361`

```python
# L318-L332
def get_futures_signal(params: FuturesParams) -> dict:
    """현재 시점 신호 반환. ..."""
    df = _load_ohlcv(params.symbol, "3m")  # 최근 3개월
    signal_series = _get_signal_series(df, params)

    last_sig = int(signal_series.iloc[-1])
    last_price = float(df["close"].iloc[-1])
```
- **무엇을**: 백테스트(과거 전체)와 달리 **지금 당장의 롱/숏/중립**을 판정.
- 데이터는 `"3m"`(3개월)만 — 단, `_load_ohlcv` 의 `days_map` 에 `"3m"` 키가 **없어** `.get(period, 365)` 의 기본 365일로 떨어집니다. ⚠️ 즉 주석은 "3개월"이지만 실제로는 1년치를 받습니다(동작엔 무해, 신호는 마지막 값만 보므로).
- `signal_series.iloc[-1]` — **가장 최근 날의 신호**. `df["close"].iloc[-1]` — 최근 종가.

```python
# L334-L340
    indicators = {}
    if params.strategy == "sma_cross":
        indicators["sma_fast"] = round(df["close"].rolling(params.sma_fast).mean().iloc[-1], 4)
        indicators["sma_slow"] = round(df["close"].rolling(params.sma_slow).mean().iloc[-1], 4)
    elif params.strategy == "rsi_reversal":
        _, rsi = _rsi_signal(df, params.rsi_period, params.rsi_long, params.rsi_short)
        indicators["rsi"] = round(float(rsi.iloc[-1]), 2)
```
- **무엇을**: 화면에 같이 보여줄 **보조지표 현재값**을 담는다. SMA 전략이면 단/장기 이평 최신값, RSI 전략이면 최신 RSI.
- 여기가 `_rsi_signal` 이 `(signal, rsi)` 튜플을 반환하는 이유: rsi 값 자체를 꺼내 표시(`rsi.iloc[-1]`).
- momentum 전략엔 indicators 분기가 없어 빈 dict 로 나갑니다(보조지표 없음).

```python
# L342-L361
    # 권고 주문 (정보용, 실제 집행은 Spring Boot 측)
    suggested_order = None
    if last_sig != 0:
        suggested_order = {
            "symbol": params.symbol,
            "side": "BUY" if last_sig == 1 else "SELL",
            "type": "MARKET",
            "leverage": params.leverage,
            "reduce_only": False,
        }

    return {
        "symbol": params.symbol,
        "strategy": params.strategy,
        "signal": last_sig,
        "signal_text": {1: "LONG", -1: "SHORT", 0: "NEUTRAL"}[last_sig],
        "price": last_price,
        "indicators": indicators,
        "suggested_order": suggested_order,
    }
```
- `suggested_order` — 신호가 0이 아니면 **주문 초안**을 만든다. `side` 는 롱(+1)→BUY, 숏(-1)→SELL. `type="MARKET"`(시장가), `reduce_only=False`(신규/증대 주문).
- **"정보용, 실제 집행은 Spring Boot 측"** 주석이 핵심: 이 파이썬은 **제안만** 합니다. 실제 발주는 백엔드가 승인 게이트(kill-switch, tradingEnabled, lastVerifiedAt, MOCK→REAL 졸업)를 거쳐 집행 — CLAUDE.md 의 "MOCK→REAL 명시 게이트", "글로벌 Kill-Switch" 설계와 일치.
- `signal_text` — `{1:"LONG", -1:"SHORT", 0:"NEUTRAL"}[last_sig]` 로 정수를 사람이 읽을 문자열로 변환(dict 룩업 트릭).

> 💡 초보 포인트: `get_futures_signal` 은 **shift 도, 손절/익절/펀딩 회계도 안 합니다.** 그저 "오늘 신호가 뭐냐"만 봅니다. 백테스트(`backtest_futures`)와 실시간(`get_futures_signal`)은 같은 신호 함수를 공유하되, 회계는 백테스트에만 있는 구조입니다 — `vbt_engine` 의 `run_backtest` vs `latest_signal` 관계와 똑같아요.

---

## ⚠️ 함정·버그 주의 (실제 코드에서 확인한 것)

1. **🐛 펀딩비용 컬럼명 버그 (실동작 불일치)** — `_get_funding_cost` 가 `df_f["fundingRate"]`(카멜)로 접근하지만, `get_funding_rate` 실제 반환 컬럼은 `funding_rate`(스네이크). → `KeyError` → `except` 폴백으로 **항상 펀딩 0 처리**. `funding_cost_total_usd` 가 늘 0.0. 수정: `df_f["funding_rate"]` 로 통일.
2. **`funding_arb` 전략 주석/코드 불일치** — `FuturesParams.strategy` 주석엔 4개가 있지만 `_get_signal_series` 엔 3개만 구현. `funding_arb` 호출 시 `ValueError`.
3. **Look-ahead 미방지** — `vbt_engine` 의 `fshift(1)` 에 해당하는 신호 지연이 없음. 같은 날 종가로 만든 신호로 같은 날 진입 → 미세 미래참조. 정확히 하려면 다음 날 시가 체결로 분리.
4. **펀딩 부호 단순화** — `abs(rate)` 로 "롱=무조건 지불, 숏=무조건 수취" 근사. 실제 펀딩 방향(양/음)을 무시.
5. **청산(Liquidation) 미구현** — 진짜 청산가 계산 없이 `stop_loss_pct` 로만 근사. 고레버리지에서 스탑보다 청산이 먼저 올 수 있는데 그 시나리오가 빠짐.
6. **MDD/자산곡선이 미실현손익 미반영** — `capital` 은 청산 시에만 변해, 보유 중 평가손익이 자산곡선에 안 잡혀 **MDD가 과소평가**될 수 있음.
7. **`"3m"` period 미정의** — `get_futures_signal` 이 `"3m"` 을 넘기지만 `days_map` 에 없어 기본 365일로 폴백(주석과 실제 불일치, 동작엔 무해).
8. **타입힌트 불일치** — `_rsi_signal` 은 `-> pd.Series` 라 적혔지만 실제는 `(Series, Series)` 튜플 반환.
9. **JSON 안전변환 부재** — `vbt_engine._f()` 같은 NaN/Inf→None 처리 없음. 극단 입력에서 직렬화 깨질 여지.
10. **미사용 import** — `os`, `field` 는 import 됐으나 미사용.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **펀딩 버그부터 수정**: `funding_rate` 컬럼명 맞추고, `abs(rate)` 대신 **부호 그대로** 사용해 방향별 정확 정산(롱이 음수 펀딩이면 수취, 등). 가장 임팩트 큰 1순위.
- **진짜 청산 모델**: 유지증거금률 기반 **청산가**를 계산해, 손절보다 청산이 먼저면 청산으로 처리. 고레버리지 리스크를 현실화.
- **미실현손익 반영 자산곡선**: 매일 `equity = capital + (현재 미실현 PnL)` 로 평가해 MDD·Sharpe 를 정확히. 현재의 계단식 자산곡선 해소.
- **Look-ahead 제거**: 신호를 하루 미루고 **다음 날 시가**로 체결. `vbt_engine` 의 `fshift(1)` 철학 이식.
- **벡터화로 속도↑**: `for iterrows()` 는 느림. 청산·진입 로직을 numpy/vectorbt 로 벡터화하거나, 적어도 `itertuples()` 로 교체.
- **포지션 사이징 고도화**: 고정 `max_position_pct` 대신 변동성(ATR) 기반 사이징, 켈리 기준 등.
- **숏 펀딩·자금조달 비현실성 보정**: 숏의 펀딩 수취/차입비용, 거래소별 수수료 티어 반영.
- **전략 확장**: 주석의 `funding_arb`(펀딩 차익거래) 실제 구현, 볼린저·돈치안 채널 등 추가. `_get_signal_series` 에 `elif` 한 블록 + 파라미터 추가가 전부.
- **JSON 안전화**: `vbt_engine._f()` 헬퍼를 이식해 NaN/Inf→None.
- **결과 일관성**: `equity_curve[-500:]` 잘라내기 대신 `vbt_engine` 식 **균등 다운샘플링**으로 전체 구간 형태 보존.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **영구선물(Perpetual)** | 만기 없는 선물 계약(바이낸스 USDT-M). 롱·숏 양방향 베팅 가능 |
| **레버리지(Leverage)** | 빌린 돈으로 키운 베팅 배수. 손익이 N배로 증폭 |
| **청산(Liquidation)** | 손실이 증거금을 다 까먹기 직전 거래소가 강제 종료 (이 파일은 미구현, stop_loss 로 근사) |
| **펀딩레이트(Funding Rate)** | 영구선물 보유 시 8시간마다 롱↔숏이 주고받는 비용/수익 |
| **노셔널(Notional)** | 레버리지까지 곱한 실제 베팅 명목액 = `자본 × max_position_pct × leverage` |
| **롱(Long, +1) / 숏(Short, -1)** | 가격 상승/하락에 베팅. `pnl = (가격변화) × position` 으로 부호 통일 |
| **스탑로스 / 테이크프로핏** | 손익률이 -5% / +15% 되면 손절/익절 청산 |
| **신호반전(signal_flip)** | 보유 방향과 반대 신호가 떠서 청산하는 사유 |
| **OHLCV** | Open(시가)·High(고가)·Low(저가)·Close(종가)·Volume(거래량) 일봉 표 |
| **3중 폴백** | DB → 바이낸스 → 야후 순으로 데이터 조달 (앞이 실패하면 다음으로) |
| **HTTP 451** | 법적 사유 차단 응답. 미국 IP에서 바이낸스 선물 API가 막히는 코드 |
| **`df.iterrows()`** | DataFrame 을 한 행(=하루)씩 꺼내는 반복 (직접 루프 백테스트의 엔진) |
| **상태 신호 vs 교차 신호** | 이 파일은 "위/아래 구간 전체"(상태)를 신호로, 청산/진입은 "방향이 바뀌는 날"에 발동 |
| **CAGR(연환산수익)** | 복리로 1년당 환산한 수익률. 크립토는 365일 기준 |
| **Sharpe(간이)** | 일별수익 평균/표준편차 × √365. 무위험수익 차감 없는 약식 버전 |
