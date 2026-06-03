import { useEffect } from "react";

const F = "'Inter', 'Pretendard', 'Noto Sans KR', sans-serif";

export default function AlphaPrivacyPolicy() {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "개인정보처리방침 | Alpha-Helix";
  }, []);

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", fontFamily: F }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "52px 24px 96px" }}>
        <div style={{ marginBottom: 44 }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: "#0F172A", margin: "0 0 8px", fontFamily: F }}>
            개인정보처리방침
          </h1>
          <p style={{ fontSize: 14, color: "#94A3B8", margin: 0 }}>
            Privacy Policy · 최종 업데이트: 2026년 1월 1일
          </p>
        </div>

        <Section title="개요">
          <p>
            Alpha-Helix(이하 "서비스")는 AI 기반 퀀트 투자 워크스페이스로서 사용자의 개인정보 보호를
            최우선으로 생각합니다. 본 방침은 서비스 이용 과정에서 수집·이용하는 개인정보에 대해 설명합니다.
          </p>
          <p style={{ marginTop: 12, padding: "12px 16px", background: "#EFF6FF", borderRadius: 8, borderLeft: "3px solid #6366F1", fontSize: 14 }}>
            본 서비스는 <strong>Google API 서비스 사용자 데이터 정책</strong>을 준수합니다.
            Google API를 통해 획득한 정보를 광고 목적으로 제3자에게 제공하지 않습니다.
          </p>
        </Section>

        <Section title="1. 수집하는 개인정보 항목">
          <SubTitle>가. 계정 정보 (회원가입 시)</SubTitle>
          <ul>
            <li>이메일 주소, 이름 (Google / 카카오 OAuth 로그인 시 제공)</li>
            <li>직접 입력 시: 이메일, 비밀번호(암호화 저장), 닉네임</li>
          </ul>
          <SubTitle>나. 투자 서비스 이용 정보</SubTitle>
          <ul>
            <li>퀀트 전략 설정값 및 파라미터 (사용자 직접 입력)</li>
            <li>백테스트 실행 기록 및 결과 데이터</li>
            <li>AI 대화 히스토리 (전략 구성 목적)</li>
            <li>한국투자증권(KIS) API 키 — <strong>AES-GCM 암호화</strong> 후 DB 저장, 평문 보관 없음</li>
            <li>주문 제안(OrderProposal) 기록 및 승인 이력</li>
          </ul>
          <SubTitle>다. 자동 수집 정보</SubTitle>
          <ul>
            <li>서비스 접속 일시, 이용 기능 기록</li>
            <li>구독 플랜 정보 및 결제 처리 기록 (Toss Payments 위탁)</li>
          </ul>
        </Section>

        <Section title="2. 개인정보의 이용 목적">
          <ul>
            <li><strong>계정 정보</strong>: 서비스 로그인 및 사용자 식별, 이메일 인증</li>
            <li><strong>KIS API 키</strong>: 사용자 요청에 따른 한국투자증권 모의·실거래 주문 처리 목적으로만 사용. 제3자에게 제공하지 않으며, 사용자가 직접 삭제할 수 있습니다.</li>
            <li><strong>전략·백테스트 데이터</strong>: 사용자 개인 워크스페이스 내 전략 저장·조회 및 AI 분석 지원</li>
            <li><strong>AI 대화 기록</strong>: 전략 구성 맥락 유지 및 서비스 품질 개선</li>
            <li><strong>이용 기록</strong>: 서비스 품질 개선 및 장애 해결</li>
          </ul>
        </Section>

        <Section title="3. 데이터 보관 및 파기">
          <ul>
            <li>수집된 개인정보는 서비스 이용 기간 동안 보관됩니다.</li>
            <li>회원 탈퇴 요청 시 수집된 데이터는 지체 없이 파기합니다.</li>
            <li>KIS API 키는 사용자가 브로커 설정 페이지에서 언제든지 직접 삭제할 수 있습니다.</li>
            <li>AI 대화 기록은 사용자가 워크스페이스 삭제 시 함께 삭제됩니다.</li>
            <li>관계 법령에 따라 보존이 필요한 정보(결제 기록 등)는 법령에서 정한 기간 동안 보관 후 파기합니다.</li>
          </ul>
        </Section>

        <Section title="4. 제3자 제공 금지">
          <div style={{ padding: "14px 18px", background: "#FEF2F2", borderRadius: 10, borderLeft: "4px solid #EF4444", marginBottom: 14 }}>
            <strong style={{ color: "#DC2626" }}>중요</strong>
            <p style={{ margin: "6px 0 0", color: "#7F1D1D", fontSize: 14, lineHeight: 1.7 }}>
              KIS API 키를 포함한 민감 투자 정보는 어떠한 경우에도 제3자에게 제공하지 않으며,
              사용자의 투자 전략 데이터는 광고·상업적 목적으로 활용하지 않습니다.
            </p>
          </div>
          <ul>
            <li>수집된 개인정보는 본 방침에 명시된 목적 이외에 사용하지 않습니다.</li>
            <li>법령에 의한 요청(수사기관 등)이 있는 경우에만 예외적으로 제공할 수 있습니다.</li>
            <li>결제 처리는 Toss Payments에 위탁되며, 카드번호 등 결제 정보는 서비스 서버에 저장되지 않습니다.</li>
            <li>서비스 인프라 운영을 위한 클라우드 제공사(AWS)에는 보안 계약 하에 데이터가 저장될 수 있습니다.</li>
          </ul>
        </Section>

        <Section title="5. Google API 서비스 사용자 데이터 정책 준수">
          <p>
            본 서비스는{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank" rel="noopener noreferrer"
              style={{ color: "#4F46E5", textDecoration: "underline" }}>
              Google API 서비스 사용자 데이터 정책
            </a>
            을 준수합니다.
          </p>
          <ul>
            <li>Google API에서 획득한 데이터는 사용자에게 직접 제공하는 기능 목적으로만 사용합니다.</li>
            <li>Google 사용자 데이터를 광고 제공 또는 제3자에게 판매하지 않습니다.</li>
          </ul>
        </Section>

        <Section title="6. 사용자의 권리">
          <ul>
            <li>수집된 개인정보의 조회, 수정, 삭제를 언제든지 요청할 수 있습니다.</li>
            <li>KIS API 키는 설정 → 브로커 설정 페이지에서 직접 삭제 가능합니다.</li>
            <li>Google 계정 연동 해제는 Google 계정 설정의 "앱 접근 권한"에서 취소할 수 있습니다.</li>
            <li>개인정보 관련 문의: <a href="mailto:wngusgkgus@gmail.com" style={{ color: "#4F46E5" }}>wngusgkgus@gmail.com</a></li>
          </ul>
        </Section>

        <Section title="7. 문의처">
          <p>
            개인정보 처리와 관련한 문의사항은 아래로 연락 바랍니다.<br />
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

function SubTitle({ children }) {
  return (
    <p style={{ fontSize: 14, fontWeight: 700, color: "#4F46E5", margin: "14px 0 6px" }}>
      {children}
    </p>
  );
}
