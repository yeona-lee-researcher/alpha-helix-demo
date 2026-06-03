import json, urllib.request

token = "who-a-internal-2026"
url = "http://127.0.0.1:8000/futures/backtest"
url = "http://127.0.0.1:8000/backtest"
data = json.dumps({
    "ticker": "SPY",
    "strategy": "sma_cross",
    "period": "1y"
}).encode()

req = urllib.request.Request(url, data=data, headers={
    "X-Internal-Token": token,
    "Content-Type": "application/json"
})
try:
    with urllib.request.urlopen(req, timeout=120) as r:
        print("STATUS:", r.status)
        print(r.read().decode()[:2000])
except Exception as e:
    print("ERROR:", e)
