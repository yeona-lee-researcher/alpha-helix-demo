"""Workflow 2 (Developer Studio) live E2E (안전 파트):
signup -> workspace -> saveCode -> getWorkspace(code 확인) -> git status 도달 -> claude-agent 엔드포인트 도달.
(실제 Claude CLI 패치/git push 는 CLI 인증 + 연결 레포 필요 — 별도. 여기선 코드 영속화 + 패널 데이터 도달성 검증.)"""
import json, urllib.request, urllib.error, time, sys

BASE = "http://localhost:9091/api"

def req(method, path, body=None, token=None, timeout=60):
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
    email = f"e2e_wf2_{ts}_{run}@test.com"
    print(f"=== Workflow 2 E2E run {run} (email={email}) ===", flush=True)
    ok_all = True

    st, j = req("POST", "/auth/signup", {"email": email, "password": "Test1234!", "username": f"wf2{ts}{run}",
                                          "phone": f"010{ts % 100000000:08d}", "userType": "STANDARD"})
    token = j.get("token")
    if not step("signup", st == 200 and bool(token), f"st={st}"):
        print("    ->", j); return False

    st, j = req("POST", "/alpha/workspaces", {"name": f"E2E WF2 {run}"}, token)
    wsId = j.get("id")
    if not step("create workspace", st == 200 and bool(wsId), f"id={wsId} st={st}"):
        print("    ->", j); return False

    # 1) Dev Studio: 전략 코드 저장
    code = {"main": f"# E2E WF2 run {run}\nfrom AlgorithmImports import *\nclass S(QCAlgorithm):\n    def Initialize(self):\n        self.SetCash(100000)\n"}
    st, j = req("PATCH", f"/alpha/workspaces/{wsId}/code", {"codeJson": json.dumps(code)}, token)
    ok_all &= step("코드 저장 (saveCode)", st == 200, f"st={st}")

    # 2) 저장된 코드가 다시 조회되나 (워크스페이스에서 코드 확인)
    st, ws = req("GET", f"/alpha/workspaces/{wsId}", None, token)
    cj = ws.get("codeJson") if isinstance(ws, dict) else None
    has_code = bool(cj) and ("E2E WF2" in (cj if isinstance(cj, str) else json.dumps(cj)))
    ok_all &= step("저장된 코드 조회 (code view)", has_code, f"codeJson_present={bool(cj)}")

    # 3) git 백본저장 패널 데이터: git status 도달 (미연결이면 linked=false)
    st, j = req("GET", f"/alpha/workspaces/{wsId}/git/status", None, token)
    ok_all &= step("git status 도달 (백본저장 패널)", st in (200, 204), f"st={st} linked={j.get('linked') if isinstance(j, dict) else '?'}")

    # 4) claude-agent 비동기 시작 엔드포인트 도달성 (실제 CLI 작업은 트리거하지 않고 라우트 존재만)
    st, j = req("POST", f"/alpha/workspaces/{wsId}/claude-agent/start", {"request": "noop reachability check"}, token, timeout=20)
    # 200(jobId) 또는 4xx(검증/비활성) 모두 '엔드포인트 도달'로 간주; -1(연결실패)만 실패
    ok_all &= step("claude-agent 엔드포인트 도달", st != -1, f"st={st}")

    print(f"=== run {run}: {'ALL PASS' if ok_all else 'HAS FAIL'} ===\n", flush=True)
    return ok_all

if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    results = [run_once(i) for i in range(1, n + 1)]
    print(f"SUMMARY: {sum(results)}/{len(results)} runs fully passed")
    sys.exit(0 if all(results) else 1)
