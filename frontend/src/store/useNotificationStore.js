import { create } from "zustand";
import { persist } from "zustand/middleware";

function buildInitial() {
  const t = Date.now();
  return [
    {
      id: 1, type: "strategy", read: false,
      title: "전략 정형화 완료",
      body: "RSI + MACD 복합 전략이 성공적으로 정형화되었습니다. 백테스트를 실행해보세요.",
      time: new Date(t - 5 * 60_000).toISOString(),
    },
    {
      id: 2, type: "backtest", read: false,
      title: "백테스트 실행 완료",
      body: "SPY 5년 백테스트 결과 — CAGR 14.2%, MDD -18.3%, Sharpe 1.34",
      time: new Date(t - 23 * 60_000).toISOString(),
    },
    {
      id: 3, type: "regime", read: false,
      title: "시장 국면 전환 감지",
      body: "Bull → Neutral 국면 전환 감지. 보유 전략 리밸런싱을 검토해보세요.",
      time: new Date(t - 2 * 3_600_000).toISOString(),
    },
    {
      id: 4, type: "briefing", read: true,
      title: "오늘의 Living Briefing 도착",
      body: "AI가 오늘의 시장 흐름과 전략 성과를 분석했습니다. 지금 확인해보세요.",
      time: new Date(t - 8 * 3_600_000).toISOString(),
    },
    {
      id: 5, type: "trust", read: true,
      title: "Trust Score 상승",
      body: "전략 신뢰도 68 → 74점 상승. Walk-forward 강건성 검증 통과.",
      time: new Date(t - 86_400_000).toISOString(),
    },
    {
      id: 6, type: "system", read: true,
      title: "Pro 플랜 갱신 예정",
      body: "구독이 3일 후 자동 갱신됩니다. 결제 수단을 확인해주세요.",
      time: new Date(t - 2 * 86_400_000).toISOString(),
    },
    {
      id: 7, type: "strategy", read: true,
      title: "전략 템플릿 업데이트",
      body: "볼린저 밴드 + 모멘텀 복합 전략 템플릿이 마켓에 추가되었습니다.",
      time: new Date(t - 3 * 86_400_000).toISOString(),
    },
  ];
}

export const useNotificationStore = create(
  persist(
    (set) => ({
      notifications: buildInitial(),
      markRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),
      markAllRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        })),
      remove: (id) =>
        set((s) => ({
          notifications: s.notifications.filter((n) => n.id !== id),
        })),
      clearAll: () => set({ notifications: [] }),
    }),
    { name: "alpha-notifications" }
  )
);
