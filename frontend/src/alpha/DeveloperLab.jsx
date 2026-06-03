import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import Editor, { DiffEditor } from "@monaco-editor/react";
import {
  Play, Rocket, Terminal, BarChart3, Code2, Loader, Boxes, Save, Bot,
  FolderOpen, Database, FileCode, ChevronDown, ChevronRight, X,
  ShoppingCart, AlertCircle, CheckCircle2, GitBranch, FilePlus, FolderPlus,
  ExternalLink, Send, Plus, Lightbulb,
} from "lucide-react";
import { useTheme } from "./ThemeContext";
import {
  getWorkspace, listWorkspaces, runBacktest, runRegime, runTrust, saveCode, queueOrders,
  getDataStatus, getDataPreview, leanBacktestStart, leanBacktestStatus, leanListStrategies, getLeanHealth,
  runClaudeAgentStart, runClaudeAgentStatus, resetClaudeSession, runImproveProposal, runCompareBacktest,
  getWorkspaceGitStatus, getWorkspaceFileTree, pullWorkspaceFile, deleteWorkspaceFile,
  listBrokerAccounts, getBinanceBalance, getWorkspaceCommit,
} from "./alphaApi";
import GitPanel from "./GitPanel";
import TerminalTabs from "./TerminalTabs";
import { TrendLineChart, SubIndicatorChart, calcSMA, calcEMA, calcBollinger } from "./tabs/helpers";
import RepoExplorer from "./RepoExplorer";
import ClaudeKeyConnect from "./ClaudeKeyConnect";

// ── 언어 감지 ─────────────────────────────────────────────────────────────────
function detectLang(fileName) {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  return {
    py:"python", js:"javascript", jsx:"javascript", ts:"typescript", tsx:"typescript",
    java:"java", md:"markdown", json:"json", yaml:"yaml", yml:"yaml",
    html:"html", css:"css", sh:"bash", txt:"plaintext", sql:"sql",
    rs:"rust", go:"go", rb:"ruby", cpp:"cpp", c:"c", cs:"csharp",
  }[ext] || "plaintext";
}

// ── 파일 트리 빌더 (flat list → 재귀 트리) ────────────────────────────────────
function buildTree(entries) {
  const root = { children: {}, files: [] };
  for (const entry of entries) {
    const parts = entry.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.children[parts[i]]) node.children[parts[i]] = { children: {}, files: [] };
      node = node.children[parts[i]];
    }
    node.files.push({ name: parts[parts.length - 1], path: entry.path });
  }
  return root;
}

// ── 재귀 트리 노드 컴포넌트 ───────────────────────────────────────────────────
function RepoTreeNode({ name, node, depth, onOpen, activePath, modifiedSet, fetching }) {
  const [open, setOpen] = useState(depth < 2);
  const dirs = useMemo(
    () => Object.entries(node.children).sort(([a], [b]) => a.localeCompare(b)),
    [node.children]
  );
  const files = useMemo(
    () => [...node.files].sort((a, b) => a.name.localeCompare(b.name)),
    [node.files]
  );
  const childDepth = name ? depth + 1 : depth;
  const indent = childDepth * 12 + 8;

  return (
    <div>
      {name && (
        <div
          onClick={() => setOpen(o => !o)}
          style={{
            display:"flex", alignItems:"center", gap:4,
            padding:`4px 8px 4px ${8 + depth * 12}px`,
            cursor:"pointer", userSelect:"none", color:"#9CA3AF", fontSize:11, fontWeight:600,
          }}
        >
          {open ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}
          <FolderOpen size={11} color="#60a5fa" style={{flexShrink:0}}/>
          {name}
        </div>
      )}
      {(open || !name) && (
        <>
          {dirs.map(([dir, child]) => (
            <RepoTreeNode key={dir} name={dir} node={child} depth={childDepth}
              onOpen={onOpen} activePath={activePath} modifiedSet={modifiedSet} fetching={fetching}/>
          ))}
          {files.map(f => {
            const isActive = f.path === activePath;
            const isModified = modifiedSet.has(f.path);
            const isFetching = f.path === fetching;
            return (
              <div key={f.path}
                onClick={() => !isFetching && onOpen(f.path)}
                style={{
                  display:"flex", alignItems:"center", gap:5,
                  padding:`3px 8px 3px ${indent}px`,
                  cursor: isFetching ? "wait" : "pointer",
                  background: isActive ? "rgba(96,165,250,0.1)" : "transparent",
                  color: isActive ? "#e2e8f0" : "#6B7280", fontSize:11,
                }}
                onMouseEnter={e => !isActive && (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                onMouseLeave={e => !isActive && (e.currentTarget.style.background = "transparent")}
              >
                {isFetching
                  ? <Loader size={10} style={{animation:"spin 1s linear infinite",flexShrink:0}}/>
                  : <FileCode size={10} color={isActive ? "#93c5fd" : "#60a5fa"} style={{flexShrink:0}}/>
                }
                <span style={{flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                  {f.name}
                </span>
                {isModified && (
                  <span style={{width:6, height:6, borderRadius:999, background:"#60a5fa", flexShrink:0}}/>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── 코드 생성 유틸 ─────────────────────────────────────────────────────────────
function generateCodeFromConfig(cfg) {
  if (!cfg) return null;
  const stype   = cfg.strategy_type || "moving_average_timing";
  const assets  = cfg.assets || ["SPY"];
  const params  = cfg.parameters || {};
  const name    = cfg.strategy_name || "My Strategy";
  const ticker  = assets[0] || "SPY";
  const smFast  = params.sma_fast || 20;
  const smSlow  = params.ma_window || params.sma_slow || 60;
  const mFast   = params.macd_fast || 12;
  const mSlow   = params.macd_slow || 26;
  const mSig    = params.macd_signal || 9;
  const rPeriod = params.rsi_period || 14;
  const rLow    = params.rsi_low || 30;
  const rHigh   = params.rsi_high || 70;
  const vix     = params.vix_threshold || 25;
  const clsName = name.replace(/[^a-zA-Z0-9]/g, "").replace(/^[0-9]/, "S") || "Strategy";

  if (stype === "momentum_rotation") {
    return `# AlphaHelix Strategy: ${name}
# ════════════════════════════════════════════════════════
# 전략 유형: MACD 모멘텀
TICKER       = "${ticker}"
BENCHMARK    = "SPY"
MACD_FAST    = ${mFast}
MACD_SLOW    = ${mSlow}
MACD_SIGNAL  = ${mSig}

from AlgorithmImports import *

class ${clsName}(QCAlgorithm):
    def Initialize(self):
        self.SetStartDate(2020, 1, 1)
        self.SetEndDate(2024, 12, 31)
        self.SetCash(10_000)
        self.symbol = self.AddEquity(TICKER, Resolution.Daily).Symbol
        self.SetBenchmark(BENCHMARK)
        self.macd = self.MACD(self.symbol, MACD_FAST, MACD_SLOW, MACD_SIGNAL, MovingAverageType.Exponential, Resolution.Daily)
        self.SetWarmUp(MACD_SLOW + MACD_SIGNAL + 5)

    def OnData(self, data):
        if self.IsWarmingUp or not self.macd.IsReady:
            return
        if self.macd.Current.Value > self.macd.Signal.Current.Value:
            if not self.Portfolio[self.symbol].IsLong:
                self.SetHoldings(self.symbol, 1.0)
        elif self.macd.Current.Value < self.macd.Signal.Current.Value:
            if self.Portfolio[self.symbol].IsLong:
                self.Liquidate()
`;
  }

  if (stype === "rsi_meanrev") {
    return `# AlphaHelix Strategy: ${name}
# ════════════════════════════════════════════════════════
# 전략 유형: RSI 평균회귀
TICKER       = "${ticker}"
BENCHMARK    = "SPY"
RSI_PERIOD   = ${rPeriod}
RSI_LOW      = ${rLow}
RSI_HIGH     = ${rHigh}

from AlgorithmImports import *

class ${clsName}(QCAlgorithm):
    def Initialize(self):
        self.SetStartDate(2020, 1, 1)
        self.SetEndDate(2024, 12, 31)
        self.SetCash(10_000)
        self.symbol = self.AddEquity(TICKER, Resolution.Daily).Symbol
        self.SetBenchmark(BENCHMARK)
        self.rsi = self.RSI(self.symbol, RSI_PERIOD, Resolution.Daily)
        self.SetWarmUp(RSI_PERIOD + 5)

    def OnData(self, data):
        if self.IsWarmingUp or not self.rsi.IsReady:
            return
        val = self.rsi.Current.Value
        if val < RSI_LOW:
            if not self.Portfolio[self.symbol].IsLong:
                self.SetHoldings(self.symbol, 1.0)
        elif val > RSI_HIGH:
            if self.Portfolio[self.symbol].IsLong:
                self.Liquidate()
`;
  }

  if (stype === "vix_risk_off") {
    return `# AlphaHelix Strategy: ${name}
# ════════════════════════════════════════════════════════
# 전략 유형: VIX 리스크 오프
TICKER          = "${ticker}"
BENCHMARK       = "SPY"
VIX_THRESHOLD   = ${vix}

from AlgorithmImports import *

class ${clsName}(QCAlgorithm):
    def Initialize(self):
        self.SetStartDate(2020, 1, 1)
        self.SetEndDate(2024, 12, 31)
        self.SetCash(10_000)
        self.symbol = self.AddEquity(TICKER, Resolution.Daily).Symbol
        self.vix    = self.AddEquity("VXX", Resolution.Daily).Symbol
        self.SetBenchmark(BENCHMARK)

    def OnData(self, data):
        if not data.ContainsKey(self.vix):
            return
        vix_val = data[self.vix].Close
        if vix_val <= VIX_THRESHOLD:
            if not self.Portfolio[self.symbol].IsLong:
                self.SetHoldings(self.symbol, 1.0)
        else:
            if self.Portfolio[self.symbol].IsLong:
                self.Liquidate()
`;
  }

  return `# AlphaHelix Strategy: ${name}
# ════════════════════════════════════════════════════════
# 전략 유형: SMA 크로스오버
TICKER       = "${ticker}"
BENCHMARK    = "SPY"
SMA_FAST     = ${smFast}
SMA_SLOW     = ${smSlow}

from AlgorithmImports import *

class ${clsName}(QCAlgorithm):
    def Initialize(self):
        self.SetStartDate(2020, 1, 1)
        self.SetEndDate(2024, 12, 31)
        self.SetCash(10_000)
        self.symbol   = self.AddEquity(TICKER, Resolution.Daily).Symbol
        self.SetBenchmark(BENCHMARK)
        self.sma_fast = self.SMA(self.symbol, SMA_FAST, Resolution.Daily)
        self.sma_slow = self.SMA(self.symbol, SMA_SLOW, Resolution.Daily)
        self.SetWarmUp(SMA_SLOW + 10)

    def OnData(self, data):
        if self.IsWarmingUp:
            return
        if not all([self.sma_fast.IsReady, self.sma_slow.IsReady]):
            return
        if self.sma_fast.Current.Value > self.sma_slow.Current.Value:
            if not self.Portfolio[self.symbol].IsLong:
                self.SetHoldings(self.symbol, 1.0)
        elif self.sma_fast.Current.Value < self.sma_slow.Current.Value:
            if self.Portfolio[self.symbol].IsLong:
                self.Liquidate()

    def OnEndOfAlgorithm(self):
        self.Log(f"[DONE] 포트폴리오 최종 가치: ${"{"}self.Portfolio.TotalPortfolioValue:,.0f{"}"}")
`;
}

// ── 코드에서 파라미터 추출 ─────────────────────────────────────────────────────
function parseParamsFromCode(code) {
  if (!code) return {};
  const result = {};
  const extract = (re, key, toNum = true) => {
    const m = code.match(re);
    if (m) result[key] = toNum ? parseFloat(m[1]) : m[1];
  };
  extract(/^\s*SMA_FAST\s*=\s*([\d.]+)/m,    "sma_fast");
  extract(/^\s*SMA_SLOW\s*=\s*([\d.]+)/m,    "sma_slow");
  extract(/^\s*RSI_PERIOD\s*=\s*([\d.]+)/m,  "rsi_period");
  extract(/^\s*RSI_LOW\s*=\s*([\d.]+)/m,     "rsi_low");
  extract(/^\s*RSI_HIGH\s*=\s*([\d.]+)/m,    "rsi_high");
  extract(/^\s*MACD_FAST\s*=\s*([\d.]+)/m,   "macd_fast");
  extract(/^\s*MACD_SLOW\s*=\s*([\d.]+)/m,   "macd_slow");
  extract(/^\s*MACD_SIGNAL\s*=\s*([\d.]+)/m, "macd_signal");
  extract(/^\s*VIX_THRESHOLD\s*=\s*([\d.]+)/m,"vix_threshold");
  extract(/^\s*TICKER\s*=\s*"([^"]+)"/m,     "ticker", false);
  return result;
}

// parseParamsFromCode 의 역함수 — 선택한 파라미터 값을 코드의 상수에 그대로 반영(P3 적용).
function applyParamsToCode(code, params) {
  if (!code || !params) return code;
  let out = code;
  const repl = (constName, val) => {
    if (val == null) return;
    const re = new RegExp(`^(\\s*${constName}\\s*=\\s*)[\\d.]+`, "m");
    if (re.test(out)) out = out.replace(re, `$1${val}`);
  };
  repl("SMA_FAST", params.sma_fast);   repl("SMA_SLOW", params.sma_slow);
  repl("RSI_PERIOD", params.rsi_period); repl("RSI_LOW", params.rsi_low); repl("RSI_HIGH", params.rsi_high);
  repl("MACD_FAST", params.macd_fast); repl("MACD_SLOW", params.macd_slow); repl("MACD_SIGNAL", params.macd_signal);
  repl("VIX_THRESHOLD", params.vix_threshold);
  return out;
}

// ── 에쿼티 커브 변환 ──────────────────────────────────────────────────────────
function convertEquityCurve(curve) {
  if (!curve || curve.length < 2) return [];
  const base = curve[0].value || 10000;
  return curve.map(d => ({
    v: Math.round((d.value / base) * 100),
    t: (d.date || "").slice(2, 7).replace("-", "."),
  }));
}

const FILE_META = {
  main: { name: "main.py", lang: "python" },
};

const PLACEHOLDER_CODE = `# ── AlphaHelix Developer Studio ──────────────────────────
# 워크스페이스가 선택되지 않았습니다.
#
# 사용 방법:
#  1. 왼쪽 'Alpha-Helix' 탭에서 워크스페이스를 만들고
#     Goal → Strategy 설정을 완료하세요.
#  2. 설정 완료 후 이 화면으로 돌아오면
#     전략 코드가 자동으로 로드됩니다.
#  3. 파라미터를 수정하고 'Run Backtest'를 실행하세요.
`;

const DATASETS = [
  {
    id:"us_daily", name:"US_Stock_Daily", desc:"미국 주식 일봉 (2010~2024)", rows:"48,320",
    cols:["date","ticker","open","high","low","close","volume","adj_close"],
    preview:[
      {date:"2024-12-31",ticker:"TQQQ",open:"82.40",high:"84.20",low:"81.90",close:"83.15",volume:"12,480,000",adj_close:"83.15"},
      {date:"2024-12-31",ticker:"SOXL",open:"31.20",high:"32.10",low:"30.85",close:"31.75",volume:"8,320,000", adj_close:"31.75"},
      {date:"2024-12-31",ticker:"SPY", open:"592.10",high:"594.30",low:"591.40",close:"593.22",volume:"62,400,000",adj_close:"593.22"},
      {date:"2024-12-30",ticker:"TQQQ",open:"81.50",high:"82.80",low:"80.90",close:"82.40",volume:"9,840,000", adj_close:"82.40"},
    ],
  },
  {
    id:"kospi", name:"KOSPI_Daily", desc:"KOSPI 구성 종목 일봉 (2015~2024)", rows:"31,200",
    cols:["date","code","name","open","high","low","close","volume"],
    preview:[
      {date:"2024-12-31",code:"005930",name:"삼성전자",  open:"53,200",high:"54,100",low:"53,000",close:"53,800",volume:"14,820,000"},
      {date:"2024-12-31",code:"000660",name:"SK하이닉스",open:"198,000",high:"201,000",low:"197,500",close:"200,500",volume:"3,240,000"},
    ],
  },
  {
    id:"crypto", name:"Crypto_1Min", desc:"BTC/ETH 1분봉 (2020~2024)", rows:"2,100,000",
    cols:["timestamp","symbol","open","high","low","close","volume"],
    preview:[
      {timestamp:"2024-12-31 23:59",symbol:"BTC/USDT",open:"94,820.5",high:"94,850.0",low:"94,800.0",close:"94,840.0",volume:"18.240"},
      {timestamp:"2024-12-31 23:59",symbol:"ETH/USDT",open:"3,386.0", high:"3,390.0", low:"3,384.5", close:"3,388.0", volume:"142.80"},
    ],
  },
  {
    id:"my_kis", name:"MyPortfolio_KIS", desc:"내 한투 계좌 보유 현황 (실시간)", rows:"실시간",
    cols:["ticker","qty","avg_price","current","pnl","pnl_pct"],
    preview:[
      {ticker:"TQQQ",    qty:"1,240",avg_price:"$42.30",current:"$83.15",pnl:"+$50,499",pnl_pct:"+96.6%"},
      {ticker:"SOXL",    qty:"860",  avg_price:"$18.40",current:"$31.75",pnl:"+$11,481",pnl_pct:"+72.6%"},
    ],
  },
  {
    id:"my_binance", name:"MyPortfolio_Binance", desc:"내 Binance 계좌 보유 현황 (실시간)", rows:"실시간",
    cols:["asset","free","locked","total"],
    liveBinance:true,
    preview:[],
  },
];

// 실제 수집 현황(/api/analytics/data-status)을 데이터셋 카드로 변환.
// 하드코딩 대신 DB에 실제 적재된 polygon/binance 행 수·종목·기간을 보여준다.
function buildDatasetsFromStatus(status, fallback) {
  const stats = (status && status.collection_stats) || [];
  if (!stats.length) return fallback;
  const fmt = (n) => Number(n || 0).toLocaleString();
  const day = (s) => (s ? String(s).slice(0, 10) : "?");
  const bySrc = {};
  for (const s of stats) {
    const src = s.source || "?";
    const g = bySrc[src] || (bySrc[src] = { rows: 0, symbols: new Set(), tfs: new Set(), oldest: null, latest: null });
    g.rows += s.total_rows || 0;
    if (s.symbol) g.symbols.add(s.symbol);
    if (s.tf) g.tfs.add(s.tf);
    if (s.oldest && (!g.oldest || s.oldest < g.oldest)) g.oldest = s.oldest;
    if (s.latest && (!g.latest || s.latest > g.latest)) g.latest = s.latest;
  }
  const META = {
    polygon: { id: "us_daily", name: "US_Stock_Daily", label: "미국 주식 일봉 · Polygon.io" },
    binance: { id: "crypto",   name: "Crypto_OHLCV",   label: "암호화폐 · Binance" },
    yfinance:{ id: "yf",       name: "YFinance_Daily",  label: "주식 일봉 · yfinance" },
    kis:     { id: "kis_ohlcv",name: "KIS_OHLCV",       label: "국내/해외 · KIS" },
  };
  const cards = [];
  for (const [src, g] of Object.entries(bySrc)) {
    const m = META[src] || { id: src, name: src, label: src };
    const tfs = [...g.tfs];
    cards.push({
      id: m.id, name: m.name, source: src, live: true,
      symbols: [...g.symbols].sort(),
      tf: tfs.includes("1d") ? "1d" : (tfs[0] || "1d"),
      rows: fmt(g.rows),
      desc: `${m.label} · ${g.symbols.size}종목 · ${tfs.join("/") || "1d"} (${day(g.oldest)}~${day(g.latest)})`,
      cols: ["ts", "symbol", "open", "high", "low", "close", "volume"],
      preview: [],
    });
  }
  cards.sort((a, b) => a.name.localeCompare(b.name));
  // 내 데이터(KIS/Binance 실시간) 카드는 fallback 그대로 유지
  for (const id of ["my_kis", "my_binance"]) {
    const card = (fallback || []).find((d) => d.id === id);
    if (card) cards.push(card);
  }
  return cards;
}

// ── SVG 차트 ──────────────────────────────────────────────────────────────────
function SparkChart({ data, bench = [] }) {
  const [W, H] = [560, 150];
  const pad = { t:10, r:10, b:24, l:36 };
  const cW = W-pad.l-pad.r, cH = H-pad.t-pad.b;
  const allV = [...data.map(d=>d.v), ...(bench.length ? bench.map(d=>d.v) : [])];
  if (allV.length === 0) return null;
  const mn = Math.min(...allV)-5, mx = Math.max(...allV)+5;
  const tx = i => (i/(data.length-1))*cW;
  const ty = v => cH - ((v-mn)/(mx-mn))*cH;
  const pathD = arr => arr.map((d,i)=>`${i?"L":"M"}${tx(i).toFixed(1)},${ty(d.v).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} style={{overflow:"visible"}}>
      <g transform={`translate(${pad.l},${pad.t})`}>
        {[0,0.33,0.66,1].map((r,i)=>(<line key={i} x1={0} y1={cH*r} x2={cW} y2={cH*r} stroke="rgba(255,255,255,0.05)" strokeWidth={1}/>))}
        {bench.length > 0 && <path d={pathD(bench)} fill="none" stroke="#4B5563" strokeWidth={1.5} strokeDasharray="4 2"/>}
        <path d={pathD(data)} fill="none" stroke="#60a5fa" strokeWidth={2.2}/>
        {data.filter((_,i)=>i%3===0).map((d)=>{
          const idx=data.indexOf(d);
          return <text key={idx} x={tx(idx)} y={cH+16} textAnchor="middle" fill="#4B5563" fontSize={9}>{d.t}</text>;
        })}
        {[mn,(mn+mx)/2,mx].map((v,i)=>(<text key={i} x={-4} y={ty(v)+4} textAnchor="end" fill="#4B5563" fontSize={9}>{Math.round(v)}</text>))}
        <rect x={cW-110} y={-6} width={8} height={8} rx={2} fill="#60a5fa"/>
        <text x={cW-98} y={2} fill="#6B7280" fontSize={9}>전략</text>
      </g>
    </svg>
  );
}

function MetricCard({label,value,color="#60a5fa"}) {
  return (
    <div style={{padding:"8px 12px",borderRadius:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)"}}>
      <div style={{fontSize:9,color:"#4B5563",marginBottom:2}}>{label}</div>
      <div style={{fontSize:15,fontWeight:800,color}}>{value}</div>
    </div>
  );
}

// ── DataTableView ─────────────────────────────────────────────────────────────
function DataTableView({ datasetId, datasets }) {
  const list = (datasets && datasets.length) ? datasets : DATASETS;
  const ds = list.find(d=>d.id===datasetId);
  const [rows, setRows] = useState(ds?.preview || []);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    // 내 Binance 계좌 — 실시간 잔고 (getBinanceBalance)
    if (ds && ds.liveBinance) {
      let alive = true;
      setLoading(true); setErr(null);
      (async () => {
        try {
          const accts = await listBrokerAccounts();
          const bn = (accts || []).find(a => a.brokerType === "BINANCE");
          if (!bn) { if (alive) { setRows([]); setErr("Binance 계좌 미등록 — 계좌관리에서 등록하세요."); } return; }
          const bal = await getBinanceBalance(bn.env, bn.binanceMode || "SPOT");
          const balances = (bal && bal.balances) || [];
          const f = (n) => (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 8 });
          if (alive) setRows(balances.map(b => {
            const free = Number(b.free) || 0, locked = Number(b.locked) || 0;
            return { asset: b.asset, free: f(free), locked: f(locked), total: f(free + locked) };
          }));
        } catch (e) {
          if (alive) setErr("Binance 잔고 로드 실패 — 계좌 검증(연결 테스트) 상태를 확인하세요.");
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => { alive = false; };
    }
    if (!ds || !ds.live) { setRows(ds?.preview || []); return; }
    const sym = ds.symbols && ds.symbols[0];
    if (!sym) { setRows([]); return; }
    let alive = true;
    setLoading(true); setErr(null);
    getDataPreview(sym, ds.tf || "1d", ds.source, 30)
      .then(res => {
        if (!alive) return;
        const data = (res && res.data) || [];
        // 최신이 위로 오도록 역순
        setRows(data.slice().reverse().map(r => ({
          ts: String(r.ts || "").slice(0, 19),
          symbol: r.symbol,
          open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
        })));
      })
      .catch(() => { if (alive) setErr("미리보기 로드 실패 — Analytics 사이드카 / 수집 현황을 확인하세요."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ds?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ds) return null;
  const cols = ds.cols || ["ts","symbol","open","high","low","close","volume"];
  return (
    <div style={{flex:1,overflow:"auto",padding:"16px 20px",background:"#0f1117"}}>
      <div style={{marginBottom:10,display:"flex",alignItems:"center",gap:12}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"white",display:"flex",alignItems:"center",gap:8}}>
            {ds.name}
            {(ds.live || ds.liveBinance) && <span style={{fontSize:8,padding:"1px 6px",borderRadius:999,background:"rgba(16,185,129,0.15)",color:"#10B981",fontWeight:700}}>{ds.liveBinance ? "LIVE" : "LIVE DB"}</span>}
          </div>
          <div style={{fontSize:10,color:"#4B5563",marginTop:2}}>{ds.desc}  ·  {ds.rows} rows  ·  {cols.length} cols</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
          {cols.map(c=>(
            <span key={c} style={{fontSize:9,padding:"2px 7px",borderRadius:4,background:"rgba(96,165,250,0.1)",color:"#60a5fa",fontFamily:"monospace"}}>{c}</span>
          ))}
        </div>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",fontSize:11.5}}>
          <thead>
            <tr>
              {cols.map(c=>(
                <th key={c} style={{padding:"6px 12px",textAlign:"left",color:"#4B5563",fontWeight:700,
                  borderBottom:"1px solid rgba(255,255,255,0.08)",background:"#161b22",whiteSpace:"nowrap"}}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row,i)=>(
              <tr key={i} style={{background:i%2===0?"transparent":"rgba(255,255,255,0.015)"}}>
                {cols.map(c=>(
                  <td key={c} style={{padding:"5px 12px",color:"#9CA3AF",borderBottom:"1px solid rgba(255,255,255,0.04)",
                    fontFamily:"'Fira Code',monospace",whiteSpace:"nowrap",fontSize:11}}>{String(row[c] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{marginTop:10,fontSize:10,color:"#2d3748"}}>
        {loading ? "실제 DB에서 미리보기 로딩 중…"
          : err ? err
          : ds.liveBinance ? `* 실시간 Binance 잔고 ${rows.length}개 자산 (0 잔고 제외)`
          : ds.live ? `* 최근 ${rows.length}행 (실제 수집 데이터 · source=${ds.source})  |  전체 ${ds.rows} rows 적재됨`
          : `* 상위 ${rows.length}행 미리보기`}
      </div>
    </div>
  );
}

// ── BacktestReportView ────────────────────────────────────────────────────────
function BacktestReportView({ btResult }) {
  const [subInd, setSubInd] = useState({ rsi: false, macd: false, stoch: false });
  if (!btResult?.stats) {
    return (
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,color:"#4B5563"}}>
        <BarChart3 size={32} color="#2d3748"/>
        <div style={{fontSize:13,fontWeight:600}}>백테스트 결과 없음</div>
        <div style={{fontSize:11}}>상단의 <span style={{color:"#60a5fa",fontWeight:700}}>Run Backtest</span> 버튼을 눌러 실행하세요</div>
      </div>
    );
  }
  const s = btResult.stats;
  // 에쿼티 + 보조선 시리즈 (StrategyWorkspace 리포트와 동일한 TrendLineChart 사용)
  const IDE_THEME = { accent:"#60a5fa", text:"#e5e7eb", textMuted:"#94a3b8", panel:"#161b22", panelBorder:"rgba(255,255,255,0.12)", panelAlt:"rgba(96,165,250,0.12)" };
  const eqPts = (btResult.equity_curve || []).map((d, i) => ({ x: d.date ? new Date(d.date) : i, y: Number(d.value) }));
  const eqVals = eqPts.map((p) => p.y);
  const eqDates = eqPts.map((p) => p.x);
  const mkS = (arr, name, color, width, extra) => ({ name, color, width, ...extra, points: eqPts.map((p, i) => ({ x: p.x, y: arr[i] })) });
  const bbIde = eqVals.length >= 20 ? calcBollinger(eqVals, 20, 2) : null;
  const ideSeries = eqPts.length > 1 ? [
    { name: "에쿼티", color: "#60a5fa", width: 2, points: eqPts },
    ...(eqVals.length >= 20 ? [mkS(calcSMA(eqVals, 20), "SMA 20", "#10b981", 1.4)] : []),
    ...(eqVals.length >= 50 ? [mkS(calcSMA(eqVals, 50), "SMA 50", "#f59e0b", 1.4)] : []),
    ...(eqVals.length >= 120 ? [mkS(calcSMA(eqVals, 120), "SMA 120", "#ef4444", 1.4)] : []),
    ...(eqVals.length >= 20 ? [mkS(calcEMA(eqVals, 20), "EMA 20", "#8b5cf6", 1.4)] : []),
    ...(bbIde ? [mkS(bbIde.upper, "BB 상단", "#94a3b8", 1, { dash: "4 3", opacity: 0.8 }), mkS(bbIde.lower, "BB 하단", "#94a3b8", 1, { dash: "4 3", opacity: 0.8 })] : []),
  ] : [];
  const fmtPct = (v) => v == null ? "N/A" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
  const fmtNum = (v, d=2) => v == null ? "N/A" : v.toFixed(d);
  const period = `${s.start || ""} – ${s.end || ""}`;
  return (
    <div style={{flex:1,overflow:"auto",padding:"20px",background:"#0f1117"}}>
      <div style={{marginBottom:16,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <BarChart3 size={16} color="#60a5fa"/>
        <span style={{fontSize:14,fontWeight:800,color:"white"}}>백테스트 리포트</span>
        <span style={{fontSize:10,color:"#4B5563"}}>{period} · {s.engine === "lean" ? `Lean · QC${s.run_id ? " · " + s.run_id : ""}` : "vectorbt"}</span>
        <span style={{fontSize:9,padding:"2px 8px",borderRadius:999,background:"rgba(16,185,129,0.15)",color:"#10B981",fontWeight:700}}>완료</span>
      </div>
      {ideSeries.length > 1 && (
        <div style={{marginBottom:16,background:"rgba(255,255,255,0.02)",borderRadius:12,
          border:"1px solid rgba(255,255,255,0.06)",padding:"14px 16px"}}>
          <div style={{fontSize:11,color:"#cbd5e1",fontWeight:700,marginBottom:8}}>📈 에쿼티 추세 &amp; 보조지표</div>
          <TrendLineChart series={ideSeries} theme={IDE_THEME} height={240}
            toggleable initialHidden={["EMA 20","BB 상단","BB 하단"]} />
          {/* 하단 보조지표 패널 (RSI / MACD / Stochastic) */}
          <div style={{display:"flex",gap:7,alignItems:"center",margin:"12px 0 2px",flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:"#94a3b8",fontWeight:700}}>보조지표 패널</span>
            {[["rsi","RSI"],["macd","MACD"],["stoch","Stochastic"]].map(([k,lbl])=>(
              <button key={k} type="button" onClick={()=>setSubInd(v=>({...v,[k]:!v[k]}))}
                style={{padding:"3px 12px",borderRadius:999,fontSize:11,fontWeight:700,cursor:"pointer",
                  border:`1px solid ${subInd[k]?"#60a5fa":"rgba(255,255,255,0.14)"}`,
                  background:subInd[k]?"#60a5fa":"transparent",color:subInd[k]?"#fff":"#94a3b8"}}>{lbl}</button>
            ))}
          </div>
          {subInd.rsi && <SubIndicatorChart kind="rsi" values={eqVals} dates={eqDates} theme={IDE_THEME} />}
          {subInd.macd && <SubIndicatorChart kind="macd" values={eqVals} dates={eqDates} theme={IDE_THEME} />}
          {subInd.stoch && <SubIndicatorChart kind="stoch" values={eqVals} dates={eqDates} theme={IDE_THEME} />}
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:16}}>
        <MetricCard label="총 수익률"    value={fmtPct(s.total_return_pct)}      color={s.total_return_pct >= 0 ? "#10B981" : "#EF4444"}/>
        <MetricCard label="연환산 수익률" value={fmtPct(s.annualized_return_pct)} color={s.annualized_return_pct >= 0 ? "#10B981" : "#EF4444"}/>
        <MetricCard label="샤프 지수"    value={fmtNum(s.sharpe)}                color="#60a5fa"/>
        <MetricCard label="MDD"          value={fmtPct(s.max_drawdown_pct)}      color="#F59E0B"/>
        <MetricCard label="승률"         value={fmtPct(s.win_rate_pct)}          color="#60a5fa"/>
        <MetricCard label="총 거래 횟수" value={`${s.trades ?? "N/A"}회`}        color="#9CA3AF"/>
        {s.engine === "lean" && <>
          <MetricCard label="Sortino"       value={fmtNum(s.sortino)}       color="#34d399"/>
          <MetricCard label="Profit Factor" value={fmtNum(s.profit_factor)} color="#a78bfa"/>
          <MetricCard label="총 수수료"     value={s.total_fees != null ? `$${Math.round(s.total_fees).toLocaleString()}` : "N/A"} color="#9CA3AF"/>
        </>}
      </div>
    </div>
  );
}

// ── 에디터 설정 읽기 (localStorage ah.editor.*) ──────────────────────────────
function readEditorOpts(tabSizeDefault = 4) {
  const ls = (key, def) => { try { const v = localStorage.getItem(key); return v === null ? def : v; } catch { return def; } };
  const bool = (key, def) => ls(key, String(def)) === "true";
  const num  = (key, def) => { const n = Number(ls(key, def)); return Number.isFinite(n) && n > 0 ? n : def; };
  return {
    fontSize:   num("ah.editor.fontSize", 13),
    fontFamily: ls("ah.editor.fontFamily", "'Fira Code','Cascadia Code','Consolas',monospace"),
    tabSize:    num("ah.editor.tabSize", tabSizeDefault),
    insertSpaces: bool("ah.editor.insertSpaces", true),
    wordWrap:   bool("ah.editor.wordWrap", false) ? "on" : "off",
    minimap:    { enabled: bool("ah.editor.minimap", true), scale: 1 },
    lineNumbers: bool("ah.editor.lineNumbers", true) ? "on" : "off",
    fontLigatures: true,
    scrollBeyondLastLine: false,
    renderLineHighlight: "gutter",
    bracketPairColorization: { enabled: true },
    smoothScrolling: true,
    cursorBlinking: "phase",
    formatOnPaste: true,
    suggestOnTriggerCharacters: true,
    quickSuggestions: { other: true, comments: false, strings: false },
  };
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
// ── ClaudeDiffView (Claude 에이전트 변경 before/after · Monaco diff) ──────────────
function ClaudeDiffView({ changes, onMeasure, measuring }) {
  if (!changes || changes.length === 0) {
    return (
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,color:"#4B5563"}}>
        <Bot size={30} color="#a78bfa"/>
        <div style={{fontSize:13,fontWeight:600}}>Claude 변경 내역 없음</div>
      </div>
    );
  }
  return (
    <div style={{flex:1,overflow:"auto",background:"#0f1117"}}>
      {/* P4: 이 패치의 전후 효과를 같은 비교 포맷으로 측정 */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",
        borderBottom:"1px solid rgba(255,255,255,0.08)",background:"#12161f",position:"sticky",top:0,zIndex:2}}>
        <span style={{fontSize:11.5,color:"#94a3b8",flex:1}}>Claude 패치의 실제 성과 영향을 백테스트로 확인하세요.</span>
        <button onClick={()=>onMeasure&&onMeasure(changes)} disabled={measuring}
          style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:7,border:"none",
            background:measuring?"rgba(245,158,11,0.2)":"linear-gradient(135deg,#F59E0B,#D97706)",
            color:"#fff",fontSize:11.5,fontWeight:800,cursor:measuring?"wait":"pointer"}}>
          {measuring ? <Loader size={12} style={{animation:"spin 1s linear infinite"}}/> : <BarChart3 size={12}/>}
          변경 효과 측정 (전후 백테스트)
        </button>
      </div>
      {changes.map((c, i) => (
        <div key={c.path || i} style={{borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",background:"#161b22"}}>
            <FileCode size={13} color="#a78bfa"/>
            <span style={{fontSize:12,fontWeight:700,color:"#e5e7eb"}}>{c.filename || c.path}</span>
            <span style={{fontSize:9,padding:"2px 7px",borderRadius:999,background:"rgba(167,139,250,0.15)",color:"#a78bfa",fontWeight:700}}>Claude 편집</span>
          </div>
          <DiffEditor
            height={Math.min(440, Math.max(160, ((c.after || "").split("\n").length + 2) * 19))}
            language={detectLang(c.filename || c.path || "main.py")}
            original={c.before || ""}
            modified={c.after || ""}
            theme="vs-dark"
            options={{ readOnly:true, renderSideBySide:true, minimap:{enabled:false}, fontSize:13.5, scrollBeyondLastLine:false, automaticLayout:true }}
          />
        </div>
      ))}
    </div>
  );
}

export default function DeveloperLab() {
  useTheme();
  const [searchParams] = useSearchParams();

  // 에디터 설정 — 설정 모달 변경 시 즉시 반영
  const [editorOpts, setEditorOpts] = useState(() => readEditorOpts());
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.key?.startsWith("ah.editor.")) setEditorOpts(readEditorOpts());
    };
    window.addEventListener("ah:settingsChanged", handler);
    return () => window.removeEventListener("ah:settingsChanged", handler);
  }, []);
  const sidePanelScrollRef = useRef(null);
  const logScrollRef = useRef(null);

  // ── 워크스페이스 ──
  const [wsId, setWsId] = useState(null);
  const [wsLoading, setWsLoading] = useState(true);
  const [btResult, setBtResult] = useState(null);
  // 백테스트 엔진 선택: vectorbt(빠름·Docker불필요) | lean(정밀·QuantConnect Docker)
  const [engine, setEngine] = useState("vectorbt");
  const [engineMenuOpen, setEngineMenuOpen] = useState(false);
  const [leanStrategies, setLeanStrategies] = useState([]);
  const [leanStrategyId, setLeanStrategyId] = useState("sma_crossover");
  const engineMenuRef = useRef(null);
  const leanJobRef = useRef(null);   // 현재 폴링 중인 Lean job_id (새 실행 시 이전 폴링 취소)
  const [leanHealth, setLeanHealth] = useState(null);  // Lean 실행환경 준비 상태(Docker/CLI/이미지)
  // Claude Code 에이전트 입력
  const [claudeOpen, setClaudeOpen] = useState(false);
  const [claudeReq, setClaudeReq] = useState("");
  const [claudeBusy, setClaudeBusy] = useState(false);
  const claudeJobRef = useRef(null);          // 현재 폴링 중인 Claude job (새 실행 시 취소)
  const [claudeDiff, setClaudeDiff] = useState(null);  // { changes:[{path,filename,before,after}] }
  const [claudeDockW, setClaudeDockW] = useState(380); // 우측 Claude 도크 너비
  const [claudeMessages, setClaudeMessages] = useState([]); // 도크 내 대화(VSCode Claude Code 식): {role,content,...}
  const claudeScrollRef = useRef(null);
  useEffect(() => { if (claudeScrollRef.current) claudeScrollRef.current.scrollTop = claudeScrollRef.current.scrollHeight; }, [claudeMessages, claudeBusy]);
  // P3: 전략 개선 제안서
  const [improveOpen, setImproveOpen] = useState(false);
  const [improveBusy, setImproveBusy] = useState(false);
  const [improveData, setImproveData] = useState(null);
  const [improveErr, setImproveErr] = useState(null);
  const [improveApplied, setImproveApplied] = useState(null);
  // P4: Claude 패치 전후 효과 측정
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareData, setCompareData] = useState(null);
  const [compareErr, setCompareErr] = useState(null);
  const [queueMsg, setQueueMsg] = useState(null);
  const [wsList, setWsList] = useState([]);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const wsDropdownRef = useRef(null);

  // ── 워크스페이스 코드 (기존) ──
  const [fileContents, setFileContents] = useState({ main: PLACEHOLDER_CODE });
  const [strategyName, setStrategyName] = useState("AlphaHelix Developer");

  // ── GitHub 레포 파일 트리 (신규) ──
  const [repoFiles, setRepoFiles]       = useState([]);   // [{path, sha, size}]
  const [fileCache, setFileCache]       = useState({});   // {path: 원본 content}
  const [repoContents, setRepoContents] = useState({});   // {path: 현재 에디터 content}
  const [fetchingFile, setFetchingFile] = useState(null); // 현재 fetch 중인 path
  const [localFolders, setLocalFolders]   = useState(new Set());
  const [deletedFiles, setDeletedFiles]   = useState(new Set());
  const [selectedPath, setSelectedPath]   = useState(null);
  const [newFileTrigger, setNewFileTrigger] = useState(null);

  // modified = 변경됐거나 새로 생성된 파일 (fileCache에 없으면 신규)
  const modifiedFiles = useMemo(() => {
    const out = {};
    for (const [path, content] of Object.entries(repoContents)) {
      const isNew = fileCache[path] === undefined;
      const isChanged = !isNew && content !== fileCache[path];
      if (isNew || isChanged) out[path] = content;
    }
    return out;
  }, [repoContents, fileCache]);

  const modifiedSet = useMemo(() => new Set(Object.keys(modifiedFiles)), [modifiedFiles]);

  const repoTree = useMemo(
    () => repoFiles.length > 0 ? buildTree(repoFiles) : null,
    [repoFiles]
  );

  // ── IDE 탭 ──
  const [openTabs, setOpenTabs] = useState([
    { id:"tab_main", name:"main.py", type:"code", fileKey:"main" },
  ]);
  const [activeTabId, setActiveTabId] = useState("tab_main");

  // ── 사이드 패널 ──
  const [sidePanel, setSidePanel] = useState(() => {
    const p = new URLSearchParams(window.location.search).get("panel");
    if (p === "data") return "data";
    if (p === "report" || p === "console" || p === "code") return null;
    return "explorer";
  });

  useEffect(() => {
    const p = searchParams.get("panel");
    if (p === "data") { setSidePanel("data"); }
    else if (p === "explorer" || !p) { setSidePanel("explorer"); }
    else if (p === "code") { setSidePanel(null); }
    else if (p === "report") {
      setSidePanel(null);
      setOpenTabs(prev => {
        if (prev.find(t => t.type === "report")) return prev;
        const reportId = `tab_report_sidebar`;
        const next = [...prev, { id: reportId, name: "📊 백테스트 결과", type: "report" }];
        setActiveTabId(reportId);
        return next;
      });
    } else if (p === "console") {
      setSidePanel(null);
      setTimeout(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (sidePanelScrollRef.current) sidePanelScrollRef.current.scrollTop = 0;
    if (logScrollRef.current) logScrollRef.current.scrollTop = 0;
  }, [sidePanel]);

  const [folderOpen, setFolderOpen] = useState(true);

  // 데이터셋: 실제 수집 현황(/api/analytics/data-status)으로 동적 구성 (실패 시 하드코딩 폴백)
  const [datasets, setDatasets] = useState(DATASETS);
  useEffect(() => {
    let alive = true;
    getDataStatus()
      .then(st => { if (alive) setDatasets(buildDatasetsFromStatus(st, DATASETS)); })
      .catch(() => { /* 폴백 유지 */ });
    return () => { alive = false; };
  }, []);
  const [dataGroupOpen, setDataGroupOpen] = useState(true);
  const [myDataOpen, setMyDataOpen] = useState(true);

  // ── 사이드 패널 너비 ──
  const [sidePanelW, setSidePanelW] = useState(() => {
    const v = Number(localStorage.getItem("ah.workbench.sidePanelWidth"));
    return Number.isFinite(v) && v >= 160 && v <= 400 ? v : 220;
  });
  const sideDragRef = useRef(null);
  const handleSideResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX, startW = sidePanelW;
    const onMove = (ev) => setSidePanelW(Math.min(420, Math.max(140, startW + ev.clientX - startX)));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidePanelW]);

  // ── 하단 콘솔 ──
  const [bottomH, setBottomH] = useState(180);
  const [runStatus, setRunStatus] = useState("idle");
  const [logLines, setLogLines] = useState([]);
  const [consoleTab, setConsoleTab] = useState("log"); // "log" | "terminal"
  const logEndRef = useRef(null);
  const timerRefs = useRef([]);

  useEffect(() => { if (logLines.length > 0) logEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [logLines]);

  // ── 파일 트리 로드 ──
  const loadFileTree = useCallback(async (id) => {
    if (!id) return;
    try {
      const tree = await getWorkspaceFileTree(id);
      setRepoFiles(Array.isArray(tree) ? tree : []);
    } catch { setRepoFiles([]); }
  }, []);

  // wsId 변경 시 레포 연결 여부 확인 후 파일 트리 로드
  useEffect(() => {
    if (!wsId) { setRepoFiles([]); setFileCache({}); setRepoContents({}); return; }
    getWorkspaceGitStatus(wsId)
      .then(ws => { if (ws.connected) return getWorkspaceFileTree(wsId); return []; })
      .then(tree => setRepoFiles(Array.isArray(tree) ? tree : []))
      .catch(() => setRepoFiles([]));
  }, [wsId]);

  // ── 레포 파일 열기 ──
  const openRepoFile = useCallback(async (filePath) => {
    const tabId = `tab_repo_${filePath}`;
    if (openTabs.find(t => t.id === tabId)) { setActiveTabId(tabId); return; }
    const fileName = filePath.split("/").pop();
    const lang = detectLang(fileName);

    // 캐시에 있으면 바로 탭 열기
    if (fileCache[filePath] !== undefined) {
      if (repoContents[filePath] === undefined) {
        setRepoContents(prev => ({ ...prev, [filePath]: fileCache[filePath] }));
      }
      setOpenTabs(prev => [...prev, { id:tabId, name:fileName, type:"repoFile", filePath, lang }]);
      setActiveTabId(tabId);
      return;
    }

    setFetchingFile(filePath);
    try {
      const data = await pullWorkspaceFile(wsId, filePath);
      setFileCache(prev => ({ ...prev, [filePath]: data.content }));
      setRepoContents(prev => ({ ...prev, [filePath]: data.content }));
      setOpenTabs(prev => [...prev, { id:tabId, name:fileName, type:"repoFile", filePath, lang }]);
      setActiveTabId(tabId);
    } catch {
      setLogLines(prev => [...prev, {
        type:"error", msg:`파일 로드 실패: ${filePath}`, ts:new Date().toLocaleTimeString(),
      }]);
    } finally {
      setFetchingFile(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, openTabs, fileCache, repoContents]);

  // push 성공 후 fileCache 갱신 (더 이상 modified 아님)
  const onGitPushComplete = useCallback((pushedPaths) => {
    setFileCache(prev => {
      const updated = { ...prev };
      for (const path of pushedPaths) {
        if (repoContents[path] !== undefined) updated[path] = repoContents[path];
      }
      return updated;
    });
  }, [repoContents]);

  // pull 시 현재 열려있는 repo 파일들 갱신
  const onGitPullAll = useCallback(async () => {
    if (!wsId) return;
    await loadFileTree(wsId);
    // 이미 열린 repo 파일 내용 갱신
    const repoPaths = openTabs.filter(t => t.type === "repoFile").map(t => t.filePath);
    for (const path of repoPaths) {
      try {
        const data = await pullWorkspaceFile(wsId, path);
        setFileCache(prev => ({ ...prev, [path]: data.content }));
        setRepoContents(prev => ({ ...prev, [path]: data.content }));
      } catch { /* ignore */ }
    }
    // pull 후 파일 트리가 보이도록 탐색기로 전환
    setSidePanel("explorer");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, openTabs]);

  // ── 레포 파일/폴더 생성 ──
  const handleRepoCreate = useCallback((fullPath, type) => {
    if (type === 'folder') {
      setLocalFolders(prev => new Set([...prev, fullPath]));
    } else {
      setRepoContents(prev => ({ ...prev, [fullPath]: '' }));
      setRepoFiles(prev => prev.find(f => f.path === fullPath) ? prev : [...prev, { path: fullPath, sha: '', size: 0 }]);
      const tabId = `tab_repo_${fullPath}`;
      const fileName = fullPath.split('/').pop();
      const lang = detectLang(fileName);
      setOpenTabs(prev => prev.find(t => t.id === tabId) ? prev : [
        ...prev, { id: tabId, name: fileName, type: 'repoFile', filePath: fullPath, lang }
      ]);
      setActiveTabId(tabId);
    }
  }, []);

  // ── 레포 파일/폴더 삭제 ──
  const handleRepoDelete = useCallback((path, type) => {
    const pathsToDelete = type === 'folder'
      ? repoFiles.filter(f => f.path.startsWith(path + '/')).map(f => f.path)
      : [path];
    for (const p of pathsToDelete) {
      const existing = repoFiles.find(f => f.path === p);
      if (existing && existing.sha) {
        setDeletedFiles(prev => new Set([...prev, p]));
      }
      setRepoFiles(prev => prev.filter(f => f.path !== p));
      setRepoContents(prev => { const n = {...prev}; delete n[p]; return n; });
      setFileCache(prev => { const n = {...prev}; delete n[p]; return n; });
      const tabId = `tab_repo_${p}`;
      setOpenTabs(prev => {
        const next = prev.filter(t => t.id !== tabId);
        if (activeTabId === tabId && next.length > 0) setActiveTabId(next[next.length - 1].id);
        return next;
      });
    }
    if (type === 'folder') setLocalFolders(prev => { const n = new Set(prev); n.delete(path); return n; });
  }, [repoFiles, activeTabId]);

  // ── 레포 파일/폴더 이름 변경 ──
  const handleRepoRename = useCallback((oldPath, newPath) => {
    setRepoFiles(prev => prev.map(f => f.path === oldPath ? { ...f, path: newPath } : f));
    setRepoContents(prev => {
      const n = { ...prev };
      if (n[oldPath] !== undefined) { n[newPath] = n[oldPath]; delete n[oldPath]; }
      return n;
    });
    if (fileCache[oldPath] !== undefined) {
      setDeletedFiles(prev => new Set([...prev, oldPath]));
      setFileCache(prev => { const n = { ...prev }; delete n[oldPath]; return n; });
    }
    const oldTabId = `tab_repo_${oldPath}`;
    const newTabId = `tab_repo_${newPath}`;
    const newName = newPath.split('/').pop();
    const lang = detectLang(newName);
    setOpenTabs(prev => prev.map(t => t.id === oldTabId
      ? { ...t, id: newTabId, name: newName, filePath: newPath, lang }
      : t
    ));
    if (activeTabId === oldTabId) setActiveTabId(newTabId);
  }, [fileCache, activeTabId]);

  // ── 워크스페이스 로드 ──
  const loadWorkspace = useCallback((id) => {
    setWsLoading(true);
    setWsId(id);
    localStorage.setItem("alpha.lastWsId", id);
    getWorkspace(id)
      .then(data => {
        setStrategyName(data.name || "AlphaHelix Strategy");
        setBtResult(null);
        if (data.codeJson) {
          try { setFileContents(JSON.parse(data.codeJson)); } catch { /* ignore */ }
        } else if (data.strategyConfig) {
          const cfg = typeof data.strategyConfig === "string"
            ? JSON.parse(data.strategyConfig) : data.strategyConfig;
          const code = generateCodeFromConfig(cfg);
          setFileContents({ main: code });
          // P1.2: config 에서 파생한 코드를 서버에 영속화 — 모든 전략이 codeJson 을 갖게 해
          //       Heli/재방문/비Studio 회원도 동일한 전략 코드를 보게 한다(파생→1회 저장, 이후 codeJson 경로).
          if (code) { saveCode(id, JSON.stringify({ main: code })).catch(() => {}); }
        }
      })
      .catch(() => {})
      .finally(() => setWsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = localStorage.getItem("alpha.lastWsId");
    if (id) loadWorkspace(id);
    else setWsLoading(false);
    listWorkspaces().then(r => setWsList(Array.isArray(r) ? r : (r?.content || []))).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onReload = (e) => {
      const patchedId = e?.detail?.wsId ? Number(e.detail.wsId) : null;
      if (!patchedId || patchedId === Number(wsId)) {
        const targetId = patchedId || wsId;
        if (targetId) loadWorkspace(targetId);
      }
    };
    window.addEventListener("alphaWorkspaceReload", onReload);
    return () => window.removeEventListener("alphaWorkspaceReload", onReload);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  // Lean 엔진 선택 시 preset 전략 목록 1회 로드 (lazy)
  useEffect(() => {
    if (engine !== "lean" || leanStrategies.length > 0) return;
    leanListStrategies()
      .then(r => {
        const list = Array.isArray(r?.strategies) ? r.strategies : [];
        setLeanStrategies(list);
        if (list.length && !list.some(s => s.id === leanStrategyId)) setLeanStrategyId(list[0].id);
      })
      .catch(() => { /* 503/오프라인 — 기본 전략값 유지 */ });
  }, [engine, leanStrategies.length, leanStrategyId]);

  // 엔진 셀렉터 바깥 클릭 시 닫기
  useEffect(() => {
    if (!engineMenuOpen) return;
    const onDown = (e) => { if (engineMenuRef.current && !engineMenuRef.current.contains(e.target)) setEngineMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [engineMenuOpen]);

  // Lean 셀렉터가 열릴 때 실행환경 준비 상태(Docker/lean CLI/이미지) 조회
  useEffect(() => {
    if (!engineMenuOpen || engine !== "lean") return;
    getLeanHealth().then(setLeanHealth).catch(() => setLeanHealth({ analytics: false, ready: false }));
  }, [engineMenuOpen, engine]);

  // Heli(RightChatDock)가 현재 에디터 코드를 알 수 있도록 라이브 스냅샷 공유.
  // → dev studio 에서 "이 코드 고쳐줘" 했을 때 Heli 가 현재 코드를 베이스로 code 패치를 만든다.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__alphaLiveCode = { wsId: wsId ? Number(wsId) : null, files: fileContents };
    }
  }, [wsId, fileContents]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!wsDropdownOpen) return;
    const handler = (e) => { if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target)) setWsDropdownOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [wsDropdownOpen]);

  // ── 탭 관리 ──
  const openFile = useCallback((fileKey) => {
    const tabId = `tab_${fileKey}`;
    setOpenTabs(prev => prev.find(t=>t.id===tabId) ? prev : [...prev, {id:tabId, name:FILE_META[fileKey].name, type:"code", fileKey}]);
    setActiveTabId(tabId);
  }, []);

  const openDataset = useCallback((ds) => {
    const tabId = `tab_data_${ds.id}`;
    setOpenTabs(prev => prev.find(t=>t.id===tabId) ? prev : [...prev, {id:tabId, name:ds.name, type:"data", datasetId:ds.id}]);
    setActiveTabId(tabId);
  }, []);

  const closeTab = useCallback((tabId, e) => {
    e?.stopPropagation();
    setOpenTabs(prev => {
      const next = prev.filter(t=>t.id!==tabId);
      if (activeTabId===tabId && next.length>0) setActiveTabId(next[next.length-1].id);
      return next;
    });
  }, [activeTabId]);

  // ── 코드 저장 ──
  const handleSave = useCallback(async () => {
    if (!wsId) { alert("워크스페이스가 없습니다. Alpha-Helix 탭에서 먼저 전략을 설정하세요."); return; }
    try {
      await saveCode(wsId, JSON.stringify(fileContents));
      setLogLines(prev => [...prev, {type:"success", msg:"코드가 저장되었습니다.", ts:new Date().toLocaleTimeString()}]);
    } catch {
      setLogLines(prev => [...prev, {type:"error", msg:"저장 실패", ts:new Date().toLocaleTimeString()}]);
    }
  }, [wsId, fileContents]);

  // ── 백테스트 실행 ──
  const handleRunBacktest = useCallback(async () => {
    if (runStatus === "running") return;
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];
    setRunStatus("running");
    setLogLines([{ type:"info", msg:"백테스트 준비 중...", ts: new Date().toLocaleTimeString() }]);

    if (!wsId) {
      setRunStatus("idle");
      setLogLines([{ type:"error", msg:"워크스페이스가 없습니다.", ts: new Date().toLocaleTimeString() }]);
      return;
    }

    const activeContent = openTabs.find(t=>t.id===activeTabId);
    const currentCode = (activeContent?.fileKey && fileContents[activeContent.fileKey])
      || fileContents.main || "";
    const customParams = parseParamsFromCode(currentCode);
    const ticker = customParams.ticker || "SPY";

    const t0 = Date.now();
    setLogLines([
      { type:"info", msg:`[vectorbt] 백테스트 시작  ticker=${ticker}  period=5y`, ts: new Date().toLocaleTimeString() },
      { type:"info", msg:`[param] ${JSON.stringify(customParams)}`, ts: new Date().toLocaleTimeString() },
      { type:"info", msg:`[data] OHLCV 로드 중… (Polygon→yfinance 폴백)`, ts: new Date().toLocaleTimeString() },
    ]);

    try {
      const result = await runBacktest(wsId, "5y", customParams);
      setBtResult(result);
      setRunStatus("done");
      const stats = result.stats || {};
      const ec = result.equity_curve || [];
      const ts = new Date().toLocaleTimeString();
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const f1 = (v) => (v == null ? "N/A" : v.toFixed(1));
      const f2 = (v) => (v == null ? "N/A" : v.toFixed(2));
      setLogLines(prev => [...prev,
        { type:"info",    msg:`[data] OHLCV ${ec.length || "?"} bars 로드 완료 (${stats.start || "?"} ~ ${stats.end || "?"})`, ts },
        { type:"info",    msg:`[cost] 수수료 0.25% + 슬리피지 0.1% 반영 · 신호 fshift(1) anti-look-ahead`, ts },
        { type:"info",    msg:`[engine] vectorbt Portfolio.from_signals 시뮬레이션 완료`, ts },
        { type:"success", msg:`[done] 백테스트 완료 (${elapsed}s)`, ts },
        { type:"trade",   msg:`총수익 ${f1(stats.total_return_pct)}%  ·  연환산 ${f1(stats.annualized_return_pct)}%  ·  Sharpe ${f2(stats.sharpe)}`, ts },
        { type:"trade",   msg:`거래 ${stats.trades ?? "?"}회  ·  승률 ${f1(stats.win_rate_pct)}%  ·  MDD ${f1(stats.max_drawdown_pct)}%`, ts },
        { type:"info",    msg:`▶ '📊 백테스트 결과' 탭에서 수익률 커브 + 메트릭 확인`, ts },
      ]);
      const reportId = `tab_report_${Date.now()}`;
      setOpenTabs(prev => {
        const filtered = prev.filter(t => t.type !== "report");
        return [...filtered, { id: reportId, name: "📊 백테스트 결과", type: "report" }];
      });
      setActiveTabId(reportId);
    } catch (e) {
      setRunStatus("idle");
      const msg = e?.response?.data?.error || e?.message || "알 수 없는 오류";
      setLogLines([{ type:"error", msg:`백테스트 실패: ${msg}`, ts: new Date().toLocaleTimeString() }]);
    }
  }, [runStatus, wsId, fileContents, activeTabId, openTabs]);

  // ── Lean (QuantConnect) 백테스트 실행 — 비동기 잡 시작 + 진행 폴링 ──
  const handleRunLean = useCallback(async () => {
    if (runStatus === "running") return;
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];
    setRunStatus("running");
    if (!wsId) {
      setRunStatus("idle");
      setLogLines([{ type:"error", msg:"워크스페이스가 없습니다.", ts: new Date().toLocaleTimeString() }]);
      return;
    }

    const activeContent = openTabs.find(t=>t.id===activeTabId);
    const currentCode = (activeContent?.fileKey && fileContents[activeContent.fileKey]) || fileContents.main || "";
    const customParams = parseParamsFromCode(currentCode);
    const ticker = customParams.ticker || "SPY";
    // Lean 은 명시적 YYYY-MM-DD 필요 → 최근 2년 범위
    const endD = new Date();
    const startD = new Date(); startD.setFullYear(startD.getFullYear() - 2);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const startDate = fmt(startD), endDate = fmt(endD);
    const sName = leanStrategies.find(s=>s.id===leanStrategyId)?.name || leanStrategyId;
    const nowTs = () => new Date().toLocaleTimeString();

    setLogLines([
      { type:"info", msg:`[Lean·QuantConnect] 백테스트 시작  strategy=${leanStrategyId} (${sName})`, ts: nowTs() },
      { type:"info", msg:`[Lean] symbols=[${ticker}]  market=us  range ${startDate} ~ ${endDate}`, ts: nowTs() },
    ]);

    // 1) 잡 시작
    let jobId;
    try {
      const startResp = await leanBacktestStart({
        strategyId: leanStrategyId, symbols: [ticker], startDate, endDate,
        market: "us", paramOverrides: customParams,
      });
      jobId = startResp.job_id;
      leanJobRef.current = jobId;
    } catch (e) {
      setRunStatus("idle");
      const ts = nowTs();
      if (e?.response?.status === 503) {
        const d = e.response.data || {};
        setLogLines([
          { type:"error", msg:`[Lean] 비활성: ${d.error || "Lean 엔진이 꺼져 있습니다."}`, ts },
          { type:"warn",  msg:`[hint] ${d.hint || "application-{profile}.properties 에 app.lean.enabled=true + analytics 사이드카에 Docker/quantconnect-lean 이미지 필요"}`, ts },
          { type:"info",  msg:`[tip] vectorbt 엔진은 Docker 없이 즉시 실행됩니다 — 엔진 셀렉터에서 전환하세요.`, ts },
        ]);
      } else {
        const msg = e?.response?.data?.error || e?.message || "알 수 없는 오류";
        setLogLines(prev => [...prev, { type:"error", msg:`Lean 시작 실패: ${msg}`, ts }]);
      }
      return;
    }
    setLogLines(prev => [...prev, { type:"info", msg:`[Lean] 잡 시작됨 job=${jobId} · 진행 폴링 중…`, ts: nowTs() }]);

    // 2) 진행 폴링 (1.5s 간격, since 커서로 증분 로그)
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let cursor = 0;
    const MAX_POLLS = 420; // ~10.5분 안전 상한
    for (let i = 0; i < MAX_POLLS; i++) {
      if (leanJobRef.current !== jobId) return; // 새 실행이 시작돼 이 폴링은 취소
      await sleep(1500);
      let st;
      try {
        st = await leanBacktestStatus(jobId, cursor);
      } catch { continue; } // 일시적 폴링 오류는 다음 주기에 재시도
      if (leanJobRef.current !== jobId) return;

      const newLogs = Array.isArray(st.logs) ? st.logs : [];
      if (newLogs.length > 0) {
        const ts = nowTs();
        setLogLines(prev => [...prev, ...newLogs.map(l => ({
          type: l.type === "phase" ? "info" : (l.type || "info"),
          msg:  l.type === "phase" ? `▸ ${l.msg}` : l.msg,
          ts,
        }))]);
      }
      if (typeof st.next === "number") cursor = st.next;

      if (st.status === "done" && st.result) {
        leanJobRef.current = null;
        const resp = st.result;
        // Lean 통계는 정규화(0~1) → 리포트 패널 퍼센트 스케일로 변환
        const ls = resp.statistics || {};
        const pct = (v) => (v == null ? null : v * 100);
        const stats = {
          total_return_pct:      pct(ls.total_return_pct),
          annualized_return_pct: pct(ls.cagr),
          sharpe:                ls.sharpe_ratio,
          sortino:               ls.sortino_ratio,
          profit_factor:         ls.profit_factor,
          total_fees:            ls.total_commission,
          max_drawdown_pct:      pct(ls.max_drawdown_pct),
          win_rate_pct:          pct(ls.win_rate),
          trades:                ls.num_trades,
          start: startDate, end: endDate, engine: "lean", run_id: resp.run_id,
        };
        const equity = (resp.equity_curve || []).map(v => (typeof v === "number" ? { value: v } : v));
        setBtResult({ stats, equity_curve: equity });
        setRunStatus("done");
        const ts = nowTs();
        const elapsed = resp.elapsed_seconds != null ? Number(resp.elapsed_seconds).toFixed(1) : "?";
        const f1 = (v) => (v == null ? "N/A" : v.toFixed(1));
        const f2 = (v) => (v == null ? "N/A" : v.toFixed(2));
        setLogLines(prev => [...prev,
          { type:"success", msg:`[done] Lean 백테스트 완료 run_id=${resp.run_id} (${elapsed}s)`, ts },
          { type:"trade",   msg:`총수익 ${f1(stats.total_return_pct)}%  ·  CAGR ${f1(stats.annualized_return_pct)}%  ·  Sharpe ${f2(stats.sharpe)}`, ts },
          { type:"trade",   msg:`거래 ${stats.trades ?? "?"}회  ·  승률 ${f1(stats.win_rate_pct)}%  ·  MDD ${f1(stats.max_drawdown_pct)}%`, ts },
          { type:"info",    msg:`▶ '📊 백테스트 결과' 탭에서 메트릭 확인`, ts },
        ]);
        const reportId = `tab_report_${Date.now()}`;
        setOpenTabs(prev => { const filtered = prev.filter(t => t.type !== "report"); return [...filtered, { id: reportId, name: "📊 백테스트 결과", type: "report" }]; });
        setActiveTabId(reportId);
        return;
      }
      if (st.status === "error") {
        leanJobRef.current = null;
        setRunStatus("idle");
        setLogLines(prev => [...prev, { type:"error", msg:`Lean 실패: ${st.error || "알 수 없는 오류"}`, ts: nowTs() }]);
        return;
      }
    }
    // 폴링 상한 초과 (백그라운드 잡은 계속될 수 있음)
    if (leanJobRef.current === jobId) {
      leanJobRef.current = null;
      setRunStatus("idle");
      setLogLines(prev => [...prev, { type:"warn", msg:`[Lean] 폴링 시간 초과 — 백그라운드 실행은 계속될 수 있음 (job=${jobId})`, ts: nowTs() }]);
    }
  }, [runStatus, wsId, fileContents, activeTabId, openTabs, leanStrategyId, leanStrategies]);

  // ── P3: 전략 개선 제안서 (진단 + 선택지 + 전후 백테스트 비교) ──
  const handleImproveProposal = useCallback(async () => {
    if (improveBusy) return;
    setImproveOpen(true); setImproveErr(null); setImproveData(null); setImproveApplied(null);
    if (!wsId) { setImproveErr("워크스페이스가 없습니다."); return; }
    const activeContent = openTabs.find(t=>t.id===activeTabId);
    const currentCode = (activeContent?.fileKey && fileContents[activeContent.fileKey]) || fileContents.main || "";
    const customParams = parseParamsFromCode(currentCode);
    setImproveBusy(true);
    try {
      const data = await runImproveProposal(wsId, customParams, "5y");
      setImproveData(data);
    } catch (e) {
      setImproveErr(e?.response?.data?.error || e?.message || "개선 제안 생성 실패");
    } finally { setImproveBusy(false); }
  }, [improveBusy, wsId, openTabs, activeTabId, fileContents]);

  const handleApplyOption = useCallback((option) => {
    if (!option || !option.params) return;
    const fileKey = (openTabs.find(t=>t.id===activeTabId)?.fileKey) || "main";
    const baseCode = fileContents[fileKey] || fileContents.main || "";
    const newCode = applyParamsToCode(baseCode, option.params);
    const nextContents = { ...fileContents, [fileKey]: newCode };
    setFileContents(nextContents);
    setImproveApplied(option.key);
    if (wsId) saveCode(wsId, JSON.stringify(nextContents)).catch(()=>{});
    setImproveOpen(false);
    // 적용된 파라미터로 바로 백테스트해 결과 확인
    setTimeout(() => { handleRunBacktest(); }, 120);
  }, [openTabs, activeTabId, fileContents, wsId, handleRunBacktest]);

  // ── P4: Claude 패치 전후 효과 측정 (같은 비교 포맷) ──
  const handleMeasureClaudeChange = useCallback(async (changes) => {
    if (!changes || changes.length === 0) return;
    // 코드 파일 변경 우선(main 우선), 없으면 첫 변경
    const target = changes.find(c => /\.py$/.test(c.filename || c.path || "") || (c.path === "main"))
      || changes.find(c => (c.path || "").includes("main")) || changes[0];
    const before = parseParamsFromCode(target.before || "");
    const after = parseParamsFromCode(target.after || "");
    setCompareOpen(true); setCompareErr(null); setCompareData(null); setCompareBusy(true);
    if (!wsId) { setCompareErr("워크스페이스가 없습니다."); setCompareBusy(false); return; }
    try {
      const data = await runCompareBacktest(wsId, before, after, "5y");
      setCompareData(data);
    } catch (e) {
      setCompareErr(e?.response?.data?.error || e?.message || "효과 측정 실패");
    } finally { setCompareBusy(false); }
  }, [wsId]);

  // ── Claude Code 에이전트 (헤드리스 claude CLI · 단계별 스트리밍 + diff) ──
  const handleClaudeAgent = useCallback(async () => {
    if (claudeBusy) return;
    const req = claudeReq.trim();
    if (!wsId) { setClaudeMessages(prev => [...prev, { role:"error", content:"워크스페이스가 없습니다." }]); return; }
    if (!req) return;
    setClaudeBusy(true);
    setClaudeReq("");
    // 대화는 도크 안에 누적 (VSCode Claude Code 식). 콘솔로 보내지 않는다.
    setClaudeMessages(prev => [...prev, { role:"user", content:req }]);

    // 1) 잡 시작
    let jobId;
    try {
      const s = await runClaudeAgentStart(wsId, req);
      jobId = s.jobId;
      claudeJobRef.current = jobId;
    } catch (e) {
      setClaudeBusy(false);
      if (e?.response?.status === 503) {
        const d = e.response.data || {};
        setClaudeMessages(prev => [...prev, { role:"error", content:`Claude 에이전트 비활성: ${d.error || "꺼져 있음"} ${d.hint ? "("+d.hint+")" : ""}` }]);
      } else if (e?.response?.status === 402) {
        setClaudeMessages(prev => [...prev, { role:"error", content: e.response.data?.error || "Developer Studio(Claude)는 STANDARD 구독부터입니다." }]);
      } else {
        setClaudeMessages(prev => [...prev, { role:"error", content:`Claude 시작 실패: ${e?.response?.data?.error || e?.message}` }]);
      }
      return;
    }

    // 2) 단계별 진행 폴링 (1s 간격, since 커서) → 대화에 진행 단계 누적
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let cursor = 0;
    const MAX_POLLS = 220; // ~3.5분 안전 상한
    for (let i = 0; i < MAX_POLLS; i++) {
      if (claudeJobRef.current !== jobId) return;
      await sleep(1000);
      let st;
      try { st = await runClaudeAgentStatus(wsId, jobId, cursor); }
      catch { continue; }
      if (claudeJobRef.current !== jobId) return;

      const newLogs = Array.isArray(st.logs) ? st.logs : [];
      if (newLogs.length) {
        setClaudeMessages(prev => [...prev, ...newLogs.map(l => ({ role:"progress", type: l.type || "info", content: l.msg }))]);
      }
      if (typeof st.next === "number") cursor = st.next;

      if (st.status === "done" && st.result) {
        claudeJobRef.current = null;
        setClaudeBusy(false);
        const r = st.result;
        const narr = (r.narration || "").trim();
        let summary = "";
        if (r.hasChanges) {
          const files = (r.changedFiles || []).join(", ");
          summary = `✓ ${(r.changedFiles||[]).length}개 파일 편집 적용 (${files}) — '🔀 Claude diff' 탭 + 상단 'Heli 변경' 바에서 [유지]/[실행취소]`;
          const changes = Array.isArray(r.changes) ? r.changes : [];
          if (changes.length) {
            const diffId = `tab_diff_${Date.now()}`;
            setClaudeDiff({ changes });
            setOpenTabs(prev => { const filtered = prev.filter(t => t.type !== "diff"); return [...filtered, { id: diffId, name: `🔀 Claude diff (${changes.length})`, type: "diff" }]; });
            setActiveTabId(diffId);
          }
          window.dispatchEvent(new CustomEvent("alphaPatchApplied", { detail: { wsId: Number(wsId), changeSet: { id: r.changeSetId, title: r.changeSetTitle } } }));
          window.dispatchEvent(new CustomEvent("alphaWorkspaceReload", { detail: { wsId: Number(wsId) } }));
        }
        setClaudeMessages(prev => [...prev, {
          role:"assistant",
          content: narr || (r.hasChanges ? "" : "코드 변경 없이 답변했어요."),
          summary,
        }]);
        // 도크는 닫지 않는다 — 대화 계속.
        return;
      }
      if (st.status === "error") {
        claudeJobRef.current = null;
        setClaudeBusy(false);
        setClaudeMessages(prev => [...prev, { role:"error", content:`Claude 실패: ${st.error || "알 수 없는 오류"}` }]);
        return;
      }
    }
    if (claudeJobRef.current === jobId) {
      claudeJobRef.current = null;
      setClaudeBusy(false);
      setClaudeMessages(prev => [...prev, { role:"error", content:`Claude 폴링 시간 초과 (job=${jobId})` }]);
    }
  }, [claudeBusy, claudeReq, wsId]);

  // ── 주문 큐 ──
  const handleQueueOrders = useCallback(async () => {
    if (!wsId) { alert("워크스페이스가 없습니다."); return; }
    if (!btResult) { alert("먼저 백테스트를 실행하세요."); return; }
    try {
      const result = await queueOrders(wsId);
      const count = result?.count ?? result?.orders?.length ?? "?";
      setQueueMsg(`✓ ${count}건의 주문이 큐에 추가되었습니다`);
      setTimeout(() => setQueueMsg(null), 4000);
    } catch (e) {
      alert(`큐 추가 실패: ${e?.response?.data?.error || e?.message}`);
    }
  }, [wsId, btResult]);

  const handleDeploy = useCallback(() => {
    alert("배포 전 체크리스트:\n\n✓ 백테스트 완료 확인\n✓ Trust Score ≥ 70\n⚠ KIS 모의계좌 연동 필요\n\n[계좌·주문] 탭에서 KIS 계좌를 먼저 등록하세요.");
  }, []);

  const activeTab = openTabs.find(t=>t.id===activeTabId);
  // 우측 Claude 도크 너비 드래그 리사이즈 (왼쪽으로 끌면 넓어짐)
  const handleClaudeDockResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = claudeDockW;
    const onMove = (ev) => setClaudeDockW(Math.max(260, Math.min(680, startW + (startX - ev.clientX))));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
  }, [claudeDockW]);

  // 하단 콘솔/터미널 패널 높이 드래그 리사이즈 (위로 끌면 커짐)
  const handleBottomResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = bottomH;
    const onMove = (ev) => setBottomH(Math.max(90, Math.min(720, startH + (startY - ev.clientY))));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "ns-resize";
  }, [bottomH]);

  const logColor = {info:"#9CA3AF",trade:"#60a5fa",warn:"#F59E0B",success:"#10B981",error:"#EF4444"};

  return (
    <div style={{
      height:"calc(100vh - 52px)", display:"flex", flexDirection:"column",
      background:"#0f1117", fontFamily:"'Inter',-apple-system,sans-serif", overflow:"hidden",
    }}>

      {/* ═══ 헤더바 ═══════════════════════════════════════════════════════════ */}
      <div style={{
        display:"flex", alignItems:"center", gap:10, padding:"0 14px",
        height:44, flexShrink:0, background:"#161b22",
        borderBottom:"1px solid rgba(255,255,255,0.08)",
      }}>
        <Code2 size={14} color="#60a5fa" style={{flexShrink:0}}/>
        <div ref={wsDropdownRef} style={{position:"relative",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:13,fontWeight:700,color:"white",
              maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {strategyName}
          </span>
          {wsList.length > 1 && (
            <button onClick={() => setWsDropdownOpen(o => !o)} title="전략 전환"
              style={{display:"flex",alignItems:"center",padding:"2px 4px",borderRadius:4,
                background:"transparent",border:"1px solid rgba(255,255,255,0.12)",
                color:"#9CA3AF",cursor:"pointer",flexShrink:0}}>
              <ChevronDown size={12} color={wsDropdownOpen ? "#60a5fa" : "#9CA3AF"} />
            </button>
          )}
          {wsDropdownOpen && (
            <div style={{
              position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:200,
              background:"#1e2433",border:"1px solid rgba(255,255,255,0.12)",
              borderRadius:8,padding:4,minWidth:200,
              boxShadow:"0 8px 24px rgba(0,0,0,0.5)",
            }}>
              {wsList.map(ws => (
                <button key={ws.id}
                  onClick={() => { loadWorkspace(ws.id); setWsDropdownOpen(false); }}
                  style={{
                    display:"block",width:"100%",textAlign:"left",
                    padding:"7px 10px",borderRadius:5,border:"none",
                    background: ws.id === wsId ? "rgba(96,165,250,0.15)" : "transparent",
                    color: ws.id === wsId ? "#60a5fa" : "#D1D5DB",
                    fontSize:12,fontWeight: ws.id === wsId ? 700 : 400,cursor:"pointer",
                  }}
                  onMouseEnter={e => { if (ws.id !== wsId) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={e => { if (ws.id !== wsId) e.currentTarget.style.background = "transparent"; }}
                >
                  {ws.name || `전략 #${ws.id}`}
                </button>
              ))}
            </div>
          )}
        </div>
        <span style={{fontSize:9,padding:"1px 7px",borderRadius:999,
          background:"rgba(99,102,241,0.2)",color:"#a5b4fc",fontWeight:700,flexShrink:0}}>
          Expert Mode
        </span>
        {runStatus==="done"&&(
          <span style={{fontSize:9,fontWeight:700,padding:"1px 7px",borderRadius:999,
            background:"rgba(16,185,129,0.15)",color:"#10B981"}}>백테스트 완료</span>
        )}
        {runStatus==="running"&&(
          <span style={{fontSize:9,fontWeight:700,padding:"1px 7px",borderRadius:999,
            background:"rgba(245,158,11,0.15)",color:"#F59E0B",display:"flex",alignItems:"center",gap:3}}>
            <Loader size={9} style={{animation:"spin 1s linear infinite"}}/>실행 중</span>
        )}
        <div style={{flex:1}}/>
        {queueMsg && (
          <span style={{fontSize:10,padding:"2px 9px",borderRadius:999,
            background:"rgba(16,185,129,0.15)",color:"#10B981",fontWeight:600}}>{queueMsg}</span>
        )}
        <span style={{fontSize:9,color:"#2d3748",fontFamily:"monospace"}}>{activeTab?.name||""}</span>
        <button onClick={() => setClaudeOpen(o => !o)} title="Claude Code 에이전트로 코드 편집"
          style={{display:"flex",alignItems:"center",gap:4,padding:"4px 9px",borderRadius:5,
            background: claudeOpen ? "rgba(167,139,250,0.18)" : "transparent",
            border:"1px solid rgba(167,139,250,0.35)",color:"#a78bfa",fontSize:11,fontWeight:700,cursor:"pointer"}}>
          <Bot size={12}/> Claude
        </button>
        <button onClick={handleSave}
          style={{display:"flex",alignItems:"center",gap:4,padding:"4px 9px",borderRadius:5,
            background:"transparent",border:"1px solid rgba(255,255,255,0.1)",
            color:"#6B7280",fontSize:11,fontWeight:600,cursor:"pointer"}}>
          <Save size={10}/> 저장
        </button>
        <button onClick={handleQueueOrders} disabled={!btResult}
          style={{display:"flex",alignItems:"center",gap:4,padding:"5px 13px",borderRadius:6,
            background:btResult?"linear-gradient(135deg,#7c3aed,#4f46e5)":"rgba(109,40,217,0.15)",
            border:"none",color:btResult?"white":"#6B7280",fontSize:12,fontWeight:700,
            cursor:btResult?"pointer":"not-allowed",
            boxShadow:btResult?"0 2px 8px rgba(109,40,217,0.35)":"none"}}>
          <ShoppingCart size={11}/> 주문 큐
        </button>
        {/* 백테스트 엔진 셀렉터 (vectorbt | Lean·QC) */}
        <div ref={engineMenuRef} style={{position:"relative",flexShrink:0}}>
          <button onClick={()=>setEngineMenuOpen(o=>!o)} title="백테스트 엔진 선택"
            style={{display:"flex",alignItems:"center",gap:5,padding:"5px 9px",borderRadius:6,
              background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.12)",
              color:"#cbd5e1",fontSize:11,fontWeight:700,cursor:"pointer"}}>
            <Boxes size={12} color={engine==="lean"?"#a78bfa":"#60a5fa"}/>
            {engine==="lean" ? "Lean · QC" : "vectorbt"}
            <ChevronDown size={11} color={engineMenuOpen?"#60a5fa":"#6B7280"}/>
          </button>
          {engineMenuOpen && (
            <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,zIndex:300,
              background:"#1e2433",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,
              padding:5,minWidth:236,boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}>
              <div style={{fontSize:9,color:"#6B7280",fontWeight:700,padding:"3px 8px 5px"}}>백테스트 엔진</div>
              <button onClick={()=>{setEngine("vectorbt");setEngineMenuOpen(false);}}
                style={{display:"block",width:"100%",textAlign:"left",padding:"6px 8px",borderRadius:6,
                  border:"none",marginBottom:2,cursor:"pointer",
                  background:engine==="vectorbt"?"rgba(96,165,250,0.12)":"transparent"}}>
                <div style={{fontSize:11,fontWeight:700,color:engine==="vectorbt"?"#cbd5e1":"#9CA3AF"}}>vectorbt <span style={{fontSize:9,color:"#10B981"}}>· 빠름</span></div>
                <div style={{fontSize:9,color:"#6B7280"}}>Docker 불필요 · 즉시 실행</div>
              </button>
              <button onClick={()=>{setEngine("lean");setEngineMenuOpen(false);}}
                style={{display:"block",width:"100%",textAlign:"left",padding:"6px 8px",borderRadius:6,
                  border:"none",cursor:"pointer",
                  background:engine==="lean"?"rgba(167,139,250,0.12)":"transparent"}}>
                <div style={{fontSize:11,fontWeight:700,color:engine==="lean"?"#cbd5e1":"#9CA3AF"}}>Lean · QuantConnect <span style={{fontSize:9,color:"#a78bfa"}}>· 정밀</span></div>
                <div style={{fontSize:9,color:"#6B7280"}}>실제 체결 시뮬 · Docker 필요</div>
              </button>
              {engine==="lean" && leanHealth && (
                <div style={{margin:"5px 2px 2px",padding:"6px 8px",borderRadius:6,background:"rgba(255,255,255,0.03)"}}>
                  <div style={{fontSize:9,color:"#6B7280",fontWeight:700,marginBottom:5}}>실행 환경</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {[["활성",leanHealth.enabled],["Docker",leanHealth.docker],["lean CLI",leanHealth.lean_cli],["이미지",leanHealth.image]].map(([label,ok]) => (
                      <span key={label} style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:999,
                        background: ok ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.12)",
                        color: ok ? "#10B981" : "#EF4444"}}>{ok ? "✓" : "✗"} {label}</span>
                    ))}
                  </div>
                  {!leanHealth.ready && (
                    <div style={{fontSize:9,color:"#F59E0B",marginTop:6,lineHeight:1.5}}>
                      {leanHealth.analytics === false ? "analytics 사이드카 연결 불가 · " : ""}
                      {leanHealth.enabled === false ? "app.lean.enabled=true 필요 · " : ""}
                      {leanHealth.docker === false ? "Docker Desktop 실행 필요 · " : ""}
                      {leanHealth.docker && leanHealth.image === false ? `docker pull ${leanHealth.image_name || "quantconnect/lean:latest"} · ` : ""}
                      {leanHealth.lean_cli === false ? "pip install lean · " : ""}
                      준비 후 Lean 실행 가능
                    </div>
                  )}
                </div>
              )}
              {engine==="lean" && leanStrategies.length>0 && (
                <>
                  <div style={{height:1,background:"rgba(255,255,255,0.08)",margin:"5px 0"}}/>
                  <div style={{fontSize:9,color:"#6B7280",fontWeight:700,padding:"2px 8px 4px"}}>Lean 전략</div>
                  <div style={{maxHeight:172,overflow:"auto"}}>
                    {leanStrategies.map(s => (
                      <button key={s.id} onClick={()=>{setLeanStrategyId(s.id);setEngineMenuOpen(false);}}
                        style={{display:"flex",alignItems:"baseline",gap:6,width:"100%",textAlign:"left",
                          padding:"5px 8px",borderRadius:5,border:"none",cursor:"pointer",
                          background:s.id===leanStrategyId?"rgba(167,139,250,0.15)":"transparent"}}>
                        <span style={{fontSize:11,fontWeight:s.id===leanStrategyId?700:400,color:s.id===leanStrategyId?"#a78bfa":"#D1D5DB"}}>{s.name || s.id}</span>
                        <span style={{fontSize:9,color:"#4B5563",fontFamily:"monospace"}}>{s.id}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <button onClick={engine==="lean" ? handleRunLean : handleRunBacktest} disabled={runStatus==="running"}
          style={{display:"flex",alignItems:"center",gap:4,padding:"5px 13px",borderRadius:6,
            background:runStatus==="running"?"rgba(96,165,250,0.12)":(engine==="lean"?"linear-gradient(135deg,#7c3aed,#6d28d9)":"linear-gradient(135deg,#1d4ed8,#2563eb)"),
            border:"none",color:"white",fontSize:12,fontWeight:700,
            cursor:runStatus==="running"?"wait":"pointer",
            boxShadow:runStatus==="running"?"none":(engine==="lean"?"0 2px 8px rgba(124,58,237,0.35)":"0 2px 8px rgba(37,99,235,0.35)")}}>
          {runStatus==="running"
            ?<><Loader size={11} style={{animation:"spin 1s linear infinite"}}/>실행 중…</>
            :<><Play size={11}/>{engine==="lean" ? "Run Lean" : "Run Backtest"}</>}
        </button>
        <button onClick={handleImproveProposal} disabled={improveBusy}
          title="AI 진단 + 안정형/공격형 조정안 + 전후 백테스트 비교"
          style={{display:"flex",alignItems:"center",gap:4,padding:"5px 13px",borderRadius:6,
            background:improveBusy?"rgba(245,158,11,0.18)":"linear-gradient(135deg,#F59E0B,#D97706)",border:"none",
            color:"white",fontSize:12,fontWeight:700,cursor:improveBusy?"wait":"pointer",
            boxShadow:improveBusy?"none":"0 2px 8px rgba(217,119,6,0.35)"}}>
          {improveBusy ? <Loader size={11} style={{animation:"spin 1s linear infinite"}}/> : <Lightbulb size={11}/>}
          개선 제안
        </button>
        <button onClick={handleDeploy}
          style={{display:"flex",alignItems:"center",gap:4,padding:"5px 13px",borderRadius:6,
            background:"linear-gradient(135deg,#7c3aed,#6d28d9)",border:"none",
            color:"white",fontSize:12,fontWeight:700,cursor:"pointer",
            boxShadow:"0 2px 8px rgba(109,40,217,0.35)"}}>
          <Rocket size={11}/>Deploy to Live
        </button>
      </div>

      {/* Claude 에이전트 입력 → 우측 도크로 이동 (바디 내부 마지막 컬럼) */}

      {/* ═══ 바디 ════════════════════════════════════════════════════════════ */}
      <div style={{flex:1, minHeight:0, display:"flex", overflow:"hidden"}}>

        {/* ── Activity Bar ─────────────────────────────────────────────────── */}
        <div style={{
          width:36, flexShrink:0, background:"#161b22",
          borderRight:"1px solid rgba(255,255,255,0.06)",
          display:"flex", flexDirection:"column", alignItems:"center",
          paddingTop:6, gap:2,
        }}>
          {[
            { icon:<FolderOpen size={20}/>, title:"파일 탐색기",   act: sidePanel==="explorer", fn: ()=>setSidePanel(p=>p==="explorer"?null:"explorer") },
            { icon:<FileCode size={20}/>,   title:"코드만 보기",   act: sidePanel===null,        fn: ()=>setSidePanel(null) },
            { icon:<Database size={20}/>,   title:"데이터 탐색기", act: sidePanel==="data",     fn: ()=>setSidePanel(p=>p==="data"?null:"data") },
            { icon:<GitBranch size={20}/>,  title:"GitHub 연결",   act: sidePanel==="git",      fn: ()=>setSidePanel(p=>p==="git"?null:"git") },
            { icon:<BarChart3 size={20}/>,  title:"백테스트 결과", act: openTabs.some(t=>t.type==="report")&&activeTab?.type==="report",
              fn: ()=>{ const t=openTabs.find(tt=>tt.type==="report"); if(t) setActiveTabId(t.id); else handleRunBacktest(); } },
            { icon:<Terminal size={20}/>,   title:"콘솔 / 터미널", act: false,                   fn: ()=>logEndRef.current?.scrollIntoView({behavior:"smooth"}) },
          ].map((b,i)=>(
            <button key={i} title={b.title} onClick={b.fn} style={{
              width:36, height:36, borderRadius:6, border:"none",
              background: b.act ? "rgba(96,165,250,0.16)" : "transparent",
              color: b.act ? "#60a5fa" : "#9CA3AF",
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
              transition:"color 0.12s, background 0.12s",
            }}
            onMouseEnter={e=>{e.currentTarget.style.color="#E5E7EB"; e.currentTarget.style.background="rgba(255,255,255,0.08)";}}
            onMouseLeave={e=>{e.currentTarget.style.color=b.act?"#60a5fa":"#9CA3AF"; e.currentTarget.style.background=b.act?"rgba(96,165,250,0.16)":"transparent";}}
            >{b.icon}</button>
          ))}
        </div>

        {/* ── Side Panel ───────────────────────────────────────────────────── */}
        {sidePanel && (
          <div style={{
            width:sidePanelW, flexShrink:0, background:"#1a1f2a",
            borderRight:"1px solid rgba(255,255,255,0.06)",
            display:"flex", flexDirection:"column", overflow:"hidden",
            position:"relative",
          }}>
            <div ref={sideDragRef} onMouseDown={handleSideResizeMouseDown}
              style={{position:"absolute",top:0,right:0,width:4,height:"100%",cursor:"col-resize",zIndex:10,background:"transparent"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(96,165,250,0.35)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            />

            {sidePanel!=="git" && (
              <div style={{
                padding:"6px 8px 6px 12px", fontSize:9, fontWeight:700, color:"#CBD5E1",
                letterSpacing:"0.08em", textTransform:"uppercase", flexShrink:0,
                borderBottom:"1px solid rgba(255,255,255,0.05)",
                display:"flex", alignItems:"center",
              }}>
                <span style={{flex:1}}>
                  {sidePanel==="explorer" ? (repoTree ? "레포지토리" : "탐색기") : "데이터 브라우저"}
                </span>
                {sidePanel==="explorer" && repoTree && (
                  <>
                    <button
                      onClick={() => setNewFileTrigger({ type:'file', parentPath: selectedPath && !repoFiles.find(f=>f.path===selectedPath) ? selectedPath : (selectedPath?.includes('/') ? selectedPath.split('/').slice(0,-1).join('/') : '') })}
                      title="새 파일"
                      style={{
                        display:"flex", alignItems:"center", justifyContent:"center",
                        width:20, height:20, borderRadius:4, border:"none",
                        background:"transparent", color:"#4B5563", cursor:"pointer",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background="rgba(96,165,250,0.15)"; e.currentTarget.style.color="#60a5fa"; }}
                      onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="#4B5563"; }}
                    >
                      <FilePlus size={13}/>
                    </button>
                    <button
                      onClick={() => setNewFileTrigger({ type:'folder', parentPath: selectedPath && !repoFiles.find(f=>f.path===selectedPath) ? selectedPath : (selectedPath?.includes('/') ? selectedPath.split('/').slice(0,-1).join('/') : '') })}
                      title="새 폴더"
                      style={{
                        display:"flex", alignItems:"center", justifyContent:"center",
                        width:20, height:20, borderRadius:4, border:"none",
                        background:"transparent", color:"#4B5563", cursor:"pointer",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background="rgba(96,165,250,0.15)"; e.currentTarget.style.color="#60a5fa"; }}
                      onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="#4B5563"; }}
                    >
                      <FolderPlus size={13}/>
                    </button>
                  </>
                )}
              </div>
            )}

            <div ref={sidePanelScrollRef} className="dark-scroll" style={{flex:1, overflow:"auto", display:sidePanel==="git"?"flex":"block", flexDirection:"column"}}>

              {/* ── Explorer ── */}
              {sidePanel==="explorer" && (
                <div>
                  {repoTree ? (
                    <RepoExplorer
                      repoFiles={repoFiles}
                      modifiedFiles={modifiedFiles}
                      deletedFiles={deletedFiles}
                      localFolders={localFolders}
                      onOpenFile={openRepoFile}
                      activeFilePath={activeTab?.filePath}
                      fetchingFile={fetchingFile}
                      onCreate={handleRepoCreate}
                      onDelete={handleRepoDelete}
                      onRename={handleRepoRename}
                      triggerNew={newFileTrigger}
                      onTriggerNewDone={() => setNewFileTrigger(null)}
                      selectedPath={selectedPath}
                      onSelect={setSelectedPath}
                    />
                  ) : (
                    /* 워크스페이스 기본 파일 */
                    <>
                      <div onClick={()=>setFolderOpen(v=>!v)}
                        style={{display:"flex",alignItems:"center",gap:4,
                          padding:"5px 8px",cursor:"pointer",userSelect:"none",
                          color:"#F1F5F9",fontSize:11,fontWeight:700}}>
                        {folderOpen?<ChevronDown size={11}/>:<ChevronRight size={11}/>}
                        <FolderOpen size={12} color="#60a5fa" style={{flexShrink:0}}/>
                        MY_STRATEGY
                      </div>
                      {folderOpen && Object.entries(FILE_META).map(([key,meta])=>(
                        <div key={key} onClick={()=>openFile(key)}
                          style={{
                            display:"flex", alignItems:"center", gap:6,
                            padding:"4px 8px 4px 26px", cursor:"pointer",
                            background:activeTab?.fileKey===key&&activeTab?.type==="code"
                              ?"rgba(96,165,250,0.1)":"transparent",
                            color:activeTab?.fileKey===key&&activeTab?.type==="code"
                              ?"#e2e8f0":"#CBD5E1",
                            fontSize:11.5,
                          }}
                          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}
                          onMouseLeave={e=>e.currentTarget.style.background=
                            activeTab?.fileKey===key&&activeTab?.type==="code"?"rgba(96,165,250,0.1)":"transparent"}>
                          <FileCode size={12} color="#60a5fa" style={{flexShrink:0}}/>
                          {meta.name}
                        </div>
                      ))}
                      <div style={{padding:"10px 12px 4px", fontSize:10, color:"#94A3B8"}}>
                        Git 패널에서 레포지토리를 연결하면<br/>파일 트리가 여기에 표시됩니다.
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Data Browser ── */}
              {sidePanel==="data" && (
                <div>
                  <div onClick={()=>setDataGroupOpen(v=>!v)}
                    style={{display:"flex",alignItems:"center",gap:4,padding:"5px 8px",
                      cursor:"pointer",userSelect:"none",color:"#F1F5F9",fontSize:11,fontWeight:700}}>
                    {dataGroupOpen?<ChevronDown size={11}/>:<ChevronRight size={11}/>}
                    <Database size={12} color="#10B981" style={{flexShrink:0}}/>
                    기본 제공 데이터셋
                  </div>
                  {dataGroupOpen && datasets.filter(d=>d.id!=="my_kis"&&d.id!=="my_binance").map(ds=>(
                    <div key={ds.id}
                      onClick={()=>openDataset(ds)}
                      style={{padding:"4px 8px 4px 26px",cursor:"pointer",fontSize:11.5,
                        background:activeTab?.datasetId===ds.id?"rgba(16,185,129,0.1)":"transparent",
                        color:activeTab?.datasetId===ds.id?"#e2e8f0":"#CBD5E1"}}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}
                      onMouseLeave={e=>e.currentTarget.style.background=
                        activeTab?.datasetId===ds.id?"rgba(16,185,129,0.1)":"transparent"}>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <span style={{fontSize:10}}>📊</span>
                        <span>{ds.name}</span>
                      </div>
                      <div style={{fontSize:9,color:"#374151",marginLeft:15,marginTop:1}}>{ds.rows} rows</div>
                    </div>
                  ))}
                  <div onClick={()=>setMyDataOpen(v=>!v)}
                    style={{display:"flex",alignItems:"center",gap:4,padding:"5px 8px",
                      cursor:"pointer",userSelect:"none",color:"#F1F5F9",fontSize:11,fontWeight:700,marginTop:4}}>
                    {myDataOpen?<ChevronDown size={11}/>:<ChevronRight size={11}/>}
                    <Database size={12} color="#60a5fa" style={{flexShrink:0}}/>
                    내 데이터 (KIS API)
                  </div>
                  {myDataOpen && datasets.filter(d=>d.id==="my_kis"||d.id==="my_binance").map(ds=>(
                    <div key={ds.id}
                      onClick={()=>openDataset(ds)}
                      style={{padding:"4px 8px 4px 26px",cursor:"pointer",fontSize:11.5,
                        background:activeTab?.datasetId===ds.id?"rgba(96,165,250,0.1)":"transparent",
                        color:activeTab?.datasetId===ds.id?"#e2e8f0":"#CBD5E1"}}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}
                      onMouseLeave={e=>e.currentTarget.style.background=
                        activeTab?.datasetId===ds.id?"rgba(96,165,250,0.1)":"transparent"}>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <span style={{fontSize:10}}>📊</span>
                        <span>{ds.name}</span>
                        <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,
                          background:"rgba(16,185,129,0.15)",color:"#10B981"}}>실시간</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Git Panel ── */}
              {sidePanel==="git" && (
                <GitPanel
                  workspaceId={wsId}
                  modifiedFiles={modifiedFiles}
                  onPushComplete={onGitPushComplete}
                  onPullAll={onGitPullAll}
                  onRepoLinked={() => {
                    if (wsId) loadFileTree(wsId);
                    setSidePanel("explorer"); // 연결 후 파일 트리 자동 표시
                  }}
                  onRepoUnlinked={() => { setRepoFiles([]); setFileCache({}); setRepoContents({}); }}
                  fileContents={fileContents}
                  onPullComplete={(contents) => {
                    setFileContents(contents);
                    setOpenTabs(prev => prev.find(t=>t.id==="tab_main") ? prev
                      : [...prev, { id:"tab_main", name:"main.py", type:"code", fileKey:"main" }]);
                    setActiveTabId("tab_main");
                  }}
                  onOpenCommit={(c) => {
                    const tabId = `tab_commit_${c.sha}`;
                    setOpenTabs(prev => prev.find(t=>t.id===tabId) ? prev : [
                      ...prev, { id:tabId, name:c.sha?.slice(0,7), type:"commit", commit:c }
                    ]);
                    setActiveTabId(tabId);
                  }}
                  deletedFiles={[...deletedFiles]}
                  onDeleteComplete={(paths) => setDeletedFiles(prev => {
                    const next = new Set(prev);
                    paths.forEach(p => next.delete(p));
                    return next;
                  })}
                />
              )}
            </div>
          </div>
        )}

        {/* ── 메인 영역 ─────────────────────────────────────────────────────── */}
        <div style={{flex:1, minWidth:0, display:"flex", flexDirection:"column", overflow:"hidden"}}>

          {/* 탭 바 */}
          <div style={{
            display:"flex", alignItems:"center", flexShrink:0,
            background:"#161b22", borderBottom:"1px solid rgba(255,255,255,0.07)",
            overflowX:"auto", minHeight:34,
          }}>
            {openTabs.map(tab=>(
              <div key={tab.id} onClick={()=>setActiveTabId(tab.id)}
                style={{
                  display:"flex", alignItems:"center", gap:5,
                  padding:"0 14px", height:34, flexShrink:0, cursor:"pointer",
                  background:activeTabId===tab.id?"#0f1117":"transparent",
                  borderBottom:activeTabId===tab.id?"2px solid #60a5fa":"2px solid transparent",
                  color:activeTabId===tab.id?"#e2e8f0":"#4B5563",
                  fontSize:11.5, fontWeight:activeTabId===tab.id?600:400,
                  borderRight:"1px solid rgba(255,255,255,0.05)",
                }}>
                {tab.type==="code"&&<FileCode size={10} color="#60a5fa"/>}
                {tab.type==="repoFile"&&<FileCode size={10} color="#93c5fd"/>}
                {tab.type==="data"&&<Database size={10} color="#10B981"/>}
                {tab.type==="report"&&<BarChart3 size={10} color="#F59E0B"/>}
                <span style={{whiteSpace:"nowrap"}}>{tab.name}</span>
                {/* dirty indicator */}
                {tab.type==="repoFile" && modifiedSet.has(tab.filePath) && (
                  <span style={{width:5,height:5,borderRadius:999,background:"#60a5fa",flexShrink:0}}/>
                )}
                <X size={10}
                  onClick={(e)=>closeTab(tab.id,e)}
                  style={{opacity:activeTabId===tab.id?0.5:0,cursor:"pointer",marginLeft:2}}
                  onMouseEnter={e=>e.currentTarget.style.opacity="1"}
                  onMouseLeave={e=>e.currentTarget.style.opacity=activeTabId===tab.id?"0.5":"0"}
                />
              </div>
            ))}
            {openTabs.length===0 && (
              <div style={{padding:"0 16px",fontSize:11,color:"#2d3748"}}>
                탐색기에서 파일을 클릭하여 여세요
              </div>
            )}
          </div>

          {/* 에디터 / 데이터뷰 / 리포트 */}
          <div style={{flex:1, minHeight:0, overflow:"hidden", display:"flex", flexDirection:"column"}}>

            {/* 워크스페이스 코드 파일 */}
            {activeTab?.type==="code" && (
              <Editor
                key={activeTab.fileKey}
                height="100%"
                defaultLanguage="python"
                value={fileContents[activeTab.fileKey]||""}
                onChange={v=>setFileContents(prev=>({...prev,[activeTab.fileKey]:v??""}))}
                theme="vs-dark"
                options={editorOpts}
              />
            )}
            {/* GitHub 레포 파일 */}
            {activeTab?.type==="repoFile" && (
              <Editor
                key={activeTab.filePath}
                height="100%"
                defaultLanguage={activeTab.lang || "plaintext"}
                value={repoContents[activeTab.filePath] || ""}
                onChange={v => setRepoContents(prev => ({ ...prev, [activeTab.filePath]: v ?? "" }))}
                theme="vs-dark"
                options={{ ...editorOpts, tabSize: editorOpts.tabSize !== 4 ? editorOpts.tabSize : 2 }}
              />
            )}

            {activeTab?.type==="data" && <DataTableView datasetId={activeTab.datasetId} datasets={datasets}/>}
            {activeTab?.type==="report" && <BacktestReportView btResult={btResult}/>}
            {activeTab?.type==="diff" && <ClaudeDiffView changes={claudeDiff?.changes || []} onMeasure={handleMeasureClaudeChange} measuring={compareBusy}/>}
            {activeTab?.type==="commit" && (
              <CommitDiffView commit={activeTab.commit} workspaceId={wsId} />
            )}

            {!activeTab && (
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
                justifyContent:"center",color:"#2d3748",gap:10}}>
                <Code2 size={36} color="#1f2937"/>
                <div style={{fontSize:13,color:"#374151"}}>좌측 탐색기에서 파일을 열거나 데이터셋을 선택하세요</div>
                <div style={{fontSize:11,color:"#2d3748"}}>Run Backtest → 완료 후 📊 Report 탭이 자동 생성됩니다</div>
              </div>
            )}
          </div>

          {/* ── 하단 콘솔 ─────────────────────────────────────────────────── */}
          <div style={{
            height:bottomH, flexShrink:0,
            background:"#0d1117", borderTop:"1px solid rgba(255,255,255,0.07)",
            display:"flex", flexDirection:"column", overflow:"hidden",
          }}>
            {/* 리사이즈 핸들 — 마우스 가까이 가면 파란 선, 위로 드래그하면 콘솔/터미널 영역 커짐 */}
            <div onMouseDown={handleBottomResizeMouseDown}
              style={{height:6, marginTop:-3, flexShrink:0, cursor:"ns-resize", background:"transparent", position:"relative", zIndex:5}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(96,165,250,0.5)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}/>
            <div style={{
              display:"flex", alignItems:"center",
              borderBottom:"1px solid rgba(255,255,255,0.06)",
              padding:"0 12px", flexShrink:0, background:"#161b22",
            }}>
              <button onClick={()=>setConsoleTab("log")}
                style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",
                background:"none",border:"none",borderBottom:consoleTab==="log"?"2px solid #60a5fa":"2px solid transparent",
                color:consoleTab==="log"?"#60a5fa":"#6B7280",fontSize:11,fontWeight:600,cursor:"pointer",marginBottom:-1}}>
                <Terminal size={10}/>CONSOLE
                {runStatus==="running"&&(
                  <span style={{width:6,height:6,borderRadius:999,background:"#F59E0B",animation:"pulse 1s ease-in-out infinite"}}/>
                )}
                {runStatus==="done"&&(
                  <span style={{width:6,height:6,borderRadius:999,background:"#10B981"}}/>
                )}
              </button>
              <button onClick={()=>setConsoleTab("terminal")}
                style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",
                background:"none",border:"none",borderBottom:consoleTab==="terminal"?"2px solid #60a5fa":"2px solid transparent",
                color:consoleTab==="terminal"?"#60a5fa":"#6B7280",fontSize:11,fontWeight:600,cursor:"pointer",marginBottom:-1}}>
                <Terminal size={10}/>TERMINAL
              </button>
              <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:2}}>
                {consoleTab==="log" && (
                  <button onClick={()=>setLogLines([])} title="콘솔 지우기"
                    style={{background:"none",border:"none",color:"#4B5563",cursor:"pointer",
                      fontSize:10,padding:"3px 8px"}}>Clear</button>
                )}
                <button onClick={()=>setBottomH(h=>h===180?320:180)} title="콘솔 크기"
                  style={{background:"none",border:"none",color:"#2d3748",cursor:"pointer",
                    fontSize:9,padding:"3px 6px"}}>
                  {bottomH===180?"↑":"↓"}
                </button>
              </div>
            </div>
            {consoleTab==="terminal" ? (
              <div style={{flex:1,minHeight:0,overflow:"hidden"}}>
                <TerminalTabs/>
              </div>
            ) : (
              <div ref={logScrollRef} className="dark-scroll" style={{flex:1,overflow:"auto",padding:"6px 14px",
                fontFamily:"'Fira Code','Cascadia Code',monospace",fontSize:12.5}}>
                {logLines.length===0&&runStatus==="idle"&&(
                  <div style={{color:"#2d3748",marginTop:4}}>
                    ▶  Run Backtest 클릭 → LEAN 엔진 로그 / TERMINAL 탭에서 bash·powershell·cmd 실행.
                  </div>
                )}
                {logLines.map((line,i)=>(
                  <div key={i} style={{display:"flex",gap:10,marginBottom:1}}>
                    <span style={{color:"#2d3748",flexShrink:0}}>{line.ts}</span>
                    <span style={{color:logColor[line.type]||"#9CA3AF"}}>{line.msg}</span>
                  </div>
                ))}
                {runStatus==="running"&&(
                  <div style={{color:"#374151",marginTop:2,display:"flex",alignItems:"center",gap:4}}>
                    <Loader size={9} style={{animation:"spin 1s linear infinite"}}/>처리 중…
                  </div>
                )}
                <div ref={logEndRef}/>
              </div>
            )}
          </div>

        </div>

        {/* ═══ Claude Code 에이전트 우측 도크 (리사이즈 가능) ═══ */}
        {claudeOpen && (
          <>
            <div onMouseDown={handleClaudeDockResizeMouseDown}
              style={{width:6, marginRight:-3, flexShrink:0, cursor:"col-resize", background:"transparent", zIndex:6}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(167,139,250,0.5)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}/>
            <div style={{width:claudeDockW, flexShrink:0, background:"#12161f",
              borderLeft:"1px solid rgba(255,255,255,0.08)", display:"flex", flexDirection:"column", overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"center",gap:7,padding:"9px 12px",
                borderBottom:"1px solid rgba(255,255,255,0.08)",flexShrink:0}}>
                <Bot size={15} color="#a78bfa"/>
                <span style={{fontSize:12.5,fontWeight:800,color:"#e5e7eb",flex:1}}>Claude 에이전트</span>
                {claudeBusy && <Loader size={13} color="#a78bfa" style={{animation:"spin 1s linear infinite"}}/>}
                {claudeMessages.length > 0 && !claudeBusy && (
                  <button
                    onClick={async () => { try { if (wsId) await resetClaudeSession(wsId); } catch { /* noop */ } setClaudeMessages([]); }}
                    title="새 대화 (이 워크스페이스의 Claude 세션 맥락 초기화)"
                    style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:7,
                      border:"1px solid rgba(167,139,250,0.3)",background:"transparent",color:"#a78bfa",
                      fontSize:11,fontWeight:700,cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(167,139,250,0.12)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <Plus size={12}/>새 대화
                  </button>
                )}
                <X size={15} onClick={()=>setClaudeOpen(false)} style={{color:"#6B7280",cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.color="#e5e7eb"} onMouseLeave={e=>e.currentTarget.style.color="#6B7280"}/>
              </div>
              {/* BYOK: 본인 Claude 키 연동(연동되면 한 줄) */}
              <div style={{padding:"8px 12px 6px",flexShrink:0}}>
                <ClaudeKeyConnect />
              </div>
              {/* 대화 — VSCode Claude Code 식, 도크 안에 누적 */}
              <div ref={claudeScrollRef} style={{flex:1, minHeight:0, overflowY:"auto", padding:"4px 12px 8px",
                display:"flex", flexDirection:"column", gap:9}}>
                {claudeMessages.length === 0 && (
                  <div style={{fontSize:11,color:"#6B7280",lineHeight:1.7,padding:"4px 2px"}}>
                    현재 에디터 코드를 Claude가 직접 편집합니다. 변경은 <span style={{color:"#a78bfa",fontWeight:700}}>🔀 Claude diff</span> 탭 + 상단 'Heli 변경' 바에서 확인하세요.
                    <br/><b style={{color:"#94a3b8"}}>Enter</b> 전송 · <b style={{color:"#94a3b8"}}>Shift+Enter</b> 줄바꿈.
                  </div>
                )}
                {claudeMessages.map((m, i) => {
                  if (m.role === "user") return (
                    <div key={i} style={{alignSelf:"flex-end", maxWidth:"88%", background:"linear-gradient(135deg,#7c3aed,#6d28d9)",
                      color:"#fff", padding:"8px 12px", borderRadius:"12px 4px 12px 12px", fontSize:12.5, lineHeight:1.55, whiteSpace:"pre-wrap"}}>{m.content}</div>
                  );
                  if (m.role === "assistant") return (
                    <div key={i} style={{alignSelf:"flex-start", maxWidth:"92%", display:"flex", flexDirection:"column", gap:6}}>
                      {m.content && <div style={{background:"#1b2130", color:"#e5e7eb", padding:"9px 12px",
                        borderRadius:"4px 12px 12px 12px", fontSize:12.5, lineHeight:1.6, whiteSpace:"pre-wrap"}}>{m.content}</div>}
                      {m.summary && <div style={{fontSize:11.5, color:"#34d399", fontWeight:600, lineHeight:1.5}}>{m.summary}</div>}
                    </div>
                  );
                  if (m.role === "error") return (
                    <div key={i} style={{alignSelf:"flex-start", maxWidth:"92%", background:"rgba(248,113,113,0.12)", color:"#fca5a5",
                      border:"1px solid rgba(248,113,113,0.3)", padding:"8px 11px", borderRadius:8, fontSize:12, lineHeight:1.5}}>⚠️ {m.content}</div>
                  );
                  return (
                    <div key={i} style={{fontSize:11, color:"#7c8aa0", fontFamily:"ui-monospace,monospace", paddingLeft:2, lineHeight:1.5}}>{m.content}</div>
                  );
                })}
                {claudeBusy && (
                  <div style={{fontSize:11.5, color:"#a78bfa", display:"flex", alignItems:"center", gap:6}}>
                    <Loader size={12} style={{animation:"spin 1s linear infinite"}}/> 작업 중…
                  </div>
                )}
              </div>
              {/* 입력 — Enter 전송 / Shift+Enter 줄바꿈 */}
              <div style={{padding:"8px 12px 12px", flexShrink:0, borderTop:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{display:"flex", gap:7, alignItems:"flex-end"}}>
                  <textarea
                    value={claudeReq}
                    onChange={e=>setClaudeReq(e.target.value)}
                    onKeyDown={e=>{ if(e.nativeEvent.isComposing) return; if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); handleClaudeAgent(); } }}
                    placeholder="Claude에게 요청…  (Enter 전송 · Shift+Enter 줄바꿈)"
                    rows={2}
                    disabled={claudeBusy}
                    style={{flex:1, boxSizing:"border-box", resize:"none", background:"#0f1117", color:"#e5e7eb",
                      border:"1px solid rgba(167,139,250,0.3)", borderRadius:10, padding:"9px 11px",
                      fontSize:12.5, fontFamily:"inherit", lineHeight:1.5, outline:"none", minHeight:40, maxHeight:150}}/>
                  <button onClick={handleClaudeAgent} disabled={claudeBusy||!claudeReq.trim()}
                    title="전송 (Enter)"
                    style={{width:40, height:40, borderRadius:10, border:"none", flexShrink:0,
                      background:(claudeBusy||!claudeReq.trim())?"rgba(125,211,252,0.25)":"#7DD3FC",
                      cursor:(claudeBusy||!claudeReq.trim())?"not-allowed":"pointer",
                      display:"inline-flex", alignItems:"center", justifyContent:"center", transition:"background 0.15s ease"}}
                    onMouseEnter={e=>{ if(!claudeBusy&&claudeReq.trim()) e.currentTarget.style.background="#38BDF8"; }}
                    onMouseLeave={e=>{ if(!claudeBusy&&claudeReq.trim()) e.currentTarget.style.background="#7DD3FC"; }}>
                    {claudeBusy ? <Loader size={15} color="#a78bfa" style={{animation:"spin 1s linear infinite"}}/> : <Send size={16} color="#0C4A6E"/>}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {improveOpen && (
        <ImproveProposalModal
          busy={improveBusy} data={improveData} err={improveErr} applied={improveApplied}
          onApply={handleApplyOption} onClose={()=>setImproveOpen(false)} />
      )}
      {compareOpen && (
        <PatchCompareModal
          busy={compareBusy} data={compareData} err={compareErr} onClose={()=>setCompareOpen(false)} />
      )}

      <style>{`
        @keyframes spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}

/* ───── P3: 전략 개선 제안서 모달 ───── */
const IMPROVE_METRICS = [
  { key: "return_pct", label: "수익률", unit: "%", better: "high", dec: 1, signed: true },
  { key: "mdd_pct",    label: "최대낙폭(MDD)", unit: "%", better: "high", dec: 1, signed: false },
  { key: "vol_pct",    label: "변동성", unit: "%", better: "low",  dec: 1, signed: false },
  { key: "sharpe",     label: "샤프지수", unit: "",  better: "high", dec: 2, signed: false },
];
const TONE = {
  neutral:    { bg: "#1e2533", border: "#374151", text: "#cbd5e1", accent: "#94a3b8" },
  stable:     { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.45)", text: "#6ee7b7", accent: "#10b981" },
  aggressive: { bg: "rgba(244,114,182,0.10)", border: "rgba(244,114,182,0.45)", text: "#f9a8d4", accent: "#ec4899" },
};
function fmtMetric(v, m) {
  if (v == null || Number.isNaN(v)) return "—";
  const s = Number(v).toFixed(m.dec);
  return (m.signed && Number(v) > 0 ? "+" : "") + s + m.unit;
}
function metricDelta(variantV, baseV, m) {
  if (variantV == null || baseV == null) return null;
  const d = Number(variantV) - Number(baseV);
  if (Math.abs(d) < (m.dec === 2 ? 0.01 : 0.05)) return { text: "≈", color: "#6b7280" };
  const improved = m.better === "high" ? d > 0 : d < 0;
  return { text: (d > 0 ? "▲" : "▼") + Math.abs(d).toFixed(m.dec), color: improved ? "#34d399" : "#f87171" };
}
function ImproveProposalModal({ busy, data, err, applied, onApply, onClose }) {
  const options = data?.options || [];
  const baseline = options.find(o => o.key === "keep")?.metrics || {};
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 4000, background: "rgba(8,11,18,0.72)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(940px, 96vw)", maxHeight: "90vh", overflow: "auto", background: "#12161f",
        border: "1px solid rgba(245,158,11,0.35)", borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
        display: "flex", flexDirection: "column",
      }}>
        {/* 헤더 */}
        <div style={{
          display: "flex", alignItems: "center", gap: 9, padding: "14px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.08)", position: "sticky", top: 0,
          background: "linear-gradient(135deg,#1b2130,#161b24)", zIndex: 2,
        }}>
          <Lightbulb size={18} color="#F59E0B" />
          <span style={{ fontSize: 15, fontWeight: 800, color: "#f8fafc", flex: 1 }}>전략 개선 제안서</span>
          <X size={18} onClick={onClose} style={{ color: "#94a3b8", cursor: "pointer" }} />
        </div>

        <div style={{ padding: 18 }}>
          {busy && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "40px 0", justifyContent: "center", color: "#cbd5e1", fontSize: 13.5 }}>
              <Loader size={18} color="#F59E0B" style={{ animation: "spin 1s linear infinite" }} />
              진단 분석 + 안정형·공격형 전후 백테스트 측정 중… (수 초)
            </div>
          )}
          {!busy && err && (
            <div style={{ padding: 16, borderRadius: 10, background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.35)", color: "#fca5a5", fontSize: 13 }}>
              ⚠️ {err}
            </div>
          )}
          {!busy && !err && data && (
            <>
              {/* 진단 */}
              <div style={{ marginBottom: 16, padding: "13px 15px", borderRadius: 11, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.28)" }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: "#FBBF24", letterSpacing: 0.4, marginBottom: 5 }}>🩺 진단</div>
                <div style={{ fontSize: 13, color: "#e5e7eb", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{data.diagnosis}</div>
              </div>

              {/* 선택지 카드 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 11, marginBottom: 16 }}>
                {options.map(opt => {
                  const t = TONE[opt.tone] || TONE.neutral;
                  const isApplied = applied === opt.key;
                  return (
                    <div key={opt.key} style={{ background: t.bg, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: 13, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: t.text }}>{opt.label}</div>
                      <div style={{ fontSize: 11.5, color: "#cbd5e1", lineHeight: 1.5, minHeight: 32 }}>{opt.summary}</div>
                      {/* 변경 파라미터 */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {(opt.changes || []).length === 0
                          ? <div style={{ fontSize: 11, color: "#6b7280" }}>· 변경 없음(현재값)</div>
                          : opt.changes.map((c, i) => (
                            <div key={i} style={{ fontSize: 11, color: "#cbd5e1", fontFamily: "ui-monospace,monospace" }}>
                              {c.label}: <span style={{ color: "#94a3b8" }}>{String(c.from ?? "—")}</span> → <span style={{ color: t.accent, fontWeight: 700 }}>{String(c.to)}</span>
                            </div>
                          ))}
                      </div>
                      {opt.key === "keep" ? (
                        <div style={{ marginTop: "auto", padding: "7px 0", textAlign: "center", fontSize: 11.5, color: "#6b7280", fontWeight: 700 }}>현재 기준</div>
                      ) : (
                        <button onClick={() => onApply(opt)} disabled={opt.metrics && opt.metrics.available === false}
                          style={{ marginTop: "auto", padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
                            background: isApplied ? "#334155" : t.accent, color: "#fff", fontSize: 12, fontWeight: 800 }}>
                          {isApplied ? "✓ 적용됨" : "이 안 적용 + 백테스트"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 전후 비교표 */}
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "#94a3b8", letterSpacing: 0.4, marginBottom: 7 }}>📊 변경 전후 비교 (실제 백테스트 · {data.period || "5y"})</div>
              <div style={{ overflowX: "auto", borderRadius: 11, border: "1px solid rgba(255,255,255,0.08)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: "#1a1f2a" }}>
                      <th style={{ textAlign: "left", padding: "9px 12px", color: "#94a3b8", fontWeight: 700 }}>지표</th>
                      {options.map(o => {
                        const t = TONE[o.tone] || TONE.neutral;
                        return <th key={o.key} style={{ textAlign: "right", padding: "9px 12px", color: t.text, fontWeight: 800 }}>{o.label}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {IMPROVE_METRICS.map(m => (
                      <tr key={m.key} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "9px 12px", color: "#cbd5e1", fontWeight: 600 }}>{m.label}</td>
                        {options.map(o => {
                          const mv = o.metrics || {};
                          const v = mv[m.key];
                          const unavailable = mv.available === false;
                          const d = o.key === "keep" ? null : metricDelta(v, baseline[m.key], m);
                          return (
                            <td key={o.key} style={{ padding: "9px 12px", textAlign: "right", color: unavailable ? "#6b7280" : "#f1f5f9", fontFamily: "ui-monospace,monospace", fontWeight: 700 }}>
                              {unavailable ? "—" : fmtMetric(v, m)}
                              {d && <span style={{ marginLeft: 6, fontSize: 10.5, color: d.color, fontWeight: 700 }}>{d.text}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: "#6b7280", lineHeight: 1.6 }}>
                · 성과는 추정이 아니라 <b style={{ color: "#94a3b8" }}>실제 vectorbt 백테스트</b> 결과입니다(수수료 0.25% + 슬리피지 0.1% 반영).
                <br />· <b style={{ color: "#94a3b8" }}>적용</b>하면 에디터 코드의 파라미터 상수가 바뀌고 즉시 백테스트로 확인합니다. 마음에 안 들면 되돌리세요.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───── P4: Claude 패치 전후 효과 비교 모달 (같은 비교 포맷 재사용) ───── */
function PatchCompareModal({ busy, data, err, onClose }) {
  const options = data?.options || [];
  const before = options.find(o => o.key === "before")?.metrics || {};
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 4000, background: "rgba(8,11,18,0.72)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(680px, 96vw)", maxHeight: "90vh", overflow: "auto", background: "#12161f",
        border: "1px solid rgba(245,158,11,0.35)", borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "14px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.08)", background: "linear-gradient(135deg,#1b2130,#161b24)" }}>
          <BarChart3 size={18} color="#F59E0B" />
          <span style={{ fontSize: 15, fontWeight: 800, color: "#f8fafc", flex: 1 }}>Claude 패치 — 변경 전후 효과</span>
          <X size={18} onClick={onClose} style={{ color: "#94a3b8", cursor: "pointer" }} />
        </div>
        <div style={{ padding: 18 }}>
          {busy && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "36px 0", justifyContent: "center", color: "#cbd5e1", fontSize: 13.5 }}>
              <Loader size={18} color="#F59E0B" style={{ animation: "spin 1s linear infinite" }} /> 변경 전·후 백테스트 측정 중…
            </div>
          )}
          {!busy && err && (
            <div style={{ padding: 16, borderRadius: 10, background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.35)", color: "#fca5a5", fontSize: 13 }}>⚠️ {err}</div>
          )}
          {!busy && !err && data && (
            <>
              {data.paramsChanged === false && (
                <div style={{ marginBottom: 14, padding: "11px 14px", borderRadius: 10, background: "rgba(148,163,184,0.10)", border: "1px solid rgba(148,163,184,0.3)", color: "#cbd5e1", fontSize: 12.5, lineHeight: 1.6 }}>
                  ℹ️ 파라미터 상수(SMA·RSI·MACD) 변경은 감지되지 않았습니다. 로직만 바뀐 변경의 효과는 <b style={{ color: "#a78bfa" }}>Lean 백테스트</b>로 확인하세요.
                </div>
              )}
              {(data.changes || []).length > 0 && (
                <div style={{ marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {data.changes.map((c, i) => (
                    <span key={i} style={{ fontSize: 11, fontFamily: "ui-monospace,monospace", color: "#cbd5e1", background: "#1a1f2a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, padding: "4px 9px" }}>
                      {c.label}: {String(c.from ?? "—")} → <span style={{ color: "#34d399", fontWeight: 700 }}>{String(c.to)}</span>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ overflowX: "auto", borderRadius: 11, border: "1px solid rgba(255,255,255,0.08)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: "#1a1f2a" }}>
                      <th style={{ textAlign: "left", padding: "9px 12px", color: "#94a3b8", fontWeight: 700 }}>지표</th>
                      {options.map(o => {
                        const t = TONE[o.tone] || TONE.neutral;
                        return <th key={o.key} style={{ textAlign: "right", padding: "9px 12px", color: t.text, fontWeight: 800 }}>{o.label}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {IMPROVE_METRICS.map(m => (
                      <tr key={m.key} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "9px 12px", color: "#cbd5e1", fontWeight: 600 }}>{m.label}</td>
                        {options.map(o => {
                          const mv = o.metrics || {};
                          const v = mv[m.key];
                          const unavailable = mv.available === false;
                          const d = o.key === "before" ? null : metricDelta(v, before[m.key], m);
                          return (
                            <td key={o.key} style={{ padding: "9px 12px", textAlign: "right", color: unavailable ? "#6b7280" : "#f1f5f9", fontFamily: "ui-monospace,monospace", fontWeight: 700 }}>
                              {unavailable ? "—" : fmtMetric(v, m)}
                              {d && <span style={{ marginLeft: 6, fontSize: 10.5, color: d.color, fontWeight: 700 }}>{d.text}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: "#6b7280", lineHeight: 1.6 }}>
                · 실제 vectorbt 백테스트({data.period || "5y"}) 기준 · <b style={{ color: "#94a3b8" }}>변경 후</b> 컬럼의 색은 변경 전 대비 개선(녹)/악화(적).
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───── CommitDiffView ───── */
function CommitDiffView({ commit, workspaceId }) {
  const [detail, setDetail] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [selFile, setSelFile] = React.useState(null);

  React.useEffect(() => {
    if (!commit?.sha) return;
    setLoading(true); setErr(null); setDetail(null); setSelFile(null);
    getWorkspaceCommit(workspaceId, commit.sha)
      .then(d => { setDetail(d); if (d.files?.length) setSelFile(d.files[0]); })
      .catch(e => setErr(e.message || "커밋 정보 로드 실패"))
      .finally(() => setLoading(false));
  }, [commit?.sha, workspaceId]);

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#94a3b8",fontSize:13}}>
      커밋 로드 중…
    </div>
  );
  if (err) return (
    <div style={{padding:16,color:"#f87171",fontSize:13}}>{err}</div>
  );
  if (!detail) return null;

  const statusColor = { added:"#34d399", modified:"#60a5fa", removed:"#f87171", renamed:"#f59e0b" };
  const statusLabel = { added:"A", modified:"M", removed:"D", renamed:"R" };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      {/* Header */}
      <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.08)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
          <code style={{fontSize:11,color:"#94a3b8",fontFamily:"monospace"}}>{detail.sha?.slice(0,7)}</code>
          {detail.htmlUrl && (
            <a href={detail.htmlUrl} target="_blank" rel="noreferrer"
               style={{color:"#60a5fa",display:"flex",alignItems:"center",gap:3,fontSize:11}}>
              <ExternalLink size={11}/> GitHub
            </a>
          )}
        </div>
        <div style={{fontSize:12.5,color:"#e2e8f0",fontWeight:600,marginBottom:4,lineHeight:1.4}}>
          {detail.message}
        </div>
        <div style={{display:"flex",gap:10,fontSize:11,color:"#64748b"}}>
          <span>{detail.authorName}</span>
          <span>{detail.authoredAt ? new Date(detail.authoredAt).toLocaleString("ko-KR") : ""}</span>
          <span style={{color:"#34d399"}}>+{detail.additions}</span>
          <span style={{color:"#f87171"}}>-{detail.deletions}</span>
        </div>
      </div>

      {/* Body: file list + diff */}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* File list */}
        <div style={{width:220,borderRight:"1px solid rgba(255,255,255,0.08)",overflowY:"auto",flexShrink:0}}>
          {(detail.files || []).map(f => (
            <div key={f.filename}
                 onClick={() => setSelFile(f)}
                 style={{
                   padding:"6px 10px",cursor:"pointer",fontSize:11,
                   background: selFile?.filename === f.filename ? "rgba(96,165,250,0.12)" : "transparent",
                   borderLeft: selFile?.filename === f.filename ? "2px solid #60a5fa" : "2px solid transparent",
                   display:"flex",alignItems:"center",gap:6,
                 }}>
              <span style={{
                fontSize:9,fontWeight:700,padding:"1px 4px",borderRadius:3,
                background: statusColor[f.status] || "#64748b", color:"#0f172a",flexShrink:0
              }}>{statusLabel[f.status] || "?"}</span>
              <span style={{color:"#cbd5e1",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={f.filename}>
                {f.filename.split("/").pop()}
              </span>
            </div>
          ))}
        </div>

        {/* Diff panel */}
        <div style={{flex:1,overflow:"auto"}}>
          {selFile ? <DiffPatchView file={selFile}/> : (
            <div style={{color:"#64748b",fontSize:12,padding:16}}>파일을 선택하세요.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───── DiffPatchView ───── */
function DiffPatchView({ file }) {
  if (!file) return null;

  const statusColor = { added:"#34d399", modified:"#60a5fa", removed:"#f87171", renamed:"#f59e0b" };

  const lines = file.patch ? file.patch.split("\n") : [];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* File header */}
      <div style={{
        padding:"6px 12px",borderBottom:"1px solid rgba(255,255,255,0.06)",
        display:"flex",alignItems:"center",gap:8,flexShrink:0,
        background:"rgba(0,0,0,0.2)"
      }}>
        <span style={{
          fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:3,
          background: statusColor[file.status] || "#64748b", color:"#0f172a"
        }}>{file.status?.toUpperCase()}</span>
        <span style={{fontSize:11,color:"#e2e8f0",fontFamily:"monospace"}}>{file.filename}</span>
        <span style={{fontSize:10,color:"#34d399",marginLeft:"auto"}}>+{file.additions}</span>
        <span style={{fontSize:10,color:"#f87171"}}>-{file.deletions}</span>
        {file.blobUrl && (
          <a href={file.blobUrl} target="_blank" rel="noreferrer"
             style={{color:"#60a5fa",display:"flex",alignItems:"center",gap:2,fontSize:10}}>
            <ExternalLink size={10}/>
          </a>
        )}
      </div>

      {/* Diff lines */}
      {lines.length === 0 ? (
        <div style={{color:"#64748b",fontSize:11,padding:12}}>diff 없음 (바이너리 또는 빈 파일)</div>
      ) : (
        <div style={{overflowY:"auto",flex:1,fontFamily:"monospace",fontSize:11.5}}>
          {lines.map((line, i) => {
            let bg = "transparent", color = "#cbd5e1";
            if (line.startsWith("+") && !line.startsWith("+++")) { bg="rgba(52,211,153,0.10)"; color="#86efac"; }
            else if (line.startsWith("-") && !line.startsWith("---")) { bg="rgba(248,113,113,0.10)"; color="#fca5a5"; }
            else if (line.startsWith("@@")) { bg="rgba(96,165,250,0.08)"; color="#93c5fd"; }
            else if (line.startsWith("+++") || line.startsWith("---")) { color="#64748b"; }
            return (
              <div key={i} style={{
                background:bg, color, padding:"1px 12px", whiteSpace:"pre-wrap", wordBreak:"break-all",
                lineHeight:1.6, borderLeft: line.startsWith("+") && !line.startsWith("+++") ? "2px solid #34d399"
                  : line.startsWith("-") && !line.startsWith("---") ? "2px solid #f87171"
                  : "2px solid transparent"
              }}>{line || " "}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
