#!/bin/bash
set -e
URL=http://127.0.0.1:8000/regime
TOKEN=who-a-internal-2026

for METHOD in rule hmm; do
  echo "=== method=$METHOD smoothing=5 n_states=4 ==="
  curl -sS -X POST $URL \
    -H 'Content-Type: application/json' \
    -H "X-Internal-Token: $TOKEN" \
    -d "{\"ticker\":\"SPY\",\"period\":\"5y\",\"strategy\":\"sma_cross\",\"method\":\"$METHOD\",\"smoothing\":5,\"n_states\":4}" \
    | python3 -c '
import sys, json
d = json.load(sys.stdin)
if "detail" in d:
    print("ERROR:", d["detail"]); sys.exit(1)
print("method=", d.get("method"), "smoothing=", d.get("smoothing"), "n_states=", d.get("n_states"))
print("current=", d.get("current_regime_ko"), "/ weak=", d.get("weak_regime"))
print("dist=", d.get("regime_distribution"))
print("headline=", d.get("headline"))
for k, v in (d.get("per_regime") or {}).items():
    if "effective_sharpe" in v:
        s = v["sharpe"]; e = v["effective_sharpe"]; w = v["sample_weight"]; days = v["days"]
        print("  %-20s days=%4d  sharpe=%+.2f  eff=%+.2f  w=%.2f" % (k, days, s, e, w))
    else:
        print("  %-20s days=%s  note=%s" % (k, v.get("days"), v.get("note")))
'
  echo ""
done
