/**
 * TrustScore.jsx
 * 신뢰 점수 대시보드 컴포넌트
 *
 * @typedef {{ key: string, label: string, score: number }} MetricItem
 * @typedef {{ type: 'strength'|'weakness', title: string, score: number, body: string }} StrengthCard
 * @typedef {{
 *   score: number,
 *   grade: string,
 *   penaltyLabel?: string,
 *   description: string,
 *   cards: StrengthCard[],
 *   metrics: MetricItem[],
 *   alertMessage?: string,
 * }} TrustScoreProps
 */

import React from "react";
import { Award, Wrench, Minus, AlertTriangle } from "lucide-react";

// ─── 점수별 색상 (프로젝트 팔레트 기준) ──────────────────────
function getScoreColor(score) {
  if (score >= 80) return "#10B981";  // emerald
  if (score >= 50) return "#3B82F6";  // accent blue
  if (score >= 20) return "#F59E0B";  // amber
  return "#DC2626";                   // danger red
}

// ─── 원형 게이지 ──────────────────────────────────────────────
function CircleGauge({ score }) {
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex-shrink-0" style={{ width: 110, height: 110 }}>
      <svg width="110" height="110" viewBox="0 0 110 110" fill="none">
        <circle cx="55" cy="55" r={r} stroke="#E2E8F0" strokeWidth="8" fill="none" />
        <circle
          cx="55" cy="55" r={r}
          stroke="#3B82F6" strokeWidth="8" fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 55 55)"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-medium leading-none">{score}</span>
        <span className="text-xs text-gray-400 mt-1">/ 100</span>
      </div>
    </div>
  );
}

// ─── 메트릭 카드 ──────────────────────────────────────────────
function MetricCard({ item }) {
  const color = getScoreColor(item.score);
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5">
      <p className="text-xs text-gray-400 mb-1.5 truncate">{item.label}</p>
      <p className="text-base font-medium mb-1.5" style={{ color }}>{item.score}</p>
      <div className="h-0.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-0.5 rounded-full"
          style={{ width: `${item.score}%`, background: color, transition: "width 0.6s ease" }}
        />
      </div>
    </div>
  );
}

// ─── 강점/보완 카드 ───────────────────────────────────────────
function StrengthWeaknessCard({ card }) {
  const isStrength = card.type === "strength";
  const cardBg       = isStrength ? "#f0fdf4" : "#fff5f5";
  const borderColor  = isStrength ? "#bbf7d0" : "#fecaca";
  const iconBg       = isStrength ? "#d1fae5" : "#fee2e2";
  const iconColor    = isStrength ? "#15803d" : "#dc2626";
  const badgeBg      = isStrength ? "#d1fae5" : "#fee2e2";
  const badgeText    = isStrength ? "#064e3b" : "#991b1b";
  const Icon         = isStrength ? Award : Wrench;

  const [desc, evidence] = (() => {
    const idx = card.body.indexOf("근거:");
    if (idx === -1) return [card.body.trim(), null];
    return [card.body.slice(0, idx).trim(), card.body.slice(idx + 3).trim()];
  })();

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2.5"
      style={{ background: cardBg, border: `1px solid ${borderColor}` }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg }}
        >
          <Icon size={14} color={iconColor} />
        </div>
        <p className="text-sm font-medium m-0 flex-1">{card.title}</p>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full ml-auto"
          style={{ background: badgeBg, color: badgeText }}
        >
          {card.score}점
        </span>
      </div>
      {desc && <p className="text-xs text-gray-500 leading-relaxed m-0">{desc}</p>}
      {evidence && (
        <div className="flex flex-col gap-1 pt-2" style={{ borderTop: `1px dashed ${borderColor}` }}>
          <span className="text-xs font-semibold" style={{ color: iconColor }}>근거</span>
          <p className="text-xs leading-relaxed m-0" style={{ color: "#64748B" }}>{evidence}</p>
        </div>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────
/**
 * @param {TrustScoreProps} props
 */
export default function TrustScore({ score, grade, penaltyLabel, description, cards, metrics, alertMessage }) {
  return (
    <div className="flex flex-col gap-4">

      {/* ① 게이지 + 요약 */}
      <div className="grid gap-5 items-center bg-white border border-gray-200 rounded-xl px-6 py-5"
        style={{ gridTemplateColumns: "auto 1fr" }}>
        <CircleGauge score={score} />
        <div className="flex flex-col gap-2.5">
          <p className="text-xs text-gray-400 tracking-widest uppercase m-0">신뢰 점수 (Trust Score)</p>
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1"
              style={{ background: "#DBEAFE", color: "#1D4ED8" }}>
              <Minus size={11} /> {grade}
            </span>
            {penaltyLabel && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1"
                style={{ background: "#FEF3C7", color: "#92400E" }}>
                <AlertTriangle size={11} /> {penaltyLabel}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 leading-relaxed m-0">{description}</p>
        </div>
      </div>

      {/* ② 강점/보완 카드 */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {cards.map((card, i) => <StrengthWeaknessCard key={i} card={card} />)}
        </div>
      )}

      {/* ③ 메트릭 바 */}
      {metrics.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${metrics.length}, 1fr)` }}>
          {metrics.map((m) => <MetricCard key={m.key} item={m} />)}
        </div>
      )}

      {/* ④ 경고 */}
      {alertMessage && (
        <div className="flex gap-2.5 items-start rounded-lg px-3.5 py-2.5"
          style={{ background: "#FEF3C7", border: "1px solid #FCD34D" }}>
          <AlertTriangle size={15} color="#92400E" className="flex-shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed m-0" style={{ color: "#92400E" }}>{alertMessage}</p>
        </div>
      )}
    </div>
  );
}
