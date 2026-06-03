import React, { useState, useEffect, useCallback } from "react";
import {
  GitBranch, Github, Link2, Unlink, RefreshCw, ExternalLink,
  GitCommit, AlertCircle, CheckCircle2, Loader, Search, Filter, Pin, Check,
  Upload, Download, FileCode,
} from "lucide-react";
import {
  getGitStatus, connectGit, disconnectGit, listGitRepos,
  getWorkspaceGitStatus, linkWorkspaceRepo, unlinkWorkspaceRepo,
  listWorkspaceCommits, pushWorkspaceFiles, deleteWorkspaceFile,
} from "./alphaApi";

/**
 * Developer Studio Git Panel
 *
 * 흐름:
 *  1. PAT 미연결 → 연결 폼
 *  2. PAT 연결됨, 워크스페이스 미링크 → repo picker
 *  3. 링크 완료 → 변경 파일 목록 + push/pull + 커밋 히스토리
 *
 * props:
 *  - workspaceId        현재 워크스페이스 ID
 *  - modifiedFiles      { [filePath]: newContent }  변경된 파일 목록 (DeveloperLab에서 전달)
 *  - onPushComplete     (pushedPaths: string[]) => void  push 성공 후 fileCache 갱신용
 *  - onPullAll          () => Promise<void>  pull 시 DeveloperLab 파일 캐시 갱신
 *  - onRepoLinked       () => void  레포 링크 완료 후 파일 트리 로드 트리거
 *  - onRepoUnlinked     () => void  레포 언링크 후 파일 트리 초기화 트리거
 *  - fileContents       레거시: 워크스페이스 코드 (main.py 없을 때 폴백)
 *  - onPullComplete     레거시: main.py pull 완료 콜백
 *  - onOpenCommit       커밋 탭 열기 콜백
 */
export default function GitPanel({
  workspaceId, onOpenCommit, fileContents, onPullComplete,
  modifiedFiles = {}, onPushComplete, onPullAll, onRepoLinked, onRepoUnlinked,
  deletedFiles = [], onDeleteComplete,
}) {
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [globalStatus, setGlobalStatus] = useState(null);
  const [wsStatus, setWsStatus]         = useState(null);
  const [commits, setCommits]           = useState([]);
  const [stage, setStage]               = useState("init");

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const g = await getGitStatus();
      setGlobalStatus(g);
      if (!g.connected) { setStage("connect"); setLoading(false); return; }
      if (workspaceId == null) { setStage("connect"); setLoading(false); return; }
      const ws = await getWorkspaceGitStatus(workspaceId);
      setWsStatus(ws);
      if (!ws.repoFullName) {
        setStage("repos");
      } else {
        setStage("commits");
        const cs = await listWorkspaceCommits(workspaceId, ws.branch, 100);
        setCommits(cs || []);
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", color: "#cbd5e1" }}>
      <Header onRefresh={refresh} loading={loading} username={globalStatus?.username} />
      {error && <ErrorBanner msg={error} />}
      {loading && <CenterMsg><Loader size={16} className="spin" /> 로딩 중…</CenterMsg>}

      {!loading && stage === "connect" && (
        <ConnectForm
          onConnect={async (tok) => { await connectGit(tok); refresh(); }}
          onDisconnect={globalStatus?.connected ? async () => { await disconnectGit(); refresh(); } : null}
          username={globalStatus?.username}
        />
      )}
      {!loading && stage === "repos" && (
        <RepoPicker
          workspaceId={workspaceId}
          onLinked={() => { refresh(); onRepoLinked?.(); }}
        />
      )}
      {!loading && stage === "commits" && (
        <CommitList
          wsStatus={wsStatus}
          commits={commits}
          workspaceId={workspaceId}
          modifiedFiles={modifiedFiles}
          onPushComplete={onPushComplete}
          onPullAll={onPullAll}
          fileContents={fileContents}
          onPullComplete={onPullComplete}
          deletedFiles={deletedFiles}
          onDeleteComplete={onDeleteComplete}
          onUnlink={async () => {
            await unlinkWorkspaceRepo(workspaceId);
            refresh();
            onRepoUnlinked?.();
          }}
          onOpenCommit={onOpenCommit}
          onBranchChange={async (br) => {
            await linkWorkspaceRepo(workspaceId, wsStatus.repoFullName, br);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────────── Header

function Header({ onRefresh, loading, username }) {
  return (
    <div style={{
      padding: "8px 12px", display: "flex", alignItems: "center", gap: 6,
      borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0,
    }}>
      <Github size={16} color="#60a5fa" />
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#94a3b8" }}>
        Git
      </div>
      {username && (
        <div style={{ fontSize: 12.5, color: "#64748b", marginLeft: 4 }}>· {username}</div>
      )}
      <div style={{ flex: 1 }} />
      <button onClick={onRefresh} disabled={loading} title="새로고침"
        style={{ background: "transparent", border: "none", cursor: "pointer", color: "#64748b", padding: 2 }}>
        <RefreshCw size={12} style={loading ? {animation:"spin 1s linear infinite"} : {}} />
      </button>
    </div>
  );
}

// ───────────────────────────── PAT 연결 폼

function ConnectForm({ onConnect, onDisconnect, username }) {
  const [token, setToken] = useState("");
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState(null);

  const submit = async () => {
    if (!token.trim()) return;
    setBusy(true); setErr(null);
    try { await onConnect(token.trim()); setToken(""); }
    catch (e) { setErr(e?.response?.data?.error || "연결 실패"); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ padding: 14, fontSize: 12, lineHeight: 1.6 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#e2e8f0" }}>GitHub 연결</div>
      {username ? (
        <div style={{ fontSize: 11.5, color: "#10b981", marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
          <CheckCircle2 size={12} /> {username} 로 연결됨
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
            Personal Access Token으로 GitHub 레포와 연동하면 파일 트리·커밋·push/pull을 IDE 안에서 직접 관리할 수 있습니다.
          </div>
          <div style={{
            fontSize: 10.5, color: "#93c5fd",
            background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)",
            borderRadius: 6, padding: "6px 8px", marginBottom: 8, lineHeight: 1.5,
          }}>
            토큰 발급: github.com → Settings → Developer settings → Personal access tokens (classic) → scope: <code>repo</code>
          </div>
          <input
            type="password" value={token} onChange={e => setToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxx" disabled={busy}
            onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") submit(); }}
            style={{
              width: "100%", padding: "7px 9px", background: "#0f1117",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
              color: "#e2e8f0", fontSize: 11.5, marginBottom: 8, boxSizing: "border-box",
            }}
          />
          <button onClick={submit} disabled={busy || !token.trim()}
            style={{
              width: "100%", padding: "7px 12px", background: "#60a5fa",
              border: "none", borderRadius: 6, color: "#0f1117", fontWeight: 700,
              fontSize: 11.5, cursor: busy ? "wait" : "pointer", opacity: busy || !token.trim() ? 0.5 : 1,
            }}>
            {busy ? "검증 중…" : "연결"}
          </button>
          {err && <div style={{ marginTop: 8, fontSize: 11, color: "#ef4444" }}>{err}</div>}
        </>
      )}
      {username && onDisconnect && (
        <button onClick={onDisconnect}
          style={{
            width: "100%", marginTop: 8, padding: "6px 12px", background: "transparent",
            border: "1px solid rgba(239,68,68,0.4)", borderRadius: 6, color: "#ef4444",
            fontSize: 11, cursor: "pointer",
          }}>
          <Unlink size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />
          연결 해제
        </button>
      )}
    </div>
  );
}

// ───────────────────────────── Repo Picker

function RepoPicker({ workspaceId, onLinked }) {
  const [repos, setRepos]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]       = useState(null);
  const [q, setQ]           = useState("");
  const [linking, setLinking] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortLatest, setSortLatest] = useState(true);    // PR/업데이트 최신순
  const [showPublic, setShowPublic] = useState(true);
  const [showPrivate, setShowPrivate] = useState(true);
  const [pinned, setPinned] = useState(() => {
    try { return JSON.parse(localStorage.getItem("alpha.pinnedRepos") || "[]"); } catch { return []; }
  });

  useEffect(() => {
    (async () => {
      try {
        const { listGitRepos } = await import("./alphaApi");
        setRepos(await listGitRepos());
      } catch (e) {
        setErr(e?.response?.data?.error || "repo 목록 로드 실패");
      } finally { setLoading(false); }
    })();
  }, []);

  const togglePin = (e, fullName) => {
    e.stopPropagation();
    setPinned(prev => {
      const next = prev.includes(fullName) ? prev.filter(n => n !== fullName) : [...prev, fullName];
      try { localStorage.setItem("alpha.pinnedRepos", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // 검색 + 공개/비공개 필터 → 핀 우선 → (최신순 | 이름순) 정렬
  const visible = repos
    .filter(r => !q || r.fullName.toLowerCase().includes(q.toLowerCase()))
    .filter(r => (r.isPrivate ? showPrivate : showPublic));
  const sorted = [...visible].sort((a, b) => {
    const pa = pinned.includes(a.fullName), pb = pinned.includes(b.fullName);
    if (pa !== pb) return pa ? -1 : 1;
    if (sortLatest) return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    return a.fullName.localeCompare(b.fullName);
  });

  const link = async (repo) => {
    setLinking(repo.fullName);
    try {
      await linkWorkspaceRepo(workspaceId, repo.fullName, repo.defaultBranch);
      onLinked();
    } catch (e) { setErr(e?.response?.data?.error || "링크 실패"); }
    finally { setLinking(null); }
  };

  if (loading) return <CenterMsg><Loader size={14} style={{animation:"spin 1s linear infinite"}}/> repo 로딩…</CenterMsg>;
  if (err) return <ErrorBanner msg={err} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ padding: "10px 12px 6px", fontSize: 13.5, color: "#e2e8f0", fontWeight: 700 }}>
        이 워크스페이스에 연결할 repo
      </div>
      <div style={{ padding: "0 10px 8px", position: "relative" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, background: "#0f1117",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "2px 5px 2px 9px",
        }}>
          <Search size={14} color="#64748b" style={{ flexShrink: 0 }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="검색"
            style={{
              flex: 1, minWidth: 0, padding: "7px 4px", background: "transparent", border: "none", outline: "none",
              color: "#e2e8f0", fontSize: 13, boxSizing: "border-box",
            }} />
          <button onClick={() => setFilterOpen(o => !o)} title="필터"
            style={{
              background: filterOpen ? "rgba(96,165,250,0.15)" : "transparent", border: "none",
              borderRadius: 5, cursor: "pointer", color: filterOpen ? "#60a5fa" : "#64748b",
              padding: "5px 6px", display: "flex", flexShrink: 0,
            }}>
            <Filter size={14} />
          </button>
        </div>
        {filterOpen && (
          <div style={{
            position: "absolute", right: 10, top: "100%", zIndex: 20, marginTop: 3,
            minWidth: 180, background: "#161b22", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}>
            <FilterRow label="PR/업데이트 최신순" checked={sortLatest} onClick={() => setSortLatest(v => !v)} />
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
            <FilterRow label="Public 표시" checked={showPublic} onClick={() => setShowPublic(v => !v)} />
            <FilterRow label="Private 표시" checked={showPrivate} onClick={() => setShowPrivate(v => !v)} />
          </div>
        )}
      </div>
      <div className="dark-scroll" style={{ flex: 1, overflow: "auto" }}>
        {sorted.map(r => {
          const isPinned = pinned.includes(r.fullName);
          return (
            <div key={r.fullName} onClick={() => link(r)}
              style={{
                padding: "8px 12px", cursor: linking === r.fullName ? "wait" : "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                opacity: linking === r.fullName ? 0.5 : 1,
                display: "flex", alignItems: "flex-start", gap: 6,
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(96,165,250,0.08)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13.5, color: "#e2e8f0", fontWeight: 600 }}>
                  {r.isPrivate ? "🔒" : "📂"}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fullName}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 2 }}>
                  {r.defaultBranch} · {r.updatedAt?.slice(0, 10)}
                </div>
              </div>
              <button onClick={(e) => togglePin(e, r.fullName)} title={isPinned ? "고정 해제" : "상단 고정"}
                style={{
                  background: "transparent", border: "none", cursor: "pointer", padding: 3, flexShrink: 0,
                  color: isPinned ? "#f59e0b" : "#3a424d",
                }}>
                <Pin size={13} fill={isPinned ? "#f59e0b" : "none"} />
              </button>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div style={{ padding: 14, fontSize: 13, color: "#64748b", textAlign: "center" }}>repo 없음</div>
        )}
      </div>
    </div>
  );
}

function FilterRow({ label, checked, onClick }) {
  return (
    <div onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
        cursor: "pointer", borderRadius: 5, fontSize: 12, color: "#cbd5e1",
      }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <span style={{
        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
        border: checked ? "none" : "1.5px solid #3a424d",
        background: checked ? "#60a5fa" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {checked && <Check size={11} color="#0f1117" strokeWidth={3} />}
      </span>
      {label}
    </div>
  );
}

// ───────────────────────────── Git Graph (multi-lane, parent-SHA based)

const _GP   = ["#60a5fa","#34d399","#f59e0b","#f472b6","#fb923c","#38bdf8","#4ade80","#e879f9"];
const _LSEP = 13;   // lane gap px
const _LX0  = 10;   // lane-0 x
const _RH   = 56;   // row height px
const _DR   = 3.5;  // dot radius
const gLX   = j => _LX0 + j * _LSEP;

/**
 * parent SHA를 사용해 커밋별 레인·색상을 결정한다.
 * lanes[j] = { sha, color } | null  (각 레인이 다음으로 기대하는 SHA)
 */
function buildGraphLayout(rawCommits) {
  if (!rawCommits?.length) return { commits: [], svgW: _LX0 + _LSEP + 4 };

  const lanes = [{ sha: rawCommits[0].sha, color: _GP[0] }];
  let cIdx = 1, maxLane = 0;

  const result = rawCommits.map((c) => {
    const parents   = (c.parents || []).filter(Boolean);
    const isMerge   = parents.length >= 2;

    // 이 커밋의 SHA를 기대하는 레인 전부
    const myLanes = lanes.reduce((a, l, j) => { if (l?.sha === c.sha) a.push(j); return a; }, []);
    let laneIdx = myLanes[0] ?? lanes.length;

    if (!myLanes.length) {
      // 매핑 없음(고아 커밋 등) → 새 레인
      lanes.push({ sha: c.sha, color: _GP[cIdx++ % _GP.length] });
      laneIdx = lanes.length - 1;
    }

    const myColor      = lanes[laneIdx]?.color ?? _GP[0];
    const lanesBefore  = lanes.map(l => l ? { ...l } : null);

    // 수렴 레인: 동일 SHA를 기대하던 추가 레인들 → 닫기
    const convergingLanes = myLanes.slice(1);
    convergingLanes.forEach(j => { lanes[j] = null; });

    // 1차 부모로 레인 계속
    let newLaneForMerge = null;
    if (!parents.length) {
      lanes[laneIdx] = null;
    } else {
      lanes[laneIdx] = { sha: parents[0], color: myColor };

      if (parents.length >= 2) {
        // 2차 부모(피처 브랜치)를 위한 새 레인을 오른쪽에 확보
        let nj = lanes.findIndex((l, j) => j > laneIdx && l === null);
        if (nj === -1) { nj = lanes.length; lanes.push(null); }
        const nc = _GP[cIdx++ % _GP.length];
        lanes[nj] = { sha: parents[1], color: nc };
        newLaneForMerge = nj;
        maxLane = Math.max(maxLane, nj);
      }
    }

    const lanesAfter = lanes.map(l => l ? { ...l } : null);
    maxLane = Math.max(maxLane, laneIdx);

    return { ...c, laneIdx, color: myColor, isMerge, lanesBefore, lanesAfter, convergingLanes, newLaneForMerge };
  });

  return { commits: result, svgW: _LX0 + (maxLane + 1) * _LSEP + 6 };
}

/** 전체 커밋 목록을 하나의 SVG로 렌더링 */
function GitGraphSVG({ laned, svgW }) {
  const total = laned.length;
  const els   = [];

  laned.forEach((c, i) => {
    const y0 = i * _RH, yC = y0 + _RH / 2, yH = y0 + _RH;
    const { laneIdx, color, isMerge, lanesBefore, lanesAfter, convergingLanes, newLaneForMerge } = c;
    const dx   = gLX(laneIdx);
    const maxJ = Math.max(lanesBefore.length, lanesAfter.length);

    // ── 각 레인의 수직선 ──────────────────────────────────────────
    for (let j = 0; j < maxJ; j++) {
      const bef = lanesBefore[j] ?? null;
      const aft = lanesAfter[j]  ?? null;
      const lc  = ((bef || aft)?.color ?? _GP[0]);

      if (j === laneIdx) {
        // 이 커밋의 레인: 점 위아래로 나눔
        if (i > 0       && bef) els.push(<line key={`t${i}_${j}`} x1={dx} y1={y0} x2={dx} y2={yC-_DR-1} stroke={lc+"c0"} strokeWidth={1.5}/>);
        if (i < total-1 && aft) els.push(<line key={`b${i}_${j}`} x1={dx} y1={yC+_DR+1} x2={dx} y2={yH} stroke={lc+"c0"} strokeWidth={1.5}/>);
      } else if (convergingLanes.includes(j) || j === newLaneForMerge) {
        // 곡선이 담당 → 직선 생략
      } else if (bef && aft) {
        // 통과 레인: 전체 높이
        els.push(<line key={`p${i}_${j}`} x1={gLX(j)} y1={y0} x2={gLX(j)} y2={yH} stroke={lc+"80"} strokeWidth={1.5}/>);
      } else if (bef && !aft && i > 0) {
        // 이 행에서 레인 종료 (루트 커밋 등)
        els.push(<line key={`e${i}_${j}`} x1={gLX(j)} y1={y0} x2={gLX(j)} y2={yC} stroke={lc+"80"} strokeWidth={1.5}/>);
      } else if (!bef && aft && i < total-1) {
        els.push(<line key={`s${i}_${j}`} x1={gLX(j)} y1={yC} x2={gLX(j)} y2={yH} stroke={lc+"80"} strokeWidth={1.5}/>);
      }
    }

    // ── 수렴 곡선: 다른 레인 → 이 커밋 (공통 조상) ──────────────
    convergingLanes.forEach((j, ci) => {
      const fx = gLX(j);
      const fc = (lanesBefore[j]?.color ?? _GP[0]) + "b0";
      els.push(<path key={`cv${i}_${ci}`} d={`M ${fx} ${y0} Q ${fx} ${yC} ${dx} ${yC-_DR-1}`} stroke={fc} fill="none" strokeWidth={1.5}/>);
    });

    // ── 분기 곡선: 머지 → 새 레인(피처 브랜치) 아래쪽 ──────────
    if (isMerge && newLaneForMerge !== null) {
      const tx = gLX(newLaneForMerge);
      const tc = (lanesAfter[newLaneForMerge]?.color ?? _GP[1]) + "b0";
      els.push(<path key={`dv${i}`} d={`M ${dx} ${yC+_DR+1} Q ${dx} ${yH} ${tx} ${yH}`} stroke={tc} fill="none" strokeWidth={1.5}/>);
    }

    // ── 점 ────────────────────────────────────────────────────────
    if (isMerge) {
      els.push(
        <g key={`d${i}`}>
          <rect x={dx-5} y={yC-5} width={10} height={10} transform={`rotate(45 ${dx} ${yC})`} fill="#120d2e" stroke="#a78bfa" strokeWidth={1.8} rx={1}/>
          <circle cx={dx} cy={yC} r={2} fill="#a78bfa"/>
        </g>
      );
    } else {
      els.push(<circle key={`d${i}`} cx={dx} cy={yC} r={_DR} fill={color} stroke="#0d1117" strokeWidth={1.5}/>);
    }
  });

  return (
    <svg width={svgW} height={total * _RH}
         style={{ position:"absolute", top:0, left:0, pointerEvents:"none" }}>
      {els}
    </svg>
  );
}

// ───────────────────────────── Commit List (linked 상태)

function CommitList({
  wsStatus, commits, onUnlink, onOpenCommit, onBranchChange,
  workspaceId, modifiedFiles, onPushComplete, onPullAll,
  fileContents, onPullComplete,
  deletedFiles = [], onDeleteComplete,
}) {
  const [showBranches, setShowBranches] = useState(false);
  const [commitMsg, setCommitMsg]       = useState("");
  const [pushing, setPushing]           = useState(false);
  const [pulling, setPulling]           = useState(false);
  const [actionMsg, setActionMsg]       = useState(null);

  const modifiedPaths = Object.keys(modifiedFiles || {});

  const showMsg = (ok, text) => {
    setActionMsg({ ok, text });
    setTimeout(() => setActionMsg(null), 3500);
  };

  const handlePush = async () => {
    // 변경된 레포 파일 우선, 없으면 레거시 main.py 폴백
    const files = modifiedPaths.length > 0
      ? modifiedFiles
      : (fileContents?.main ? { "main.py": fileContents.main } : null);

    const hasChanges = (files && Object.keys(files).length > 0) || deletedFiles.length > 0;
    if (!hasChanges) {
      showMsg(false, "변경된 파일이 없습니다.");
      return;
    }
    setPushing(true);
    try {
      const msg = commitMsg.trim() || "Update from AlphaHelix Developer Studio";

      // 1. 삭제된 파일 먼저 처리
      const failedDeletes = [];
      for (const path of deletedFiles) {
        try {
          await deleteWorkspaceFile(workspaceId, path, msg);
        } catch { failedDeletes.push(path); }
      }
      const successDeletes = deletedFiles.filter(p => !failedDeletes.includes(p));
      if (successDeletes.length > 0) onDeleteComplete?.(successDeletes);

      // 2. 수정/신규 파일 push
      if (files && Object.keys(files).length > 0) {
        await pushWorkspaceFiles(workspaceId, {
          branch: wsStatus.branch,
          commitMessage: msg,
          files,
        });
        onPushComplete?.(Object.keys(files));
      }

      setCommitMsg("");
      const total = Object.keys(files || {}).length + successDeletes.length;
      showMsg(true, `${total}개 변경사항 push 완료!`);
    } catch (e) {
      showMsg(false, e?.response?.data?.error || "push 실패");
    } finally { setPushing(false); }
  };

  const handlePull = async () => {
    setPulling(true);
    try {
      // 레포 파일 트리 + 열린 파일 갱신
      if (onPullAll) {
        await onPullAll();
        showMsg(true, "최신 파일을 가져왔습니다.");
      }
    } catch (e) {
      showMsg(false, e?.response?.data?.error || "pull 실패");
    } finally { setPulling(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* 레포 + 브랜치 헤더 */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#e2e8f0", fontWeight: 600, overflow: "hidden" }}>
          <Link2 size={12} color="#60a5fa" style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wsStatus.repoFullName}</span>
        </div>
        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setShowBranches(s => !s)}
            style={{
              padding: "2px 6px", background: "rgba(96,165,250,0.1)",
              border: "1px solid rgba(96,165,250,0.3)", borderRadius: 4,
              color: "#60a5fa", fontSize: 10.5, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 3,
            }}>
            <GitBranch size={10} /> {wsStatus.branch}
          </button>
          <button onClick={onUnlink} title="연결 해제"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#64748b" }}>
            <Unlink size={11} />
          </button>
        </div>
        {showBranches && wsStatus.branches?.length > 0 && (
          <div style={{ marginTop: 4, padding: 4, background: "#0f1117", borderRadius: 4, maxHeight: 120, overflow: "auto" }}>
            {wsStatus.branches.map(b => (
              <div key={b} onClick={() => { onBranchChange(b); setShowBranches(false); }}
                style={{
                  padding: "3px 6px", fontSize: 10.5, cursor: "pointer", borderRadius: 3,
                  color: b === wsStatus.branch ? "#60a5fa" : "#cbd5e1",
                  background: b === wsStatus.branch ? "rgba(96,165,250,0.12)" : "transparent",
                }}>
                {b}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* 변경된 파일 목록 */}
      {modifiedPaths.length > 0 && (
        <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", marginBottom: 5 }}>
            변경됨 ({modifiedPaths.length})
          </div>
          <div style={{ maxHeight: 90, overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {modifiedPaths.map(p => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "#60a5fa", flexShrink: 0 }}/>
                <FileCode size={10} color="#60a5fa" style={{ flexShrink: 0 }}/>
                <span style={{
                  flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: "#93c5fd", fontFamily: "monospace",
                }}>
                  {p}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 삭제된 파일 목록 */}
      {deletedFiles.length > 0 && (
        <div style={{ padding: "4px 12px 8px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
            삭제됨 ({deletedFiles.length})
          </div>
          <div style={{ maxHeight: 60, overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {deletedFiles.map(p => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "#f87171", flexShrink: 0 }}/>
                <span style={{
                  flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: "#f87171", fontFamily: "monospace", textDecoration: "line-through", opacity: 0.8,
                }}>
                  {p}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Push / Pull */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <input
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
          placeholder="커밋 메시지 (생략 시 기본값)"
          onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") handlePush(); }}
          style={{
            width: "100%", padding: "5px 8px", marginBottom: 6,
            background: "#0f1117", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 5, color: "#e2e8f0", fontSize: 11, boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={handlePush} disabled={pushing || pulling}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              padding: "5px 0", borderRadius: 5, border: "none", cursor: pushing || pulling ? "wait" : "pointer",
              background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "white",
              fontSize: 11, fontWeight: 700, opacity: pushing || pulling ? 0.5 : 1,
            }}>
            {pushing ? <Loader size={10} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={10} />}
            Push{(modifiedPaths.length + deletedFiles.length) > 0 ? ` (${modifiedPaths.length + deletedFiles.length})` : ""}
          </button>
          <button onClick={handlePull} disabled={pushing || pulling}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              padding: "5px 0", borderRadius: 5, border: "1px solid rgba(96,165,250,0.3)",
              cursor: pushing || pulling ? "wait" : "pointer",
              background: "rgba(96,165,250,0.08)", color: "#60a5fa",
              fontSize: 11, fontWeight: 700, opacity: pushing || pulling ? 0.5 : 1,
            }}>
            {pulling ? <Loader size={10} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={10} />}
            Pull
          </button>
        </div>
        {actionMsg && (
          <div style={{
            marginTop: 6, fontSize: 10.5, padding: "4px 8px", borderRadius: 4,
            background: actionMsg.ok ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
            color: actionMsg.ok ? "#10b981" : "#fca5a5",
          }}>
            {actionMsg.text}
          </div>
        )}
      </div>

      {/* 파일 탐색기 안내 */}
      <div style={{
        margin: "8px 12px 0", padding: "7px 10px",
        background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.2)",
        borderRadius: 6, fontSize: 10.5, color: "#93c5fd", lineHeight: 1.5,
      }}>
        📁 좌측 <strong>탐색기</strong> 패널에서 파일을 클릭하면 에디터에서 열립니다.
      </div>

      {/* 커밋 히스토리 */}
      <div className="dark-scroll" style={{ flex: 1, overflow: "auto", marginTop: 8 }}>
        <div style={{ padding: "6px 12px 2px", fontSize: 10, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          히스토리
        </div>
        {commits.length === 0 && (
          <div style={{ padding: 14, fontSize: 11, color: "#64748b", textAlign: "center" }}>커밋 없음</div>
        )}
        {commits.length > 0 && (() => {
          const { commits: laned, svgW } = buildGraphLayout(commits);
          return (
            <div style={{ position: "relative" }}>
              {/* 전체 레이아웃을 커버하는 단일 SVG */}
              <GitGraphSVG laned={laned} svgW={svgW} />

              {laned.map((c, i) => {
                const isMergeToMain = /Merge (pull request|branch).*(main|master)/i.test(c.message || "");
                const initials = (c.authorName || "?").slice(0, 1).toUpperCase();
                return (
                  <div key={c.sha} onClick={() => onOpenCommit?.(c)}
                    style={{
                      display: "flex", height: _RH, alignItems: "center",
                      cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.03)",
                      overflow: "hidden",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(96,165,250,0.05)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>

                    {/* SVG 너비만큼 스페이서 */}
                    <div style={{ width: svgW, flexShrink: 0 }} />

                    {/* 커밋 내용 */}
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      {c.isMerge && (
                        <span style={{
                          display: "inline-block", fontSize: 9, fontWeight: 700,
                          padding: "1px 5px", marginBottom: 2,
                          background: isMergeToMain ? "rgba(167,139,250,0.18)" : "rgba(167,139,250,0.1)",
                          border: `1px solid ${isMergeToMain ? "rgba(167,139,250,0.5)" : "rgba(167,139,250,0.3)"}`,
                          borderRadius: 3, color: "#a78bfa",
                        }}>
                          {isMergeToMain ? "↳ main" : "MERGE"}
                        </span>
                      )}
                      <div style={{
                        fontSize: 11.5, color: "#e2e8f0", fontWeight: 500,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }} title={c.message}>
                        {c.message?.split("\n")[0]}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, overflow: "hidden", minWidth: 0 }}>
                        {c.authorAvatar ? (
                          <img src={c.authorAvatar} alt={c.authorName}
                            style={{ width: 13, height: 13, borderRadius: 999, flexShrink: 0 }} />
                        ) : (
                          <div style={{
                            width: 13, height: 13, borderRadius: 999, flexShrink: 0,
                            background: `hsl(${initials.charCodeAt(0) * 37 % 360},55%,38%)`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 7, color: "#fff", fontWeight: 700,
                          }}>{initials}</div>
                        )}
                        <span style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{c.authorLogin || c.authorName}</span>
                        <span style={{ fontSize: 10, color: "#2d3748", flexShrink: 0 }}>·</span>
                        <span style={{ fontSize: 10, color: "#4B5563", flexShrink: 0, whiteSpace: "nowrap" }}>{fmtAgo(c.authoredAt)}</span>
                        <span style={{ fontSize: 10, color: "#2d3748", flexShrink: 0 }}>·</span>
                        <code style={{ fontSize: 9.5, color: "#475569", flexShrink: 0, whiteSpace: "nowrap" }}>{c.sha?.slice(0, 7)}</code>
                      </div>
                    </div>

                    <a href={c.htmlUrl} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ color: "#374151", flexShrink: 0, paddingRight: 8 }} title="GitHub에서 보기">
                      <ExternalLink size={10} />
                    </a>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ───────────────────────────── helpers

function CenterMsg({ children }) {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      gap: 6, fontSize: 11.5, color: "#64748b",
    }}>{children}</div>
  );
}

function ErrorBanner({ msg }) {
  return (
    <div style={{
      margin: 10, padding: "8px 10px",
      background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
      borderRadius: 6, fontSize: 11, color: "#fca5a5",
      display: "flex", alignItems: "flex-start", gap: 6,
    }}>
      <AlertCircle size={12} style={{ marginTop: 1, flexShrink: 0 }} />
      <div>{msg}</div>
    </div>
  );
}

function fmtAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return iso;
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}
