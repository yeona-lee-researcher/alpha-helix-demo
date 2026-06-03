import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Layers, MessageSquare, BarChart3, ShieldCheck, Inbox,
  Activity, Sparkles, Wallet, TrendingUp, CheckCircle2,
  ArrowRight, Play, AlertTriangle, Clock, Zap,
  BookOpen, Target, Settings, ChevronRight,
} from "lucide-react";

const F = "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif";
const ACCENT = "linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)";
const SECTION_COLOR = "#3b82f6";

/* ── 섹션 메타 ──────────────────────────────────────────────────────────── */
const SECTIONS = [
  { id: "overview",    label: "Alpha-Helix 한눈에 보기",    Icon: Sparkles },
  { id: "workspace",   label: "첫 워크스페이스 만들기",     Icon: Layers },
  { id: "goal-chat",   label: "Goal Chat (목표 → 전략)",    Icon: MessageSquare },
  { id: "config",      label: "전략 카드 편집",              Icon: Settings },
  { id: "backtest",    label: "백테스트 리포트 보는 법",    Icon: BarChart3 },
  { id: "trust",       label: "Trust Score 의미",            Icon: ShieldCheck },
  { id: "orders",      label: "주문 제안 승인 큐",           Icon: Inbox },
];

/* ── 공통 스타일 헬퍼 ────────────────────────────────────────────────────── */
const SectionTitle = ({ icon: Icon, title, accent = SECTION_COLOR }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
    <div style={{
      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
      background: `linear-gradient(135deg, ${accent}22, ${accent}11)`,
      border: `1px solid ${accent}33`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <Icon size={18} color={accent} />
    </div>
    <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>{title}</h2>
  </div>
);

const Card = ({ children, style }) => (
  <div style={{
    background: "white", border: "1.5px solid #E5E7EB", borderRadius: 14,
    padding: "24px 28px", ...style,
  }}>{children}</div>
);

const StepBadge = ({ n, color = SECTION_COLOR }) => (
  <div style={{
    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
    background: `linear-gradient(135deg, ${color}, ${color}CC)`,
    color: "white", fontSize: 12, fontWeight: 800,
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: `0 2px 8px ${color}44`,
  }}>{n}</div>
);

const Tag = ({ children, color = "#3b82f6" }) => (
  <span style={{
    display: "inline-block", fontSize: 11, fontWeight: 700,
    padding: "3px 10px", borderRadius: 999,
    background: `${color}15`, color,
  }}>{children}</span>
);

/* ─────────────────────────────────────────────────────────────────────────── */
/* 섹션 1: Overview */
/* ─────────────────────────────────────────────────────────────────────────── */
const FEATURES = [
  { icon: MessageSquare, label: "Goal Chat",        desc: "자연어 목표 → AI가 전략 파라미터 자동 생성",                  color: "#3b82f6" },
  { icon: Layers,        label: "전략 카드",         desc: "6가지 전략 유형, 자산·파라미터 시각적 편집",                  color: "#8b5cf6" },
  { icon: BarChart3,     label: "백테스트 엔진",     desc: "vectorbt 기반 · 수수료 0.25% · 슬리피지 0.1% 반영",         color: "#06b6d4" },
  { icon: Activity,      label: "5-State Regime",   desc: "시장 국면 자동 감지 (Bull/Bear/High-Vol/Neutral/Crisis)",     color: "#f59e0b" },
  { icon: ShieldCheck,   label: "Trust Score",       desc: "4개 서브스코어 종합 · 75+ Stable · 60+ Normal",             color: "#10b981" },
  { icon: TrendingUp,    label: "Tearsheet",         desc: "QuantStats HTML 리포트 자동 생성 · 전략별 저장",             color: "#ec4899" },
  { icon: Inbox,         label: "주문 제안 큐",      desc: "일일 시그널 → 사용자 승인 후 KIS 실주문 전송",               color: "#6366f1" },
  { icon: Wallet,        label: "KIS 브로커 연동",   desc: "모의/실거래 계좌 · AES-GCM 암호화 · 토큰 자동 갱신",        color: "#0ea5e9" },
  { icon: Sparkles,      label: "Living Briefing",   desc: "Gemini 2.5-flash 일일 시장 요약 + 포트폴리오 코멘트",       color: "#a78bfa" },
  { icon: Zap,           label: "Rate Limiting",     desc: "AI 채팅 20 req/hour/user (Bucket4j 토큰 버킷)",             color: "#f97316" },
];

function SectionOverview() {
  return (
    <section id="overview" style={{ scrollMarginTop: 80 }}>
      <SectionTitle icon={Sparkles} title="Alpha-Helix 한눈에 보기" accent="#6366f1" />

      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 15, color: "#334155", lineHeight: 1.8, margin: "0 0 16px" }}>
          <strong>Alpha-Helix</strong>는 자연어 프롬프트로 퀀트 전략을 구성하고,
          백테스트 → AI 검증 → 실주문까지 한 흐름으로 연결하는 <strong>AI 기반 퀀트 투자 워크스페이스</strong>입니다.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Tag color="#3b82f6">Spring Boot 4.0</Tag>
          <Tag color="#06b6d4">FastAPI (vectorbt)</Tag>
          <Tag color="#10b981">React 18 + Vite</Tag>
          <Tag color="#8b5cf6">Gemini 2.5-flash</Tag>
          <Tag color="#f59e0b">MySQL 8</Tag>
          <Tag color="#ec4899">KIS OpenAPI</Tag>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {FEATURES.map(({ icon: Icon, label, desc, color }) => (
          <div key={label} style={{
            background: "white", border: "1.5px solid #E5E7EB", borderRadius: 12,
            padding: "16px 18px", display: "flex", gap: 14,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, flexShrink: 0,
              background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon size={16} color={color} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.55 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <Card style={{ marginTop: 20, background: "linear-gradient(135deg, #EFF6FF, #F5F3FF)", border: "1px solid #BFDBFE" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e3a5f", marginBottom: 10 }}>전체 플로우</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {["Goal Chat", "전략 자동 생성", "백테스트", "Regime 분석", "Trust Score", "OrderProposal 큐", "KIS 실주문"].map((step, i, arr) => (
            <React.Fragment key={step}>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 20,
                background: "white", color: "#3b82f6", border: "1px solid #BFDBFE",
                boxShadow: "0 1px 4px rgba(59,130,246,0.1)",
              }}>{step}</span>
              {i < arr.length - 1 && <ArrowRight size={12} color="#94A3B8" />}
            </React.Fragment>
          ))}
        </div>
      </Card>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 섹션 2: 첫 워크스페이스 */
/* ─────────────────────────────────────────────────────────────────────────── */
function SectionWorkspace() {
  const steps = [
    {
      title: "Alpha-Helix 접속",
      desc: "좌측 사이드바의 전략 카드 아이콘(레이어 모양)을 클릭하거나, 홈 → '내 전략' 버튼으로 /alpha 페이지로 이동합니다.",
      sub: ["로그인 필요 — 우측 상단 또는 사이드바 하단에서 로그인"],
    },
    {
      title: "새 전략 만들기",
      desc: "워크스페이스 목록 화면에서 '+ New Strategy' 버튼을 클릭하거나, 좌측 전략 목록 하단의 '+ New Strategy'를 클릭합니다.",
      sub: ["전략 이름 입력 후 확인", "워크스페이스 상태: DRAFT로 시작"],
    },
    {
      title: "Goal Chat에서 목표 설정",
      desc: "워크스페이스가 열리면 AI 대화 탭이 기본으로 표시됩니다. 자연어로 투자 목표를 입력하면 AI가 전략 파라미터를 자동으로 제안합니다.",
      sub: ['예: "TQQQ와 SOXL로 레버리지 모멘텀 전략을 만들어줘. 월 수익률 3% 이상 목표."', "AI가 전략 유형·자산·파라미터를 JSON으로 생성"],
    },
    {
      title: "전략 카드에서 세부 설정",
      desc: "전략 카드 탭으로 이동하면 AI가 생성한 전략 파라미터를 시각적으로 편집할 수 있습니다.",
      sub: ["자산(티커), SMA/RSI/MACD 파라미터 조정", "'Formalize' 버튼으로 전략을 백테스트 가능 상태로 저장"],
    },
    {
      title: "백테스트 실행",
      desc: "상단의 'Backtest' 버튼을 클릭하면 vectorbt 엔진이 과거 데이터로 전략을 검증합니다.",
      sub: ["결과: 총 수익률, 연환산 수익률, Sharpe, MDD, 승률", "Full Report 버튼으로 QuantStats HTML Tearsheet 확인"],
    },
  ];

  return (
    <section id="workspace" style={{ scrollMarginTop: 80 }}>
      <SectionTitle icon={Layers} title="첫 워크스페이스 만들기" accent="#3b82f6" />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {steps.map((s, i) => (
          <Card key={i} style={{ display: "flex", gap: 16 }}>
            <StepBadge n={i + 1} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>{s.title}</div>
              <div style={{ fontSize: 13.5, color: "#475569", lineHeight: 1.7, marginBottom: s.sub.length ? 10 : 0 }}>{s.desc}</div>
              {s.sub.map((sub, j) => (
                <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                  <CheckCircle2 size={13} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: "#64748B", lineHeight: 1.6 }}>{sub}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 섹션 3: Goal Chat */
/* ─────────────────────────────────────────────────────────────────────────── */
function SectionGoalChat() {
  const examples = [
    { input: "연 수익률 15% 이상을 목표로 SPY를 활용한 이동평균 전략을 만들어줘.", tag: "SMA 크로스오버" },
    { input: "TQQQ와 SOXL로 레버리지 모멘텀 전략을 설계해줘. 변동성이 클 때 자동으로 현금으로 전환되게 해줘.", tag: "VIX 리스크 오프" },
    { input: "RSI 과매도 구간에서 매수하고 과매수에서 청산하는 평균회귀 전략을 QQQ로 만들어줘.", tag: "RSI 평균회귀" },
  ];

  return (
    <section id="goal-chat" style={{ scrollMarginTop: 80 }}>
      <SectionTitle icon={MessageSquare} title="Goal Chat (목표 → 전략)" accent="#8b5cf6" />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.8 }}>
          Goal Chat은 자연어 투자 목표를 <strong>구조화된 전략 JSON</strong>으로 변환하는 AI 대화창입니다.
          Gemini 2.5-flash 기반으로, 사용자의 목표·리스크 허용 범위·선호 자산을 파악하여
          전략 유형과 파라미터를 자동으로 제안합니다.
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", marginBottom: 12 }}>지원 전략 유형 (6가지)</div>
          {[
            ["SMA 크로스오버",     "단기/장기 이동평균 골든·데드크로스"],
            ["RSI 평균회귀",       "과매도 매수, 과매수 청산"],
            ["MACD 모멘텀",        "MACD/시그널 선 교차 신호"],
            ["VIX 리스크 오프",    "VIX 임계값 초과 시 전량 현금"],
            ["Buy & Hold",         "단순 장기 보유 벤치마크"],
            ["무한매수법",         "일정 비율 하락 시 분할 매수"],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F1F5F9" }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "#0F172A" }}>{name}</span>
              <span style={{ fontSize: 11, color: "#64748B" }}>{desc}</span>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", marginBottom: 12 }}>AI가 생성하는 전략 필드</div>
          {[
            ["strategy_name",   "전략 이름"],
            ["strategy_type",   "전략 유형 (6종)"],
            ["assets",          "자산 티커 배열"],
            ["parameters",      "SMA/RSI/MACD 등 수치 파라미터"],
            ["risk_profile",    "리스크 프로파일 (conservative/balanced/aggressive)"],
            ["target_return",   "목표 수익률"],
          ].map(([field, desc]) => (
            <div key={field} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid #F1F5F9" }}>
              <code style={{ fontSize: 11, color: "#6366f1", fontFamily: "monospace", whiteSpace: "nowrap", background: "#F5F3FF", padding: "1px 5px", borderRadius: 4 }}>{field}</code>
              <span style={{ fontSize: 11.5, color: "#64748B" }}>{desc}</span>
            </div>
          ))}
        </Card>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 10 }}>입력 예시</div>
        {examples.map((ex, i) => (
          <Card key={i} style={{ marginBottom: 10, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <MessageSquare size={14} color="#8b5cf6" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.6, marginBottom: 6 }}>"{ex.input}"</div>
                <Tag color="#8b5cf6">{ex.tag}</Tag>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <AlertTriangle size={15} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12.5, color: "#92400E", lineHeight: 1.7 }}>
            <strong>Tip:</strong> AI 채팅은 사용자당 <strong>20 req/hour</strong> 제한이 있습니다.
            전략 생성 후 '전략 카드' 탭에서 세부 파라미터를 수동으로 조정하면 추가 AI 호출 없이 수정할 수 있습니다.
          </div>
        </div>
      </Card>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 섹션 4: 전략 카드 편집 */
/* ─────────────────────────────────────────────────────────────────────────── */
function SectionConfig() {
  return (
    <section id="config" style={{ scrollMarginTop: 80 }}>
      <SectionTitle icon={Settings} title="전략 카드 편집" accent="#06b6d4" />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.8 }}>
          전략 카드 탭은 AI가 생성한 전략 설정을 <strong>시각적으로 수정</strong>하는 공간입니다.
          파라미터를 조정한 뒤 <strong>Formalize</strong> 버튼을 누르면 백테스트 가능 상태로 저장됩니다.
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 10 }}>편집 가능 항목</div>
          {[
            { label: "자산 (Ticker)", desc: "SPY, QQQ, TQQQ, SOXL 등 미국 주식·ETF", color: "#3b82f6" },
            { label: "SMA 파라미터", desc: "단기(Fast) / 장기(Slow) 이동평균 기간", color: "#8b5cf6" },
            { label: "RSI 파라미터", desc: "RSI 기간, 과매도 기준값, 과매수 기준값", color: "#10b981" },
            { label: "MACD 파라미터", desc: "Fast EMA / Slow EMA / Signal EMA 기간", color: "#f59e0b" },
            { label: "VIX 임계값", desc: "리스크 오프 전환 VIX 기준 (기본 25)", color: "#ef4444" },
            { label: "목표 수익률", desc: "전략의 목표 연간 수익률 (참고 지표)", color: "#06b6d4" },
          ].map(({ label, desc, color }) => (
            <div key={label} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid #F1F5F9" }}>
              <div style={{ width: 3, height: "auto", borderRadius: 2, background: color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{label}</div>
                <div style={{ fontSize: 11.5, color: "#64748B" }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 10 }}>워크스페이스 상태 흐름</div>
          {[
            { status: "DRAFT",       desc: "워크스페이스 생성 직후",                  color: "#94A3B8" },
            { status: "GOAL_SET",    desc: "Goal Chat에서 목표 설정 완료",            color: "#3b82f6" },
            { status: "FORMALIZED",  desc: "전략 카드 Formalize 버튼 클릭 후",       color: "#8b5cf6" },
            { status: "TESTED",      desc: "백테스트 실행 완료 (결과 저장됨)",       color: "#f59e0b" },
            { status: "LIVE",        desc: "OrderProposal 큐가 활성화된 운용 상태", color: "#10b981" },
          ].map(({ status, desc, color }) => (
            <div key={status} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #F1F5F9" }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                background: `${color}15`, color, border: `1px solid ${color}30`, whiteSpace: "nowrap",
              }}>{status}</span>
              <span style={{ fontSize: 12, color: "#64748B" }}>{desc}</span>
            </div>
          ))}
          <Card style={{ marginTop: 16, background: "#F0FDF4", border: "1px solid #BBF7D0", padding: "14px 16px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#14532d", marginBottom: 6 }}>Formalize 버튼이란?</div>
            <div style={{ fontSize: 12, color: "#166534", lineHeight: 1.65 }}>
              전략 파라미터를 백엔드에 저장하고 상태를 FORMALIZED로 변경합니다.
              Formalize 전까지는 백테스트 실행이 불가능합니다.
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 섹션 5: 백테스트 리포트 */
/* ─────────────────────────────────────────────────────────────────────────── */
function SectionBacktest() {
  const metrics = [
    { name: "총 수익률",      key: "total_return_pct",      desc: "백테스트 기간 전체 수익률 (예: +142.3%)",                                good: "0% 이상",   color: "#10b981" },
    { name: "연환산 수익률",  key: "annualized_return_pct", desc: "CAGR — 연간 복리 수익률",                                              good: "10%+",       color: "#10b981" },
    { name: "Sharpe 지수",   key: "sharpe",                 desc: "위험 대비 초과 수익. 1.0 이상이면 양호, 2.0+ 우수",                    good: "1.0+",       color: "#3b82f6" },
    { name: "최대낙폭 (MDD)", key: "max_drawdown_pct",      desc: "고점 대비 최대 하락폭. 낮을수록 안전. -30% 이하면 위험",                good: "-20% 이하",  color: "#ef4444" },
    { name: "승률",           key: "win_rate_pct",          desc: "전체 거래 중 수익 거래 비율",                                          good: "50%+",       color: "#f59e0b" },
    { name: "총 거래 횟수",   key: "trades",                desc: "백테스트 기간 동안 발생한 매매 횟수",                                  good: "참고용",     color: "#94A3B8" },
  ];

  return (
    <section id="backtest" style={{ scrollMarginTop: 80 }}>
      <SectionTitle icon={BarChart3} title="백테스트 리포트 보는 법" accent="#06b6d4" />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.8 }}>
          백테스트는 <strong>vectorbt</strong> 엔진으로 과거 5년 데이터를 사용하여 전략을 검증합니다.
          수수료 <strong>0.25%</strong>, 슬리피지 <strong>0.1%</strong>가 적용되어 실전에 가까운 수치를 제공합니다.
          yfinance로 가격 데이터를 수집하며, 결과는 QuantStats HTML Tearsheet로 저장됩니다.
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginBottom: 20 }}>
        {metrics.map(m => (
          <div key={m.name} style={{ background: "white", border: "1.5px solid #E5E7EB", borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{m.name}</div>
              <code style={{ fontSize: 10, color: m.color, background: `${m.color}15`, padding: "2px 6px", borderRadius: 4, fontFamily: "monospace" }}>{m.key}</code>
            </div>
            <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6, marginBottom: 8 }}>{m.desc}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: m.color }}>적정 기준: {m.good}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1e3a5f", marginBottom: 10 }}>
            <Play size={13} style={{ marginRight: 6 }} />Full Report (Tearsheet)
          </div>
          <div style={{ fontSize: 12.5, color: "#1e40af", lineHeight: 1.7 }}>
            워크스페이스 상단의 <strong>Full Report</strong> 버튼을 클릭하면
            QuantStats가 생성한 HTML 리포트를 새 탭에서 확인할 수 있습니다.
            연간 수익률 히트맵, 월별 수익률, 드로다운 분석 등 상세 통계가 포함됩니다.
          </div>
        </Card>
        <Card style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#14532d", marginBottom: 10 }}>
            <BarChart3 size={13} style={{ marginRight: 6 }} />수익률 커브 해석
          </div>
          <div style={{ fontSize: 12.5, color: "#166534", lineHeight: 1.7 }}>
            리포트 탭의 차트에서 <strong>파란 실선</strong>이 전략, <strong>회색 점선</strong>이 SPY 벤치마크입니다.
            파란 선이 회색 선보다 지속적으로 높으면 시장 대비 초과 수익이 발생한 것입니다.
          </div>
        </Card>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 섹션 6: Trust Score */
/* ─────────────────────────────────────────────────────────────────────────── */
function SectionTrustScore() {
  const subScores = [
    { name: "수익성 (Profitability)",  desc: "연환산 수익률, 총 수익률 기반. 20% CAGR 이상 시 만점",     weight: "40%", color: "#10b981" },
    { name: "안정성 (Stability)",      desc: "MDD, Sharpe 지수, 변동성 기반. 낮은 MDD일수록 고점수",    weight: "30%", color: "#3b82f6" },
    { name: "견고성 (Robustness)",     desc: "Walk-Forward 테스트, 파라미터 섭동 민감도 분석",          weight: "20%", color: "#8b5cf6" },
    { name: "적합성 (Regime Fit)",     desc: "현재 시장 Regime과의 전략 적합성 (5개 상태 분류)",        weight: "10%", color: "#f59e0b" },
  ];

  const tiers = [
    { label: "Stable",  range: "75 ~ 100", desc: "실전 운용 권장 수준",       color: "#10b981", bg: "#F0FDF4" },
    { label: "Normal",  range: "60 ~ 74",  desc: "운용 가능, 모니터링 필요",  color: "#3b82f6", bg: "#EFF6FF" },
    { label: "Caution", range: "0 ~ 59",   desc: "전략 재검토 권장",          color: "#f59e0b", bg: "#FFFBEB" },
  ];

  return (
    <section id="trust" style={{ scrollMarginTop: 80 }}>
      <SectionTitle icon={ShieldCheck} title="Trust Score 의미" accent="#10b981" />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.8 }}>
          Trust Score는 전략의 신뢰도를 <strong>0~100점</strong>으로 표현하는 종합 지표입니다.
          백테스트 완료 후 Trust 탭에서 계산 버튼을 실행하면, 4개 서브스코어를 가중합산하여 최종 점수를 산출합니다.
        </div>
      </Card>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 12 }}>서브스코어 구성</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {subScores.map(s => (
            <Card key={s.name} style={{ display: "flex", gap: 16, padding: "16px 20px" }}>
              <div style={{ textAlign: "center", width: 48, flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.weight}</div>
                <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600 }}>가중치</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>{s.name}</div>
                <div style={{ fontSize: 12.5, color: "#64748B", lineHeight: 1.6 }}>{s.desc}</div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        {tiers.map(t => (
          <div key={t.label} style={{
            flex: 1, background: t.bg, border: `1.5px solid ${t.color}30`, borderRadius: 12,
            padding: "16px 18px", textAlign: "center",
          }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8,
              background: "white", border: `1px solid ${t.color}30`, borderRadius: 999,
              padding: "4px 12px",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.color, display: "inline-block" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: t.color }}>{t.label}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.color, marginBottom: 4 }}>{t.range}점</div>
            <div style={{ fontSize: 11.5, color: "#64748B" }}>{t.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 섹션 7: 주문 제안 승인 큐 */
/* ─────────────────────────────────────────────────────────────────────────── */
function SectionOrders() {
  const flow = [
    { step: "시그널 생성",   desc: "매일 22:30 KST, 전략 상태가 LIVE인 워크스페이스에 대해 XGBoost 모델이 매수/매도 시그널을 생성합니다.",         icon: Activity,   color: "#6366f1" },
    { step: "OrderProposal", desc: "생성된 시그널이 주문 제안 큐(OrderProposal 테이블)에 저장됩니다. 상태는 PENDING으로 시작합니다.",               icon: Inbox,      color: "#3b82f6" },
    { step: "승인 알림",     desc: "사용자에게 알림이 전송됩니다. HMAC 서명이 포함된 단일 클릭 승인 링크가 이메일로 발송됩니다.",                   icon: Clock,      color: "#f59e0b" },
    { step: "MOCK 시뮬레이션", desc: "승인 전 모든 주문은 MOCK 계좌에서 먼저 시뮬레이션됩니다. 실제 자금은 사용되지 않습니다.",                    icon: Play,       color: "#10b981" },
    { step: "사용자 최종 승인", desc: "MOCK 결과 확인 후 사용자가 명시적으로 실주문을 승인해야 합니다. Kill-Switch로 전체 주문을 즉시 중단 가능합니다.", icon: CheckCircle2, color: "#10b981" },
    { step: "KIS 실주문 전송", desc: "승인된 주문이 한국투자증권 OpenAPI로 전송됩니다. 모의/실거래 계좌 모두 지원합니다.",                          icon: Wallet,     color: "#ec4899" },
  ];

  return (
    <section id="orders" style={{ scrollMarginTop: 80 }}>
      <SectionTitle icon={Inbox} title="주문 제안 승인 큐" accent="#6366f1" />

      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.8 }}>
          OrderProposal 큐는 <strong>모든 실주문을 사용자 승인 후에만 집행</strong>하는 안전 게이트입니다.
          MOCK 선행 → 사용자 명시 승인 → KIS 실주문의 3단계 검증 구조로 되어 있습니다.
        </div>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        {flow.map((f, i) => (
          <Card key={i} style={{ display: "flex", gap: 16, padding: "16px 20px" }}>
            <StepBadge n={i + 1} color={f.color} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <f.icon size={14} color={f.color} />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{f.step}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "#64748B", lineHeight: 1.65 }}>{f.desc}</div>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card style={{ background: "#FFF5F5", border: "1px solid #FECACA" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#7f1d1d", marginBottom: 8 }}>
            ⚠ Kill-Switch (글로벌 중단)
          </div>
          <div style={{ fontSize: 12, color: "#991b1b", lineHeight: 1.65 }}>
            계좌·주문 탭에서 Kill-Switch를 활성화하면 모든 워크스페이스의 신규 주문이 즉시 중단됩니다.
            시장 급락 등 비상 상황에서 사용하세요.
          </div>
        </Card>
        <Card style={{ background: "#F5F3FF", border: "1px solid #DDD6FE" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#4c1d95", marginBottom: 8 }}>
            TTL 만료 자동 정리
          </div>
          <div style={{ fontSize: 12, color: "#5b21b6", lineHeight: 1.65 }}>
            승인 링크는 24시간 TTL이 적용됩니다. 만료된 PENDING 주문은
            스케줄러가 자동으로 EXPIRED 상태로 변경하고 알림을 발송합니다.
          </div>
        </Card>
      </div>

      <Card style={{ marginTop: 14, background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>
          주문 제안 큐 접근 경로
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#1e40af" }}>좌측 사이드바</span>
          <ChevronRight size={12} color="#94A3B8" />
          <Tag color="#6366f1">주문 제안 큐 (Inbox 아이콘)</Tag>
          <ChevronRight size={12} color="#94A3B8" />
          <span style={{ fontSize: 12, color: "#1e40af" }}>또는</span>
          <ChevronRight size={12} color="#94A3B8" />
          <code style={{ fontSize: 11, color: "#3b82f6", background: "#DBEAFE", padding: "2px 7px", borderRadius: 4 }}>/alpha/proposals</code>
        </div>
      </Card>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 메인 컴포넌트 */
/* ─────────────────────────────────────────────────────────────────────────── */
export default function AlphaGuide() {
  const location = useLocation();
  const sectionRefs = useRef({});
  const [activeSection, setActiveSection] = useState("overview");

  // 해시 기반 자동 스크롤
  useEffect(() => {
    const hash = location.hash.replace("#", "");
    if (hash && sectionRefs.current[hash]) {
      setTimeout(() => {
        sectionRefs.current[hash]?.scrollIntoView({ behavior: "smooth" });
        setActiveSection(hash);
      }, 100);
    }
  }, [location.hash]);

  // Intersection Observer로 사이드바 현재 섹션 하이라이트
  useEffect(() => {
    const observers = [];
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { rootMargin: "-60px 0px -70% 0px", threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach(o => o.disconnect());
  }, []);

  const scrollTo = (id) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth" });
    setActiveSection(id);
    window.history.replaceState(null, "", `#${id}`);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: F }}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #1e1b4b 0%, #1d4ed8 50%, #0ea5e9 100%)",
        padding: "72px 40px 64px", textAlign: "center",
      }}>
        <div style={{
          maxWidth: 760, margin: "0 auto",
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 20, padding: "36px 40px",
          backdropFilter: "blur(8px)",
        }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 16,
            background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 20, padding: "6px 16px" }}>
            <BookOpen size={14} color="#93c5fd" />
            <span style={{ fontSize: 12, color: "#93c5fd", fontWeight: 700 }}>이용 가이드</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: "white", margin: "0 0 12px", lineHeight: 1.2 }}>
            Alpha-Helix 가이드
          </h1>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.75)", margin: 0 }}>
            AI 기반 퀀트 투자 워크스페이스 — 전략 설계부터 실주문까지
          </p>
        </div>
      </div>

      {/* ── 본문 (사이드 nav + 섹션 콘텐츠) ──────────────────────────────── */}
      <div style={{
        maxWidth: 1140, margin: "0 auto", padding: "48px 20px 80px",
        display: "grid", gridTemplateColumns: "220px 1fr", gap: 36,
      }}>
        {/* 사이드 nav */}
        <nav style={{ position: "sticky", top: 80, height: "fit-content" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
            목차
          </div>
          {SECTIONS.map(({ id, label, Icon }) => {
            const active = activeSection === id;
            return (
              <button key={id} onClick={() => scrollTo(id)} style={{
                width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 9,
                padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                background: active ? "#EFF6FF" : "transparent",
                color: active ? "#1d4ed8" : "#64748B",
                fontSize: 12.5, fontWeight: active ? 700 : 500,
                borderLeft: `2px solid ${active ? "#3b82f6" : "transparent"}`,
                transition: "all 0.12s",
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "#F8FAFC"; e.currentTarget.style.color = "#334155"; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#64748B"; } }}
              >
                <Icon size={12} />
                {label}
              </button>
            );
          })}
        </nav>

        {/* 섹션 콘텐츠 */}
        <main style={{ display: "flex", flexDirection: "column", gap: 56 }}>
          {[
            { id: "overview",  Component: SectionOverview },
            { id: "workspace", Component: SectionWorkspace },
            { id: "goal-chat", Component: SectionGoalChat },
            { id: "config",    Component: SectionConfig },
            { id: "backtest",  Component: SectionBacktest },
            { id: "trust",     Component: SectionTrustScore },
            { id: "orders",    Component: SectionOrders },
          ].map(({ id, Component }) => (
            <div key={id} ref={el => sectionRefs.current[id] = el}>
              <Component />
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
