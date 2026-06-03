// frontend/src/lib/strategiesApi.js
// 백엔드 /api/strategies 래퍼. 쿠키 기반 인증(withCredentials: true)은 axios 인스턴스가 처리.
import api from "../api/axios";

export async function fetchMyStrategies() {
  const { data } = await api.get("/strategies");
  return data;
}

export async function fetchLatestSignals() {
  const { data } = await api.get("/strategies/me/latest-signals");
  return data;
}

export async function fetchSummaries() {
  const { data } = await api.get("/strategies/me/summaries");
  return data;
}

export async function seedDefaultStrategies() {
  const { data } = await api.post("/strategies/seed");
  return data;
}

export async function seedLeveragedUniverse() {
  const { data } = await api.post("/strategies/seed-leveraged");
  return data;
}

export async function runBacktestAll() {
  const { data } = await api.post("/strategies/me/backtest-all");
  return data;
}

export async function runBacktestOne(strategyId) {
  const { data } = await api.post(`/strategies/${strategyId}/backtest`);
  return data;
}

export async function fetchTrades(strategyId, source = "BACKTEST") {
  const { data } = await api.get(`/strategies/${strategyId}/trades`, { params: { source } });
  return data;
}

/**
 * 홈 화면용 통합 로더.
 * 1) 전략 목록 조회 → 비어있으면 seed 1회
 * 2) summary + latest signal 병합 후 카드용 형태로 변환
 * 3) summary가 비어있으면 자동 backtest-all 트리거
 */
export async function loadHomeStrategies() {
  let strategies = await fetchMyStrategies();
  if (!strategies || strategies.length === 0) {
    await seedDefaultStrategies();
    strategies = await fetchMyStrategies();
  }
  let [summaries, signals] = await Promise.all([fetchSummaries(), fetchLatestSignals()]);
  if (!summaries || summaries.length === 0) {
    await runBacktestAll();
    [summaries, signals] = await Promise.all([fetchSummaries(), fetchLatestSignals()]);
  }
  const sumByStrat = new Map(summaries.map(s => [s.strategyId ?? s.strategy?.id, s]));
  const sigByStrat = new Map(signals.map(s => [s.strategyId ?? s.strategy?.id, s]));
  return strategies.map(s => ({
    spec: {
      id: s.id,
      code: s.code,
      name: s.name,
      ticker: s.ticker,
      regime: s.regime,
      goal: s.goal,
      principalKRW: s.principalKrw,
      method: s.method,
    },
    summary: sumByStrat.get(s.id) || null,
    todaySignal: sigByStrat.get(s.id) || null,
  }));
}
