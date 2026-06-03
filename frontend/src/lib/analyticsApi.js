import api from "../api/axios";

export async function fetchAnalyticsHealth() {
  const { data } = await api.get("/analytics/health");
  return data;
}

export async function runBacktest({ ticker, period = "5y", strategy = "sma_cross", sma_fast = 20, sma_slow = 60 }) {
  const { data } = await api.post("/analytics/backtest", { ticker, period, strategy, sma_fast, sma_slow });
  return data;
}

export async function fetchTodaySignals({ tickers, strategy = "sma_cross", include_ml = true }) {
  const { data } = await api.post("/analytics/signals/today", { tickers, strategy, include_ml });
  return data.signals;
}

export async function trainModel(ticker) {
  const { data } = await api.post("/analytics/models/train", { ticker });
  return data;
}

export async function runWalkForward(ticker, strategy = "sma_cross") {
  const { data } = await api.post("/analytics/robust/walk-forward", { ticker, strategy });
  return data;
}
