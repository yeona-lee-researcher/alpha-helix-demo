import React from "react";

const REGIME_KO = {
  bull_quiet:        "상승장(안정)",
  bull_volatile:     "상승장(불안정)",
  bear:              "하락장",
  sideways:          "횡보장",
  high_vol_unstable: "고변동 불안정장",
};

const REGIME_COLOR = {
  bull_quiet:        { bar: "#22c55e", bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", icon: "↗" },
  bull_volatile:     { bar: "#86efac", bg: "#f0fdf4", border: "#bbf7d0", text: "#166534", icon: "↗" },
  bear:              { bar: "#ef4444", bg: "#fff5f5", border: "#fecaca", text: "#dc2626", icon: "↘" },
  sideways:          { bar: "#94a3b8", bg: "#f8fafc", border: "#e2e8f0", text: "#475569", icon: "→" },
  high_vol_unstable: { bar: "#f97316", bg: "#fffbeb", border: "#fde68a", text: "#b45309", icon: "⚡" },
};

function parseCurrentAdvice(narrative) {
  if (!narrative) return "";
  const m = narrative.match(/💡 현재 국면[^—]*— (.+)/s);
  return m ? m[1].trim() : "";
}

const KNOWN_KO = [
  { ko: "상승장(안정)",       key: "bull_quiet" },
  { ko: "상승장(불안정)",     key: "bull_volatile" },
  { ko: "고변동성 불안정장",  key: "high_vol_unstable" },
  { ko: "하락장",             key: "bear" },
  { ko: "횡보장",             key: "sideways" },
];

function parseNarrativeDist(narrative) {
  if (!narrative) return null;
  const result = {};
  for (const { ko, key } of KNOWN_KO) {
    const escaped = ko.replace(/[()]/g, "\\$&");
    const m = narrative.match(new RegExp(escaped + "\\((\\d+)일,\\s*(\\d+)%\\)"));
    if (m) result[key] = { days: parseInt(m[1]), pct: parseInt(m[2]) };
  }
  return Object.keys(result).length > 0 ? result : null;
}

export default function RegimeSummary({ data, theme }) {
  if (!data) return null;

  const perRegime = data.per_regime || {};
  const currentKey = data.current_regime;
  const currentKo = data.current_regime_ko || REGIME_KO[currentKey] || currentKey;
  const advice = parseCurrentAdvice(data.narrative);

  // narrative에서 직접 파싱한 분포 (자연어 뷰와 동일한 숫자)
  const narrativeDist = parseNarrativeDist(data.narrative);
  const topRegimes = narrativeDist
    ? Object.entries(narrativeDist)
        .sort((a, b) => b[1].days - a[1].days)
        .slice(0, 3)
        .map(([k, v]) => [k, v.days, v.pct])
    : [];

  // 최고/최저 국면 — 백엔드 narrative와 동일하게 effective_sharpe 기준 (없으면 sharpe 폴백)
  const validRegimes = Object.entries(perRegime).filter(([, v]) => v && !v.note && v.sharpe != null);
  const sorted = [...validRegimes].sort((a, b) =>
    (a[1].effective_sharpe ?? a[1].sharpe ?? 0) - (b[1].effective_sharpe ?? b[1].sharpe ?? 0)
  );
  const [worstKey, worstV] = sorted[0] || [];
  const [bestKey, bestV]   = sorted[sorted.length - 1] || [];

  const currentC = REGIME_COLOR[currentKey] || REGIME_COLOR.sideways;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ① 헤더 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 14px", borderRadius: 10,
        background: theme.codeBg, border: `1px solid ${theme.panelBorder}`,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: theme.accentSoft,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
        }}>📡</div>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: theme.text }}>
            {data.ticker && <span>{data.ticker} </span>}시장 국면 분석 결과
          </div>
          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
            MA200 + 60일 변동성 기준 · 5가지 국면 자동 분류
          </div>
        </div>
      </div>

      {/* ② 분석 기간 국면 분포 */}
      {topRegimes.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            분석 기간 국면 분포
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${topRegimes.length}, 1fr)`, gap: 8 }}>
            {topRegimes.map(([k, days, pct]) => {
              const c = REGIME_COLOR[k] || REGIME_COLOR.sideways;
              return (
                <div key={k} style={{
                  padding: "12px 14px", borderRadius: 10,
                  background: c.bg, border: `1px solid ${c.border}`,
                }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: c.text, marginBottom: 6 }}>
                    {REGIME_KO[k] || k}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: c.text, lineHeight: 1 }}>
                    {days}<span style={{ fontSize: 12, fontWeight: 600 }}>일</span>
                  </div>
                  <div style={{ fontSize: 11, color: c.text, opacity: 0.75, margin: "4px 0 8px" }}>{pct}%</div>
                  <div style={{ height: 4, background: `${c.bar}30`, borderRadius: 2 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: c.bar, borderRadius: 2, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ③ 국면별 성과 (최고/최저) */}
      {(bestKey || worstKey) && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            국면별 성과
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {bestKey && (() => {
              const c = REGIME_COLOR[bestKey] || REGIME_COLOR.bull_quiet;
              return (
                <div style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${c.border}`, background: "white" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: c.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    <span>{c.icon}</span> 최고 — {REGIME_KO[bestKey] || bestKey}
                  </div>
                  <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 2 }}>Sharpe</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: c.text }}>{bestV.sharpe?.toFixed(2) ?? "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 2 }}>누적 수익</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: c.text }}>+{bestV.cumulative_return_pct?.toFixed(1) ?? "—"}%</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: theme.textMuted, lineHeight: 1.6 }}>
                    {perRegime[bestKey]?.note || `이 전략이 ${REGIME_KO[bestKey]} 환경에서 가장 좋은 성과를 기록했습니다.`}
                  </div>
                </div>
              );
            })()}
            {worstKey && (() => {
              const c = REGIME_COLOR[worstKey] || REGIME_COLOR.bear;
              return (
                <div style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${c.border}`, background: "white" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: c.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    <span>{c.icon}</span> 최저 — {REGIME_KO[worstKey] || worstKey}
                  </div>
                  <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 2 }}>Sharpe</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: c.text }}>{worstV.sharpe?.toFixed(2) ?? "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 2 }}>MDD</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: c.text }}>{worstV.max_drawdown_pct?.toFixed(1) ?? "—"}%</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: theme.textMuted, lineHeight: 1.6 }}>
                    이 구간에서는 포지션 규모를 줄이거나 손절 기준을 강화하는 것이 도움이 됩니다.
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ④ 현재 국면 */}
      {currentKey && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "12px 14px", borderRadius: 10,
          background: currentC.bg, border: `1px solid ${currentC.border}`,
        }}>
          <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{currentC.icon}</span>
          <div style={{ fontSize: 12.5, lineHeight: 1.7, color: theme.text }}>
            <b>현재 국면: <span style={{ color: currentC.text }}>{currentKo}</span></b>
            {advice && <> — {advice}</>}
          </div>
        </div>
      )}
    </div>
  );
}
