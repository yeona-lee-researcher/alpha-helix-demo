/**
 * 좌측 사이드바: 현재 탭에 맞는 짧은 안내
 */
export default function TabHelpCard({ tab, theme }) {
  const TIPS = {
    chat: {
      title: "💬 AI 대화 가이드",
      body: "8가지 항목을 자유롭게 답해주세요. '⭐ 예시 양식' 버튼으로 한 번에 채울 수도 있어요. 다 답하면 자동으로 Goal Profile이 생성됩니다.",
    },
    config: {
      title: "🧩 전략 카드 가이드",
      body: "Goal Profile은 클릭해서 바로 수정할 수 있어요. AI Chat에서 '월 적립금을 200만원으로 바꿔줘' 처럼 말해도 됩니다. 후보 중 하나를 선택해 백테스트를 실행하세요.",
    },
    report: {
      title: "📊 Backtest 가이드",
      body: "기간을 1y / 5y / 10y / max 중 선택해 실행. 위쪽 추세 차트에서 SMA 20·50·200 선을 마우스 hover하면 값이 나옵니다.",
    },
    regime: {
      title: "📡 Regime 가이드",
      body: "200일 추세 + 60일 변동성으로 시장을 4국면(상승/하락/횡보/고변동)으로 자동 분류합니다. 각 국면별 Sharpe·MDD를 확인하세요.",
    },
    trust: {
      title: "🛡️ Trust Score 가이드",
      body: "5가지 세부 점수(일반화·국면·파라미터·리스크·통계)에 가중평균. ?에 마우스 올리면 설명이 떠요. 13점 같은 낮은 점수는 전략 재설계 필요.",
    },
    log: {
      title: "📜 Decision Log 가이드",
      body: "사용자 입력·LLM 응답·자동 실행 결과가 시간순으로 쌓입니다. 어떤 결정이 언제 됐는지 추적용으로 쓰세요.",
    },
  };
  const tip = TIPS[tab] || TIPS.chat;
  return (
    <div style={{
      padding: 12, borderRadius: 10,
      background: "linear-gradient(135deg,#eff6ff 0%,#e0e7ff 100%)",
      border: "1px solid #bfdbfe",
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#1e3a8a", marginBottom: 6 }}>
        {tip.title}
      </div>
      <div style={{ fontSize: 11.5, color: "#1e40af", lineHeight: 1.55 }}>
        {tip.body}
      </div>
    </div>
  );
}
