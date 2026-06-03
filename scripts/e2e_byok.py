"""BYOK live E2E: 접근 게이팅 + Claude 키 암호화 저장/마스킹/삭제 + FREE 차단(402)."""
import json, urllib.request, urllib.error, time, sys

BASE = "http://localhost:9092/api"

def req(method, path, body=None, token=None, timeout=30):
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
        except Exception: j = {"raw": t[:200]}
        return e.code, j
    except Exception as e:
        return -1, {"err": str(e)}

def step(name, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}", flush=True); return ok

def signup(utype):
    ts = int(time.time() * 1000)
    em = f"byok_{utype}_{ts}@test.com"
    st, j = req("POST", "/auth/signup", {"email": em, "password": "Test1234!", "username": f"byok{ts}",
                                          "phone": f"010{ts % 100000000:08d}", "userType": utype})
    return j.get("token"), em, st

def main():
    ok_all = True
    print("=== BYOK E2E ===", flush=True)

    # STANDARD 유저: 접근 허용 + 키 저장/조회/삭제
    tok, em, st = signup("STANDARD")
    ok_all &= step("signup STANDARD", st == 200 and bool(tok), f"st={st}")
    if not tok: print("   signup 실패", em); return False

    st, j = req("GET", "/user/access", token=tok)
    ok_all &= step("STANDARD 접근권한 developer=true", st == 200 and j.get("developer") is True, f"reason={j.get('reason')}")

    st, j = req("PUT", "/user/api-keys/ANTHROPIC", {"key": "sk-ant-api03-" + "x" * 80}, token=tok)
    ok_all &= step("Claude 키 저장(암호화)", st == 200 and j.get("connected") is True, f"st={st}")

    st, j = req("GET", "/user/api-keys", token=tok)
    masked = (j[0] if isinstance(j, list) and j else {})
    has_mask = masked.get("provider") == "ANTHROPIC" and masked.get("hint") and "x" * 80 not in json.dumps(j)
    ok_all &= step("마스킹 조회(평문 미노출)", has_mask, f"hint={masked.get('hint')}")

    st, j = req("DELETE", "/user/api-keys/ANTHROPIC", token=tok)
    ok_all &= step("키 삭제", st in (200, 204), f"st={st}")

    # FREE 유저: 접근 차단 + 키 저장 402
    tok2, em2, st2 = signup("FREE")
    ok_all &= step("signup FREE", st2 == 200 and bool(tok2), f"st={st2}")
    if tok2:
        st, j = req("GET", "/user/access", token=tok2)
        ok_all &= step("FREE 접근권한 developer=false", st == 200 and j.get("developer") is False, f"reason={j.get('reason')}")
        st, j = req("PUT", "/user/api-keys/ANTHROPIC", {"key": "sk-ant-api03-" + "y" * 80}, token=tok2)
        ok_all &= step("FREE 키저장 차단(402)", st == 402, f"st={st}")

    print(f"=== {'ALL PASS' if ok_all else 'HAS FAIL'} ===", flush=True)
    return ok_all

if __name__ == "__main__":
    sys.exit(0 if main() else 1)
