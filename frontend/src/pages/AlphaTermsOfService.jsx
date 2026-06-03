import { useEffect } from "react";

const F = "'Inter', 'Pretendard', 'Noto Sans KR', sans-serif";

export default function AlphaTermsOfService() {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "서비스 이용약관 | Alpha-Helix";
  }, []);

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", fontFamily: F }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "52px 24px 96px" }}>
        <div style={{ marginBottom: 44 }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: "#0F172A", margin: "0 0 8px", fontFamily: F }}>
            서비스 이용약관
          </h1>
          <p style={{ fontSize: 14, color: "#94A3B8", margin: 0 }}>
            Terms of Service · 최종 업데이트: 2026년 1월 1일
          </p>
        </div>

        <Section title="제1조 (목적)">
          <p>
            본 약관은 Alpha-Helix(이하 "서비스")가 제공하는 AI 기반 퀀트 투자 워크스페이스 서비스의
            이용 조건 및 절차, 서비스 이용자(이하 "사용자")와 서비스 간의 권리·의무 및 책임 사항을
            규정함을 목적으로 합니다.
          </p>
        </Section>

        <Section title="제2조 (서비스 개요)">
          <p>Alpha-Helix는 다음의 서비스를 제공합니다:</p>
          <ul>
            <li>자연어 기반 퀀트 투자 전략 구성 및 AI 대화 지원</li>
            <li>vectorbt 기반 백테스트 엔진 (7가지 전략 + 무한매수법)</li>
            <li>Trust Score 분석 (Walk-Forward · Regime HMM · 파라미터 섭동)</li>
            <li>한국투자증권(KIS) OpenAPI 연동을 통한 모의투자 및 실거래 주문 제안</li>
            <li>주문 제안 승인 큐 (HMAC 이메일 인증 기반)</li>
            <li>구독 플랜별 기능 접근 (FREE / STANDARD / PREMIUM / EXPERT)</li>
          </ul>
        </Section>

        <Section title="제3조 (회원가입 및 계정)">
          <ul>
            <li>서비스는 Google OAuth, 카카오 OAuth 또는 이메일을 통한 회원가입을 지원합니다.</li>
            <li>사용자는 정확한 정보를 제공해야 하며, 허위 정보 입력 시 서비스 이용이 제한될 수 있습니다.</li>
            <li>계정 보안 정보(비밀번호 등)의 관리 책임은 사용자에게 있습니다.</li>
            <li>1인 1계정 원칙을 준수해야 합니다.</li>
          </ul>
        </Section>

        <Section title="제4조 (투자 관련 면책 — 필독)">
          <div style={{ padding: "16px 20px", background: "#FEF9C3", borderRadius: 10, borderLeft: "4px solid #EAB308", marginBottom: 16 }}>
            <strong style={{ color: "#713F12", fontSize: 15 }}>⚠ 투자 책임 고지</strong>
            <p style={{ margin: "8px 0 0", color: "#78350F", fontSize: 14, lineHeight: 1.8 }}>
              Alpha-Helix가 제공하는 백테스트 결과, Trust Score, AI 전략 제안, 주문 제안(OrderProposal)은
              <strong> 투자 권유가 아니며 참고 정보</strong>입니다. 과거 성과가 미래 수익을 보장하지 않습니다.
              모든 투자 결정과 그에 따른 손익은 전적으로 사용자 본인의 책임입니다.
            </p>
          </div>
          <ul>
            <li>서비스는 투자 자문업자가 아니며, 제공되는 정보는 투자 자문으로 해석될 수 없습니다.</li>
            <li>실거래 주문은 사용자가 HMAC 승인 링크를 통해 명시적으로 승인한 경우에만 실행됩니다.</li>
            <li>서비스는 KIS 실주문 결과에 대한 법적 책임을 지지 않습니다.</li>
          </ul>
        </Section>

        <Section title="제5조 (KIS OpenAPI 연동)">
          <ul>
            <li>KIS API 키는 사용자가 직접 발급하여 등록하며, AES-GCM 암호화 후 DB에 저장됩니다.</li>
            <li>모의투자와 실거래는 명시적으로 구분되며, 모의투자 설정에서는 실주문이 발생하지 않습니다.</li>
            <li>글로벌 Kill-Switch가 활성화된 경우 모든 실주문이 서버 레벨에서 차단됩니다.</li>
            <li>주문 제안 승인 이메일 링크는 발급 후 일정 시간이 지나면 자동 만료됩니다.</li>
            <li>서비스는 KIS API 장애, 네트워크 오류, 한국투자증권 정책 변경으로 인한 주문 미체결에 대해 책임을 지지 않습니다.</li>
          </ul>
        </Section>

        <Section title="제6조 (구독 플랜)">
          <ul>
            <li>서비스는 FREE, STANDARD, PREMIUM, EXPERT 플랜을 제공합니다.</li>
            <li>유료 플랜 결제는 Toss Payments를 통해 처리되며, 결제 취소·환불은 관련 법령 및 서비스 환불 정책에 따릅니다.</li>
            <li>플랜별 기능 범위는 서비스 내 안내 페이지에서 확인할 수 있으며, 사전 공지 후 변경될 수 있습니다.</li>
          </ul>
        </Section>

        <Section title="제7조 (사용자의 의무)">
          <p>사용자는 다음 행위를 하여서는 안 됩니다:</p>
          <ul>
            <li>타인의 계정 정보 또는 KIS API 키를 도용하는 행위</li>
            <li>서비스를 통해 시장 조작, 불공정 거래 등 금융 관련 법령을 위반하는 행위</li>
            <li>서비스의 정상적인 운영을 방해하거나 역공학(reverse engineering)하는 행위</li>
            <li>AI 시스템을 악용하거나 과도한 요청으로 서비스 안정성을 해치는 행위</li>
            <li>관련 법령을 위반하는 일체의 행위</li>
          </ul>
        </Section>

        <Section title="제8조 (AI 서비스 이용)">
          <ul>
            <li>AI 대화 기능은 사용자별 시간당 20회 요청으로 제한됩니다 (플랜별 차등 적용 가능).</li>
            <li>AI가 제안하는 전략 파라미터는 참고 정보이며, 최종 전략 설정 및 주문 결정은 사용자의 판단에 따릅니다.</li>
            <li>AI 응답 품질은 LLM 제공자(Gemini, OpenAI, Anthropic 등)의 정책 및 상태에 따라 달라질 수 있습니다.</li>
          </ul>
        </Section>

        <Section title="제9조 (서비스 중단 및 변경)">
          <ul>
            <li>시스템 점검, 장애, 기타 불가피한 사유로 서비스가 일시적으로 중단될 수 있습니다.</li>
            <li>서비스 기능이나 약관이 변경되는 경우 시행 7일 전 서비스 내 공지사항을 통해 안내합니다.</li>
          </ul>
        </Section>

        <Section title="제10조 (개인정보 처리)">
          <p>
            사용자의 개인정보는{" "}
            <a href="/alpha_privacy" style={{ color: "#4F46E5", textDecoration: "underline" }}>
              개인정보처리방침
            </a>
            에 따라 처리됩니다.
          </p>
        </Section>

        <Section title="제11조 (준거법 및 분쟁 해결)">
          <ul>
            <li>본 약관은 대한민국 법률에 따라 해석됩니다.</li>
            <li>서비스 이용과 관련한 분쟁은 상호 협의를 우선하며, 협의가 이루어지지 않을 경우 관련 법령에 따른 관할 법원에 소를 제기할 수 있습니다.</li>
          </ul>
        </Section>

        <Section title="문의처">
          <p>
            약관 관련 문의사항은 아래로 연락 바랍니다.<br />
            이메일: <a href="mailto:wngusgkgus@gmail.com" style={{ color: "#4F46E5" }}>wngusgkgus@gmail.com</a>
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{
        fontSize: 20, fontWeight: 800, color: "#0F172A",
        margin: "0 0 16px", fontFamily: F,
        paddingBottom: 10, borderBottom: "2px solid #E2E8F0",
      }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: "#374151", lineHeight: 1.9, fontFamily: F }}>
        {children}
      </div>
    </div>
  );
}
