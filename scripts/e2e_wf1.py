"""Workflow 1 (Workspace) live E2E: signup -> workspace -> goal -> formalize -> backtest -> verify result."""
import json, urllib.request, urllib.error, time, sys

BASE = "http://localhost:9091/api"

def req(method, path, body=None, token=None, timeout=130):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            txt = resp.read().decode()
            return resp.status, (json.loads(txt) if txt.strip() else {})
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            j = json.loads(txt)
        except Exception:
            j = {"raw": txt[:300]}
        return e.code, j
    except Exception as e:
        return -1, {"err": str(e)}

def step(name, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}", flush=True)
    return ok

def run_once(run):
    ts = int(time.time())
    email = f"e2e_wf1_{ts}_{run}@test.com"
    print(f"=== Workflow 1 E2E run {run} (email={email}) ===", flush=True)
    ok_all = True

    st, j = req("POST", "/auth/signup", {"email": email, "password": "Test1234!", "username": f"wf1{ts}{run}",
                                          "phone": f"010{ts % 100000000:08d}", "userType": "STANDARD"})
    token = j.get("token")
    if not step("signup", st == 200 and bool(token), f"st={st}"):
        print("    ->", j); return False

    st, j = req("POST", "/alpha/workspaces", {"name": f"E2E WF1 {run}"}, token)
    wsId = j.get("id")
    if not step("create workspace", st == 200 and bool(wsId), f"id={wsId} st={st}"):
        print("    ->", j); return False

    goal = {"goal": "5년 안에 월 300만원 현금흐름", "horizon_years": 5, "initial_capital_krw": 50000000,
            "monthly_contribution_krw": 1000000, "risk_tolerance": "중립", "max_drawdown_target_pct": 25,
            "assets": ["SPY", "QQQ"], "initial_strategy_direction": "추세추종"}
    st, j = req("PATCH", f"/alpha/workspaces/{wsId}/goal-profile", goal, token)
    ok_all &= step("set goal-profile", st == 200, f"st={st}")

    st, j = req("POST", f"/alpha/workspaces/{wsId}/formalize", None, token)
    sc = j.get("strategyConfig") if isinstance(j, dict) else None
    cands = sc.get("candidates") if isinstance(sc, dict) else (j.get("candidates") if isinstance(j, dict) else None)
    ok_all &= step("formalize", st == 200, f"st={st} candidates={len(cands) if cands else '?'}")
    if st != 200:
        print("    ->", j)

    st, j = req("POST", f"/alpha/workspaces/{wsId}/backtest?period=2y", None, token)
    ok_all &= step("backtest", st == 200, f"st={st}")
    if st != 200:
        print("    ->", j)

    st, ws = req("GET", f"/alpha/workspaces/{wsId}", None, token)
    bt = ws.get("lastBacktest") if isinstance(ws, dict) else None
    stats = bt.get("stats") if isinstance(bt, dict) else None
    has_result = bool(stats and stats.get("total_return_pct") is not None)
    ok_all &= step("backtest result present (A7 jackson)", has_result,
                   f"total_return_pct={stats.get('total_return_pct') if stats else None}")

    # 7. Heli chat (workspace-context injection — my recent fix)
    st, j = req("POST", f"/alpha/workspaces/{wsId}/chat", {"text": "now-strategy improve return and winrate?"}, token)
    reply = j.get("reply") if isinstance(j, dict) else None
    ok_all &= step("Heli chat reachable", st == 200 and bool(reply), f"st={st} reply_len={len(reply) if reply else 0}")

    # 8. order queue (proposals list) reachable
    st, j = req("GET", "/proposals", None, token)
    ok_all &= step("order-queue (proposals) reachable", st == 200, f"st={st} count={len(j) if isinstance(j, list) else '?'}")

    print(f"=== run {run}: {'ALL PASS' if ok_all else 'HAS FAIL'} ===\n", flush=True)
    return ok_all

if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    results = [run_once(i) for i in range(1, n + 1)]
    print(f"SUMMARY: {sum(results)}/{len(results)} runs fully passed")
    sys.exit(0 if all(results) else 1)
