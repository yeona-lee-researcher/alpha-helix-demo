import json, sys
d = json.load(open(r"c:\Team2_AlphaHelix\analytics\hmm_test.json", encoding="utf-8-sig"))
print("method =", d.get("method"), "smoothing =", d.get("smoothing"), "n_states =", d.get("n_states"))
print("current =", d.get("current_regime_ko"), " / weak =", d.get("weak_regime"))
print("dist =", d.get("regime_distribution"))
print("head =", d.get("headline"))
print()
keys = ("days", "sharpe", "effective_sharpe", "sample_weight", "annualized_return_pct", "max_drawdown_pct")
for k, v in (d.get("per_regime") or {}).items():
    print(k, "->", {kk: v.get(kk) for kk in keys if kk in v})
