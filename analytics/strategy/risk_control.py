"""
Alpha-Helix Developer Studio — risk_control.py
================================================
QuantConnect LEAN 리스크 프레임워크 기반 신뢰도 스코어링 & 포지션 관리

포함 모듈:
  1. ConfidenceScoringSystem  — InterpretML-스타일 신호 설명 가능성 + 불확실성 정량화
  2. VixMultiplierEngine      — VIX 연동 레버리지·포지션 동적 조정
  3. KellyPositionSizer       — 풀/분수 켈리 기준 최적 베팅 크기
  4. RiskBudgetAllocator      — 리스크 패리티 & 변동성 타겟팅 자산배분
  5. DrawdownCircuitBreaker   — 실시간 낙폭 감지 자동 노출도 축소
  6. RegimeAwareRiskFilter    — 시장 국면별 리스크 파라미터 동적 스위칭

참고:
  - QuantConnect LEAN RiskManagementModel API
  - Kelly Criterion: Kelly(1956) "A New Interpretation of Information Rate"
  - Risk Parity: Qian(2005) "Risk Parity Portfolios"
  - CBOE VIX as fear gauge: Whaley(2009)
"""

from __future__ import annotations

import logging
import warnings
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Any

import numpy as np
import pandas as pd
from scipy import stats
from scipy.optimize import minimize

warnings.filterwarnings("ignore", category=RuntimeWarning)
log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# 공유 데이터 클래스
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class SignalBundle:
    """전략 신호 묶음 — 각 모듈이 이 구조를 공유."""
    ticker: str
    raw_signal: float        # 원시 신호 강도 (-1 ~ +1)
    confidence: float        # 신뢰도 (0 ~ 1)
    regime: str              # 현재 시장 국면
    vix_level: float         # 현재 VIX
    momentum_1m: float       # 1개월 모멘텀
    momentum_3m: float       # 3개월 모멘텀
    vol_20d: float           # 20일 변동성 (연환산)
    feature_importances: Dict[str, float] = field(default_factory=dict)


@dataclass
class RiskDecision:
    """최종 리스크 결정 산출물."""
    ticker: str
    target_weight: float      # 목표 포트폴리오 비중 (0~1)
    position_size_usd: float  # 달러 투자금액
    kelly_fraction: float     # 사용된 켈리 분수
    confidence_score: float   # 신뢰도 점수 (0~100)
    risk_budget_pct: float    # 리스크 예산 소비 (%)
    circuit_status: str       # "normal" | "warning" | "halt"
    explanation: str          # 자연어 근거


# ─────────────────────────────────────────────────────────────────────────────
# 1. ConfidenceScoringSystem
# ─────────────────────────────────────────────────────────────────────────────

class ConfidenceScoringSystem:
    """
    InterpretML-스타일 신호 설명 가능성 + 베이지안 불확실성 정량화.

    원리:
    - SHAP 값 방식으로 각 피처(모멘텀·변동성·국면·VIX·추세)가 신호에 기여하는 정도를 분해
    - 피처별 기여도가 상충(contradictory)할 때 신뢰도 하향 → 애매한 신호 필터링
    - 불확실성 구간: 몬테카를로 드롭아웃 근사로 신호의 95% CI 추정
    - 신뢰도 = 1 - (CI폭 / 2 * 안전계수)

    피처 가중치 (역사적 실증 기반):
      trend_alignment  : 0.30  (모멘텀 방향 일치 여부)
      regime_score     : 0.25  (현재 국면의 해당 전략 친화도)
      vix_adjusted     : 0.20  (VIX 역정규화 점수)
      vol_stability    : 0.15  (변동성 안정성)
      signal_strength  : 0.10  (원시 신호 강도)
    """

    FEATURE_WEIGHTS = {
        "trend_alignment": 0.30,
        "regime_score":    0.25,
        "vix_adjusted":    0.20,
        "vol_stability":   0.15,
        "signal_strength": 0.10,
    }

    # 국면별 모멘텀 전략 친화도 점수 (TQQQ-SOXL 기준)
    REGIME_SCORES = {
        "bull_quiet":        1.00,   # 최적 환경
        "bull_volatile":     0.55,   # 주의 — 급등락 가능
        "sideways":          0.35,   # 모멘텀 전략 비적합
        "bear":              0.10,   # 레버리지 ETF 위험
        "crisis":            0.00,   # 즉시 회피
        "high_vol_unstable": 0.05,   # 준위기 수준
    }

    def __init__(
        self,
        vix_neutral: float = 20.0,   # VIX 중립 수준
        vix_max:     float = 45.0,   # VIX 상한 (이상이면 신뢰도 0)
        mc_samples:  int   = 100,    # 몬테카를로 불확실성 샘플 수
    ):
        self.vix_neutral  = vix_neutral
        self.vix_max      = vix_max
        self.mc_samples   = mc_samples

    def compute_features(self, signal: SignalBundle) -> Dict[str, float]:
        """각 피처 점수를 0~1 범위로 정규화."""
        # 1. 추세 정합도: 1·3개월 모멘텀 방향 일치 여부
        signs_agree = np.sign(signal.momentum_1m) == np.sign(signal.momentum_3m)
        trend_strength = abs(signal.momentum_1m + signal.momentum_3m) / 2
        trend_alignment = float(
            min(1.0, trend_strength / 0.30) * (1.0 if signs_agree else 0.3)
        )

        # 2. 국면 점수
        regime_score = self.REGIME_SCORES.get(signal.regime, 0.3)

        # 3. VIX 역정규화 점수: VIX <= 중립이면 1.0, VIX >= 상한이면 0.0
        vix_score = float(
            np.clip((self.vix_max - signal.vix_level) / (self.vix_max - self.vix_neutral), 0, 1)
        )

        # 4. 변동성 안정성: 낮고 안정적일수록 높음
        # TQQQ 정상 변동성 ~0.50 (연환산), 정상화
        vol_stability = float(np.clip(1.0 - signal.vol_20d / 1.20, 0, 1))

        # 5. 원시 신호 강도 (이미 -1~+1)
        signal_strength = float(np.clip((signal.raw_signal + 1) / 2, 0, 1))

        return {
            "trend_alignment": trend_alignment,
            "regime_score":    regime_score,
            "vix_adjusted":    vix_score,
            "vol_stability":   vol_stability,
            "signal_strength": signal_strength,
        }

    def compute_confidence(self, signal: SignalBundle) -> Tuple[float, Dict[str, float]]:
        """
        신호 신뢰도 (0~1) + 피처 기여도(SHAP 근사) 계산.

        Returns
        -------
        confidence : float (0~1)
        breakdown  : Dict[feature -> contribution]
        """
        features = self.compute_features(signal)

        # 가중 합산 신뢰도
        raw_confidence = sum(
            features[k] * v for k, v in self.FEATURE_WEIGHTS.items()
        )

        # 충돌 페널티: 피처들의 표준편차가 클수록 신호가 엇갈림 → 하향
        vals = list(features.values())
        conflict_penalty = float(np.std(vals)) * 0.5
        confidence = float(np.clip(raw_confidence - conflict_penalty, 0.0, 1.0))

        # 몬테카를로 불확실성 추정 (간단화: 피처별 가우시안 노이즈 주입)
        rng = np.random.default_rng(42)
        mc_confs = []
        for _ in range(self.mc_samples):
            noisy = {k: float(np.clip(v + rng.normal(0, 0.05), 0, 1)) for k, v in features.items()}
            mc_raw = sum(noisy[k] * w for k, w in self.FEATURE_WEIGHTS.items())
            mc_confs.append(mc_raw)
        ci_width = float(np.percentile(mc_confs, 95) - np.percentile(mc_confs, 5))
        uncertainty_discount = ci_width / 2.0
        final_confidence = float(np.clip(confidence - uncertainty_discount, 0.0, 1.0))

        # SHAP-스타일 기여도 (피처 점수 × 가중치 / 합계, 합=confidence)
        contributions = {
            k: round(features[k] * v, 4)
            for k, v in self.FEATURE_WEIGHTS.items()
        }

        return final_confidence, contributions

    def explain(self, signal: SignalBundle) -> str:
        """
        신호 근거를 자연어로 설명 (DeveloperLab 우측 패널 표시용).
        """
        confidence, contrib = self.compute_confidence(signal)
        features = self.compute_features(signal)
        regime_ko = {
            "bull_quiet": "상승장(안정)", "bull_volatile": "상승장(불안정)",
            "bear": "하락장", "crisis": "위기", "sideways": "횡보",
            "high_vol_unstable": "고변동성 불안정",
        }

        strongest = max(contrib, key=contrib.get)
        weakest   = min(contrib, key=contrib.get)

        strongest_ko = {
            "trend_alignment": "추세 정합도",
            "regime_score":    "시장국면 점수",
            "vix_adjusted":    "VIX 조정 점수",
            "vol_stability":   "변동성 안정성",
            "signal_strength": "신호 강도",
        }

        return (
            f"[{signal.ticker}] 신뢰도 {confidence*100:.0f}% | "
            f"국면: {regime_ko.get(signal.regime, signal.regime)} | "
            f"VIX {signal.vix_level:.1f} | "
            f"주요 강점: {strongest_ko[strongest]}({contrib[strongest]*100:.0f}%) | "
            f"주요 약점: {strongest_ko[weakest]}({contrib[weakest]*100:.0f}%) | "
            f"1M모멘텀: {signal.momentum_1m*100:.1f}% / 3M: {signal.momentum_3m*100:.1f}%"
        )


# ─────────────────────────────────────────────────────────────────────────────
# 2. VixMultiplierEngine
# ─────────────────────────────────────────────────────────────────────────────

class VixMultiplierEngine:
    """
    VIX 연동 포지션 크기 동적 승수.

    원리 (Whaley 2009 + 실증 연구):
    - VIX < 15 : 공포 없음 → 풀 포지션 허용 (승수 1.0)
    - VIX 15~25: 보통 → 선형 축소
    - VIX 25~35: 경계 → 50% 이하로 강제
    - VIX > 35  : 공황 → 레버리지 ETF 포지션 최대 10%
    - VIX > 50  : 극단 → 현금 보유 (승수 0)

    레버리지 ETF 전용 추가 페널티:
    - 레버리지 배수가 높을수록 VIX 임계값을 더 엄격하게 적용
    - 3x ETF는 2x보다 VIX 임계값 5pt 낮게 설정
    """

    def __init__(
        self,
        leverage: float = 3.0,
        vix_floor:   float = 15.0,   # 이하: 풀 포지션
        vix_ceiling: float = 50.0,   # 이상: 제로 포지션
        min_multiplier: float = 0.0,
    ):
        self.leverage       = leverage
        self.vix_floor      = vix_floor - (leverage - 1) * 2.5   # 레버리지 페널티 적용
        self.vix_ceiling    = vix_ceiling - (leverage - 1) * 5.0
        self.min_multiplier = min_multiplier

    def multiplier(self, vix: float) -> float:
        """
        VIX → 포지션 크기 승수 (0~1).

        구간별 비선형 스케일:
          [floor, 25)   : 선형 1.0 → 0.5
          [25, 35)      : 가속 축소 0.5 → 0.15
          [35, ceiling) : 급감 0.15 → 0.0
        """
        floor   = self.vix_floor
        ceiling = self.vix_ceiling

        if vix <= floor:
            return 1.0
        if vix >= ceiling:
            return float(self.min_multiplier)

        # 3구간 분할
        mid1 = floor + (ceiling - floor) * 0.35   # ~25 for 3x
        mid2 = floor + (ceiling - floor) * 0.65   # ~35 for 3x

        if vix <= mid1:
            t = (vix - floor) / (mid1 - floor)
            return float(1.0 - 0.5 * t)
        elif vix <= mid2:
            t = (vix - mid1) / (mid2 - mid1)
            return float(0.5 - 0.35 * t)
        else:
            t = (vix - mid2) / (ceiling - mid2)
            return float(max(0.15 - 0.15 * t, self.min_multiplier))

    def adjusted_weight(self, base_weight: float, vix: float) -> float:
        """기본 포트폴리오 비중에 VIX 승수 적용."""
        return float(np.clip(base_weight * self.multiplier(vix), 0.0, 1.0))

    def explain(self, vix: float) -> str:
        """VIX 레벨에 대한 포지션 조정 근거 설명."""
        mult = self.multiplier(vix)
        if vix <= self.vix_floor:
            status = "정상 (풀 포지션)"
        elif vix < 25:
            status = "주의 (포지션 부분 축소)"
        elif vix < 35:
            status = "경계 (포지션 대폭 축소)"
        elif vix < 50:
            status = "위기 (최소 포지션 유지)"
        else:
            status = "공황 (현금 보유)"
        return f"VIX {vix:.1f} → 승수 {mult:.2f} ({mult*100:.0f}%) | 상태: {status}"


# ─────────────────────────────────────────────────────────────────────────────
# 3. KellyPositionSizer
# ─────────────────────────────────────────────────────────────────────────────

class KellyPositionSizer:
    """
    켈리 기준(Kelly Criterion) 최적 베팅 크기 계산기.

    켈리 공식 (연속 버전):
      f* = μ / σ²
      μ  = 초과수익률 기댓값 (일평균)
      σ² = 수익률 분산

    실무 수정사항:
      1. 추정 오차 할인: 파라미터 불확실성으로 f* 과대추정 → 분수 켈리 적용
      2. 최대 레버리지 캡: 실수익률 분포의 왜도·첨도 반영 하향 조정
      3. 음수 켈리(단기 기대 마이너스): 포지션 0 (숏 금지 — 레버리지 ETF)
      4. 샘플 내 추정량 분산: 부트스트랩으로 f*의 95% CI → 하한을 사용 (보수적)

    분수 켈리 선택 기준:
      full (1.0) : 확실한 엣지 + 긴 트랙레코드 (≥3년 OOS 데이터)
      half (0.5) : 일반 전략 권장
      quarter (0.25): 레버리지 ETF / 짧은 히스토리 / 높은 분산
    """

    def __init__(
        self,
        fraction: float = 0.25,      # 분수 켈리 (레버리지 ETF 기본 0.25)
        max_weight: float = 0.90,    # 단일 종목 최대 비중
        min_edge: float = 0.0001,    # 최소 유효 기대 수익 (이하면 포지션=0)
        bootstrap_n: int = 200,      # 부트스트랩 CI 추정 샘플 수
    ):
        self.fraction   = fraction
        self.max_weight = max_weight
        self.min_edge   = min_edge
        self.bootstrap_n = bootstrap_n

    def full_kelly(self, returns: pd.Series) -> float:
        """
        수익률 시계열에서 이론적 최적 켈리 분수 계산.
        (연속 버전: f* = μ / σ²)
        """
        r = returns.dropna()
        if len(r) < 20:
            return 0.0
        mu    = float(r.mean())
        sigma2 = float(r.var())
        if sigma2 < 1e-10 or mu < self.min_edge:
            return 0.0
        f_star = mu / sigma2
        return float(np.clip(f_star, 0.0, self.max_weight))

    def fractional_kelly(self, returns: pd.Series) -> float:
        """분수 켈리 = full_kelly × fraction."""
        return float(np.clip(self.full_kelly(returns) * self.fraction, 0.0, self.max_weight))

    def bootstrap_kelly(self, returns: pd.Series) -> Dict[str, float]:
        """
        부트스트랩으로 켈리 분수의 95% 신뢰구간 추정.
        보수적 접근: 하한(5th percentile)을 실제 사용 값으로 권장.
        """
        r = returns.dropna().values
        if len(r) < 20:
            return {"lower": 0.0, "median": 0.0, "upper": 0.0, "recommended": 0.0}

        rng = np.random.default_rng(42)
        boot_kellys = []
        for _ in range(self.bootstrap_n):
            sample = rng.choice(r, size=len(r), replace=True)
            mu = float(np.mean(sample))
            s2 = float(np.var(sample))
            fk = float(np.clip(mu / s2 * self.fraction if s2 > 1e-10 and mu > self.min_edge else 0.0,
                                0.0, self.max_weight))
            boot_kellys.append(fk)

        lo = float(np.percentile(boot_kellys, 5))
        med = float(np.percentile(boot_kellys, 50))
        hi = float(np.percentile(boot_kellys, 95))
        return {
            "lower": round(lo, 4),
            "median": round(med, 4),
            "upper": round(hi, 4),
            "recommended": round(lo, 4),   # 보수적 하한 사용
        }

    def multi_asset_kelly(
        self,
        returns_df: pd.DataFrame,
    ) -> Dict[str, float]:
        """
        다중 에셋 켈리 최적화 (공분산 고려).
        f* = Σ⁻¹ · μ  (벡터 형태)

        TQQQ/SOXL처럼 고상관 에셋의 경우 공분산 역행렬이 불안정 →
        Ridge 정규화(λ=0.01) 적용.
        """
        ret = returns_df.dropna()
        if len(ret) < 30:
            return {t: 0.0 for t in returns_df.columns}

        mu    = ret.mean().values
        cov   = ret.cov().values
        n     = len(mu)
        lam   = 0.01  # Ridge 정규화 계수

        # 양정치 보장
        cov_reg = cov + lam * np.eye(n)
        try:
            f_star = np.linalg.solve(cov_reg, mu)
        except np.linalg.LinAlgError:
            return {t: 0.0 for t in returns_df.columns}

        f_frac = np.clip(f_star * self.fraction, 0.0, self.max_weight)
        # 합계가 1 초과하면 정규화
        total = f_frac.sum()
        if total > 1.0:
            f_frac /= total

        return {t: round(float(w), 4) for t, w in zip(returns_df.columns, f_frac)}


# ─────────────────────────────────────────────────────────────────────────────
# 4. RiskBudgetAllocator
# ─────────────────────────────────────────────────────────────────────────────

class RiskBudgetAllocator:
    """
    리스크 패리티 & 변동성 타겟팅 자산배분.

    리스크 패리티 (Qian 2005):
      각 에셋의 포트폴리오 리스크 기여도(MRC × w)가 균등하도록 최적화.
      → 고변동성 자산(TQQQ>SOXL) 비중 자동 조절

    변동성 타겟팅:
      목표 변동성 σ*에 맞게 전체 포지션 스케일 조정.
      포트폴리오 전체 레버리지 = σ* / 실현변동성

    TQQQ-SOXL 적용 시:
      - TQQQ가 SOXL보다 변동성이 높음 → 리스크 패리티 → SOXL 비중 상승
      - 변동성 타겟 30% → 레버리지 ETF 특성상 실제 비중 0.6 내외
    """

    def __init__(
        self,
        vol_target: float = 0.30,    # 연환산 변동성 목표 (30%)
        rebal_threshold: float = 0.05,  # 리밸런싱 트리거 (현재 vs 목표 5% 이상 차이)
        lookback: int = 63,          # 변동성 추정 기간 (일)
    ):
        self.vol_target       = vol_target
        self.rebal_threshold  = rebal_threshold
        self.lookback         = lookback

    def risk_parity_weights(self, returns: pd.DataFrame) -> np.ndarray:
        """
        리스크 패리티 최적 비중 계산.
        목적함수: Σ (RC_i - 1/N)² 최소화
        (RC_i = 에셋 i의 포트폴리오 리스크 기여 비율)
        """
        ret = returns.dropna().tail(self.lookback)
        if len(ret) < 10:
            return np.ones(len(returns.columns)) / len(returns.columns)

        cov = ret.cov().values
        n   = cov.shape[0]

        def objective(w: np.ndarray) -> float:
            w = np.abs(w)
            w /= w.sum() + 1e-10
            port_var = float(w @ cov @ w)
            if port_var < 1e-12:
                return 1e6
            mrc = cov @ w / np.sqrt(port_var)  # 한계 리스크 기여
            rc  = w * mrc                        # 절대 리스크 기여
            rc /= rc.sum() + 1e-10              # 상대 비율
            target = np.ones(n) / n
            return float(np.sum((rc - target) ** 2))

        w0 = np.ones(n) / n
        bounds = [(0.01, 0.99)] * n
        constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1}]

        result = minimize(
            objective, w0, method="SLSQP",
            bounds=bounds, constraints=constraints,
            options={"maxiter": 500, "ftol": 1e-9},
        )

        if result.success:
            w = np.abs(result.x)
            return w / w.sum()
        return np.ones(n) / n

    def vol_target_scalar(self, returns: pd.DataFrame, weights: np.ndarray) -> float:
        """
        변동성 타겟 달성을 위한 전체 포지션 스케일링 계수.
        scalar = vol_target / realized_portfolio_vol
        (최소 0.1, 최대 2.0 클리핑)
        """
        ret = returns.dropna().tail(self.lookback)
        if len(ret) < 5:
            return 1.0

        port_ret = ret.values @ weights
        realized_vol = float(np.std(port_ret) * np.sqrt(252))
        if realized_vol < 0.001:
            return 1.0

        scalar = self.vol_target / realized_vol
        return float(np.clip(scalar, 0.1, 2.0))

    def allocate(
        self,
        returns: pd.DataFrame,
        total_capital: float,
        regime: str = "bull_quiet",
    ) -> Dict[str, float]:
        """
        최종 자산배분 결정 (달러 금액).

        Parameters
        ----------
        returns       : 에셋별 수익률 DataFrame
        total_capital : 총 투자 자본 (원화 또는 달러)
        regime        : 현재 시장 국면

        Returns
        -------
        dict : {ticker -> 투자금액}
        """
        tickers = list(returns.columns)
        n = len(tickers)

        # 국면별 최대 노출도 제한
        regime_cap = {
            "bull_quiet":        0.95,
            "bull_volatile":     0.60,
            "sideways":          0.30,
            "bear":              0.05,
            "crisis":            0.00,
            "high_vol_unstable": 0.10,
        }
        max_exposure = regime_cap.get(regime, 0.50)

        if max_exposure < 0.01:
            return {t: 0.0 for t in tickers}

        # 리스크 패리티 비중
        rp_weights = self.risk_parity_weights(returns)

        # 변동성 타겟 스케일
        scalar = self.vol_target_scalar(returns, rp_weights)

        # 최종 비중 = min(RP × scalar × 국면캡, 1)
        final_weights = np.clip(rp_weights * scalar * max_exposure, 0.0, 1.0)
        total_w = final_weights.sum()
        if total_w > 1.0:
            final_weights /= total_w

        return {t: round(float(w * total_capital), 2) for t, w in zip(tickers, final_weights)}

    def marginal_risk_contribution(
        self, returns: pd.DataFrame, weights: np.ndarray
    ) -> pd.Series:
        """에셋별 포트폴리오 리스크 기여도 (%)."""
        cov = returns.cov().values
        port_vol = float(np.sqrt(weights @ cov @ weights))
        if port_vol < 1e-10:
            return pd.Series(np.zeros(len(weights)), index=returns.columns)
        mrc = (cov @ weights) / port_vol
        rc  = weights * mrc
        rc_pct = rc / rc.sum() * 100
        return pd.Series(rc_pct, index=returns.columns)


# ─────────────────────────────────────────────────────────────────────────────
# 5. DrawdownCircuitBreaker
# ─────────────────────────────────────────────────────────────────────────────

class DrawdownCircuitBreaker:
    """
    실시간 낙폭 감지 자동 노출도 축소 메커니즘.

    QuantConnect LEAN의 MaximumDrawdownPercentPerSecurity 모델 기반,
    Alpha-Helix 전용으로 확장.

    동작 원리:
    1. 포트폴리오 고점 대비 현재 낙폭(drawdown) 실시간 추적
    2. 임계값 도달 시 단계적 포지션 축소 (단계적 — 패닉 셀 방지)
    3. 극단 낙폭 시 완전 청산 → 재진입 신호 대기 (쿨다운)
    4. 레버리지 ETF의 경우 복구 시간이 길어 조기 감지·차단이 필수

    단계별 낙폭 임계값 (TQQQ-SOXL 기준):
      경보 (-15%): 포지션 50% 축소, 추가 매수 중지
      위험 (-25%): 포지션 75% 청산
      위기 (-35%): 전량 청산, 30일 재진입 쿨다운
    """

    @dataclass
    class CircuitState:
        status: str = "normal"         # normal / warning / danger / halt
        drawdown_pct: float = 0.0
        positions_multiplier: float = 1.0
        cooldown_days: int = 0
        high_water_mark: float = 0.0

    def __init__(
        self,
        warn_threshold: float  = -0.15,   # 경보 임계값
        danger_threshold: float = -0.25,  # 위험 임계값
        halt_threshold: float  = -0.35,   # 완전 차단 임계값
        cooldown_days: int = 30,          # 재진입 쿨다운 (영업일)
    ):
        self.warn_threshold   = warn_threshold
        self.danger_threshold = danger_threshold
        self.halt_threshold   = halt_threshold
        self.cooldown_days    = cooldown_days
        self.state = self.CircuitState()

    def update(self, portfolio_value: float) -> CircuitState:
        """
        포트폴리오 현재가치 입력 → 상태 갱신.

        Parameters
        ----------
        portfolio_value : 현재 포트폴리오 가치 (원화 or 달러)

        Returns
        -------
        CircuitState : 현재 서킷 상태
        """
        state = self.state

        # 쿨다운 감소
        if state.cooldown_days > 0:
            state.cooldown_days -= 1
            state.positions_multiplier = 0.0
            return state

        # 고점 갱신
        if portfolio_value > state.high_water_mark:
            state.high_water_mark = portfolio_value
            # 고점 경신 → 상태 리셋 (단, halt → normal은 쿨다운 종료 후)
            if state.status != "halt":
                state.status = "normal"
                state.positions_multiplier = 1.0

        # 낙폭 계산
        if state.high_water_mark > 0:
            state.drawdown_pct = (portfolio_value - state.high_water_mark) / state.high_water_mark
        else:
            state.drawdown_pct = 0.0

        # 단계별 상태 전환 (히스테리시스: 이전 상태 고려)
        dd = state.drawdown_pct
        if dd <= self.halt_threshold:
            if state.status != "halt":
                log.warning(f"[CircuitBreaker] HALT 발동! 낙폭 {dd*100:.1f}% — 전량 청산, {self.cooldown_days}일 쿨다운")
            state.status = "halt"
            state.positions_multiplier = 0.0
            state.cooldown_days = self.cooldown_days

        elif dd <= self.danger_threshold:
            state.status = "danger"
            state.positions_multiplier = 0.25   # 25%만 유지

        elif dd <= self.warn_threshold:
            # 선형 축소: -15% → 100%, -25% → 25%
            t = (dd - self.warn_threshold) / (self.danger_threshold - self.warn_threshold)
            state.positions_multiplier = float(np.clip(1.0 - 0.75 * t, 0.25, 1.0))
            state.status = "warning"

        else:
            state.status = "normal"
            state.positions_multiplier = 1.0

        return state

    def get_adjusted_weight(self, base_weight: float) -> float:
        """서킷브레이커 승수를 적용한 실제 포지션 비중."""
        return float(base_weight * self.state.positions_multiplier)

    def explain(self) -> str:
        s = self.state
        return (
            f"[CircuitBreaker] 상태: {s.status.upper()} | "
            f"낙폭: {s.drawdown_pct*100:.1f}% | "
            f"포지션 승수: {s.positions_multiplier:.2f} | "
            f"고점: {s.high_water_mark:,.0f} | "
            f"쿨다운 잔여: {s.cooldown_days}일"
        )


# ─────────────────────────────────────────────────────────────────────────────
# 6. RegimeAwareRiskFilter
# ─────────────────────────────────────────────────────────────────────────────

class RegimeAwareRiskFilter:
    """
    시장 국면별 리스크 파라미터 동적 스위칭 필터.

    국면 인식 투자(Regime-Aware Investing):
    - 각 시장 국면에 맞게 켈리 분수·변동성 타겟·서킷브레이커 임계값을 동적 조정
    - 상승장에서는 공격적으로, 하락장·위기에서는 방어적으로 자동 전환
    - 국면 전환 신호의 신뢰도(posterior probability)를 가중치로 반영 → 급변동 완충

    TQQQ-SOXL 전용 국면별 파라미터 세트:
    ┌─────────────────────┬────────┬─────────┬────────────┬──────────┐
    │ 국면                 │ 켈리   │ 변동성  │ 서킷브레이커│ 최대비중  │
    │                     │ 분수   │ 타겟    │ halt임계   │          │
    ├─────────────────────┼────────┼─────────┼────────────┼──────────┤
    │ bull_quiet          │ 0.25   │ 35%     │ -35%       │ 90%      │
    │ bull_volatile       │ 0.15   │ 25%     │ -25%       │ 60%      │
    │ sideways            │ 0.10   │ 15%     │ -20%       │ 30%      │
    │ bear                │ 0.05   │ 8%      │ -15%       │ 10%      │
    │ crisis / high_vol   │ 0.00   │ 5%      │ -10%       │ 0%       │
    └─────────────────────┴────────┴─────────┴────────────┴──────────┘
    """

    REGIME_PARAMS = {
        "bull_quiet":        {"kelly_frac": 0.25, "vol_target": 0.35, "halt_dd": -0.35, "max_weight": 0.90},
        "bull_volatile":     {"kelly_frac": 0.15, "vol_target": 0.25, "halt_dd": -0.25, "max_weight": 0.60},
        "sideways":          {"kelly_frac": 0.10, "vol_target": 0.15, "halt_dd": -0.20, "max_weight": 0.30},
        "bear":              {"kelly_frac": 0.05, "vol_target": 0.08, "halt_dd": -0.15, "max_weight": 0.10},
        "crisis":            {"kelly_frac": 0.00, "vol_target": 0.05, "halt_dd": -0.10, "max_weight": 0.00},
        "high_vol_unstable": {"kelly_frac": 0.00, "vol_target": 0.05, "halt_dd": -0.10, "max_weight": 0.00},
    }

    def __init__(self, smoothing: float = 0.3):
        """
        Parameters
        ----------
        smoothing : EMA 스무딩 계수 (국면 전환 시 파라미터 급변 완충)
                    0 = 즉시 전환, 1 = 변환 없음
        """
        self.smoothing = smoothing
        self._current_params: Optional[Dict] = None
        self._prev_regime: Optional[str] = None

    def get_params(
        self,
        regime: str,
        regime_proba: Optional[Dict[str, float]] = None,
    ) -> Dict[str, float]:
        """
        현재 국면에 맞는 리스크 파라미터 반환.

        regime_proba가 있으면 후방확률 가중 평균으로 부드럽게 전환.
        없으면 결정론적으로 즉시 전환.
        """
        default = self.REGIME_PARAMS.get(regime, self.REGIME_PARAMS["sideways"])

        if regime_proba:
            # 사후확률 가중 평균
            blended = {k: 0.0 for k in default}
            total_prob = 0.0
            for r, prob in regime_proba.items():
                if r in self.REGIME_PARAMS:
                    for k in blended:
                        blended[k] += self.REGIME_PARAMS[r].get(k, 0.0) * prob
                    total_prob += prob
            if total_prob > 0.01:
                for k in blended:
                    blended[k] /= total_prob
                params = blended
            else:
                params = dict(default)
        else:
            params = dict(default)

        # EMA 스무딩 (이전 파라미터와 혼합)
        if self._current_params is not None and self.smoothing > 0:
            for k in params:
                if k in self._current_params:
                    params[k] = (1 - self.smoothing) * params[k] + self.smoothing * self._current_params[k]

        self._current_params = params
        self._prev_regime = regime
        return params

    def make_kelly_sizer(self, regime: str, **kwargs) -> KellyPositionSizer:
        """국면에 맞는 KellyPositionSizer 인스턴스 반환."""
        p = self.get_params(regime, kwargs.get("regime_proba"))
        return KellyPositionSizer(fraction=p["kelly_frac"], **{k: v for k, v in kwargs.items() if k != "regime_proba"})

    def make_risk_allocator(self, regime: str, **kwargs) -> RiskBudgetAllocator:
        """국면에 맞는 RiskBudgetAllocator 인스턴스 반환."""
        p = self.get_params(regime)
        return RiskBudgetAllocator(vol_target=p["vol_target"], **kwargs)

    def make_circuit_breaker(self, regime: str) -> DrawdownCircuitBreaker:
        """국면에 맞는 DrawdownCircuitBreaker 인스턴스 반환."""
        p = self.get_params(regime)
        return DrawdownCircuitBreaker(
            halt_threshold=p["halt_dd"],
            danger_threshold=p["halt_dd"] * 0.7,
            warn_threshold=p["halt_dd"] * 0.45,
        )


# ─────────────────────────────────────────────────────────────────────────────
# 7. 통합 리스크 파이프라인
# ─────────────────────────────────────────────────────────────────────────────

class IntegratedRiskPipeline:
    """
    ConfidenceScoringSystem + VixMultiplierEngine + KellyPositionSizer
    + RiskBudgetAllocator + DrawdownCircuitBreaker를 체이닝하는
    단일 진입점.

    사용 예 (main.py에서 호출):
        pipeline = IntegratedRiskPipeline(total_capital=500_000_000)
        decision = pipeline.decide(signal_tqqq, signal_soxl, portfolio_value)
    """

    def __init__(
        self,
        total_capital: float,
        leverage: float = 3.0,
    ):
        self.total_capital = total_capital
        self.leverage      = leverage
        self.confidence_sys = ConfidenceScoringSystem()
        self.vix_engine     = VixMultiplierEngine(leverage=leverage)
        self.kelly_sizer    = KellyPositionSizer(fraction=0.25)
        self.risk_filter    = RegimeAwareRiskFilter(smoothing=0.2)
        self.circuit        = DrawdownCircuitBreaker()
        self._portfolio_val = total_capital

    def decide(
        self,
        signals: List[SignalBundle],
        returns_df: pd.DataFrame,
        portfolio_value: float,
    ) -> List[RiskDecision]:
        """
        신호 리스트 → 최종 투자 결정 리스트 반환.

        Parameters
        ----------
        signals       : 각 에셋의 SignalBundle 리스트
        returns_df    : 수익률 DataFrame (에셋 x 날짜)
        portfolio_value: 현재 포트폴리오 총 가치
        """
        # 1. 서킷브레이커 상태 갱신
        cb_state = self.circuit.update(portfolio_value)
        self._portfolio_val = portfolio_value

        if cb_state.status == "halt":
            return [
                RiskDecision(
                    ticker=s.ticker, target_weight=0.0, position_size_usd=0.0,
                    kelly_fraction=0.0, confidence_score=0.0, risk_budget_pct=0.0,
                    circuit_status="halt",
                    explanation=f"[{s.ticker}] 서킷브레이커 HALT — {self.circuit.explain()}",
                )
                for s in signals
            ]

        # 기준 국면 (첫 번째 신호 사용)
        regime = signals[0].regime if signals else "sideways"
        vix    = signals[0].vix_level if signals else 20.0

        # 2. 국면별 파라미터 적용
        regime_params = self.risk_filter.get_params(regime)

        # 3. 켈리 기반 다중 에셋 비중
        kelly = KellyPositionSizer(fraction=regime_params["kelly_frac"])
        kelly_weights = kelly.multi_asset_kelly(returns_df)

        # 4. 리스크 패리티 자산배분
        allocator = RiskBudgetAllocator(vol_target=regime_params["vol_target"])
        rp_alloc  = allocator.allocate(returns_df, portfolio_value, regime)

        # 5. VIX 승수
        vix_mult = self.vix_engine.multiplier(vix)

        decisions = []
        for sig in signals:
            # 신뢰도 계산
            confidence, contrib = self.confidence_sys.compute_confidence(sig)

            # 켈리 비중 × VIX 승수 × 서킷브레이커 승수 × 신뢰도
            base_w = kelly_weights.get(sig.ticker, 0.0)
            adj_w  = base_w * vix_mult * cb_state.positions_multiplier * confidence
            adj_w  = float(np.clip(adj_w, 0.0, regime_params["max_weight"]))
            pos_usd = adj_w * portfolio_value

            # 리스크 예산 소비 (RP 기준 대비)
            rp_target = rp_alloc.get(sig.ticker, 0.0)
            risk_budget_pct = float(pos_usd / rp_target * 100) if rp_target > 0 else 0.0

            explanation = (
                f"{self.confidence_sys.explain(sig)} | "
                f"켈리{base_w*100:.0f}% × VIX승수{vix_mult:.2f} × "
                f"신뢰도{confidence:.2f} = {adj_w*100:.0f}% | "
                f"{self.circuit.explain()}"
            )

            decisions.append(RiskDecision(
                ticker=sig.ticker,
                target_weight=round(adj_w, 4),
                position_size_usd=round(pos_usd, 2),
                kelly_fraction=regime_params["kelly_frac"],
                confidence_score=round(confidence * 100, 1),
                risk_budget_pct=round(risk_budget_pct, 1),
                circuit_status=cb_state.status,
                explanation=explanation,
            ))

        return decisions


if __name__ == "__main__":
    import numpy as np, pandas as pd

    print("=== ConfidenceScoringSystem ===")
    css = ConfidenceScoringSystem()
    test_sig = SignalBundle(
        ticker="TQQQ", raw_signal=0.7, confidence=0.0,
        regime="bull_quiet", vix_level=16.5,
        momentum_1m=0.08, momentum_3m=0.22, vol_20d=0.45,
    )
    conf, contrib = css.compute_confidence(test_sig)
    print(f"신뢰도: {conf*100:.1f}% | 기여: {contrib}")
    print(css.explain(test_sig))

    print("\n=== VixMultiplierEngine ===")
    vme = VixMultiplierEngine(leverage=3.0)
    for v in [12, 18, 25, 32, 40, 55]:
        print(f"  VIX {v:2d}: 승수 {vme.multiplier(v):.2f} — {vme.explain(v)}")

    print("\n=== DrawdownCircuitBreaker ===")
    dcb = DrawdownCircuitBreaker()
    for val in [1_000_000, 950_000, 880_000, 780_000, 1_100_000]:
        s = dcb.update(val)
        print(f"  포트폴리오 {val:,} → {s.status} | 낙폭 {s.drawdown_pct*100:.1f}% | 승수 {s.positions_multiplier:.2f}")
