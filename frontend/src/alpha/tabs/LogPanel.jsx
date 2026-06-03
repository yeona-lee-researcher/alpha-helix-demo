import React, { useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import { fetchDecisionLog } from "../alphaApi";
import { PanelHeader, Empty } from "./helpers";

export default function LogPanel({ id }) {
  const { theme } = useTheme();
  const [logs, setLogs] = useState(null);
  useEffect(() => { fetchDecisionLog(id).then(setLogs); }, [id]);
  const ICONS = { USER: "👤", AI: "🤖", SYSTEM: "⚙" };
  const COLORS = { USER: theme.accent, AI: "#8b5cf6", SYSTEM: theme.textMuted };
  return (
    <div style={{ maxWidth: 800 }}>
      <PanelHeader
        icon="📜"
        title="Decision Log"
        description="사용자와 AI의 모든 의사결정 시간순 기록 (Human-AI Interaction 분석용)"
        theme={theme}
      />
      {logs?.length === 0 && <Empty msg="아직 기록이 없습니다" theme={theme} />}
      <div style={{ position: "relative", paddingLeft: 22 }}>
        <div style={{ position: "absolute", left: 8, top: 4, bottom: 4, width: 2, background: theme.panelBorder }} />
        {(logs || []).map(l => (
          <div key={l.id} style={{ position: "relative", marginBottom: 16 }}>
            <div style={{
              position: "absolute", left: -22, top: 0, width: 18, height: 18,
              borderRadius: 999, background: COLORS[l.actor] || theme.textMuted,
              color: "white", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center",
            }}>{ICONS[l.actor] || "•"}</div>
            <div style={{
              padding: 10, background: theme.panel, border: `1px solid ${theme.panelBorder}`, borderRadius: 8,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: COLORS[l.actor] }}>
                  {l.actor} · {l.eventType}
                </span>
                <span style={{ fontSize: 10, color: theme.textMuted }}>
                  {new Date(l.createdAt).toLocaleString("ko-KR")}
                </span>
              </div>
              <div style={{ fontSize: 13, color: theme.text }}>{l.summary}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
