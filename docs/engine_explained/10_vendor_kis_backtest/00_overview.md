# `kis_backtest/` — 벤더링된 KIS 백테스트 라이브러리 전체 구조 개요 (정독 지도)

> 원본 루트: `analytics/app/lean/kis_backtest/` (~70 파일 · ~16K줄)
> 이 문서는 **"이 거대한 라이브러리를 어디부터 어떤 순서로 읽을지"** 를 알려주는 **지도**입니다.
> 라인별 해설이 아니라 **개요** — 각 하위패키지의 역할·핵심 클래스·우리가 실제 쓰는지 여부를 정리합니다.
> 형식 기준: [`README.md`](../README.md) · 모범 [`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md).

---

## 📌 이 라이브러리 한눈에

`kis_backtest/` 는 **한국투자증권(KIS)이 공개한 `open-trading-api` 예제 코드를 토대로 만들어진, "전략 빌더 + 백테스트 + 실주문" 종합 SDK** 입니다. 우리(Alpha-Helix)는 이걸 **통째로 빌려다(벤더링)** `analytics/app/lean/` 안에 넣어놓고, **Lean(QuantConnect) 백테스트 실행**에만 일부를 씁니다.

> 비유: 이 라이브러리는 **"가구 조립 공장 통째"** 입니다. 안에는 ① 설계도를 그리는 작업대(DSL), ② 설계도를 Lean 도면으로 번역하는 번역기(codegen), ③ 실제로 가구를 만드는 기계(lean executor + Docker), ④ KIS 증권사에 자재를 주문하고 실거래까지 하는 창구(providers/kis), ⑤ 완성품을 사진 찍어 보고서로 만드는 스튜디오(report), ⑥ 여러 가구를 묶어 방을 꾸미는 인테리어팀(portfolio)이 다 들어 있습니다. **우리는 이 공장에서 ①②③ 라인만 가동**하고, ④⑤⑥ 은 켜두기만 한 채 안 씁니다(업스트림 기능).

### 우리가 실제 쓰는 부분 vs 순수 업스트림

`runner.py`(우리 코드)가 요청 시점에 lazy import 하는 심볼이 곧 **"우리가 실제로 쓰는 길"** 입니다. 근거: `analytics/app/lean/runner.py:112-118, 176, 238-239`.

```python
import kis_backtest.strategies.preset            # 프리셋 10종 자동 등록 (side-effect)
from kis_backtest.strategies.registry import StrategyRegistry
from kis_backtest.codegen.generator import LeanCodeGenerator, CodeGenConfig
from kis_backtest.lean.executor import LeanExecutor
from kis_backtest.lean.project_manager import LeanProjectManager
from kis_backtest.lean.data_converter import DataConverter
from kis_backtest.lean.result_formatter import ResultFormatter
from kis_backtest.core.converters import from_definition
```

| 구분 | 하위패키지 | Alpha-Helix 가 쓰나? |
|---|---|---|
| ✅ **핵심 사용** | `strategies/`(registry+preset) · `codegen/` · `core/`(converters·schema·strategy·indicator·condition·risk) · `lean/`(executor·project_manager·data_converter·result_formatter) | **예** — Lean 백테스트 파이프라인의 실제 부품 |
| 🟡 **간접 사용** | `dsl/` · `core/candlestick` · `core/param_resolver` · `models/`(result·enums) | preset/codegen 이 내부적으로 의존. 우리가 직접 호출하진 않음 |
| ⚪ **업스트림 전용(미사용)** | `providers/`(kis 실데이터·실주문·웹소켓) · `portfolio/` · `report/` · `lean/optimizer` · `file/`(YAML 로드·저장) · `client.py`(LeanClient·LiveClient) · `utils/korean_market` | **아니오** — 우리 데이터는 `app/data/`(yfinance) 가, 실주문은 백엔드(Java `KisBrokerService`) 가 담당. 이 코드들은 "잠들어 있는" 원본 기능 |

> ⚠️ 중요한 경계: **"실주문"은 두 군데에 따로 있습니다.** ① 이 라이브러리의 `providers/kis/brokerage.py`(파이썬, **우리는 안 씀**), ② 백엔드의 `KisBrokerService`(Java, **실제 주문은 이쪽**). 백테스트의 데이터도 이 라이브러리의 `providers/kis/data.py` 가 아니라 우리 `app/data/yf_client.py` 에서 받아 `DataConverter` 로 Lean CSV 만 만듭니다(`runner.py:69`).

---

## 🗺 전체 구조 지도

```
kis_backtest/                         KIS 백테스트/전략/주문 종합 SDK (벤더링)
│
├── __init__.py                       라이브러리 공개 API (LeanClient·전략·DSL·지표 전부 re-export)
├── client.py            (1216줄)     ⚪ LeanClient/LiveClient — 라이브러리의 "정문" 파사드(우리는 우회)
├── exceptions.py                     예외 계층 (LeanError → KISError/AlgorithmError/DockerError…)
│
├── core/                ✅ 전략의 "내부 표현(데이터 모델)" — 모든 입력의 공통 언어
│   ├── strategy.py          StrategyDefinition (불변 dataclass) — 전략 한 개의 표준 정의
│   ├── indicator.py         Indicator + INDICATOR_REGISTRY + Price/BollingerBands — 지표 객체 & 연산자 오버로딩(>,<,crosses_above)
│   ├── condition.py         Condition / CompositeCondition — "SMA(5)>SMA(20) & RSI<70" 의 객체 표현(&,| 지원)
│   ├── candlestick.py        CandlestickPattern + 레지스트리 — 도지·해머 등 19종 캔들 패턴
│   ├── risk.py              RiskManagement — 손절·익절·트레일링·최대비중 설정
│   ├── schema.py            StrategySchema (Pydantic) — ★Single Source of Truth(모든 입력을 표준화·검증)
│   ├── converters.py        from_preset / from_yaml_file / from_definition / from_dict → StrategySchema 로 통일
│   └── param_resolver.py    "$period" 같은 파라미터 참조를 실제 값으로 치환
│
├── dsl/                 🟡 코드 없이 전략을 "선언"하는 Fluent API
│   ├── builder.py           RuleBuilder.buy_when(...).sell_when(...).stop_loss(...).build()
│   └── helpers.py           SMA·EMA·RSI·MACD… 지표 팩토리 함수 ~80종 + 캔들 패턴
│
├── codegen/             ✅ StrategySchema → Lean(QuantConnect) Python 코드 문자열 생성
│   ├── generator.py         LeanCodeGenerator — QCAlgorithm 클래스·OnData·지표초기화·수수료/슬리피지 모델 코드 작성
│   └── validator.py         IndicatorValidator — 지표 파라미터/워밍업/출력 검증
│
├── lean/                ✅ 생성된 코드를 실제로 굴리는 실행 계층 (→ 07_lean 교재에서 라인별)
│   ├── executor.py          LeanExecutor/LeanRun — `lean` CLI(내부 Docker) 호출  → 07_lean/executor.md
│   ├── project_manager.py   LeanProjectManager — Lean 워크스페이스/프로젝트 폴더 관리 → 07_lean/project_manager.md
│   ├── data_converter.py    DataConverter — KIS/yf DataFrame → Lean CSV 변환 → 07_lean/data_converter.md
│   ├── result_formatter.py  ResultFormatter — Lean 결과 JSON → API 응답 형식 → 07_lean/result_formatter.md
│   └── optimizer.py     ⚪  Grid/Random Search 파라미터 최적화(병렬) — 업스트림 전용
│
├── strategies/          ✅ "내장 전략 카탈로그" + 등록 시스템
│   ├── base.py              BaseStrategy(ABC) — 모든 프리셋의 부모(PARAM_DEFINITIONS 패턴)
│   ├── registry.py          StrategyRegistry — id로 전략 조회·빌드(@register 데코레이터)
│   ├── generator.py         StrategyGenerator — 하위호환 래퍼(내부적으로 LeanCodeGenerator)
│   ├── preset/              ★ Expert Sample 10종 전략 (sma_crossover·momentum·week52_high…)
│   └── risk/position_sizer.py  PositionSizer — 고정/비율/변동성 기반 포지션 사이징 Lean 코드
│
├── providers/           ⚪ "외부 세계 연결" — 데이터/주문 제공자(업스트림 전용)
│   ├── base.py              DataProvider / BrokerageProvider Protocol(추상 인터페이스)
│   └── kis/                 한국투자증권 실구현
│       ├── auth.py              KISAuth — 토큰 발급·인증(REST 래퍼)
│       ├── data.py              KISDataProvider — 일/분봉·시세·해외·지수 조회
│       ├── brokerage.py         KISBrokerageProvider — 주문·취소·잔고·체결통보
│       ├── websocket.py         KISWebSocket — 실시간 시세/체결 스트림(AES 복호화)
│       └── constants.py         TrId·ApiPath·OrderDivision 상수
│
├── portfolio/           ⚪ 다중자산 포트폴리오 분석(업스트림 전용)
│   ├── analyzer.py          PortfolioAnalyzer/PortfolioMetrics — 상관·분산·효율적 프론티어
│   ├── rebalance.py         RebalanceSimulator — 주기 리밸런싱 vs Buy&Hold
│   └── visualizer.py        PortfolioVisualizer — 히트맵·프론티어 차트
│
├── report/              ⚪ HTML 백테스트 리포트 생성(업스트림 전용)
│   ├── generator.py         KISReportGenerator — standalone HTML 리포트
│   ├── portfolio_report.py  PortfolioReportGenerator
│   ├── components/          charts(Plotly)·summary(카드)·tables(거래내역)
│   └── themes/              BaseTheme / KISTheme(KIS 블루 #245BEE)
│
├── file/                ⚪ `.kis.yaml` 전략 파일 입출력(업스트림 전용)
│   ├── schema.py            KisStrategyFile(Pydantic) — YAML 파일 스키마
│   ├── loader.py            StrategyFileLoader — YAML → Schema/Definition
│   ├── saver.py             StrategyFileSaver — Definition → YAML
│   └── python_exporter.py   PythonExporter — Definition → Python DSL 코드 문자열
│
├── models/              🟡 Pydantic 데이터 모델(전 패키지 공용 자료형)
│   ├── enums.py             Resolution·OrderSide·OrderType·OrderStatus·TimeInForce
│   ├── market_data.py       Bar(OHLCV)·Quote·IndexBar·StockInfo·FinancialData
│   ├── trading.py           Order·Position·AccountBalance·Subscription
│   └── result.py            BacktestResult·OptimizationResult
│
└── utils/korean_market.py  ⚪ 한국시장 호가단위(tick_size)·반올림 유틸
```

범례: ✅ 핵심 사용 · 🟡 간접 사용 · ⚪ 업스트림 전용(잠든 코드)

### 우리가 실제로 도는 길 (data flow)

```
프리셋 id 또는 전략 정의
        │
        ▼
strategies/registry  →  core/strategy(StrategyDefinition)
        │                        │ from_definition()
        ▼                        ▼
core/converters  ───────►  core/schema(StrategySchema)   ← 모든 입력의 공통 표준
                                 │
                                 ▼
                    codegen/generator(LeanCodeGenerator)
                                 │  Lean Python(QCAlgorithm) 코드 문자열
        app/data/yf_client ──┐   ▼
                             ▼   lean/project_manager (워크스페이스 생성)
              lean/data_converter (CSV)        │
                             └──────►  lean/executor (lean CLI → Docker)
                                              │  result.json
                                              ▼
                                    lean/result_formatter → API 응답 → 백엔드
```

---

## 📦 하위패키지별 요약

각 항목: **무엇을 / 핵심 파일·클래스 / 우리가 쓰나 / (해당 시) 07_lean 링크**.

### 1. `core/` — 전략의 내부 표현 (공통 언어) ✅
- **무엇을**: "전략 한 개"를 코드 생성기·로더·검증기가 모두 이해하는 **표준 데이터 모델**로 표현. 라이브러리의 척추.
- **핵심**:
  - `StrategyDefinition`(`strategy.py`) — `@dataclass(frozen=True)` 불변 전략 정의(이름·지표·진입/청산조건·리스크·params). `to_dict`/`from_dict`/`with_params`.
  - `Indicator`(`indicator.py`) — 지표 객체. **연산자 오버로딩**이 핵심: `SMA(5) > SMA(20)` 이 `Condition` 객체를 만들고, `.crosses_above()`/`.between()` 메서드 제공. `INDICATOR_REGISTRY` 가 각 지표의 Lean 클래스 매핑을 보관. `Price.close/high/low/open/volume`, `BollingerBands.upper/middle/lower`.
  - `Condition`/`CompositeCondition`(`condition.py`) — 비교식 객체. `&`(AND)·`|`(OR) 오버로딩으로 복합조건 트리 구성.
  - `schema.py` — **★ Single Source of Truth**. `StrategySchema`(Pydantic). 모든 입력(프리셋·YAML·dict)을 여기로 정규화·검증(`operator` 키 통일, `crosses_above→cross_above` 자동정규화, 캔들패턴 auto-populate).
  - `converters.py` — `from_preset`·`from_yaml_file`·`from_definition`·`from_dict` → 전부 `StrategySchema` 로 모음. **우리는 `from_definition` 사용**(`runner.py:176`).
  - `risk.py`(`RiskManagement`: stop_loss/take_profit/trailing/max_position) · `candlestick.py`(19종 패턴) · `param_resolver.py`(`$param` 치환).
- **쓰나**: ✅ 직접(`from_definition`) + 간접(codegen·preset 이 schema/indicator/condition 의존).

### 2. `dsl/` — 코드 없이 전략 선언 🟡
- **무엇을**: 파이썬 메서드 체이닝으로 전략을 **선언적**으로 기술. 비개발자 친화 Fluent API.
- **핵심**:
  - `RuleBuilder`(`builder.py`) — `RuleBuilder("이름").buy_when(cond).sell_when(cond).stop_loss(5.0).take_profit(10.0).build()` → `StrategyRule` → `StrategyDefinition`.
  - `helpers.py` — 지표 팩토리 함수 **약 80종**(이동평균 14·오실레이터 20·추세 12·거래량 12·변동성 10·기타 10·멀티아웃풋 5 + 캔들 19). `SMA(5)`, `RSI(14)`, `MACD(12,26,9)`, `BollingerBands(20,2.0)` 등이 모두 `Indicator` 를 반환해 `core/indicator` 의 연산자와 결합.
- **쓰나**: 🟡 간접. preset 전략들이 이 팩토리(SMA·RSI 등)를 써서 조건을 구성. 우리가 RuleBuilder 를 직접 호출하진 않음(주: 미래에 "자연어→전략" 경로에서 쓰기 좋은 자리).

### 3. `codegen/` — Schema → Lean Python 코드 생성 ✅
- **무엇을**: 추상 전략(Schema)을 **실행 가능한 Lean(QuantConnect) `QCAlgorithm` Python 소스 문자열**로 번역.
- **핵심**:
  - `LeanCodeGenerator`(`generator.py`, ~900줄) — `generate()` 가 헤더·데이터클래스(KRX/US PythonData)·수수료모델·슬리피지모델·`Initialize()`·`OnData()`·지표 초기화/갱신 코드를 조립. 별칭 변수명 sanitize, TradeBar 필요 지표 구분 등 디테일 처리.
  - `IndicatorValidator`(`validator.py`) — 지표 파라미터 검증·워밍업 기간 계산·출력 필드 유효성·TradeBar 필요 여부.
- **쓰나**: ✅ 직접(`runner.py:114`). 우리 백테스트의 "전략→코드" 단계 그 자체.

### 4. `lean/` — Lean CLI 실행 계층 ✅ → 07_lean 교재 연결
- **무엇을**: 생성된 코드를 **실제로 백테스트**(공식 `lean` CLI → 내부 Docker)하고 결과를 거두는 부분.
- **핵심 & 링크**:
  - `LeanExecutor`/`LeanRun`(`executor.py`) — CLI 호출·결과 수집 → [`07_lean/executor.md`](../07_lean/executor.md)
  - `LeanProjectManager`(`project_manager.py`) — 워크스페이스/프로젝트 폴더 구조 → [`07_lean/project_manager.md`](../07_lean/project_manager.md)
  - `DataConverter`(`data_converter.py`) — DataFrame → Lean CSV → [`07_lean/data_converter.md`](../07_lean/data_converter.md)
  - `ResultFormatter`(`result_formatter.py`) — 결과 JSON → API 형식 → [`07_lean/result_formatter.md`](../07_lean/result_formatter.md)
  - `optimizer.py` ⚪ — `ParameterGrid`·`ParallelExecutor`·`StrategyOptimizer`(Grid/Random Search 병렬 최적화). **업스트림 전용**(우리 미사용).
- **쓰나**: ✅ optimizer 빼고 전부 직접. (참고: 우리 쪽 상위 오케스트레이터 `runner.py`/`jobs.py`/`kis_auth.py` 는 라이브러리 밖이며 [`07_lean/runner.md`](../07_lean/runner.md)·[`jobs.md`](../07_lean/jobs.md)·[`kis_auth.md`](../07_lean/kis_auth.md) 에서 다룸.)

### 5. `strategies/` — 내장 전략 카탈로그 + 등록 시스템 ✅
- **무엇을**: 바로 쓸 수 있는 **프리셋 전략 10종**과, id로 조회/빌드하는 레지스트리.
- **핵심**:
  - `BaseStrategy`(`base.py`, ABC) — 모든 프리셋의 부모. `id`·`name`·`category`·`indicators`·`entry_condition`·`exit_condition`·`risk_management`·`build()` 추상 멤버 + `PARAM_DEFINITIONS`(프론트가 파라미터를 동적 조회/수정하도록 노출).
  - `StrategyRegistry`(`registry.py`) — `@register` 데코레이터로 자동 등록, `get(id)`·`build_with_params(...)`·`list_all_with_params()`.
  - `preset/` — **Expert Sample 10종**: `sma_crossover`(골든/데드크로스) · `momentum` · `week52_high`(52주 신고가 돌파) · `consecutive_moves`(n일 연속 상승/하락) · `ma_divergence`(이격도) · `false_breakout`(가짜 돌파) · `strong_close`(전일 대비 강한 종가) · `volatility_breakout`(변동성 수축→확장) · `short_term_reversal`(단기 반전) · `trend_filter_signal`(추세필터+시그널). 각 파일은 `BaseStrategy` 를 상속하고 dsl 지표 팩토리로 조건을 정의.
  - `risk/position_sizer.py` — `PositionSizer`/`SizingMethod`(고정·비율·변동성) → Lean 포지션 사이징 코드.
  - `generator.py` — 하위호환 `StrategyGenerator`(내부적으로 `LeanCodeGenerator` 위임).
- **쓰나**: ✅ 직접. `import ...preset`(자동등록) + `StrategyRegistry`(`runner.py:112-113, 238-239`).

### 6. `providers/` — 외부 데이터/주문 연결 ⚪ 업스트림 전용
- **무엇을**: KIS OpenAPI 로 **실데이터 조회 + 실주문 + 실시간 스트림**.
- **핵심**:
  - `base.py` — `DataProvider`·`BrokerageProvider` Protocol(교체 가능한 추상 인터페이스).
  - `kis/auth.py` `KISAuth` — 토큰 발급/인증(REST). `kis/data.py` `KISDataProvider` — 일/분봉·시세·해외·지수. `kis/brokerage.py` `KISBrokerageProvider` — 주문/취소/수정·잔고·체결. `kis/websocket.py` `KISWebSocket` — 실시간 시세/체결(AES-CBC 복호화). `kis/constants.py` — TR ID·경로·주문구분 상수.
- **쓰나**: ⚪ **아니오**. 우리 데이터는 `app/data/yf_client`, 실주문은 백엔드 Java `KisBrokerService`. 이 파이썬 경로는 "잠든" 업스트림 기능. (※ 우리 KIS 인증은 라이브러리 밖 `app/lean/kis_auth.py` 가 별도 담당 — `providers/kis/auth.py` 가 그걸 래핑하긴 함.)

### 7. `portfolio/` — 다중자산 분석 ⚪ 업스트림 전용
- **무엇을**: 여러 종목 포트폴리오의 상관관계·분산효과·효율적 프론티어·리밸런싱 시뮬.
- **핵심**: `PortfolioAnalyzer`/`PortfolioMetrics`(`analyzer.py`) · `RebalanceSimulator`(`rebalance.py`) · `PortfolioVisualizer`(`visualizer.py`).
- **쓰나**: ⚪ 아니오. (우리 신뢰성/지표는 `app/robust`·`app/metrics` 가 담당.)

### 8. `report/` — HTML 리포트 ⚪ 업스트림 전용
- **무엇을**: 백테스트 결과를 KIS 스타일 standalone HTML 리포트로 렌더.
- **핵심**: `KISReportGenerator`(`generator.py`) · `PortfolioReportGenerator` · `components/`(charts=Plotly·summary=카드·tables=거래내역) · `themes/`(KIS 블루 #245BEE).
- **쓰나**: ⚪ 아니오. (우리 리포트는 `app/metrics/quantstats_report` HTML Tearsheet.)

### 9. `file/` — `.kis.yaml` 전략 파일 입출력 ⚪ 업스트림 전용
- **무엇을**: 전략을 YAML 파일로 저장/로드/검증, 또는 Python DSL 코드로 export.
- **핵심**: `KisStrategyFile`(`schema.py`, Pydantic) · `StrategyFileLoader`(`loader.py`) · `StrategyFileSaver`(`saver.py`) · `PythonExporter`(`python_exporter.py`).
- **쓰나**: ⚪ 아니오(우리는 코드 경로로 `StrategyDefinition` 을 직접 만들어 `from_definition` 사용). converters 의 `from_yaml_file` 진입점이 여기에 의존.

### 10. `models/` — 공용 데이터 모델 🟡
- **무엇을**: 전 패키지가 공유하는 Pydantic 자료형.
- **핵심**: `enums.py`(Resolution·OrderSide/Type/Status·TimeInForce) · `market_data.py`(`Bar` OHLCV·`Quote`·`IndexBar`·`StockInfo`·`FinancialData`) · `trading.py`(`Order`·`Position`·`AccountBalance`·`Subscription`) · `result.py`(`BacktestResult`·`OptimizationResult`, `to_dataframe`/`get_monthly_returns`).
- **쓰나**: 🟡 간접(`BacktestResult`·enums 등이 결과/변환 경로에서 등장).

### 11. 루트 파일들
- `client.py`(1216줄) ⚪ — `LeanClient`(파사드: `backtest`/`backtest_strategy`/`backtest_rule`/`optimize`/`analyze_portfolio`/`report`)와 `LiveClient`(실매매: `submit_order`/`subscribe_realtime`/`run_strategy`). **라이브러리의 "정문"** 이지만 **우리는 우회**해서 하위 부품(registry·codegen·lean)을 직접 조립. 라이브러리를 통째로 학습할 땐 여기가 시작점이지만, 우리 동작을 이해하려면 `runner.py` 가 시작점.
- `exceptions.py` — `LeanError`(루트) → `ConfigurationError`·`AlgorithmError`(stacktrace 보유)·`DockerError`·`KISError`(error_code/message) → `KISAuthError`·`KISOrderError`.
- `utils/korean_market.py` ⚪ — `get_tick_size`(가격대별 호가단위)·`round_to_tick`. 한국시장 주문가 정규화용(실주문 경로에서나 쓰임 → 우리 미사용).

---

## 🧭 추천 정독 순서

> 원칙: **"우리가 실제 쓰는 길"을 먼저**(이해 즉시 우리 시스템에 도움) → 그 다음 업스트림 부가기능.

| 순서 | 대상 | 왜 이 순서인가 |
|---|---|---|
| 1 | `core/strategy.py` → `core/condition.py` → `core/indicator.py` | **전략의 "내부 표현"이 모든 것의 기초.** `SMA(5)>SMA(20)` 이 어떻게 객체 트리가 되는지(연산자 오버로딩)를 먼저 잡으면 나머지가 쉬움 |
| 2 | `dsl/helpers.py`(훑기) → `dsl/builder.py` | 1의 객체들을 사람이 어떻게 "선언"으로 조립하는지. helpers 는 전수 읽지 말고 패턴만 |
| 3 | `core/schema.py` → `core/converters.py` | 모든 입력이 모이는 **Single Source of Truth**. 여기가 codegen 의 입력 |
| 4 | `strategies/base.py` → `strategies/registry.py` → `preset/sma_crossover.py`(샘플 1개만) | 내장 전략이 1~3을 어떻게 조합하는지 구체 사례로 확인 |
| 5 | `codegen/validator.py` → `codegen/generator.py` | Schema → Lean 코드 번역. 이 라이브러리의 "하이라이트". generator 는 길어서 `generate()`→`_generate_algorithm()` 골격부터 |
| 6 | `lean/*` | 이미 [`07_lean/`](../07_lean/) 교재로 라인별 완료. 링크 따라가기 |
| 7 | `providers/kis/auth.py` → `data.py` → `brokerage.py` → `websocket.py` | KIS 실연동(업스트림). 실주문/실시간을 배우려면. 우리 시스템엔 안 쓰지만 "KIS API 교과서" 로 가치 |
| 8 | `codegen` 이후 여력 시: `report/` → `portfolio/` → `lean/optimizer.py` → `file/` | 부가기능. 강의 확장용 |

> 빠른 길(우리 동작만): **`runner.py`(밖) → registry → preset → converters → codegen/generator → lean/executor**. 이 6개만 따라가면 "프리셋 한 줄이 어떻게 Lean 백테스트 결과가 되는지" 전 과정이 보임.

---

## 🧠 핵심 개념 (이 라이브러리를 관통하는 5가지)

1. **DSL = 전략을 "코드" 대신 "선언"으로 기술.**
   `for` 루프로 매매 로직을 짜는 대신, `RuleBuilder("X").buy_when(SMA(5)>SMA(20)).build()` 처럼 **무엇을 사고팔지 선언**만 한다. 이게 가능한 이유는 `Indicator` 가 `>`·`<`·`&`·`|` 연산자를 오버로딩해 **비교식 자체가 객체(`Condition`)** 가 되기 때문. (vbt_engine 의 "boolean Series" 와 대비: 거긴 값으로 신호를 만들고, 여긴 "규칙을 객체로 기술"한 뒤 코드로 생성.)

2. **Schema = Single Source of Truth.**
   입력이 프리셋이든 YAML이든 dict든, `core/schema.StrategySchema` 한 형태로 **정규화·검증**된 뒤에야 코드가 생성된다. "operator 키 통일", "crosses_above→cross_above 자동정규화" 같은 규칙이 여기 모여 있어, 입력 경로가 늘어도 codegen 은 하나만 상대하면 됨.

3. **codegen = DSL/Schema → Lean Python 코드 생성.**
   `LeanCodeGenerator` 가 추상 전략을 **실행 가능한 `QCAlgorithm` 소스 문자열**로 짜준다. "전략 정의"와 "실행 엔진(Lean)"을 분리하는 핵심 다리. (우리 `vbt_engine` 은 코드를 생성하지 않고 직접 백테스트하지만, 이 라이브러리는 **코드를 만들어 Lean 에 넘기는** 방식 — 더 사실적인 체결 모델·수수료/슬리피지 모델을 Lean 이 처리.)

4. **providers = KIS 실데이터/실주문 어댑터.**
   `DataProvider`/`BrokerageProvider` Protocol 뒤에 KIS 구현이 꽂혀 있어, "데이터 소스/증권사"를 교체 가능하게 추상화. **우리는 이 경로 대신** 데이터=yfinance, 실주문=백엔드 Java 를 쓰므로 잠들어 있음.

5. **strategies/preset = 내장 전략들.**
   바로 백테스트 가능한 검증된 10종. `BaseStrategy` 를 상속하고 `entry_condition`/`exit_condition` 을 dsl 지표로 정의 → registry 자동 등록 → codegen 으로 Lean 코드화. "전략을 어떻게 작성하는가"의 모범 예제 모음.

---

## 📚 용어 사전

| 용어 | 한 줄 설명 |
|---|---|
| **벤더링(vendoring)** | 외부 라이브러리를 의존성으로 설치하는 대신 **소스째 프로젝트 안에 복사해 넣는 것**. `kis_backtest/` 가 그렇게 들어옴 |
| **DSL(Domain Specific Language)** | 특정 분야(여기선 전략 기술) 전용의 작은 언어/문법. `RuleBuilder` 체이닝이 그 예 |
| **Fluent API / 메서드 체이닝** | `.a().b().c()` 처럼 메서드를 연달아 이어 호출하는 스타일(각 메서드가 자기 자신을 반환) |
| **연산자 오버로딩** | `>`·`&` 같은 연산자를 클래스에 재정의. `SMA(5) > SMA(20)` 이 숫자 비교가 아니라 `Condition` 객체를 만들게 함 |
| **codegen(코드 생성)** | 추상 정의를 실제 실행 코드(문자열)로 자동 변환 |
| **StrategyDefinition** | 전략 한 개의 **불변(frozen) 표준 정의**(이름·지표·조건·리스크) |
| **StrategySchema** | 모든 입력을 모아 검증한 **Pydantic 표준 스키마**(Single Source of Truth) |
| **Single Source of Truth** | "진실의 단일 출처" — 같은 정보를 여러 곳이 아닌 한 곳에서만 정의해 불일치를 막는 설계 |
| **레지스트리(Registry)** | id로 객체를 등록/조회하는 중앙 명부. `@register` 로 자동 등록 |
| **프리셋(preset)** | 미리 만들어 둔 바로 쓰는 전략(Expert Sample 10종) |
| **Lean / QuantConnect** | 오픈소스 알고리즘 트레이딩 엔진. `QCAlgorithm` 클래스의 `Initialize`/`OnData` 로 전략을 기술 |
| **QCAlgorithm** | Lean 의 전략 베이스 클래스. codegen 이 이걸 상속하는 코드를 생성 |
| **TradeBar** | Lean 의 OHLCV 바 객체. 일부 지표는 종가만이 아니라 TradeBar 전체가 필요 |
| **Provider Protocol** | 데이터/주문 제공자의 추상 인터페이스(교체 가능하게). `DataProvider`·`BrokerageProvider` |
| **TR ID** | KIS API 의 트랜잭션 식별 코드(주문/조회 종류마다 다름) |
| **호가단위(tick size)** | 주문 가격이 움직일 수 있는 최소 단위(가격대별로 1·5·10·…원) |
| **PARAM_DEFINITIONS** | 전략 파라미터의 기본값·범위·타입 정의. 프론트가 동적으로 조회/수정하도록 노출 |
| **워밍업(warmup)** | 지표가 유효값을 내기 전 필요한 최소 바 개수(예: SMA(20)은 20봉 필요) |
| **포지션 사이징** | 한 번에 자본의 얼마를 투입할지 결정(고정·비율·변동성 기반) |
| **업스트림(upstream) 전용** | 원본 라이브러리엔 있으나 **우리 시스템은 호출하지 않는** "잠든" 기능 |
