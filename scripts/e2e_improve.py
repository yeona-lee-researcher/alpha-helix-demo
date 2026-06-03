"""P3 개선 제안서 백엔드 E2E: 진단 + 선택지(기존/안정형/공격형) + 각 선택지 전후 백테스트 메트릭."""
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
    ok_all = True
    print("=== P3 개선 제안서 E2E ===", flush=True)
    ts = int(time.time() * 1000)
    st, j = req("POST", "/auth/signup", {"email": f"imp_{ts}@test.com", "password": "Test1234!",
                "username": f"imp{ts}", "phone": f"010{ts % 100000000:08d}", "userType": "STANDARD"})
    tok = j.get("token")
    ok_all &= step("signup STANDARD", st == 200 and bool(tok), f"st={st}")
    if not tok: return False

    st, j = req("POST", "/alpha/workspaces", {"name": "개선테스트"}, token=tok)
    ws = j.get("id")
    ok_all &= step("워크스페이스 생성", st == 200 and bool(ws), f"#{ws}")
    if not ws: return False

    body = {"customParams": {"sma_fast": 20, "sma_slow": 60, "ticker": "SPY"}, "period": "5y"}
    st, j = req("POST", f"/alpha/workspaces/{ws}/improve-proposal", body, token=tok, timeout=180)
    ok_all &= step("improve-proposal 200", st == 200, f"st={st} keys={list(j)[:6]}")
    if st != 200:
        print("   resp:", json.dumps(j, ensure_ascii=False)[:300]); return False

    ok_all &= step("진단 텍스트 존재", bool(j.get("diagnosis")), f"len={len(j.get('diagnosis',''))}")
    opts = j.get("options", [])
    keys = [o.get("key") for o in opts]
    ok_all &= step("선택지 3종(keep/stable/aggressive)", keys == ["keep", "stable", "aggressive"], f"{keys}")

    by = {o["key"]: o for o in opts}
    base_m = by.get("keep", {}).get("metrics", {})
    ok_all &= step("기존유지 백테스트 메트릭", base_m.get("available") is True and base_m.get("return_pct") is not None,
                   f"ret={base_m.get('return_pct')} mdd={base_m.get('mdd_pct')} vol={base_m.get('vol_pct')} sharpe={base_m.get('sharpe')}")

    for k in ("stable", "aggressive"):
        o = by.get(k, {})
        ch = o.get("changes", [])
        m = o.get("metrics", {})
        ok_all &= step(f"{k}: 변경+메트릭", len(ch) >= 1 and m.get("available") is True,
                       f"changes={[(c['label'],c['from'],'→',c['to']) for c in ch]} ret={m.get('return_pct')} mdd={m.get('mdd_pct')}")

    print(f"=== {'ALL PASS' if ok_all else 'HAS FAIL'} ===", flush=True)
    return ok_all

if __name__ == "__main__":
    sys.exit(0 if main() else 1)
