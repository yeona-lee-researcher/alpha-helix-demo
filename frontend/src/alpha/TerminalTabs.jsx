import React, { useState, useRef, useEffect } from "react";
import { Plus, X, ChevronDown, Terminal } from "lucide-react";
import TerminalPane from "./TerminalPane";

// 백엔드 TerminalWebSocketHandler.shellCmd 와 매핑되는 셸들
const SHELLS = [
  { id: "powershell", label: "PowerShell" },
  { id: "bash",       label: "Git Bash" },
  { id: "cmd",        label: "Command Prompt" },
  { id: "sql",        label: "SQL (sqlcl)" },
];

let _seq = 0;
const newTab = (shell) => ({ id: ++_seq, shell });

/**
 * VSCode식 멀티-터미널: 여러 셸 세션을 탭으로 관리.
 * 모든 탭의 TerminalPane 을 마운트 유지(세션 보존), 비활성은 숨김.
 * 우측 탭 리스트에서 전환/닫기, + 드롭다운으로 새 셸 생성.
 */
export default function TerminalTabs() {
  const [tabs, setTabs] = useState(() => [newTab("powershell")]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const addTab = (shell) => {
    const t = newTab(shell);
    setTabs(prev => [...prev, t]);
    setActiveId(t.id);
    setMenuOpen(false);
  };

  const closeTab = (id, e) => {
    e?.stopPropagation();
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) { const t = newTab("powershell"); setActiveId(t.id); return [t]; }
      if (id === activeId) setActiveId(next[next.length - 1].id);
      return next;
    });
  };

  const shellLabel = (s) => SHELLS.find(x => x.id === s)?.label || s;

  return (
    <div style={{ display: "flex", height: "100%", background: "#0d1117" }}>
      {/* 본문: 모든 탭 마운트 유지, 활성만 표시 */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {tabs.map(t => (
          <div key={t.id} style={{ position: "absolute", inset: 0, display: t.id === activeId ? "block" : "none" }}>
            <TerminalPane shell={t.shell} active={t.id === activeId} />
          </div>
        ))}
      </div>

      {/* 우측 탭 리스트 (VSCode 스타일) */}
      <div style={{ width: 168, flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,0.08)",
        background: "#161b22", display: "flex", flexDirection: "column" }}>
        <div ref={menuRef} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 6px",
          borderBottom: "1px solid rgba(255,255,255,0.06)", position: "relative" }}>
          <span style={{ fontSize: 9, color: "#6B7280", fontWeight: 700, flex: 1, letterSpacing: 0.3 }}>터미널</span>
          <button onClick={() => setMenuOpen(o => !o)} title="새 터미널"
            style={{ display: "flex", alignItems: "center", background: "none", border: "none",
              color: "#94a3b8", cursor: "pointer", padding: 2 }}>
            <Plus size={13} /><ChevronDown size={10} />
          </button>
          {menuOpen && (
            <div style={{ position: "absolute", top: "100%", right: 4, zIndex: 50, background: "#1e2433",
              border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: 4, minWidth: 152,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
              {SHELLS.map(s => (
                <button key={s.id} onClick={() => addTab(s.id)}
                  style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left",
                    padding: "6px 9px", borderRadius: 5, border: "none", background: "transparent",
                    color: "#D1D5DB", fontSize: 11, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <Terminal size={11} color="#60a5fa" />{s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="dark-scroll" style={{ flex: 1, overflow: "auto" }}>
          {tabs.map(t => (
            <div key={t.id} onClick={() => setActiveId(t.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", cursor: "pointer",
                borderLeft: t.id === activeId ? "2px solid #60a5fa" : "2px solid transparent",
                background: t.id === activeId ? "rgba(96,165,250,0.1)" : "transparent" }}>
              <Terminal size={11} color={t.id === activeId ? "#60a5fa" : "#6B7280"} />
              <span style={{ flex: 1, fontSize: 11, color: t.id === activeId ? "#e2e8f0" : "#94a3b8",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shellLabel(t.shell)}</span>
              <X size={12} onClick={(e) => closeTab(t.id, e)} style={{ color: "#6B7280", flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = "#EF4444"}
                onMouseLeave={e => e.currentTarget.style.color = "#6B7280"} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
