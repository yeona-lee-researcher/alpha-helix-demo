"""멀티세션 백엔드 E2E: 같은 워크스페이스에서 2턴 대화의 맥락이 --resume 으로 이어지는지.
Turn1 은 파일을 편집하지 않고 비밀단어만 기억 → Turn2 가 (코드가 아니라) 대화 맥락에서 회상하면 통과."""
import json, urllib.request, urllib.error, time, sys

BASE = "http://localhost:9091/api"
SECRET = "망고"

def req(method, path, body=None, token=None, timeout=300):
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
        except Exception: j = {"raw": t[:300]}
        return e.code, j
    except Exception as e:
        return -1, {"err": str(e)}

def signup():
    ts = int(time.time() * 1000)
    st, j = req("POST", "/auth/signup", {"email": f"mt_{ts}@test.com", "password": "Test1234!",
                "username": f"mt{ts}", "phone": f"010{ts % 100000000:08d}", "userType": "STANDARD"})
    return j.get("token"), st

def run_turn(ws, token, request, label):
    st, j = req("POST", f"/alpha/workspaces/{ws}/claude-agent/start", {"request": request}, token=token)
    if st != 200 or not j.get("jobId"):
        print(f"  [{label}] start 실패 st={st} {j}"); return None
    job = j["jobId"]
    for _ in range(180):  # 최대 ~180s
        time.sleep(1)
        st, snap = req("GET", f"/alpha/workspaces/{ws}/claude-agent/status/{job}", token=token)
        if st != 200: continue
        if snap.get("status") == "done":
            return (snap.get("result") or {}).get("narration", "")
        if snap.get("status") == "error":
            print(f"  [{label}] 잡 error: {snap.get('error')}"); return None
    print(f"  [{label}] 타임아웃"); return None

def main():
    print("=== 멀티세션 백엔드 E2E ===", flush=True)
    tok, st = signup()
    if not tok: print(f"signup 실패 st={st}"); return False
    print(f"  [OK] signup STANDARD")

    st, j = req("POST", "/alpha/workspaces", {"name": "멀티세션테스트"}, token=tok)
    ws = j.get("id")
    if st != 200 or not ws: print(f"  워크스페이스 생성 실패 st={st} {j}"); return False
    print(f"  [OK] 워크스페이스 #{ws}")

    n1 = run_turn(ws, tok, f"파일은 절대 편집하지 마. 내 비밀 단어 '{SECRET}' 만 기억해둬. '기억했어'라고만 답해.", "TURN1")
    if n1 is None: return False
    print(f"  [TURN1] {n1[:80]!r}")

    n2 = run_turn(ws, tok, "내가 방금 말한 비밀 단어가 뭐였지? 파일 말고 우리 대화 기준으로 그 단어 하나만 답해.", "TURN2")
    if n2 is None: return False
    print(f"  [TURN2] {n2[:120]!r}")

    ok = SECRET in (n2 or "")
    print(f"  [{'PASS' if ok else 'FAIL'}] Turn2 가 Turn1 의 비밀단어를 {'기억함 → 멀티세션 OK' if ok else '기억 못함'}")
    print(f"=== {'ALL PASS' if ok else 'FAIL'} ===", flush=True)
    return ok

if __name__ == "__main__":
    sys.exit(0 if main() else 1)
