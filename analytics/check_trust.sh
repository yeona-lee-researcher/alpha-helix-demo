#!/bin/bash
curl -s -X POST http://127.0.0.1:8000/trust \
  -H "X-Internal-Token: who-a-internal-2026" \
  -H "Content-Type: application/json" \
  -d '{"ticker":"SPY","period":"5y","strategy":"sma_cross"}' > /tmp/trust.json
python3 <<'EOF'
import json
d = json.load(open("/tmp/trust.json"))
print("score:", d.get("score"))
br = d.get("breakdown", {})
print("regime_robust:", br.get("regime_robustness"))
print("reason:", (d.get("reasons", {}).get("regime_robustness") or "")[:600])
# per_regime 확인
import subprocess
EOF
curl -s -X POST http://127.0.0.1:8000/regime \
  -H "X-Internal-Token: who-a-internal-2026" \
  -H "Content-Type: application/json" \
  -d '{"ticker":"SPY","period":"5y","strategy":"sma_cross"}' > /tmp/regime.json
python3 <<'EOF'
import json
d = json.load(open("/tmp/regime.json"))
print("---REGIME---")
print("current:", d.get("current_regime"), "/", d.get("current_regime_ko"))
print("weak:", d.get("weak_regime"))
print("headline:", d.get("headline"))
print("distribution:", d.get("regime_distribution"))
print("per_regime:")
for k, v in (d.get("per_regime") or {}).items():
    print(f"  {k}: days={v.get('days')} SR={v.get('sharpe')} eff={v.get('effective_sharpe')} w={v.get('sample_weight')}")
EOF
