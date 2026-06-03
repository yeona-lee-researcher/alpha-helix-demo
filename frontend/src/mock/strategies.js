// Alpha-Helix · 실전 운영 중인 3가지 전략 스펙
// 사용자가 2024년 1월부터 4억 원으로 운영 중인 실제 포지션을 정의한다.
// 백테스트/오늘의 시그널/Trust Score는 lib/backtest.js + lib/marketData.js
// 가 이 스펙을 입력으로 받아 실시간으로 산출한다 (mock 값 아님).

export const PORTFOLIO_START_DATE = "2024-01-02";
export const TOTAL_PRINCIPAL_KRW = 400_000_000; // 4억
export const USD_KRW_AT_START = 1300;            // 2024-01 환산 기준 (단순 환산)

/**
 * method 종류:
 *  - "infiniteBuy"      : LOC 무한매수법 (40분할 정액 + 평단/+10~15% LOC 매도)
 *  - "valueRebalancing" : VR 매수법 (2주 단위 V값 기준 ±20% 밴드)
 */
export const STRATEGY_SPECS = [
  {
    id: "STR-TQQQ-INF",
    name: "TQQQ 무한매수법",
    method: "infiniteBuy",
    ticker: "TQQQ",
    benchmark: "QQQ",
    principalKRW: 200_000_000,        // 2억
    startDate: PORTFOLIO_START_DATE,
    regime: "LEVERAGED · NDX 3X",
    goal: "나스닥100 3X 레버리지를 40분할 LOC 정액매수로 변동성 흡수, +10% 익절 후 자동 리셋",
    params: {
      splits: 40,                     // 원금 40분할
      sellTargetPct: 10,              // 평단 +10% 지정가 매도
      locUpperPct: 12,                // 평단 +12% LOC 큰수매수 (10~15% 중간)
      firstBuyShares: 1,              // 첫날 1주 매수
    },
  },
  {
    id: "STR-SOXL-INF",
    name: "SOXL 무한매수법",
    method: "infiniteBuy",
    ticker: "SOXL",
    benchmark: "SOXX",
    principalKRW: 50_000_000,         // 5천만
    startDate: PORTFOLIO_START_DATE,
    regime: "LEVERAGED · SEMIS 3X",
    goal: "미국 반도체 3X 레버리지를 40분할 LOC 정액매수로 운영, 사이클 변동성 분산",
    params: {
      splits: 40,
      sellTargetPct: 10,
      locUpperPct: 13,
      firstBuyShares: 1,
    },
  },
  {
    id: "STR-QLD-VR",
    name: "QLD 밸류 리밸런싱(VR)",
    method: "valueRebalancing",
    ticker: "QLD",
    benchmark: "QQQ",
    principalKRW: 150_000_000,        // 1억 5천
    startDate: PORTFOLIO_START_DATE,
    regime: "LEVERAGED · NDX 2X",
    goal: "QLD(나스닥100 2X)를 2주 단위 V값 기준 ±20% 범위 매매로 감정매매 차단",
    params: {
      rebalanceDays: 10,              // 2주(영업일 10일) 단위
      expectedReturn: 0.02,           // 기대수익률 2% per period
      bandPct: 0.20,                  // 상·하단 ±20%
      poolTargetPct: 0.50,            // Pool은 평가금의 50% 유지
      biweeklyContribKRW: 0,          // 추가 적립 없음 (1.5억 일시 운용)
      initialPoolPct: 0.50,           // 시작 시 절반은 Pool, 절반은 매수
    },
  },
];

// Trust Score 등급표
export function trustScoreLabel(score) {
  if (score >= 85) return { label: "Diamond", color: "#0EA5E9" };
  if (score >= 75) return { label: "Platinum", color: "#6366F1" };
  if (score >= 65) return { label: "Gold",     color: "#F59E0B" };
  if (score >= 55) return { label: "Silver",   color: "#94A3B8" };
  return              { label: "Seed",     color: "#64748B" };
}

// Trust Score 산식: MDD가 낮고 CAGR이 높을수록 점수 ↑ (운영 안정성 위주)
export function computeTrustScore({ cagrPct, mddPct, winRate }) {
  const c = Number.isFinite(cagrPct) ? cagrPct : 0;
  const m = Number.isFinite(mddPct) ? Math.abs(mddPct) : 50;
  const w = Number.isFinite(winRate) ? winRate : 0.5;
  const raw = 70 - m * 0.7 + c * 0.4 + (w - 0.5) * 30;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function krwFmt(krw) {
  if (!Number.isFinite(krw)) return "-";
  if (Math.abs(krw) >= 1e8) return `${(krw / 1e8).toFixed(2)}억`;
  if (Math.abs(krw) >= 1e4) return `${(krw / 1e4).toFixed(0)}만`;
  return `${Math.round(krw).toLocaleString()}원`;
}
