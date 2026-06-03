import { useState, useEffect } from "react";
import { getDeveloperAccess, listApiKeys, saveApiKey, deleteApiKey } from "./alphaApi";

/**
 * Claude BYOK(본인 키 연동) + Developer Studio 접근 게이팅 카드.
 * - 비구독(locked): 업그레이드(구독 제안) 배너.
 * - 구독/allowlist: Claude API 키 연동(암호화 저장) / 마스킹 상태 / 연동 해제.
 *
 * 색상(요청): 외곽 = 밝은 라일락 보라, 버튼 = 연하늘색 + 호버.
 */
const LILAC = {
  panel: "linear-gradient(135deg,#F4EFFC 0%,#EAE0F9 100%)",
  border: "#D9C9F2",
  text: "#6D28D9",
  textMuted: "#8B7AAE",
};
const SKY = { base: "#7DD3FC", hover: "#38BDF8", soft: "#BAE6FD", text: "#0C4A6E" };

function skyBtn(busy) {
  return {
    padding: "9px 16px", borderRadius: 10, border: "none",
    background: busy ? "#CBD5E1" : SKY.base, color: busy ? "#64748B" : SKY.text,
    fontWeight: 800, fontSize: 13, cursor: busy ? "wait" : "pointer",
    transition: "background 0.15s ease, transform 0.1s ease",
    boxShadow: "0 2px 8px rgba(56,189,248,0.25)",
  };
}

export default function ClaudeKeyConnect({ onConnected }) {
  const [access, setAccess] = useState(null);
  const [keys, setKeys] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const reload = async () => {
    try { setAccess(await getDeveloperAccess()); } catch { /* noop */ }
    try { setKeys(await listApiKeys()); } catch { /* noop */ }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const connected = (keys || []).find((k) => k.provider === "ANTHROPIC");
  const locked = access && access.developer === false;

  const save = async () => {
    const key = input.trim();
    if (!key) { setErr("키를 입력하세요"); return; }
    setBusy(true); setErr(null); setMsg(null);
    try {
      await saveApiKey("ANTHROPIC", key);
      setInput("");
      setMsg("Claude 키가 안전하게 연동되었습니다 (AES-256 암호화 저장).");
      await reload();
      onConnected && onConnected();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!window.confirm("Claude 키 연동을 해제할까요?")) return;
    setBusy(true); setErr(null); setMsg(null);
    try { await deleteApiKey("ANTHROPIC"); await reload(); }
    catch (e) { setErr(e?.response?.data?.error || e.message); }
    finally { setBusy(false); }
  };

  const onHover = (e, on) => { e.currentTarget.style.background = on ? SKY.hover : SKY.base; };

  // 연동 완료 시: 큰 배너 대신 한 줄 컴팩트 표시 (Claude 연동 ● + 연동 해제).
  if (connected) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: LILAC.panel, border: `1.5px solid ${LILAC.border}`, borderRadius: 10, padding: "7px 12px",
      }}>
        <span style={{ fontSize: 14 }}>🟣</span>
        <b style={{ color: LILAC.text, fontSize: 12.5 }}>Claude 연동</b>
        <span style={{
          fontSize: 11, fontWeight: 800, color: "#15803D",
          background: "#DCFCE7", border: "1px solid #86EFAC", padding: "2px 8px", borderRadius: 999,
        }}>● {connected.hint}</span>
        <button onClick={disconnect} disabled={busy} style={{
          marginLeft: "auto", padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
          background: "#fff", color: "#B91C1C", border: "1px solid #FCA5A5", cursor: busy ? "wait" : "pointer",
        }}>연동 해제</button>
      </div>
    );
  }

  return (
    <div style={{
      background: LILAC.panel, border: `1.5px solid ${LILAC.border}`, borderRadius: 14,
      padding: 16, boxShadow: "0 4px 18px rgba(124,77,188,0.12)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>🟣</span>
        <b style={{ color: LILAC.text, fontSize: 14 }}>Claude 연동 (본인 키 · BYOK)</b>
        {connected && (
          <span style={{
            marginLeft: "auto", fontSize: 11, fontWeight: 800, color: "#15803D",
            background: "#DCFCE7", border: "1px solid #86EFAC", padding: "2px 9px", borderRadius: 999,
          }}>● 연결됨 {connected.hint}</span>
        )}
      </div>

      {locked ? (
        <div>
          <div style={{ fontSize: 12.5, color: LILAC.textMuted, lineHeight: 1.6, marginBottom: 10 }}>
            <b style={{ color: LILAC.text }}>Developer Studio</b> 와 본인 Claude 키 연동은
            <b> STANDARD 구독</b>부터 사용할 수 있어요. 구독하면 VSCode 수준으로 Claude가
            전략 코드를 직접 다듬어 줍니다.
          </div>
          <button
            onClick={() => { window.location.assign("/alpha/subscription"); }}
            style={skyBtn(false)} onMouseEnter={(e) => onHover(e, true)} onMouseLeave={(e) => onHover(e, false)}>
            ⤴ STANDARD 구독하고 열기
          </button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: LILAC.textMuted, lineHeight: 1.6, marginBottom: 10 }}>
            본인 <b style={{ color: LILAC.text }}>Anthropic(Claude) API 키</b>를 연동하면, 그 키의 권한·모델 그대로
            Developer Studio에서 Claude가 코드를 직접 편집합니다.
            <br/>🔒 키는 <b>AES-256으로 암호화</b>되어 DB에만 저장되고, 로그·응답·배포물에 절대 노출되지 않습니다.
          </div>

          {!connected ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="password" value={input} onChange={(e) => setInput(e.target.value)}
                placeholder="sk-ant-..." autoComplete="off"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) save(); }}
                style={{
                  flex: 1, minWidth: 200, padding: "10px 12px", fontSize: 13,
                  border: `1.5px solid ${LILAC.border}`, borderRadius: 10, outline: "none",
                  background: "#fff", color: "#1e293b",
                }} />
              <button onClick={save} disabled={busy} style={skyBtn(busy)}
                onMouseEnter={(e) => !busy && onHover(e, true)} onMouseLeave={(e) => !busy && onHover(e, false)}>
                {busy ? "연동 중…" : "연동하기"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12.5, color: LILAC.text }}>
                Claude 키 연동됨 — Developer Studio에서 Claude 코드 편집이 가능합니다.
              </span>
              <button onClick={disconnect} disabled={busy} style={{
                marginLeft: "auto", padding: "7px 12px", borderRadius: 9, fontSize: 12, fontWeight: 700,
                background: "#fff", color: "#B91C1C", border: "1px solid #FCA5A5", cursor: busy ? "wait" : "pointer",
              }}>연동 해제</button>
            </div>
          )}

          {msg && <div style={{ marginTop: 8, fontSize: 12, color: "#15803D" }}>{msg}</div>}
          {err && <div style={{ marginTop: 8, fontSize: 12, color: "#B91C1C" }}>{err}</div>}
          <div style={{ marginTop: 8, fontSize: 11, color: LILAC.textMuted }}>
            키 발급: <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer"
              style={{ color: SKY.hover }}>console.anthropic.com → API Keys</a>
          </div>
        </div>
      )}
    </div>
  );
}
