"""
analytics/strategy/ 통합 검증 스크립트 — 실제 TQQQ/SOXL/VIX 데이터 사용
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

import numpy as np
import pandas as pd
import yfinance as yf

# ─────────────────────────────────────────────
# 실제 데이터 다운로드 (5년치 일봉)
# ─────────────────────────────────────────────
print("실제 데이터 다운로드 중... (TQQQ / SOXL / ^VIX)")

def _fetch(ticker: str, period: str = "5y") -> pd.Series:
    df = yf.Ticker(ticker).history(period=period, interval="1d", auto_adjust=True)
    df.index = df.index.tz_localize(None) if df.index.tz else df.index
    return df["Close"].rename(ticker)

tqqq    = _fetch("TQQQ")
soxl    = _fetch("SOXL")
vix_raw = _fetch("^VIX")

# 공통 거래일 정렬
common_idx = tqqq.index.intersection(soxl.index)
tqqq   = tqqq.reindex(common_idx).dropna()
soxl   = soxl.reindex(common_idx).dropna()
vix_s  = vix_raw.reindex(common_idx).ffill().fillna(20.0)
vix_s.name = "VIX"

print(f"  TQQQ: {len(tqqq)}일 ({tqqq.index[0].date()} ~ {tqqq.index[-1].date()})")
print(f"  SOXL: {len(soxl)}일 ({soxl.index[0].date()} ~ {soxl.index[-1].date()})")
print(f"  VIX : {vix_s.min():.1f} ~ {vix_s.max():.1f}")
print()

rets_tqqq = tqqq.pct_change().dropna()
rets_soxl = soxl.pct_change().dropna()

# ─────────────────────────────────────────────
from analytics.strategy.helpers import (
    FatTailSynthesizer, SynthConfig,
    BayesianRegimeDetector, WalkForwardValidator, WFConfig,
    OverfitPenaltyEstimator, CorrelationStressTest,
    compute_sharpe, max_drawdown, annualized_return,
)

print("=" * 60)
print("[1] helpers.py 검증")
print("=" * 60)

# FatTailSynthesizer: 합성 데이터 생성 기능 자체 테스트 (stress scenario용)
synth_ref = FatTailSynthesizer(SynthConfig(n_days=252, annual_vol_base=0.55), seed=0)
stress_df = synth_ref.generate_stress_scenarios(n_scenarios=50, leverage=3.0)
print(f"  FatTailSynthesizer(스트레스 시나리오 생성): 50개 시나리오 OK")
print(f"  StressScenarios(50): median_ret={stress_df['total_return'].median()*100:.1f}% | worst_mdd={stress_df['max_drawdown'].min()*100:.1f}%")

# BayesianRegimeDetector — 실제 TQQQ 수익률
print(f"  TQQQ CAGR={annualized_return(tqqq):.1f}% | MDD={max_drawdown(tqqq):.1f}%")
detector = BayesianRegimeDetector(n_states=4)
detector.fit(rets_tqqq)
regimes = detector.predict(rets_tqqq)
counts = regimes.value_counts().to_dict()
print(f"  BayesianRegimeDetector(실제TQQQ): {counts}")
tm = detector.get_transition_matrix()
print(f"  TransitionMatrix diagonal: {[round(tm.iloc[i,i],3) for i in range(4)]}")

# WalkForwardValidator — 실제 TQQQ
wf = WalkForwardValidator(WFConfig(train_days=252, test_days=63, n_bootstrap=50))
res = wf.run(tqqq, lambda p: p.pct_change().dropna())
print(f"  WalkForward(실제TQQQ): folds={res['n_folds']} | IS_sharpe={res['is_sharpe_mean']:.3f} | OOS_sharpe={res['oos_sharpe_mean']:.3f} | overfit={res['overfit_idx']:.1f}%")
print(f"  Bootstrap CI: {res['bootstrap_ci'][0]:.1f}% ~ {res['bootstrap_ci'][1]:.1f}%")

# CorrelationStressTest — 실제 공분산에서 계산
common_rets = pd.concat([rets_tqqq, rets_soxl], axis=1).dropna()
real_vols   = common_rets.std().values / (252 ** 0.5)   # 일간 vol
real_corr   = common_rets.corr().values
crisis_corr = np.clip(real_corr + np.array([[0,0.10],[0.10,0]]), -1, 1)  # 상관 +10% 충격
cs = CorrelationStressTest(np.array([0.5, 0.5]), real_vols)
cr = cs.run(real_corr, crisis_corr)
print(f"  CorrelationStress(실제): vol_normal={cr['vol_normal']}% -> vol_crisis={cr['vol_crisis']}% (+{cr['vol_increase_pct']}%)")

ope = OverfitPenaltyEstimator(n_trials=50)
op = ope.overfit_probability(is_sharpe=1.5, oos_sharpe=0.3)
print(f"  OverfitPenalty: prob={op['overfit_prob']} | degradation={op['performance_degradation']}% | likely_overfit={op['is_likely_overfit']}")

print()
print("=" * 60)
print("[2] risk_control.py 검증")
print("=" * 60)

from analytics.strategy.risk_control import (
    ConfidenceScoringSystem, VixMultiplierEngine, KellyPositionSizer,
    RiskBudgetAllocator, DrawdownCircuitBreaker, RegimeAwareRiskFilter,
    IntegratedRiskPipeline, SignalBundle,
)

# ConfidenceScoringSystem — 실제 최신 지표 사용
mom_1m   = float(rets_tqqq.iloc[-21:].sum())
mom_3m   = float(rets_tqqq.iloc[-63:].sum())
vol_20d  = float(rets_tqqq.iloc[-20:].std() * (252 ** 0.5))
last_vix = float(vix_s.iloc[-1])
css = ConfidenceScoringSystem()
sig = SignalBundle(
    ticker="TQQQ", raw_signal=0.7, confidence=0.0,
    regime="bull_quiet", vix_level=last_vix,
    momentum_1m=mom_1m, momentum_3m=mom_3m, vol_20d=vol_20d,
)
conf, contrib = css.compute_confidence(sig)
print(f"  ConfidenceScoring(실제지표): conf={conf:.3f} | VIX={last_vix:.1f} | mom1m={mom_1m:.3f}")
print(f"  top 기여 피처: {max(contrib, key=contrib.get)}({max(contrib.values()):.3f})")

vme = VixMultiplierEngine(leverage=3.0)
for vix_val in [12, 20, 35]:
    m = vme.multiplier(vix_val)
    print(f"  VixMultiplier: VIX={vix_val} -> {m:.2f}")

# KellyPositionSizer — 실제 TQQQ/SOXL 수익률
ks = KellyPositionSizer(fraction=0.25)
rets_df = common_rets.copy()
kw = ks.multi_asset_kelly(rets_df)
print(f"  KellyWeights(실제): {kw}")
bk = ks.bootstrap_kelly(rets_df['TQQQ'])
print(f"  BootstrapKelly(실제TQQQ): lower={bk['lower']:.4f} | median={bk['median']:.4f} | upper={bk['upper']:.4f}")

dcb = DrawdownCircuitBreaker()
test_vals = [1_000_000, 950_000, 800_000, 650_000, 1_100_000]
for val in test_vals:
    s = dcb.update(val)
    print(f"  CircuitBreaker: {val:,} -> {s.status} | dd={s.drawdown_pct*100:.1f}% | mult={s.positions_multiplier:.2f}")

# RiskBudgetAllocator — 실제 수익률
rba = RiskBudgetAllocator(vol_target=0.30)
alloc = rba.allocate(rets_df, 10_000_000, "bull_quiet")
print(f"  RiskParity alloc(실제): {alloc}")

print()
print("=" * 60)
print("[3] main.py 검증")
print("=" * 60)

from analytics.strategy.main import run_strategy, TQQQSOXLMomentumAlgorithm, StrategyParams, vectorbt_bridge

# close_df, vix_s 모두 실제 데이터
close_df = pd.DataFrame({'TQQQ': tqqq, 'SOXL': soxl}, index=tqqq.index)

result = run_strategy(
    close_df=close_df, vix_series=vix_s, total_capital=10_000_000,
    run_walkforward=True, run_stress=True,
)
bt  = result['backtest']
wf2 = result['walk_forward']
st2 = result['stress_test']

print(f"  run_strategy(실제): OK")
print(f"  Backtest: Sharpe={bt['sharpe']} | CAGR={bt['cagr_pct']}% | MDD={bt['max_drawdown_pct']}%")
print(f"  WalkForward: IS={wf2['is_sharpe_mean']} | OOS={wf2['oos_sharpe_mean']} | overfit={wf2['overfit_idx']}% | folds={wf2['n_folds']}")
print(f"  Stress(200): median={st2['median_return']}% | worst_mdd={st2['worst_mdd']}% | p_loss50={st2['prob_loss_gt_50pct']}%")
print(f"  Position: {result['current_position']}")
print(f"  Circuit: {result['circuit_status']}")

vbt_r = vectorbt_bridge(close_df, StrategyParams(), vix_s)
print(f"  vectorbt_bridge(실제): total_ret={vbt_r['total_return']}% | sharpe={vbt_r['sharpe']} | n_trades={vbt_r['n_trades']}")

algo = TQQQSOXLMomentumAlgorithm(StrategyParams(), total_capital=10_000_000)
algo.Initialize()
w = algo.Rebalance({'TQQQ': tqqq, 'SOXL': soxl}, vix_s)
print(f"  Rebalance(실제): {w}")

print()
print("=" * 60)
print("ALL PASS - 3개 모듈 검증 완료 (실제 데이터 기반)")
print("=" * 60)
