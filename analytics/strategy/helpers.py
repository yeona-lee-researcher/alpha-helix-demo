"""
Alpha-Helix Developer Studio — helpers.py
==========================================
QuantStart 통계 강건성 프레임워크 기반 핵심 유틸리티

포함 모듈:
  1. FatTailSynthesizer      — 멱법칙/Fat-tail 합성 데이터 생성 (스트레스 테스트용)
  2. BayesianRegimeDetector  — Baum-Welch EM 기반 Hidden Markov 시장 국면 분류기
  3. WalkForwardValidator    — 앵커드·롤링 워크포워드 + 부트스트랩 재샘플링
  4. CorrelationStressTest   — DCC-GARCH 스타일 동적 상관관계 충격 분석
  5. OverfitPenaltyEstimator — 인-샘플 vs 아웃-오브-샘플 과적합 지수 계산

참고:
  - QuantStart "Generating Synthetic Equity Data with Realistic Correlation Structure"
  - QuantStart "Bayesian Statistics" / ARMA-GARCH 시계열 모델
  - QuantConnect LEAN Algorithm Framework 컨셉 (이벤트 드리븐 구조)
"""

from __future__ import annotations

import warnings
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from scipy import stats
from scipy.special import logsumexp

warnings.filterwarnings("ignore", category=RuntimeWarning)


# ─────────────────────────────────────────────────────────────────────────────
# 1. FatTailSynthesizer
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class SynthConfig:
    """합성 데이터 생성 설정값."""
    n_days: int = 1260                   # 생성 기간 (약 5년)
    df_t: float = 4.0                    # Student-t 자유도 (낮을수록 두꺼운 꼬리)
    annual_vol_base: float = 0.35        # 기본 연간 변동성 (TQQQ ~35%)
    annual_drift: float = 0.15           # 연간 드리프트 (기대 수익률)
    garch_alpha: float = 0.10            # GARCH(1,1) 충격 계수 α
    garch_beta: float = 0.85             # GARCH(1,1) 지속성 계수 β
    crash_prob: float = 0.005            # 일일 블랙스완 이벤트 확률
    crash_magnitude: float = -0.15       # 블랙스완 충격 크기 (-15%)
    corr_matrix: Optional[np.ndarray] = None  # 멀티에셋 상관행렬


class FatTailSynthesizer:
    """
    멱법칙/Fat-tail 합성 가격 시계열 생성기.

    이론적 배경:
    - 실제 금융 수익률은 정규분포보다 두꺼운 꼬리(leptokurtosis)를 가짐
      → Student-t(ν=4) 분포로 근사 (실증 연구상 ν≈3~5)
    - 변동성 클러스터링: GARCH(1,1) 로 시계열 이분산성 재현
      σ²_t = ω + α·ε²_{t-1} + β·σ²_{t-1}
    - 블랙스완: 낮은 확률의 급락 충격 → 극단 손실 스트레스 테스트
    - 레버리지 ETF(TQQQ/SOXL): 일일 3x 복리 경로의존성(path dependency) 반영
    """

    def __init__(self, config: Optional[SynthConfig] = None, seed: Optional[int] = 42):
        self.cfg = config or SynthConfig()
        self.rng = np.random.default_rng(seed)

    # ── 단일 에셋 ──────────────────────────────────────────────────────────

    def generate_single(self, leverage: float = 1.0) -> pd.Series:
        """
        단일 에셋 합성 가격 시계열 생성.

        Parameters
        ----------
        leverage : float
            레버리지 배수 (1=일반, 3=3x ETF). 레버리지 ETF의 변동성 감쇠(volatility decay)
            = -0.5 * leverage² * σ² * dt 를 드리프트에서 차감

        Returns
        -------
        pd.Series : index가 영업일인 종가 시계열 (시작가 100.0)
        """
        cfg = self.cfg
        n = cfg.n_days

        # GARCH(1,1) 초기 분산
        daily_vol_base = cfg.annual_vol_base / np.sqrt(252)
        omega = daily_vol_base ** 2 * (1 - cfg.garch_alpha - cfg.garch_beta)
        omega = max(omega, 1e-10)
        h_t = daily_vol_base ** 2  # 초기 조건부 분산

        returns = np.empty(n)
        for t in range(n):
            sigma_t = np.sqrt(h_t)

            # Student-t 잔차 (표준화 → 분산=1 유지)
            std_factor = np.sqrt(cfg.df_t / (cfg.df_t - 2)) if cfg.df_t > 2 else 1.0
            eps = float(self.rng.standard_t(cfg.df_t)) / std_factor

            # 블랙스완 충격
            if self.rng.random() < cfg.crash_prob:
                shock = cfg.crash_magnitude
            else:
                shock = 0.0

            # 일일 수익률: 드리프트 - 레버리지 변동성 감쇠 + 확률적 항
            daily_drift = cfg.annual_drift / 252
            vol_decay = 0.5 * (leverage ** 2) * h_t  # 레버리지 ETF 경로 비용
            r_t = leverage * (daily_drift - vol_decay + sigma_t * eps) + shock
            returns[t] = r_t

            # GARCH 분산 갱신: ε_t = sigma_t * eps
            h_t = omega + cfg.garch_alpha * (sigma_t * eps) ** 2 + cfg.garch_beta * h_t
            h_t = max(h_t, 1e-10)

        # 복리 누적 가격
        prices = 100.0 * np.cumprod(1 + returns)
        idx = pd.bdate_range(start="2010-01-04", periods=n)
        return pd.Series(prices, index=idx, name="synth_price")

    # ── 멀티에셋 (TQQQ + SOXL 등) ──────────────────────────────────────────

    def generate_multi(
        self,
        tickers: List[str],
        leverages: Optional[List[float]] = None,
        corr: Optional[np.ndarray] = None,
    ) -> pd.DataFrame:
        """
        상관관계를 가진 다중 에셋 합성 데이터 생성.

        Cholesky 분해로 상관 구조를 부여한 뒤 각 에셋별 레버리지 적용.

        Parameters
        ----------
        tickers   : 에셋 이름 리스트
        leverages : 각 에셋별 레버리지 배수 (기본: 모두 1.0)
        corr      : 상관행렬 (n×n). None이면 0.85 균일 상관 사용.
        """
        n_assets = len(tickers)
        leverages = leverages or [1.0] * n_assets

        if corr is None:
            # 기본 상관행렬: 대각 1, 오프대각 0.85 (TQQQ-SOXL 실측치 ~0.85~0.92)
            corr = np.full((n_assets, n_assets), 0.85)
            np.fill_diagonal(corr, 1.0)

        # Cholesky 분해로 상관 벡터 생성
        try:
            L = np.linalg.cholesky(corr)
        except np.linalg.LinAlgError:
            # 양정치 행렬 아닐 경우 최소 고유값 보정
            eigvals = np.linalg.eigvalsh(corr)
            corr += (-eigvals.min() + 1e-6) * np.eye(n_assets)
            L = np.linalg.cholesky(corr)

        cfg = self.cfg
        n = cfg.n_days
        daily_vol_base = cfg.annual_vol_base / np.sqrt(252)
        omega = daily_vol_base ** 2 * (1 - cfg.garch_alpha - cfg.garch_beta)
        omega = max(omega, 1e-10)

        # 각 에셋별 GARCH 상태
        h = np.full(n_assets, daily_vol_base ** 2)
        all_returns = np.empty((n, n_assets))

        for t in range(n):
            sigma = np.sqrt(h)

            # 독립 표준화 t-잔차
            std_factor = np.sqrt(cfg.df_t / (cfg.df_t - 2)) if cfg.df_t > 2 else 1.0
            z_ind = self.rng.standard_t(cfg.df_t, size=n_assets) / std_factor

            # 상관 적용
            z_corr = L @ z_ind

            # 블랙스완 (동시 발생 — 시스템 리스크)
            crash = 0.0
            if self.rng.random() < cfg.crash_prob:
                crash = cfg.crash_magnitude

            daily_drift = cfg.annual_drift / 252
            for i in range(n_assets):
                vol_decay = 0.5 * (leverages[i] ** 2) * h[i]
                r = leverages[i] * (daily_drift - vol_decay + sigma[i] * z_corr[i]) + crash
                all_returns[t, i] = r
                eps_i = sigma[i] * z_corr[i]
                h[i] = omega + cfg.garch_alpha * eps_i ** 2 + cfg.garch_beta * h[i]
                h[i] = max(h[i], 1e-10)

        idx = pd.bdate_range(start="2010-01-04", periods=n)
        prices = 100.0 * np.cumprod(1 + all_returns, axis=0)
        return pd.DataFrame(prices, index=idx, columns=tickers)

    # ── 스트레스 시나리오 ──────────────────────────────────────────────────

    def generate_stress_scenarios(
        self,
        n_scenarios: int = 500,
        leverage: float = 3.0,
    ) -> pd.DataFrame:
        """
        Monte Carlo 방식으로 n_scenarios개의 독립 경로를 생성.
        각 경로의 최종 수익률·MDD를 반환 (분포 분석용).
        """
        results = []
        for i in range(n_scenarios):
            synth = FatTailSynthesizer(config=self.cfg, seed=i)
            prices = synth.generate_single(leverage=leverage)
            total_ret = prices.iloc[-1] / prices.iloc[0] - 1
            rolling_max = prices.cummax()
            mdd = float(((prices - rolling_max) / rolling_max).min())
            results.append({"scenario": i, "total_return": total_ret, "max_drawdown": mdd})
        return pd.DataFrame(results)


# ─────────────────────────────────────────────────────────────────────────────
# 2. BayesianRegimeDetector
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class RegimeState:
    """HMM 단일 상태 파라미터."""
    mean_return: float      # 일평균 수익률
    std_return: float       # 일수익률 표준편차
    label: str              # 레짐 이름
    color: str = "#888888"  # 시각화용 색상


class BayesianRegimeDetector:
    """
    Baum-Welch EM 알고리즘 기반 Hidden Markov Model 시장 국면 탐지.

    이론적 배경 (QuantStart "Bayesian Statistics" 기반):
    - 시장 국면(regime)은 관측 불가능한 은닉 상태(hidden state)
    - 관측된 수익률 시퀀스로 최적 상태 시퀀스 추론 (Viterbi 알고리즘)
    - 전이행렬(Transition Matrix): P(s_t | s_{t-1}) → 국면 지속성/전환속도 모델링
    - 방출확률(Emission): 각 국면별 수익률이 가우시안 분포 따른다고 가정
    - 베이지안 초기값(Prior): 역사적 통계로 초기화 → EM 수렴 안정화

    상태 정의 (4-state):
      bull_quiet     : 상승 + 저변동  (정상 강세장)
      bull_volatile  : 상승 + 고변동  (불안한 강세 — 2020년 3월 이후 반등 등)
      bear           : 하락 + 저/중변동 (조정·약세장)
      crisis         : 하락 + 극변동  (2008, 2020.03 급락)
    """

    STATES: List[RegimeState] = [
        RegimeState(mean_return=0.0008,  std_return=0.012, label="bull_quiet",    color="#22c55e"),
        RegimeState(mean_return=0.0004,  std_return=0.025, label="bull_volatile", color="#f59e0b"),
        RegimeState(mean_return=-0.0005, std_return=0.018, label="bear",          color="#ef4444"),
        RegimeState(mean_return=-0.003,  std_return=0.040, label="crisis",        color="#7f1d1d"),
    ]

    def __init__(self, n_states: int = 4, max_iter: int = 100, tol: float = 1e-4):
        self.n_states = n_states
        self.max_iter = max_iter
        self.tol = tol

        # 파라미터 초기화 (역사적 근거)
        self.means_ = np.array([s.mean_return for s in self.STATES[:n_states]])
        self.stds_  = np.array([s.std_return  for s in self.STATES[:n_states]])

        # 전이행렬 초기값: 대각 0.97 (국면 지속성 높음), 오프대각 균등
        diag_prob = 0.97
        off_prob  = (1 - diag_prob) / max(n_states - 1, 1)
        self.A_ = np.full((n_states, n_states), off_prob)
        np.fill_diagonal(self.A_, diag_prob)

        # 초기 분포: 균등
        self.pi_ = np.ones(n_states) / n_states

        self._is_fitted = False

    # ── Forward-Backward (Baum-Welch) ──────────────────────────────────────

    def _emission_log_prob(self, obs: np.ndarray) -> np.ndarray:
        """각 시점별 각 상태의 로그 방출 확률 [T x K]."""
        T = len(obs)
        K = self.n_states
        log_b = np.empty((T, K))
        for k in range(K):
            log_b[:, k] = stats.norm.logpdf(obs, loc=self.means_[k], scale=self.stds_[k])
        return log_b

    def _forward(self, log_b: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Forward 알고리즘 (log-scale). 반환: (log_alpha [T×K], log_scale [T])."""
        T, K = log_b.shape
        log_alpha = np.empty((T, K))
        log_alpha[0] = np.log(self.pi_ + 1e-300) + log_b[0]
        for t in range(1, T):
            for k in range(K):
                log_alpha[t, k] = logsumexp(log_alpha[t-1] + np.log(self.A_[:, k] + 1e-300)) + log_b[t, k]
        return log_alpha

    def _backward(self, log_b: np.ndarray) -> np.ndarray:
        """Backward 알고리즘 (log-scale). 반환: log_beta [T×K]."""
        T, K = log_b.shape
        log_beta = np.zeros((T, K))
        for t in range(T - 2, -1, -1):
            for k in range(K):
                log_beta[t, k] = logsumexp(
                    np.log(self.A_[k, :] + 1e-300) + log_b[t+1] + log_beta[t+1]
                )
        return log_beta

    def fit(self, returns: pd.Series) -> "BayesianRegimeDetector":
        """
        Baum-Welch EM으로 HMM 파라미터 추정.

        Parameters
        ----------
        returns : 일별 수익률 시계열
        """
        obs = returns.dropna().values
        T = len(obs)
        K = self.n_states

        prev_ll = -np.inf
        for iteration in range(self.max_iter):
            log_b = self._emission_log_prob(obs)
            log_alpha = self._forward(log_b)
            log_beta  = self._backward(log_b)

            # 로그-우도
            ll = logsumexp(log_alpha[-1])

            # 수렴 체크
            if abs(ll - prev_ll) < self.tol and iteration > 5:
                break
            prev_ll = ll

            # E-step: γ (상태 점유 확률) & ξ (전이 확률)
            log_gamma = log_alpha + log_beta
            log_gamma -= logsumexp(log_gamma, axis=1, keepdims=True)
            gamma = np.exp(log_gamma)

            # M-step: 파라미터 갱신
            # 평균·표준편차
            for k in range(K):
                w = gamma[:, k] + 1e-10
                self.means_[k] = np.average(obs, weights=w)
                self.stds_[k]  = np.sqrt(np.average((obs - self.means_[k]) ** 2, weights=w))
                self.stds_[k]  = max(self.stds_[k], 1e-5)

            # 전이행렬 (ξ 기반 — logsumexp로 언더플로우 방지)
            for i in range(K):
                log_denom = logsumexp(log_gamma[:-1, i])  # log(Σ_t γ_t(i))
                for j in range(K):
                    # log(Σ_t α_t(i)·A_ij·b_j(o_{t+1})·β_{t+1}(j))
                    log_numer = logsumexp(
                        log_alpha[:-1, i]
                        + np.log(self.A_[i, j] + 1e-300)
                        + log_b[1:, j]
                        + log_beta[1:, j]
                    )
                    self.A_[i, j] = np.exp(np.clip(log_numer - log_denom, -30, 0))
                row_sum = self.A_[i].sum() + 1e-10
                self.A_[i] /= row_sum

            self.pi_ = gamma[0] / (gamma[0].sum() + 1e-10)

        self._is_fitted = True
        return self

    def predict_proba(self, returns: pd.Series) -> pd.DataFrame:
        """
        각 시점별 상태 사후 확률 반환.
        (포트폴리오 신뢰도 계산에 활용)
        """
        if not self._is_fitted:
            raise RuntimeError("먼저 fit()을 호출하세요.")
        obs = returns.dropna().values
        log_b = self._emission_log_prob(obs)
        log_alpha = self._forward(log_b)
        log_beta  = self._backward(log_b)
        log_gamma = log_alpha + log_beta
        log_gamma -= logsumexp(log_gamma, axis=1, keepdims=True)
        proba = np.exp(log_gamma)
        labels = [s.label for s in self.STATES[:self.n_states]]
        idx = returns.dropna().index
        return pd.DataFrame(proba, index=idx, columns=labels)

    def predict(self, returns: pd.Series) -> pd.Series:
        """Viterbi 알고리즘으로 최적 상태 시퀀스 반환."""
        if not self._is_fitted:
            raise RuntimeError("먼저 fit()을 호출하세요.")
        obs = returns.dropna().values
        T = len(obs)
        K = self.n_states
        log_b = self._emission_log_prob(obs)

        # Viterbi
        delta = np.full((T, K), -np.inf)
        psi   = np.zeros((T, K), dtype=int)
        delta[0] = np.log(self.pi_ + 1e-300) + log_b[0]
        for t in range(1, T):
            for k in range(K):
                scores = delta[t-1] + np.log(self.A_[:, k] + 1e-300)
                psi[t, k]   = np.argmax(scores)
                delta[t, k] = scores[psi[t, k]] + log_b[t, k]

        # Back-tracking
        path = np.empty(T, dtype=int)
        path[-1] = np.argmax(delta[-1])
        for t in range(T - 2, -1, -1):
            path[t] = psi[t + 1, path[t + 1]]

        labels = [s.label for s in self.STATES[:K]]
        idx = returns.dropna().index
        return pd.Series([labels[p] for p in path], index=idx, name="regime")

    def get_transition_matrix(self) -> pd.DataFrame:
        """학습된 전이행렬을 DataFrame으로 반환."""
        labels = [s.label for s in self.STATES[:self.n_states]]
        return pd.DataFrame(self.A_, index=labels, columns=labels)


# ─────────────────────────────────────────────────────────────────────────────
# 3. WalkForwardValidator
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class WFConfig:
    """워크포워드 설정."""
    train_days: int = 504      # 훈련 윈도우 (약 2년)
    test_days: int  = 63       # 테스트 윈도우 (약 3개월)
    anchored: bool  = False    # True=앵커드(훈련창 확장), False=롤링
    n_bootstrap: int = 200     # 부트스트랩 반복 횟수


@dataclass
class WFResult:
    """워크포워드 단일 fold 결과."""
    fold_id: int
    train_start: pd.Timestamp
    train_end: pd.Timestamp
    test_start: pd.Timestamp
    test_end: pd.Timestamp
    is_sharpe: float
    oos_sharpe: float
    oos_total_return: float
    oos_max_drawdown: float
    regime_dist: Dict[str, float] = field(default_factory=dict)


class WalkForwardValidator:
    """
    앵커드·롤링 워크포워드 검증 + 부트스트랩 재샘플링.

    QuantStart 방법론:
    - 인-샘플(IS): 파라미터 최적화 구간
    - 아웃-오브-샘플(OOS): 미래 성과 시뮬레이션 구간
    - 과적합 지수 = (IS Sharpe - OOS Sharpe) / IS Sharpe × 100%
    - 부트스트랩: OOS 수익률을 복원추출로 재배열 → 신뢰구간 추정
    """

    def __init__(self, config: Optional[WFConfig] = None):
        self.cfg = config or WFConfig()

    def split(self, prices: pd.Series) -> List[Dict[str, pd.Series]]:
        """IS/OOS fold 리스트 생성."""
        cfg = self.cfg
        folds = []
        n = len(prices)
        start = cfg.train_days
        fold_id = 0
        while start + cfg.test_days <= n:
            if cfg.anchored:
                train_idx = slice(0, start)
            else:
                train_idx = slice(start - cfg.train_days, start)
            test_idx = slice(start, start + cfg.test_days)

            folds.append({
                "fold_id": fold_id,
                "train":   prices.iloc[train_idx],
                "test":    prices.iloc[test_idx],
            })
            start += cfg.test_days
            fold_id += 1
        return folds

    def evaluate_fold(
        self,
        train_prices: pd.Series,
        test_prices: pd.Series,
        strategy_fn,
    ) -> WFResult:
        """
        단일 fold 평가.

        Parameters
        ----------
        train_prices : IS 가격 시계열
        test_prices  : OOS 가격 시계열
        strategy_fn  : Callable[[pd.Series], pd.Series]
                       가격 시계열 → 일별 수익률 시계열 반환하는 전략 함수
        """
        is_returns  = strategy_fn(train_prices)
        oos_returns = strategy_fn(test_prices)

        def _sharpe(r: pd.Series) -> float:
            r = r.dropna()
            if len(r) < 5 or r.std() < 1e-10:
                return 0.0
            return float(r.mean() / r.std() * np.sqrt(252))

        def _total_return(r: pd.Series) -> float:
            return float((1 + r.dropna()).prod() - 1) * 100

        def _mdd(r: pd.Series) -> float:
            r = r.dropna()
            cumval = (1 + r).cumprod()
            rolling_max = cumval.cummax()
            dd = (cumval - rolling_max) / rolling_max
            return float(dd.min()) * 100

        return WFResult(
            fold_id=0,
            train_start=train_prices.index[0],
            train_end=train_prices.index[-1],
            test_start=test_prices.index[0],
            test_end=test_prices.index[-1],
            is_sharpe=_sharpe(is_returns),
            oos_sharpe=_sharpe(oos_returns),
            oos_total_return=_total_return(oos_returns),
            oos_max_drawdown=_mdd(oos_returns),
        )

    def run(
        self,
        prices: pd.Series,
        strategy_fn,
    ) -> Dict[str, Any]:
        """
        전체 워크포워드 실행.

        Returns
        -------
        dict with keys:
          folds        : List[WFResult]
          oos_sharpe_mean / std
          overfit_idx  : (IS평균 - OOS평균) / IS평균 × 100 (%)
          bootstrap_ci : (5th, 95th percentile of OOS Sharpe)
        """
        splits = self.split(prices)
        results: List[WFResult] = []
        for i, s in enumerate(splits):
            r = self.evaluate_fold(s["train"], s["test"], strategy_fn)
            r.fold_id = i
            results.append(r)

        if not results:
            return {"folds": [], "oos_sharpe_mean": 0, "overfit_idx": 100}

        is_sharpes  = [r.is_sharpe  for r in results]
        oos_sharpes = [r.oos_sharpe for r in results]
        oos_rets    = [r.oos_total_return for r in results]

        is_mean  = float(np.mean(is_sharpes))
        oos_mean = float(np.mean(oos_sharpes))
        oos_std  = float(np.std(oos_sharpes))

        overfit_idx = (
            (is_mean - oos_mean) / abs(is_mean) * 100
            if abs(is_mean) > 0.01 else 100.0
        )

        # 부트스트랩 신뢰구간
        bootstrap_oos = []
        rng = np.random.default_rng(0)
        for _ in range(self.cfg.n_bootstrap):
            sample = rng.choice(oos_rets, size=len(oos_rets), replace=True)
            bootstrap_oos.append(float(np.mean(sample)))
        ci_lo = float(np.percentile(bootstrap_oos, 5))
        ci_hi = float(np.percentile(bootstrap_oos, 95))

        return {
            "folds":            results,
            "is_sharpe_mean":   is_mean,
            "oos_sharpe_mean":  oos_mean,
            "oos_sharpe_std":   oos_std,
            "overfit_idx":      overfit_idx,
            "bootstrap_ci":     (ci_lo, ci_hi),
            "n_folds":          len(results),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 4. CorrelationStressTest
# ─────────────────────────────────────────────────────────────────────────────

class CorrelationStressTest:
    """
    동적 상관관계 충격 분석.
    공황 구간(2008, 2020.03 등)에서 상관관계가 1에 수렴하는 "correlation breakdown" 현상을 
    시뮬레이션하여 포트폴리오 다각화 효과 손실 위험을 정량화.

    방법:
      - 평상시 상관행렬(normal)과 위기 상관행렬(crisis) 두 가지 시나리오
      - 각 시나리오별 포트폴리오 VaR(99%) / CVaR(99%) 계산
      - 상관 증가에 따른 다각화 이익(Diversification Ratio) 감소 측정
    """

    def __init__(self, weights: np.ndarray, vols: np.ndarray):
        """
        Parameters
        ----------
        weights : 포트폴리오 비중 벡터 (합=1)
        vols    : 각 에셋 일별 변동성 벡터
        """
        self.weights = weights / weights.sum()
        self.vols    = vols

    def portfolio_vol(self, corr: np.ndarray) -> float:
        """주어진 상관행렬에서 포트폴리오 변동성 계산."""
        cov = np.outer(self.vols, self.vols) * corr
        port_var = float(self.weights @ cov @ self.weights)
        return float(np.sqrt(max(port_var, 0)))

    def diversification_ratio(self, corr: np.ndarray) -> float:
        """
        다각화 비율 = 가중평균 개별변동성 / 포트폴리오변동성
        > 1이면 분산투자 효과 있음. 위기 시 1에 수렴.
        """
        weighted_vol = float(self.weights @ self.vols)
        port_v = self.portfolio_vol(corr)
        return weighted_vol / port_v if port_v > 0 else 1.0

    def run(self, normal_corr: np.ndarray, crisis_corr: Optional[np.ndarray] = None) -> Dict[str, float]:
        """
        정상·위기 시나리오별 포트폴리오 통계 비교.

        crisis_corr가 None이면 all-1 상관행렬 사용 (최악 시나리오).
        """
        n = len(self.weights)
        if crisis_corr is None:
            crisis_corr = np.ones((n, n)) * 0.97
            np.fill_diagonal(crisis_corr, 1.0)

        vol_normal = self.portfolio_vol(normal_corr)
        vol_crisis = self.portfolio_vol(crisis_corr)
        dr_normal  = self.diversification_ratio(normal_corr)
        dr_crisis  = self.diversification_ratio(crisis_corr)

        # 정규분포 가정 99% VaR (일별)
        z99 = stats.norm.ppf(0.01)
        var_normal = float(-z99 * vol_normal)
        var_crisis = float(-z99 * vol_crisis)

        # CVaR(99%) = E[손실 | 손실 > VaR]
        cvar_normal = float(vol_normal * stats.norm.pdf(z99) / 0.01)
        cvar_crisis = float(vol_crisis * stats.norm.pdf(z99) / 0.01)

        return {
            "vol_normal":  round(vol_normal * np.sqrt(252) * 100, 2),   # 연환산 %
            "vol_crisis":  round(vol_crisis * np.sqrt(252) * 100, 2),
            "dr_normal":   round(dr_normal, 3),
            "dr_crisis":   round(dr_crisis, 3),
            "var99_normal": round(var_normal * 100, 2),   # 일별 %
            "var99_crisis": round(var_crisis * 100, 2),
            "cvar99_normal": round(cvar_normal * 100, 2),
            "cvar99_crisis": round(cvar_crisis * 100, 2),
            "vol_increase_pct": round((vol_crisis / vol_normal - 1) * 100, 1),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 5. OverfitPenaltyEstimator
# ─────────────────────────────────────────────────────────────────────────────

class OverfitPenaltyEstimator:
    """
    전략 과적합 지수(Overfitting Index) 정량 추정기.

    방법론:
      1. Combinatorial Purged Cross-Validation (CPCV, Lopez de Prado 2018)
         — 겹치는 레이블 제거 후 모든 조합으로 폴드 생성
      2. Deflated Sharpe Ratio (DSR, Bailey & Lopez de Prado 2016)
         — 다중 테스트 문제를 보정한 유효 Sharpe 비율
      3. 최적화 편향 측정
         — 테스트된 파라미터 조합 수(N)가 많을수록 우연 성과 확률 증가

    참고 공식:
      Prob(최적 IS Sharpe >= θ | N 시도) ≈ 1 - (1 - Φ(θ))^N
      → N이 증가할수록 임의로 높은 Sharpe를 얻을 확률이 기하급수적으로 증가
    """

    def __init__(self, n_trials: int = 1):
        """
        Parameters
        ----------
        n_trials : 시도한 파라미터 조합 수 (최적화 런 수)
        """
        self.n_trials = n_trials

    def deflated_sharpe_ratio(
        self,
        observed_sharpe: float,
        returns_series: pd.Series,
        benchmark_sharpe: float = 0.0,
    ) -> float:
        """
        Deflated Sharpe Ratio 계산.
        DSR = SR* where SR* = (SR - E[max SR]) / sqrt(Var[max SR])
        Bailey-Lopez de Prado (2016) 간략화 버전.
        """
        r = returns_series.dropna()
        n = len(r)
        if n < 20:
            return 0.0

        sr = observed_sharpe / np.sqrt(252)  # 일별 단위
        skew = float(r.skew())
        kurt = float(r.kurt())

        # 최대 기대 Sharpe (N번 시도 중): E[max SR] = Z (Euler–Mascheroni 근사)
        # 간략 근사: E_max_sr ≈ (1 - γ) * Z_{1 - 1/N} + γ * Z_{1 - 1/(N*e)}
        # γ ≈ 0.5772 (Euler-Mascheroni 상수)
        if self.n_trials > 1:
            gamma = 0.5772
            p1 = 1 - 1 / self.n_trials
            p2 = 1 - 1 / (self.n_trials * np.e)
            e_max = (1 - gamma) * stats.norm.ppf(max(p1, 0.001)) + gamma * stats.norm.ppf(max(p2, 0.001))
        else:
            e_max = 0.0

        # 비중심 3·4차 모멘트 보정
        sr_std = np.sqrt((1 + (0.5 * sr**2) - skew * sr + (kurt - 3) / 4 * sr**2) / (n - 1))
        dsr = (sr - e_max) / (sr_std + 1e-10)
        return float(dsr)

    def overfit_probability(self, is_sharpe: float, oos_sharpe: float) -> Dict[str, float]:
        """
        과적합 확률 및 지수 계산.

        Returns
        -------
        dict:
          overfit_prob   : 우연 성과일 확률 (0~1)
          performance_degradation : OOS 성과 하락율 (%)
          is_likely_overfit : bool
        """
        if abs(is_sharpe) < 0.01:
            return {"overfit_prob": 1.0, "performance_degradation": 100.0, "is_likely_overfit": True}

        # 최적화 편향: N번 중 최고값이 θ 이상일 확률
        # p_random = 1 - Φ(is_sharpe)
        # P(우연) ≈ 1 - (1 - p_random)^N
        p_single = 1 - stats.norm.cdf(is_sharpe)
        p_overfit = 1 - (1 - p_single) ** self.n_trials

        degradation = max(0, (is_sharpe - oos_sharpe) / abs(is_sharpe) * 100)

        return {
            "overfit_prob": round(float(p_overfit), 4),
            "performance_degradation": round(float(degradation), 1),
            "is_likely_overfit": bool(degradation > 50 or p_overfit > 0.3),
            "deflation_needed": bool(self.n_trials > 10),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 6. 유틸리티 함수
# ─────────────────────────────────────────────────────────────────────────────

def compute_sharpe(returns: pd.Series, annualize: bool = True) -> float:
    """연환산 Sharpe 비율."""
    r = returns.dropna()
    if len(r) < 2 or r.std() < 1e-10:
        return 0.0
    s = float(r.mean() / r.std())
    return s * np.sqrt(252) if annualize else s


def compute_sortino(returns: pd.Series, mar: float = 0.0) -> float:
    """Sortino 비율 (하방 리스크만 고려)."""
    r = returns.dropna()
    downside = r[r < mar]
    if len(downside) < 2 or downside.std() < 1e-10:
        return 0.0
    return float((r.mean() - mar / 252) / downside.std() * np.sqrt(252))


def compute_calmar(prices: pd.Series) -> float:
    """Calmar 비율 = CAGR / |MaxDrawdown|."""
    ret = prices.pct_change().dropna()
    n_years = len(ret) / 252
    if n_years < 0.5:
        return 0.0
    cagr = float((prices.iloc[-1] / prices.iloc[0]) ** (1 / n_years) - 1)
    rolling_max = prices.cummax()
    mdd = float(((prices - rolling_max) / rolling_max).min())
    if abs(mdd) < 0.001:
        return 0.0
    return float(cagr / abs(mdd))


def compute_omega_ratio(returns: pd.Series, threshold: float = 0.0) -> float:
    """Omega 비율 = 이익면적 / 손실면적 (임계값 이상/이하)."""
    r = returns.dropna()
    gains  = r[r > threshold] - threshold
    losses = threshold - r[r < threshold]
    if losses.sum() < 1e-10:
        return float("inf")
    return float(gains.sum() / losses.sum())


def annualized_return(prices: pd.Series) -> float:
    """연환산 수익률 (CAGR)."""
    n_years = len(prices) / 252
    if n_years < 0.1 or prices.iloc[0] <= 0:
        return 0.0
    return float((prices.iloc[-1] / prices.iloc[0]) ** (1 / n_years) - 1) * 100


def max_drawdown(prices: pd.Series) -> float:
    """최대 낙폭 (음수 %)."""
    rolling_max = prices.cummax()
    dd = (prices - rolling_max) / rolling_max
    return float(dd.min()) * 100


def rolling_sharpe(returns: pd.Series, window: int = 63) -> pd.Series:
    """롤링 Sharpe (기본 63일 = 3개월)."""
    roll_mean = returns.rolling(window).mean()
    roll_std  = returns.rolling(window).std()
    return (roll_mean / roll_std * np.sqrt(252)).rename("rolling_sharpe")


if __name__ == "__main__":
    # ── 빠른 동작 검증 ──────────────────────────────────────────────────────
    print("=== FatTailSynthesizer ===")
    synth = FatTailSynthesizer(SynthConfig(n_days=500), seed=0)
    prices_tqqq = synth.generate_single(leverage=3.0)
    print(f"TQQQ 합성 {len(prices_tqqq)}일 | 최종가: {prices_tqqq.iloc[-1]:.1f} | "
          f"CAGR: {annualized_return(prices_tqqq):.1f}%")

    print("\n=== BayesianRegimeDetector ===")
    detector = BayesianRegimeDetector(n_states=4)
    rets = prices_tqqq.pct_change().dropna()
    detector.fit(rets)
    regimes = detector.predict(rets)
    print(regimes.value_counts())
    print("전이행렬:\n", detector.get_transition_matrix().round(3))

    print("\n=== WalkForwardValidator ===")
    validator = WalkForwardValidator(WFConfig(train_days=252, test_days=63, n_bootstrap=100))
    def simple_bh(p: pd.Series) -> pd.Series:
        return p.pct_change().dropna()
    wf_result = validator.run(prices_tqqq, simple_bh)
    print(f"Folds: {wf_result['n_folds']} | OOS Sharpe: {wf_result['oos_sharpe_mean']:.2f} ± "
          f"{wf_result['oos_sharpe_std']:.2f} | Overfit: {wf_result['overfit_idx']:.1f}%")
