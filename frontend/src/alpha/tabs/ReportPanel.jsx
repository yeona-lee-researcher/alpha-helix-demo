import React, { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { runBacktest, infiniteBuyingSizing } from "../alphaApi";
import { Play, Calculator } from "lucide-react";
import { PanelHeader, Card, TrendLineChart, SubIndicatorChart, calcSMA, calcEMA, calcBollinger, Empty, Json, primaryBtn } from "./helpers";

// ─── 공통: 초록 느낌표 + 호버 설명 툴팁 ───────────────────────────────
function InfoDot({ hint }) {
  const [show, setShow] = useState(false);
  if (!hint) return null;
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <span onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 16, height: 16, borderRadius: "50%", background: "#22c55e", color: "white",
          fontSize: 9, fontWeight: 900, cursor: "help", flexShrink: 0 }}>!</span>
      {show && (
        <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, background: "#fff",
          borderRadius: 12, padding: "10px 14px", zIndex: 9999, width: 230, pointerEvents: "none",
          boxShadow: "0 8px 28px rgba(99,102,241,0.18), 0 0 0 1px #E0E7FF" }}>
          <div style={{ position: "absolute", bottom: -6, left: 10, width: 12, height: 12, background: "#fff",
            borderRight: "1px solid #E0E7FF", borderBottom: "1px solid #E0E7FF", transform: "rotate(45deg)" }} />
          <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "keep-all" }}>{hint}</div>
        </div>
      )}
    </span>
  );
}

// ─── 큰 지표 카드: [라벨 / 느낌표] 왼쪽, 큰 숫자 오른쪽 ────────────────
function BigStat({ label, value, unit = "", theme, positive, negative, hint }) {
  const v = typeof value === "number" ? value.toFixed(2) : (value ?? "—");
  let color = theme.text;
  if (positive && typeof value === "number" && value > 0) color = theme.success;
  if (negative && typeof value === "number" && value < 0) color = theme.danger;
  return (
    <div style={{ padding: "14px 16px", background: theme.codeBg, borderRadius: 10,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 64 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: theme.textMuted, whiteSpace: "nowrap" }}>{label}</span>
        <InfoDot hint={hint} />
      </div>
      <div style={{ fontSize: 25, fontWeight: 900, color, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", letterSpacing: -0.5 }}>{v}{unit}</div>
    </div>
  );
}

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
  const sc = strategyConfig || {};
  const tickers = (sc.assets || sc.tickers || sc.symbols || ["TQQQ", "SOXL"])
    .map((t) => String(t).toUpperCase());
  return { tickers };
}

const fieldLabel = (theme) => ({ fontSize: 12, color: theme.textMuted, fontWeight: 700 });
const fieldInput = (theme) => ({ padding: "9px 11px", borderRadius: 8, fontSize: 14, fontWeight: 700,
  border: `1px solid ${theme.panelBorder}`, background: theme.panel, color: theme.text });

function SeedSizingCard({ ws, theme }) {
  const { tickers } = useMemo(() => cfgInfiniteBuying(ws?.strategyConfig), [ws?.strategyConfig]);
  const [targetMan, setTargetMan] = useState(2000);
  const [period, setPeriod] = useState("2y");      // 프리셋 또는 "custom"
  const [start, setStart] = useState("");           // 직접 지정 시작일
  const [end, setEnd] = useState("");               // 직접 지정 종료일
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const custom = period === "custom";

  const onCalc = async () => {
    if (busy) return;
    const krw = Number(targetMan) * 10000;
    if (!krw || krw <= 0) { setErr("목표 월수익을 입력하세요"); return; }
    if (custom && (!start || !end)) { setErr("시작일과 종료일을 모두 선택하세요"); return; }
    setBusy(true); setErr(null); setRes(null);
    try {
      const body = { tickers, targetMonthlyKrw: krw };
      if (custom) { body.start = start; body.end = end; }
      else body.period = period;
      const r = await infiniteBuyingSizing(body);
      if (r?.feasible === false) setErr(r.reason || "해당 기간엔 익절이 없어 역산 불가");
      else setRes(r);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally { setBusy(false); }
  };

  const mdd = res?.backtest_stats?.max_drawdown_pct;
  return (
    <Card title="💰 목표수익 → 필요시드 계산기" theme={theme} titleSize={20}>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: theme.textMuted, lineHeight: 1.6 }}>
        <b>무한매수법</b>으로 <b>{tickers.join(" + ")}</b>를 운용할 때,
        원하는 <b>월 목표수익</b>을 입력하면 과거 성과 기준으로 <b>종목별 필요 시드</b>를 역산합니다.
        기준 기간을 <b>최근 2개월</b>처럼 짧게 잡거나 <b>날짜를 직접 지정</b>해 실제 거래와 비교해볼 수 있어요.
      </p>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 6 }}>
        <label style={fieldLabel(theme)}>
          <div style={{ marginBottom: 5 }}>월 목표수익 (만원)</div>
          <input type="number" value={targetMan} min={1} step={100}
            onChange={(e) => setTargetMan(e.target.value)} style={{ ...fieldInput(theme), width: 130 }} />
        </label>
        <label style={fieldLabel(theme)}>
          <div style={{ marginBottom: 5 }}>기준 기간</div>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...fieldInput(theme), fontSize: 13.5 }}>
            <option value="2mo">최근 2개월</option>
            <option value="3mo">최근 3개월</option>
            <option value="6mo">최근 6개월</option>
            <option value="1y">최근 1년</option>
            <option value="2y">최근 2년</option>
            <option value="5y">최근 5년</option>
            <option value="custom">직접 지정 (달력) →</option>
          </select>
        </label>
        {custom && (
          <>
            <label style={fieldLabel(theme)}>
              <div style={{ marginBottom: 5 }}>시작일</div>
              <input type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} style={{ ...fieldInput(theme), fontSize: 13 }} />
            </label>
            <label style={fieldLabel(theme)}>
              <div style={{ marginBottom: 5 }}>종료일</div>
              <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} style={{ ...fieldInput(theme), fontSize: 13 }} />
            </label>
          </>
        )}
        <button onClick={onCalc} disabled={busy} style={{ ...primaryBtn(theme, busy), height: 40 }}>
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
            <div style={{ fontSize: 26, fontWeight: 800, color: theme.accent, marginTop: 2 }}>{fmtKRW(res.required_seed_krw)}</div>
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
          <div style={{ fontSize: 11, lineHeight: 1.6, padding: "8px 12px", borderRadius: 8,
            background: "#fef3c7", border: "1px solid #fde68a", color: "#92400e" }}>
            ⚠️ {res.caveat || `과거 ${res.period} 성과 기준 추정. 레버리지 ETF는 낙폭이 큽니다(MDD ${mdd}%). 약세장에선 월수익이 크게 줄 수 있어요.`}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── 한 시리즈(에쿼티 or 개별 종목)에 SMA/EMA/BB 보조선 입히기 ──────────
function buildOverlaySeries(points, mainName, mainColor) {
  const values = points.map((p) => p.y);
  const mk = (arr, name, color, width, extra) => ({ name, color, width, ...extra, points: points.map((p, i) => ({ x: p.x, y: arr[i] })) });
  return [
    { name: mainName, color: mainColor, width: 2, points },
    ...(values.length >= 20 ? [mk(calcSMA(values, 20), "SMA 20", "#10b981", 1.4)] : []),
    ...(values.length >= 50 ? [mk(calcSMA(values, 50), "SMA 50", "#f59e0b", 1.4)] : []),
    ...(values.length >= 120 ? [mk(calcSMA(values, 120), "SMA 120", "#ef4444", 1.4)] : []),
    ...(values.length >= 20 ? [mk(calcEMA(values, 20), "EMA 20", "#8b5cf6", 1.4)] : []),
    ...(values.length >= 20 ? [mk(calcBollinger(values, 20, 2).upper, "BB 상단", "#94a3b8", 1, { dash: "4 3", opacity: 0.8 })] : []),
    ...(values.length >= 20 ? [mk(calcBollinger(values, 20, 2).lower, "BB 하단", "#94a3b8", 1, { dash: "4 3", opacity: 0.8 })] : []),
  ];
}

// ─── 차트 탭: [에쿼티 곡선] + 포트폴리오 ETF별 가격 차트 ─────────────────
function ChartTabs({ bt, theme }) {
  const [tab, setTab] = useState(0);
  const [subInd, setSubInd] = useState({ rsi: false, macd: false, stoch: false });

  // 0번: 백테스트 자산곡선
  const equitySeries = useMemo(() => {
    const eq = bt?.equity_curve;
    if (!Array.isArray(eq) || eq.length < 5) return null;
    const points = eq.map((p) => ({ x: p.date ? new Date(p.date) : null, y: Number(p.value) }));
    return buildOverlaySeries(points, "에쿼티 곡선", "#3b82f6");
  }, [bt]);

  // 1번+: 개별 종목 가격 (analytics 가 ticker_series 를 주면 표시)
  const tickerCharts = useMemo(() => {
    const ts = bt?.ticker_series;
    if (!ts || typeof ts !== "object") return [];
    return Object.entries(ts).map(([tk, rows]) => {
      const arr = Array.isArray(rows) ? rows : [];
      const points = arr.map((p) => ({ x: p.date ? new Date(p.date) : null, y: Number(p.close ?? p.value) }));
      return { ticker: tk, series: points.length >= 5 ? buildOverlaySeries(points, tk, "#3b82f6") : null };
    }).filter((c) => c.series);
  }, [bt]);

  const tabs = [{ key: "equity", label: "📈 자산곡선" }, ...tickerCharts.map((c) => ({ key: c.ticker, label: c.ticker }))];
  const activeSeries = tab === 0 ? equitySeries : tickerCharts[tab - 1]?.series;
  const eqValues = useMemo(() => (activeSeries ? activeSeries[0].points.map((p) => p.y) : []), [activeSeries]);
  const eqDates = useMemo(() => (activeSeries ? activeSeries[0].points.map((p) => p.x) : []), [activeSeries]);
  if (!equitySeries) return null;

  return (
    <Card title="📈 전략 자산곡선 & 종목 차트" theme={theme} titleSize={20}>
      {/* 탭 헤더 */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
        {tabs.map((t, i) => (
          <button key={t.key} type="button" onClick={() => setTab(i)}
            style={{ padding: "6px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              border: `1px solid ${tab === i ? theme.accent : theme.panelBorder}`,
              background: tab === i ? theme.accent : theme.panel, color: tab === i ? "#fff" : theme.textMuted }}>
            {t.label}
          </button>
        ))}
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: theme.textMuted, lineHeight: 1.6 }}>
        {tab === 0 ? (
          <>
            <b>이 차트는 개별 주가가 아니라</b>, 선택한 전략을 과거 기간({bt.period || "5y"})에 그대로 돌렸을 때
            <b> 포트폴리오 자산가치</b>(초기자본에서 시작)가 어떻게 변했는지 — 즉 <b>백테스트 결과 자산곡선</b>이에요.
            파란선이 자산가치, <b>SMA 20/50/120 · EMA 20 · 볼린저밴드</b>는 추세 보조선. 범례 클릭 토글 · 휠 확대 · 드래그 구간선택.
          </>
        ) : (
          <><b>{tabs[tab].label}</b>의 백테스트 기간 동안 <b>실제 가격 추이</b>입니다. 포트폴리오가 어떤 종목 움직임 위에서 돌아갔는지 확인하세요.</>
        )}
      </p>
      <TrendLineChart series={activeSeries} theme={theme} height={280} toggleable initialHidden={["EMA 20", "BB 상단", "BB 하단"]} />
      {tab === 0 && (
        <>
          <div style={{ display: "flex", gap: 7, alignItems: "center", margin: "12px 0 2px", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 700 }}>보조지표 패널</span>
            {[["rsi", "RSI"], ["macd", "MACD"], ["stoch", "Stochastic"]].map(([k, lbl]) => (
              <button key={k} type="button" onClick={() => setSubInd((s) => ({ ...s, [k]: !s[k] }))}
                style={{ padding: "3px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: `1px solid ${subInd[k] ? theme.accent : theme.panelBorder}`,
                  background: subInd[k] ? theme.accent : theme.panel, color: subInd[k] ? "#fff" : theme.textMuted }}>{lbl}</button>
            ))}
          </div>
          {subInd.rsi && <SubIndicatorChart kind="rsi" values={eqValues} dates={eqDates} theme={theme} />}
          {subInd.macd && <SubIndicatorChart kind="macd" values={eqValues} dates={eqDates} theme={theme} />}
          {subInd.stoch && <SubIndicatorChart kind="stoch" values={eqValues} dates={eqDates} theme={theme} />}
        </>
      )}
      {tab === 0 && tickerCharts.length === 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: theme.textMuted, fontStyle: "italic" }}>
          종목별 차트는 백테스트를 다시 실행하면 표시됩니다(엔진이 종목 시계열을 함께 반환).
        </div>
      )}
    </Card>
  );
}

export default function ReportPanel({ id, ws, onChange }) {
  const { theme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState("5y");
  const onRun = async () => {
    if (busy) return;
    setBusy(true);
    try { await runBacktest(id, period); onChange(); }
    catch (e) { alert("백테스트 실패: " + (e?.response?.data?.error || e.message)); }
    finally { setBusy(false); }
  };
  const bt = ws.lastBacktest;
  const rm = bt?.risk_metrics || {};

  return (
    <div>
      <PanelHeader
        icon="📊" title="Backtest Report"
        description="Strategy Config가 정형화되면 vectorbt deterministic engine으로 실행한 백테스트 결과입니다."
        theme={theme}
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} disabled={busy} title="백테스트 기간"
              style={{ padding: "8px 10px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: `1px solid ${theme.panelBorder}`, background: theme.panel, color: theme.text }}>
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
          {/* 성과 지표 — 5열 (5번째 열 = 최고일/최악일) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
            <BigStat label="총 수익률" value={bt.stats?.total_return_pct} unit="%" theme={theme} positive hint="백테스트 전체 기간의 누적 수익률입니다. 매수 후 보유 대비 전략의 성과를 보여줍니다." />
            <BigStat label="연환산 수익" value={bt.stats?.annualized_return_pct} unit="%" theme={theme} hint="CAGR — 1년 단위로 환산했을 때의 평균 수익률. 기간이 달라도 비교 가능한 표준 지표입니다." />
            <BigStat label="MDD" value={bt.stats?.max_drawdown_pct} unit="%" theme={theme} negative hint="Maximum Drawdown — 고점 대비 최대 낙폭. 가장 불운한 타이밍에 매수했을 때 겪을 수 있는 최대 손실입니다." />
            <BigStat label="Sharpe" value={bt.stats?.sharpe} theme={theme} hint="수익률 ÷ 변동성 × √252. 1.0 이상이면 양호, 2.0 이상이면 우수. 리스크 대비 수익 효율성." />
            <BigStat label="최고일" value={rm.best_day_pct} unit="%" theme={theme} positive hint="백테스트 기간 중 가장 좋았던 하루의 수익률입니다." />
            <BigStat label="Sortino" value={bt.stats?.sortino} theme={theme} hint="Sharpe와 유사하나 하락 변동성만 페널티. 상승 변동성은 좋은 것이므로 투자자에게 더 유리한 평가." />
            <BigStat label="Calmar" value={bt.stats?.calmar ?? rm.calmar} theme={theme} hint="연환산 수익 ÷ |MDD|. 낙폭 대비 수익 효율성. 값이 클수록 손실 위험 대비 수익이 좋은 전략." />
            <BigStat label="승률" value={bt.stats?.win_rate_pct} unit="%" theme={theme} hint="전체 거래일 중 수익이 발생한 날의 비율입니다." />
            <BigStat label="거래 수" value={bt.stats?.trades} unit="회" theme={theme} hint="백테스트 기간 동안 발생한 총 매매 횟수입니다." />
            <BigStat label="최악일" value={rm.worst_day_pct} unit="%" theme={theme} negative hint="백테스트 기간 중 가장 나빴던 하루의 손실률입니다. 이 수준의 손실을 감당할 수 있는지 확인하세요." />
          </div>

          {/* 차트 탭 (자산곡선 + 종목별) */}
          <ChartTabs bt={bt} theme={theme} />

          {/* 위험지표 — 1줄 4지표 + 쉬운 설명 */}
          {bt.risk_metrics && (
            <Card title="📐 위험지표 상세 (QuantStats)" theme={theme} titleSize={20}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                <BigStat label="CAGR" value={rm.cagr_pct} unit="%" theme={theme} hint="복리 연환산 수익률 — 1년에 평균 몇 % 불어났는지." />
                <BigStat label="변동성" value={rm.volatility_pct} unit="%" theme={theme} hint="연환산 변동성. 일별 수익률 표준편차 × √252. 높을수록 자산가치 등락이 큽니다." />
                <BigStat label="VaR(95%)" value={rm.var_95_pct} unit="%" theme={theme} negative hint="95% 신뢰수준에서 하루에 발생 가능한 최대 손실. -2%면 95% 확률로 하루 손실이 2% 이내." />
                <BigStat label="CVaR(95%)" value={rm.cvar_95_pct} unit="%" theme={theme} negative hint="최악의 5% 상황에서의 평균 손실. VaR보다 극단적 손실을 더 잘 반영합니다." />
              </div>
              <div style={{ marginTop: 12, padding: "13px 15px", borderRadius: 10, background: theme.codeBg,
                fontSize: 12.5, color: theme.textMuted, lineHeight: 1.8 }}>
                <b style={{ color: theme.text }}>쉽게 풀면 —</b><br />
                · <b style={{ color: theme.text }}>CAGR {fmtNum(rm.cagr_pct)}%</b> : 이 전략을 그대로 두면 <b>1년에 평균 {fmtNum(rm.cagr_pct)}%</b>씩 복리로 불어났다는 뜻이에요.<br />
                · <b style={{ color: theme.text }}>변동성 {fmtNum(rm.volatility_pct)}%</b> : 자산가치가 <b>위아래로 출렁이는 정도</b>. 숫자가 클수록 마음 졸일 일이 많습니다(레버리지 ETF는 보통 높아요).<br />
                · <b style={{ color: theme.text }}>VaR {fmtNum(rm.var_95_pct)}%</b> : <b>보통 나쁜 날(하위 5%) 하루에</b> 이 정도 손실을 볼 수 있다는 선이에요.<br />
                · <b style={{ color: theme.text }}>CVaR {fmtNum(rm.cvar_95_pct)}%</b> : <b>정말 최악의 날들만 모았을 때</b> 평균 손실. VaR선을 넘는 폭락이 오면 평균 이만큼 빠집니다.<br />
                <span style={{ fontSize: 11.5 }}>👉 변동성·VaR·CVaR이 크면 수익이 좋아도 <b>중간에 버티기 힘든</b> 전략이에요. 내 멘탈/시드와 맞는지 함께 보세요.</span>
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

function fmtNum(v) { return typeof v === "number" ? v.toFixed(2) : (v ?? "—"); }
