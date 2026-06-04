import React, { useState } from "react";
import { useTheme } from "../ThemeContext";
import { runRegime } from "../alphaApi";
import { Play } from "lucide-react";
import { PanelHeader, Card, Row, Empty, RegimeTimelineChart, primaryBtn } from "./helpers";
import RegimeSummary from "./RegimeSummary";

const PERIOD_OPTIONS = [
  { value: "1y", label: "1년" },
  { value: "2y", label: "2년" },
  { value: "5y", label: "5년" },
  { value: "10y", label: "10년 (권장)" },
  { value: "custom", label: "직접 지정 (달력)" },
];

export default function RegimePanel({ id, ws, onChange }) {
  const { theme } = useTheme();
  const [data, setData] = useState(ws?.lastRegime ?? null);
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState("10y");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const custom = period === "custom";
  const onRun = async () => {
    if (custom && (!start || !end)) { alert("시작일과 종료일을 선택하세요"); return; }
    setBusy(true);
    try {
      const result = await runRegime(id, custom ? { start, end } : { period });
      setData(result);
      if (onChange) onChange();
    }
    catch (e) { alert("Regime 분석 실패: " + (e?.response?.data?.error || e.message)); }
    finally { setBusy(false); }
  };
  const dateStyle = { padding: "6px 8px", borderRadius: 8, fontSize: 12.5,
    border: `1px solid ${theme.panelBorder}`, background: theme.cardBg, color: theme.text };
  const labels = { bull: "🐂 상승장", bear: "🐻 하락장", sideways: "↔ 횡보장", high_vol_unstable: "⚡ 고변동성 불안정장" };
  const ALL_KEYS = ["bull", "bear", "sideways", "high_vol_unstable"];
  return (
    <div>
      <PanelHeader
        icon="📡"
        title="Regime Analysis"
        description="시장 국면별로 전략의 강점/약점을 분석합니다 (MA200 추세 + 60일 변동성 기반 5분류). 데이터 소스: Polygon.io (yfinance 폴백)."
        theme={theme}
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
            {custom && (
              <>
                <input type="date" value={start} max={end || undefined} disabled={busy} onChange={e => setStart(e.target.value)} style={dateStyle} />
                <input type="date" value={end} min={start || undefined} disabled={busy} onChange={e => setEnd(e.target.value)} style={dateStyle} />
              </>
            )}
            <button onClick={onRun} disabled={busy} style={primaryBtn(theme, busy)}>
              <Play size={14} /> {busy ? "분석 중…" : "Regime 실행"}
            </button>
          </div>
        }
      />
      {!data && <Empty msg="시장 국면별로 전략의 강점/약점을 분석합니다 (MA200 + 60일 변동성 기반 5분류)" theme={theme} />}
      {data && (
        <>
          <Card
            title="🌤 자연어 요약"
            theme={theme}
            action={
              <button
                onClick={() => setShowRaw(v => !v)}
                style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${theme.panelBorder}`,
                  background: showRaw ? theme.accentSoft : "white",
                  color: showRaw ? theme.accent : theme.textMuted,
                }}
              >
                {showRaw ? "요약 보기" : "자연어 보기"}
              </button>
            }
          >
            {showRaw
              ? <p style={{ margin: 0, fontSize: 13, color: theme.text, lineHeight: 1.8, whiteSpace: "pre-line" }}>{data.narrative}</p>
              : <RegimeSummary data={data} theme={theme} />
            }
          </Card>
          {data.regime_timeline && data.regime_timeline.length > 0 && (
            <Card title="📈 국면 타임라인" theme={theme}>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: theme.textMuted, lineHeight: 1.55 }}>
                각 색깔 배경이 시장 국면을 나타냅니다. 파란 선은 종가입니다. 마우스를 올리면 상세 정보가 표시됩니다.
                {data.analysis_basis && <span> · 분석 기준: <b>{data.analysis_basis}</b></span>}
              </p>
              <RegimeTimelineChart timeline={data.regime_timeline} theme={theme} ticker={data.ticker} />
            </Card>
          )}
          <Card title="ℹ️ 어떻게 계산했나요?" theme={theme}>
            <div style={{ fontSize: 12.5, color: theme.text, lineHeight: 1.75 }}>
              <p style={{ margin: "0 0 8px" }}>
                과거 가격 데이터(Polygon.io 우선, yfinance 폴백)에서 매일 두 가지 지표를 계산해 시장 국면을 <b>5가지</b>로 자동 분류합니다.
                {data.ticker && <span> 분석 티커: <b>{data.ticker}</b></span>}
              </p>
              <ul style={{ margin: "0 0 10px", paddingLeft: 18 }}>
                <li><b>200일 이동평균 (MA200)</b>: 가격이 이 선 위 → 장기 상승 추세, 아래 → 장기 하락 추세</li>
                <li><b>60일 실현 변동성</b>: 일일 수익률의 60일 표준편차 (연환산) — 높으면 불안정장으로 분류</li>
              </ul>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, marginTop: 6 }}>
                {[
                  { k: "🐂 상승장(안정)", v: "MA200 위 + 변동성 정상" },
                  { k: "🐂 상승장(불안정)", v: "MA200 위 + 변동성 높음" },
                  { k: "🐻 하락장", v: "MA200 아래 + 변동성 정상" },
                  { k: "↔ 횡보장", v: "방향성 없음 + 변동성 정상" },
                  { k: "⚡ 고변동성 불안정장", v: "변동성 극단적으로 높음" },
                ].map((x) => (
                  <div key={x.k} style={{
                    padding: "8px 10px", borderRadius: 8, background: theme.codeBg || "#f8fafc",
                    border: `1px solid ${theme.panelBorder}`, fontSize: 11.5,
                  }}>
                    <div style={{ fontWeight: 700, color: theme.text }}>{x.k}</div>
                    <div style={{ color: theme.textMuted, marginTop: 2 }}>{x.v}</div>
                  </div>
                ))}
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 12, color: theme.textMuted }}>
                각 국면별로 전략을 별도 백테스트해서 <b>누적 수익 / Sharpe / MDD / 승률</b>을 계산합니다.
                국면 발생 기간이 너무 짧으면(<code>n &lt; 5일</code>) "데이터 부족"으로 표시합니다.
              </p>
            </div>
          </Card>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            {ALL_KEYS.map((k) => {
              const v = data.per_regime?.[k];
              const missing = !v;
              return (
                <Card key={k} title={labels[k] || k} theme={theme}
                  badge={data.weakest_regime === k ? "취약" : null}>
                  {missing ? <Empty msg="이 국면이 분석 기간 동안 발생하지 않았습니다." theme={theme} /> :
                   v?.note ? <Empty msg={v.note} theme={theme} /> : (
                    <div style={{ fontSize: 12, lineHeight: 1.8, color: theme.text }}>
                      <Row k="기간(일)" v={v.days} theme={theme} />
                      <Row k="누적 수익" v={`${v.cumulative_return_pct}%`} theme={theme} />
                      <Row k="연환산" v={`${v.annualized_return_pct}%`} theme={theme} />
                      <Row k="Sharpe" v={v.sharpe} theme={theme} />
                      <Row k="MDD" v={`${v.max_drawdown_pct}%`} theme={theme} />
                      <Row k="승률" v={`${v.win_rate_pct}%`} theme={theme} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
