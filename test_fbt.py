"""futures/backtest endpoint test — BTCUSDT, sma_cross, yfinance fallback"""
import urllib.request, urllib.error, json

TOKEN = "who-a-internal-2026"
URL = "http://localhost:8000/futures/backtest"
PAYLOAD = json.dumps({
    "symbol": "BTCUSDT",
    "strategy": "sma_cross",
    "leverage": 3,
    "period": "1y"
}).encode()

req = urllib.request.Request(URL, data=PAYLOAD, method="POST")
req.add_header("Content-Type", "application/json")
req.add_header("X-Internal-Token", TOKEN)
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.loads(r.read())
        print("STATUS:", r.status)
        print("symbol:", body.get("symbol"))
        print("strategy:", body.get("strategy"))
        stats = body.get("stats", {})
        print("total_return_pct:", stats.get("total_return_pct"))
        print("sharpe_ratio:", stats.get("sharpe_ratio"))
        print("num_trades:", stats.get("num_trades"))
except urllib.error.HTTPError as e:
    print("ERROR:", e.code, e.read().decode())
