"""P4 Claude 패치 전후 효과 측정 E2E: before/after 파라미터 각각 실측 백테스트 + 비교."""
import json, urllib.request, urllib.error, time, sys

BASE = "http://localhost:9091/api"

def req(method, path, body=None, token=None, timeout=180):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            t = resp.read().decode()
            return resp.status, (json.loads(t) if t.strip() else {})
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: j = json.loads(t)
        except Exception: j = {"raw": t[:400]}
        return e.code, j
    except Exception as e:
        return -1, {"err": str(e)}

def step(name, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}", flush=True); return ok

def main():
    ok = True
    print("=== P4 패치 전후 비교 E2E ===", flush=True)
    ts = int(time.time() * 1000)
    st, j = req("POST", "/auth/signup", {"email": f"cmp_{ts}@test.com", "password": "Test1234!",
                "username": f"cmp{ts}", "phone": f"010{ts % 100000000:08d}", "userType": "STANDARD"})
    tok = j.get("token"); ok &= step("signup", st == 200 and bool(tok), f"st={st}")
    if not tok: return False
    st, j = req("POST", "/alpha/workspaces", {"name": "패치비교"}, token=tok)
    ws = j.get("id"); ok &= step("워크스페이스", st == 200 and bool(ws), f"#{ws}")
    if not ws: return False

    body = {"before": {"sma_fast": 20, "sma_slow": 60, "ticker": "SPY"},
            "after":  {"sma_fast": 40, "sma_slow": 120, "ticker": "SPY"}, "period": "5y"}
    st, j = req("POST", f"/alpha/workspaces/{ws}/compare-backtest", body, token=tok, timeout=120)
    ok &= step("compare-backtest 200", st == 200, f"st={st}")
    if st != 200:
        print("   resp:", json.dumps(j, ensure_ascii=False)[:300]); return False

    ok &= step("paramsChanged=true", j.get("paramsChanged") is True, f"changes={[(c['label'],c['from'],'->',c['to']) for c in j.get('changes',[])]}")
    opts = {o["key"]: o for o in j.get("options", [])}
    ok &= step("before/after 2컬럼", set(opts) == {"before", "after"}, f"{list(opts)}")
    bm, am = opts.get("before", {}).get("metrics", {}), opts.get("after", {}).get("metrics", {})
    ok &= step("before 메트릭", bm.get("available") is True and bm.get("return_pct") is not None,
               f"ret={bm.get('return_pct')} mdd={bm.get('mdd_pct')}")
    ok &= step("after 메트릭", am.get("available") is True and am.get("return_pct") is not None,
               f"ret={am.get('return_pct')} mdd={am.get('mdd_pct')}")
    print(f"=== {'ALL PASS' if ok else 'HAS FAIL'} ===", flush=True)
    return ok

if __name__ == "__main__":
    sys.exit(0 if main() else 1)
