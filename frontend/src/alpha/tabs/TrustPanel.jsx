import React, { useState } from "react";
import { useTheme } from "../ThemeContext";
import { runTrust } from "../alphaApi";
import { Play } from "lucide-react";
import { PanelHeader, Card, SubScoreBar, Empty, TrustDetailsCard, primaryBtn } from "./helpers";
import TrustScore from "./TrustScore";

const METRIC_LABELS = {
  generalization:        { key: "generalization",        label: "일반화" },
  regime_robustness:     { key: "regime_robustness",     label: "국면견고성" },
  parameter_stability:   { key: "parameter_stability",   label: "파라미터안정성" },
  risk_control:          { key: "risk_control",          label: "리스크통제" },
  statistical_confidence:{ key: "statistical_confidence",label: "통계유의성" },
};

function buildTrustScoreProps(trust) {
  const score = trust.trust_score;
  const grade = score >= 75 ? "우수" : score >= 60 ? "양호" : score >= 45 ? "보통" : "주의";
  const penaltyLabel = trust.overfitting_penalty < 0
    ? `과적합 패널티 ${trust.overfitting_penalty}점` : undefined;

  const p = parseNarrative(trust.narrative);

  const description = p.summary.join(" ");

  const cards = [];
  if (p.strength) cards.push({ type: "strength", title: p.strength.header, score: trust.sub_scores?.[findMetricKey(p.strength.header, trust.sub_scores)] ?? 0, body: p.strength.body });
  if (p.weakness) cards.push({ type: "weakness", title: p.weakness.header, score: trust.sub_scores?.[findMetricKey(p.weakness.header, trust.sub_scores)] ?? 0, body: p.weakness.body });

  const metrics = Object.entries(trust.sub_scores || {}).map(([k, v]) => ({
    key: k, label: METRIC_LABELS[k]?.label || k, score: v,
  }));

  const alertMessage = p.warning ? p.warning.replace(/^⚠️\s*/, "").trim() : undefined;
  return { score, grade, penaltyLabel, description, cards, metrics, alertMessage };
}

function findMetricKey(header, subScores) {
  if (!subScores) return "";
  const KO = {
    "일반화": "generalization", "국면견고성": "regime_robustness", "시장국면 견고성": "regime_robustness",
    "파라미터 안정성": "parameter_stability", "파라미터안정성": "parameter_stability",
    "리스크 통제": "risk_control", "리스크통제": "risk_control",
    "통계적 유의성": "statistical_confidence", "통계유의성": "statistical_confidence",
  };
  for (const [ko, key] of Object.entries(KO)) {
    if (header.includes(ko)) return key;
  }
  return Object.keys(subScores)[0] || "";
}

function parseNarrative(text) {
  if (!text) return {};
  const blocks = text.split(/\n\n+/);
  const result = { summary: [], strength: null, weakness: null, scores: null, warning: null };
  for (const block of blocks) {
    const t = block.trim();
    if (t.startsWith("▶ 강점:")) {
      const lines = t.split("\n");
      const header = lines[0].replace("▶ 강점:", "").trim();
      result.strength = { header, body: lines.slice(1).join("\n").trim() };
    } else if (t.startsWith("▶ 보완 필요:")) {
      const lines = t.split("\n");
      const header = lines[0].replace("▶ 보완 필요:", "").trim();
      result.weakness = { header, body: lines.slice(1).join("\n").trim() };
    } else if (t.startsWith("세부 점수:")) {
      result.scores = t.replace("세부 점수:", "").trim();
    } else if (t.startsWith("⚠️")) {
      result.warning = t;
    } else {
      result.summary.push(t);
    }
  }
  return result;
}

function TrustNarrative({ trust, theme }) {
  const score = trust.trust_score;
  const grade = score >= 75 ? { label: "우수", color: "#10b981", bg: "#d1fae5" }
    : score >= 60 ? { label: "양호", color: "#3b82f6", bg: "#dbeafe" }
    : score >= 45 ? { label: "보통", color: "#f59e0b", bg: "#fef3c7" }
    : { label: "주의", color: "#ef4444", bg: "#fee2e2" };
  const p = parseNarrative(trust.narrative);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 점수 + 등급 */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 56, fontWeight: 900, color: theme.accent, lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: 16, color: theme.textMuted }}>/ 100</span>
        </div>
        <span style={{
          padding: "4px 14px", borderRadius: 999, fontSize: 13, fontWeight: 800,
          background: grade.bg, color: grade.color, border: `1px solid ${grade.color}40`,
        }}>{grade.label}</span>
        {trust.overfitting_penalty < 0 && (
          <span style={{
            padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700,
            background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a540",
          }}>⚠️ 과적합 패널티 {trust.overfitting_penalty}점</span>
        )}
      </div>

      {/* 요약 문장 */}
      {p.summary.length > 0 && (
        <p style={{ margin: 0, fontSize: 13, color: theme.textMuted, lineHeight: 1.7, wordBreak: "keep-all" }}>
          {p.summary.join(" ")}
        </p>
      )}

      {/* 강점 / 보완 필요 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {p.strength && (
          <div style={{
            padding: "12px 14px", borderRadius: 12,
            background: "linear-gradient(135deg,#d1fae5,#a7f3d0)",
            border: "1px solid #6ee7b7",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 16 }}>💪</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#065f46", textTransform: "uppercase", letterSpacing: 0.5 }}>강점</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#064e3b", marginBottom: 4, wordBreak: "keep-all" }}>{p.strength.header}</div>
            <div style={{ fontSize: 11.5, color: "#065f46", lineHeight: 1.6, wordBreak: "keep-all" }}>{p.strength.body}</div>
          </div>
        )}
        {p.weakness && (
          <div style={{
            padding: "12px 14px", borderRadius: 12,
            background: "linear-gradient(135deg,#fef3c7,#fde68a)",
            border: "1px solid #fcd34d",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 16 }}>🔧</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#78350f", textTransform: "uppercase", letterSpacing: 0.5 }}>보완 필요</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#451a03", marginBottom: 4, wordBreak: "keep-all" }}>{p.weakness.header}</div>
            <div style={{ fontSize: 11.5, color: "#78350f", lineHeight: 1.6, wordBreak: "keep-all" }}>{p.weakness.body}</div>
          </div>
        )}
      </div>

      {/* 세부 점수 뱃지 */}
      {p.scores && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {p.scores.split("·").map((s) => {
            const t = s.trim();
            return (
              <span key={t} style={{
                padding: "4px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
                background: theme.codeBg || "#f8fafc", border: `1px solid ${theme.panelBorder}`,
                color: theme.text,
              }}>{t}</span>
            );
          })}
        </div>
      )}

      {/* 과적합 경고 */}
      {p.warning && (
        <div style={{
          padding: "10px 14px", borderRadius: 10,
          background: "#fef2f2", border: "1px solid #fca5a5",
          fontSize: 12, color: "#7f1d1d", lineHeight: 1.7, wordBreak: "keep-all",
        }}>{p.warning}</div>
      )}
    </div>
  );
}

const PERIOD_OPTIONS = [
  { value: "5y", label: "5년" },
  { value: "10y", label: "10년 (권장)" },
  { value: "15y", label: "15년" },
  { value: "20y", label: "20년" },
  { value: "25y", label: "25년" },
  { value: "30y", label: "30년 (최대)" },
];

export default function TrustPanel({ id, ws, onChange }) {
  const { theme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState("10y");
  const trust = ws.lastTrust;
  const onRun = async () => {
    if (busy) return;
    setBusy(true);
    try { await runTrust(id, { period }); onChange(); }
    catch (e) { alert("Trust 계산 실패: " + (e?.response?.data?.error || e.message)); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <PanelHeader
        icon="🛡"
        title="Trust Score & Robustness Check"
        description="Walk-Forward + Regime + Parameter Stability + Statistical Confidence를 종합한 0~100 점수."
        theme={theme}
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              disabled={busy}
              style={{
                padding: "6px 10px", borderRadius: 8, fontSize: 13,
                border: `1px solid ${theme.panelBorder}`,
                background: theme.cardBg, color: theme.text, cursor: "pointer",
              }}
            >
              {PERIOD_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button onClick={onRun} disabled={busy} style={primaryBtn(theme, busy)}>
              <Play size={14} /> {busy ? "계산 중… (~1분)" : "Trust Score 계산"}
            </button>
          </div>
        }
      />
      {!trust && <Empty msg="Walk-Forward + Regime + Parameter Stability + Statistical Confidence를 종합한 0~100 점수" theme={theme} />}
      {trust && (
        <>
          <Card title="신뢰 점수" theme={theme}>
            <TrustScore {...buildTrustScoreProps(trust)} />
          </Card>
          <Card title="ℹ️ Trust Score는 어떻게 계산되나요?" theme={theme}>
            <div style={{ fontSize: 12.5, color: theme.text, lineHeight: 1.75 }}>
              <p style={{ margin: "0 0 8px" }}>
                아래 5개 세부 점수(각 0~100)에 가중치를 곱해 합산한 뒤, <b>과적합 패널티</b>(최대 -10)를 차감해 최종 0~100점을 만듭니다.
              </p>
              <pre style={{
                margin: "6px 0 10px", padding: "8px 12px", background: theme.codeBg || "#f8fafc",
                border: `1px solid ${theme.panelBorder}`, borderRadius: 8, fontSize: 12, overflowX: "auto",
                fontFamily: "inherit",
              }}>{`trust = 0.30·일반화 + 0.25·국면견고성 + 0.20·파라미터안정성 + 0.15·리스크통제 + 0.10·통계적유의성 − |과적합패널티|`}</pre>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li><b>일반화 (Generalization)</b> — Walk-Forward(In-Sample→Out-of-Sample)에서 OOS Sharpe가 IS와 얼마나 일관되나. 과거에 잘되던 게 미래에도 될지 검증.</li>
                <li><b>시장국면 견고성 (Regime Robustness)</b> — 4가지 시장 국면 중 가장 안 좋은 국면의 Sharpe가 얼마나 방어적인지.</li>
                <li><b>파라미터 안정성 (Parameter Stability)</b> — 주요 파라미터를 ±10% 흔들었을 때 결과가 크게 바뀌지 않는지.</li>
                <li><b>리스크 통제 (Risk Control)</b> — 목표 MDD를 잘 지켰는지, 손실 제한이 의도대로 작동했는지.</li>
                <li><b>통계적 유의성 (Statistical Confidence)</b> — 수익 평균이 0과 유의하게 다른가 (t-stat 기반).</li>
              </ul>
              <p style={{ margin: "10px 0 0", fontSize: 11.5, color: theme.textMuted }}>
                세부 점수 항목의 <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 13, height: 13, borderRadius: "50%", background: "#22c55e", color: "white", fontSize: 7, fontWeight: 900 }}>!</span> 아이콘에 마우스를 올리면 개별 설명이 나타나요.
              </p>
            </div>
          </Card>
          <Card title="세부 점수" theme={theme}>
            {Object.entries(trust.sub_scores || {}).map(([k, v]) => (
              <SubScoreBar key={k} label={k} value={v} theme={theme} />
            ))}
          </Card>
          {trust.details && <TrustDetailsCard details={trust.details} theme={theme} />}
        </>
      )}
    </div>
  );
}
