"""멀티세션 DB 영속화 E2E (재시작 가로지름).
  python e2e_persist.py setup   → signup + 워크스페이스 + turn1(비밀단어 기억) → 상태를 /tmp 에 저장
  [백엔드 재시작]
  python e2e_persist.py verify  → turn2(비밀단어 회상) → DB 영속 세션 --resume 으로 기억하면 PASS
JWT 는 stateless, 워크스페이스·claude_session_id 는 DB → 재시작 후에도 이어져야 한다."""
import json, urllib.request, urllib.error, time, sys, os

BASE = "http://localhost:9091/api"
STATE = os.path.join(os.environ.get("TEMP", "/tmp"), "ah_persist_state.json")
SECRET = "키위"

def req(method, path, body=None, token=None, timeout=200):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            t = resp.read().decode(); return resp.status, (json.loads(t) if t.strip() else {})
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: j = json.loads(t)
        except Exception: j = {"raw": t[:300]}
        return e.code, j
    except Exception as e:
        return -1, {"err": str(e)}

def run_turn(ws, token, request, label):
    st, j = req("POST", f"/alpha/workspaces/{ws}/claude-agent/start", {"request": request}, token=token)
    if st != 200 or not j.get("jobId"):
        print(f"  [{label}] start 실패 st={st} {j}"); return None
    job = j["jobId"]
    for _ in range(200):
        time.sleep(1)
        st, snap = req("GET", f"/alpha/workspaces/{ws}/claude-agent/status/{job}", token=token)
        if st != 200: continue
        if snap.get("status") == "done": return (snap.get("result") or {}).get("narration", "")
        if snap.get("status") == "error": print(f"  [{label}] error: {snap.get('error')}"); return None
    print(f"  [{label}] 타임아웃"); return None

def setup():
    ts = int(time.time() * 1000)
    st, j = req("POST", "/auth/signup", {"email": f"prst_{ts}@test.com", "password": "Test1234!",
                "username": f"prst{ts}", "phone": f"010{ts % 100000000:08d}", "userType": "STANDARD"})
    tok = j.get("token")
    if not tok: print(f"signup 실패 st={st}"); return False
    st, j = req("POST", "/alpha/workspaces", {"name": "영속화테스트"}, token=tok)
    ws = j.get("id")
    if not ws: print(f"워크스페이스 실패 {j}"); return False
    n1 = run_turn(ws, tok, f"파일은 절대 편집하지 마. 내 비밀 단어 '{SECRET}' 만 기억해둬. '기억했어'라고만 답해.", "TURN1")
    if n1 is None: return False
    json.dump({"token": tok, "ws": ws}, open(STATE, "w"))
    print(f"  [SETUP OK] ws=#{ws} turn1={n1[:40]!r} → 상태저장. 이제 백엔드를 재시작하세요.")
    return True

def verify():
    if not os.path.exists(STATE): print("상태파일 없음 — 먼저 setup"); return False
    s = json.load(open(STATE)); tok, ws = s["token"], s["ws"]
    n2 = run_turn(ws, tok, "내가 (재시작 전에) 말한 비밀 단어가 뭐였지? 파일 말고 우리 대화 기준으로 그 단어 하나만 답해.", "TURN2")
    if n2 is None: return False
    ok = SECRET in (n2 or "")
    print(f"  [TURN2] {n2[:120]!r}")
    print(f"  [{'PASS' if ok else 'FAIL'}] 재시작 후에도 turn1 의 비밀단어를 {'기억 → DB 영속화 OK' if ok else '기억 못함'}")
    print(f"=== {'ALL PASS' if ok else 'FAIL'} ===")
    return ok

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "setup"
    sys.exit(0 if (setup() if mode == "setup" else verify()) else 1)
