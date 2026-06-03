import React, { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { runBacktest, infiniteBuyingSizing } from "../alphaApi";
import { Play, Calculator } from "lucide-react";
import { PanelHeader, Card, Stat, TrendLineChart, SubIndicatorChart, calcSMA, calcEMA, calcBollinger, Empty, Json, primaryBtn } from "./helpers";

// ─── 시드 역산 계산기: "월 N만원 벌려면 종목별 시드 얼마?" ──────────────
function fmtKRW(v) {
  if (v == null || isNaN(v)) return "—";
  const n = Math.round(Number(v));
  const eok = Math.floor(n / 100000000);
  const man = Math.round((n % 100000000) / 10000);
  if (eok > 0) return `${eok}억 ${man > 0 ? man.toLocaleString() + "만" : ""}원`.trim();
  if (man > 0) return `${man.toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}
function cfgInfiniteBuying(strategyConfig) {
  // strategyConfig에서 무한매수법 티커 추출
  const sc = strategyConfig || {};
  const tickers = (sc.assets || sc.tickers || sc.symbols || ["TQQQ", "SOXL"])
    .map((t) => String(t).toUpperCase());
  return { tickers };
}

function SeedSizingCard({ ws, theme }) {
  const { tickers } = useMemo(() => cfgInfiniteBuying(ws?.strategyConfig), [ws?.strategyConfig]);
  const [targetMan, setTargetMan] = useState(2000); // 월 목표수익(만원) — 기본 2천만원
  const [period, setPeriod] = useState("2y");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);

  const onCalc = async () => {
    if (busy) return;
    const krw = Number(targetMan) * 10000;
    if (!krw || krw <= 0) { setErr("목표 월수익을 입력하세요"); return; }
    setBusy(true); setErr(null); setRes(null);
    try {
      const r = await infiniteBuyingSizing({ tickers, period, targetMonthlyKrw: krw });
      if (r?.feasible === false) setErr(r.reason || "해당 기간엔 익절이 없어 역산 불가");
      else setRes(r);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally { setBusy(false); }
  };

  const mdd = res?.backtest_stats?.max_drawdown_pct;
  return (
    <Card title="💰 목표수익 → 필요시드 계산기" theme={theme}>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: theme.textMuted, lineHeight: 1.6 }}>
        <b>무한매수법</b>으로 <b>{tickers.join(" + ")}</b>를 운용할 때,
        원하는 <b>월 목표수익</b>을 입력하면 과거 성과 기준으로 <b>종목별 필요 시드</b>를 역산합니다.
        (실현수익은 시드에 선형 비례 — 한 번 백테스트해 측정한 월수익을 목표에 맞춰 환산)
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 6 }}>
        <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>
          <div style={{ marginBottom: 4 }}>월 목표수익 (만원)</div>
          <input type="number" value={targetMan} min={1} step={100}
            onChange={(e) => setTargetMan(e.target.value)}
            style={{ width: 130, padding: "8px 10px", borderRadius: 8, fontSize: 14, fontWeight: 700,
              border: `1px solid ${theme.panelBorder}`, background: theme.panel, color: theme.text }} />
        </label>
        <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>
          <div style={{ marginBottom: 4 }}>기준 기간</div>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1px solid ${theme.panelBorder}`, background: theme.panel, color: theme.text }}>
            <option value="1y">최근 1년</option>
            <option value="2y">최근 2년</option>
            <option value="5y">최근 5년</option>
          </select>
        </label>
        <button onClick={onCalc} disabled={busy} style={{ ...primaryBtn(theme, busy), height: 38 }}>
          <Calculator size={14} /> {busy ? "계산 중…" : "필요 시드 계산"}
        </button>
      </div>
      {err && <div style={{ marginTop: 10, fontSize: 12, color: "#dc2626" }}>⚠️ {err}</div>}
      {res && (
        <div style={{ marginTop: 14 }}>
          <div style={{ padding: "14px 16px", borderRadius: 10, marginBottom: 12,
            background: theme.accent + "14", border: `1px solid ${theme.accent}55` }}>
            <div style={{ fontSize: 12, color: theme.textMuted }}>
              월 <b style={{ color: theme.text }}>{fmtKRW(res.target_monthly_krw)}</b> 벌려면 필요한 총 시드
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: theme.accent, marginTop: 2 }}>
              {fmtKRW(res.required_seed_krw)}
            </div>
            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
              ≈ ${Math.round(res.required_seed_usd).toLocaleString()} · 참조시드 ${Math.round(res.reference_seed_usd).toLocaleString()} 측정 월수익 {fmtKRW(res.measured_monthly_krw)} 기준 ×{res.scale_factor}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Object.keys(res.per_ticker).length}, 1fr)`, gap: 10, marginBottom: 10 }}>
            {Object.entries(res.per_ticker).map(([t, v]) => (
              <div key={t} style={{ padding: "12px 14px", borderRadius: 10, background: theme.panel, border: `1px solid ${theme.panelBorder}` }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: theme.text, marginBottom: 6 }}>{t}</div>
                <div style={{ fontSize: 11, color: theme.textMuted }}>필요 시드</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: theme.text, marginBottom: 6 }}>{fmtKRW(v.seed_krw)}</div>
                <div style={{ fontSize: 11, color: theme.textMuted }}>하루 매수액 (1/{res.split})</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{fmtKRW(v.daily_buy_krw)} <span style={{ color: theme.textMuted, fontWeight: 400 }}>(${Math.round(v.daily_buy_usd).toLocaleString()})</span></div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.6,
            padding: "8px 12px", borderRadius: 8, background: "#fef3c7", border: "1px solid #fde68a", color: "#92400e" }}>
            ⚠️ {res.caveat || `과거 ${res.period} 성과 기준 추정. 레버리지 ETF는 낙폭이 큽니다(MDD ${mdd}%). 약세장에선 월수익이 크게 줄 수 있어요.`}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function ReportPanel({ id, ws, onChange }) {
  const { theme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState("5y");
  const [subInd, setSubInd] = useState({ rsi: false, macd: false, stoch: false });
  const onRun = async () => {
    if (busy) return;
    setBusy(true);
    try { await runBacktest(id, period); onChange(); }
    catch (e) { alert("백테스트 실패: " + (e?.response?.data?.error || e.message)); }
    finally { setBusy(false); }
  };
  const bt = ws.lastBacktest;
  const trendSeries = useMemo(() => {
    const eq = bt?.equity_curve;
    if (!Array.isArray(eq) || eq.length < 5) return null;
    const points = eq.map((p) => ({ x: p.date ? new Date(p.date) : null, y: Number(p.value) }));
    const values = points.map((p) => p.y);
    const sma20 = calcSMA(values, 20);
    const sma50 = calcSMA(values, 50);
    const sma120 = calcSMA(values, 120);
    const ema20 = calcEMA(values, 20);
    const bb = calcBollinger(values, 20, 2);
    const mk = (arr, name, color, width, extra) => ({
      name, color, width, ...extra,
      points: points.map((p, i) => ({ x: p.x, y: arr[i] })),
    });
    return [
      { name: "에쿼티 곡선", color: "#3b82f6", width: 2, points },
      ...(values.length >= 20 ? [mk(sma20, "SMA 20", "#10b981", 1.4)] : []),
      ...(values.length >= 50 ? [mk(sma50, "SMA 50", "#f59e0b", 1.4)] : []),
      ...(values.length >= 120 ? [mk(sma120, "SMA 120", "#ef4444", 1.4)] : []),
      ...(values.length >= 20 ? [mk(ema20, "EMA 20", "#8b5cf6", 1.4)] : []),
      ...(values.length >= 20 ? [mk(bb.upper, "BB 상단", "#94a3b8", 1, { dash: "4 3", opacity: 0.8 })] : []),
      ...(values.length >= 20 ? [mk(bb.lower, "BB 하단", "#94a3b8", 1, { dash: "4 3", opacity: 0.8 })] : []),
    ];
  }, [bt]);
  const eqValues = useMemo(() => (trendSeries ? trendSeries[0].points.map((p) => p.y) : []), [trendSeries]);
  const eqDates = useMemo(() => (trendSeries ? trendSeries[0].points.map((p) => p.x) : []), [trendSeries]);
  return (
    <div>
      <PanelHeader
        icon="📊"
        title="Backtest Report"
        description="Strategy Config가 정형화되면 vectorbt deterministic engine으로 실행한 백테스트 결과입니다."
        theme={theme}
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} disabled={busy}
              title="백테스트 기간"
              style={{
                padding: "8px 10px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: `1px solid ${theme.panelBorder}`, background: theme.panel, color: theme.text,
              }}>
              <option value="1y">최근 1년</option>
              <option value="2y">최근 2년</option>
              <option value="5y">최근 5년</option>
              <option value="10y">최근 10년</option>
              <option value="max">최대 (가능한 최장)</option>
            </select>
            <button onClick={onRun} disabled={!ws.strategyConfig || busy} style={primaryBtn(theme, busy)}>
              <Play size={14} /> {busy ? "실행 중…" : "백테스트 실행"}
            </button>
          </div>
        }
      />
      <SeedSizingCard ws={ws} theme={theme} />
      {!bt && <Empty msg="Strategy Config가 정형화되면 vectorbt deterministic engine으로 백테스트 실행" theme={theme} />}
      {bt && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            <Stat label="총 수익률" value={bt.stats?.total_return_pct} unit="%" theme={theme} positive hint="백테스트 전체 기간의 누적 수익률입니다. 매수 후 보유 대비 전략의 성과를 보여줍니다." />
            <Stat label="연환산 수익" value={bt.stats?.annualized_return_pct} unit="%" theme={theme} hint="CAGR — 1년 단위로 환산했을 때의 평균 수익률. 기간이 달라도 비교 가능한 표준 지표입니다." />
            <Stat label="MDD" value={bt.stats?.max_drawdown_pct} unit="%" theme={theme} negative hint="Maximum Drawdown — 고점 대비 최대 낙폭. 이 전략을 가장 불운한 타이밍에 매수했을 때 겪을 수 있는 최대 손실입니다." />
            <Stat label="Sharpe" value={bt.stats?.sharpe} theme={theme} hint="수익률 ÷ 변동성 × √252. 1.0 이상이면 양호, 2.0 이상이면 우수. 리스크 대비 수익 효율성을 측정합니다." />
            <Stat label="Sortino" value={bt.stats?.sortino} theme={theme} hint="Sharpe와 유사하지만 하락 변동성만 페널티로 계산합니다. 상승 변동성은 좋은 것이므로 Sharpe보다 투자자에게 유리한 평가 방식입니다." />
            <Stat label="Calmar" value={bt.stats?.calmar ?? bt.risk_metrics?.calmar} theme={theme} hint="연환산 수익 ÷ |MDD|. 낙폭 대비 수익 효율성. 값이 클수록 손실 위험 대비 수익이 좋은 전략입니다." />
            <Stat label="승률" value={bt.stats?.win_rate_pct} unit="%" theme={theme} hint="전체 거래일 중 수익이 발생한 날의 비율입니다. 50% 이상이면 절반 이상의 날에 수익이 났다는 의미입니다." />
            <Stat label="거래 수" value={bt.stats?.trades} unit="회" theme={theme} hint="백테스트 기간 동안 발생한 총 매매 횟수입니다. 너무 많으면 거래 비용이 과도해질 수 있습니다." />
          </div>
          {trendSeries && (
            <Card title="📈 전략 자산곡선(Equity Curve) & 보조지표" theme={theme}>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: theme.textMuted, lineHeight: 1.6 }}>
                <b>이 차트는 개별 주가가 아니라</b>, 선택한 전략을 과거 기간({bt.period || "5y"})에 그대로 돌렸을 때
                <b> 포트폴리오 자산가치</b>(초기자본에서 시작)가 어떻게 변했는지를 보여줍니다 — 즉 <b>백테스트 결과 자산곡선</b>이에요.
                파란선이 자산가치이고, <b>SMA 20/50/120 · EMA 20 · 볼린저밴드</b>는 그 자산곡선의 추세 보조선입니다.
                범례 클릭으로 보조선 토글, 마우스 올리면 그날 값이 말풍선으로. 휠 확대 · 드래그 구간선택.
              </p>
              <TrendLineChart series={trendSeries} theme={theme} height={260}
                toggleable initialHidden={["EMA 20", "BB 상단", "BB 하단"]} />
              {/* 하단 보조지표 패널 (RSI / MACD / Stochastic) — 삼성 mPOP 식 토글 */}
              <div style={{ display: "flex", gap: 7, alignItems: "center", margin: "12px 0 2px", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 700 }}>보조지표 패널</span>
                {[["rsi", "RSI"], ["macd", "MACD"], ["stoch", "Stochastic"]].map(([k, lbl]) => (
                  <button key={k} type="button" onClick={() => setSubInd((s) => ({ ...s, [k]: !s[k] }))}
                    style={{
                      padding: "3px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
                      border: `1px solid ${subInd[k] ? theme.accent : theme.panelBorder}`,
                      background: subInd[k] ? theme.accent : theme.panel, color: subInd[k] ? "#fff" : theme.textMuted,
                    }}>{lbl}</button>
                ))}
              </div>
              {subInd.rsi && <SubIndicatorChart kind="rsi" values={eqValues} dates={eqDates} theme={theme} />}
              {subInd.macd && <SubIndicatorChart kind="macd" values={eqValues} dates={eqDates} theme={theme} />}
              {subInd.stoch && <SubIndicatorChart kind="stoch" values={eqValues} dates={eqDates} theme={theme} />}
            </Card>
          )}
          {bt.risk_metrics && (
            <Card title="📐 위험지표 상세 (QuantStats)" theme={theme}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <Stat label="CAGR" value={bt.risk_metrics.cagr_pct} unit="%" theme={theme} hint="Compound Annual Growth Rate — QuantStats로 계산한 복리 연환산 수익률입니다." />
                <Stat label="변동성" value={bt.risk_metrics.volatility_pct} unit="%" theme={theme} hint="연환산 변동성. 일별 수익률의 표준편차 × √252. 높을수록 자산 가치의 등락이 크다는 의미입니다." />
                <Stat label="VaR(95%)" value={bt.risk_metrics.var_95_pct} unit="%" theme={theme} hint="Value at Risk — 95% 신뢰수준에서 하루에 발생 가능한 최대 손실. 예: -2%면 95% 확률로 하루 손실이 2% 이내." />
                <Stat label="CVaR(95%)" value={bt.risk_metrics.cvar_95_pct} unit="%" theme={theme} hint="Conditional VaR (Expected Shortfall) — 최악의 5% 상황에서의 평균 손실. VaR보다 극단적 손실을 더 잘 반영합니다." />
                <Stat label="최고일" value={bt.risk_metrics.best_day_pct} unit="%" theme={theme} positive hint="백테스트 기간 중 가장 좋았던 하루의 수익률입니다." />
                <Stat label="최악일" value={bt.risk_metrics.worst_day_pct} unit="%" theme={theme} negative hint="백테스트 기간 중 가장 나빴던 하루의 손실률입니다. 이 수준의 손실을 감당할 수 있는지 확인하세요." />
              </div>
            </Card>
          )}
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", color: theme.accent, fontSize: 12 }}>raw JSON 보기</summary>
            <Json value={bt} theme={theme} />
          </details>
        </>
      )}
    </div>
  );
}
