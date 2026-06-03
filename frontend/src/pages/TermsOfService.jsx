import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const F = "'Pretendard', 'Noto Sans KR', sans-serif";

export default function TermsOfService() {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "서비스 이용약관 | ALPHA-HELIX";
  }, []);

  return (
    <div style={{ background: "#F9FAFB", minHeight: "100vh", fontFamily: F }}>
      {/* 헤더 */}
      <div style={{
        background: "white", borderBottom: "1px solid #E5E7EB",
        padding: "0 24px", height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        <button
          onClick={() => navigate("/")}
          style={{
            border: "none", cursor: "pointer",
            fontSize: 21, fontWeight: 900, fontFamily: F,
            backgroundImage: "linear-gradient(120deg, #60A5FA 0%, #6366F1 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          ALPHA-HELIX
        </button>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: "7px 18px", borderRadius: 8,
            border: "1.5px solid #E5E7EB", background: "white",
            color: "#374151", fontSize: 14, fontWeight: 600,
            cursor: "pointer", fontFamily: F,
          }}
        >
          ← 뒤로
        </button>
      </div>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "48px 24px 80px" }}>
        {/* 제목 */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 33, fontWeight: 900, color: "#111827", margin: "0 0 8px", fontFamily: F }}>
            서비스 이용약관
          </h1>
          <p style={{ fontSize: 15, color: "#9CA3AF", margin: 0 }}>
            Terms of Service · 최종 업데이트: 2025년 6월 1일
          </p>
        </div>

        <Section title="제1조 (목적)">
          <p>
            본 약관은 ALPHA-HELIX(이하 "서비스")가 제공하는 IT 인재 매칭 플랫폼 서비스의 이용 조건 및 절차,
            서비스 이용자(이하 "사용자")와 서비스 간의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.
          </p>
        </Section>

        <Section title="제2조 (서비스 개요)">
          <p>ALPHA-HELIX는 다음의 서비스를 제공합니다:</p>
          <ul>
            <li>클라이언트와 IT 파트너(프리랜서/개발자) 간 매칭 중개</li>
            <li>프로젝트 등록 및 제안서 관리</li>
            <li>포트폴리오 작성 및 공개</li>
            <li>Google Calendar 연동을 통한 면접 일정 관리</li>
            <li>AI 기반 프로젝트 및 프로필 작성 지원</li>
            <li>계약·채팅 등 프로젝트 진행 지원 도구</li>
          </ul>
        </Section>

        <Section title="제3조 (회원가입 및 계정)">
          <ul>
            <li>서비스는 Google OAuth, 카카오 OAuth 또는 이메일을 통한 회원가입을 지원합니다.</li>
            <li>사용자는 정확하고 최신의 정보를 제공해야 하며, 허위 정보 입력 시 서비스 이용이 제한될 수 있습니다.</li>
            <li>계정 정보(비밀번호 등)의 보관 책임은 사용자에게 있으며, 계정 도용이 의심될 경우 즉시 서비스에 신고해야 합니다.</li>
            <li>1인 1계정 원칙을 준수해야 합니다.</li>
          </ul>
        </Section>

        <Section title="제4조 (Google API 및 캘린더 권한 사용)">
          <div style={{ padding: "14px 18px", background: "#EFF6FF", borderRadius: 10, borderLeft: "4px solid #3B82F6", marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 15, color: "#1E3A5F", lineHeight: 1.7 }}>
              본 서비스는 <strong>Google API 서비스 사용자 데이터 정책</strong>을 준수합니다.
              Google API를 통해 획득한 정보는 아래 명시된 목적 이외에 사용하지 않습니다.
            </p>
          </div>
          <ul>
            <li>
              <strong>Google 캘린더 연동</strong>: 사용자가 선택적으로 허용한 경우에 한해 면접 일정 등록·관리 목적으로만 사용됩니다.
            </li>
            <li>캘린더 데이터는 광고, 제3자 공유, 상업적 목적으로 활용되지 않습니다.</li>
            <li>사용자는 언제든지 Google 계정 설정에서 캘린더 접근 권한을 취소할 수 있습니다.</li>
          </ul>
        </Section>

        <Section title="제5조 (사용자의 의무)">
          <p>사용자는 다음 행위를 하여서는 안 됩니다:</p>
          <ul>
            <li>타인의 정보를 도용하거나 허위 정보를 등록하는 행위</li>
            <li>서비스의 정상적인 운영을 방해하는 행위</li>
            <li>저작권 등 지식재산권을 침해하는 행위</li>
            <li>서비스를 통해 음란물, 혐오 발언 등 불법 콘텐츠를 배포하는 행위</li>
            <li>스팸 메시지 발송 또는 상업적 무단 광고 행위</li>
            <li>관련 법령을 위반하는 일체의 행위</li>
          </ul>
        </Section>

        <Section title="제6조 (지식재산권)">
          <ul>
            <li>서비스가 제공하는 콘텐츠(디자인, 텍스트, 소프트웨어 등)의 저작권은 ALPHA-HELIX에 귀속됩니다.</li>
            <li>사용자가 등록한 포트폴리오, 프로젝트 설명 등의 저작권은 해당 사용자에게 귀속되며, 서비스는 서비스 운영에 필요한 범위 내에서 이를 활용할 수 있습니다.</li>
          </ul>
        </Section>

        <Section title="제7조 (서비스 중단 및 변경)">
          <ul>
            <li>서비스는 시스템 점검, 장애, 기타 부득이한 사유로 일시적으로 중단될 수 있습니다.</li>
            <li>서비스의 기능이나 약관이 변경될 경우, 시행 7일 전 서비스 내 공지사항을 통해 안내합니다.</li>
          </ul>
        </Section>

        <Section title="제8조 (면책 조항)">
          <ul>
            <li>서비스는 클라이언트와 파트너 간의 거래 당사자가 아니며, 거래에 대한 직접적인 책임을 지지 않습니다.</li>
            <li>천재지변, 불가항력 등 서비스의 귀책사유 없이 발생한 손해에 대해서는 책임을 지지 않습니다.</li>
          </ul>
        </Section>

        <Section title="제9조 (개인정보 처리)">
          <p>
            사용자의 개인정보는{" "}
            <a
              href="/privacy"
              style={{ color: "#2563EB", textDecoration: "underline" }}
            >
              개인정보처리방침
            </a>
            에 따라 처리됩니다.
          </p>
        </Section>

        <Section title="제10조 (준거법 및 분쟁 해결)">
          <ul>
            <li>본 약관은 대한민국 법률에 따라 해석됩니다.</li>
            <li>서비스 이용과 관련한 분쟁이 발생할 경우, 서비스와 사용자는 상호 협의를 통해 해결하며, 협의가 이루어지지 않을 경우 관련 법령에 따른 관할 법원에 소를 제기할 수 있습니다.</li>
          </ul>
        </Section>

        <Section title="문의처">
          <p>
            약관 관련 문의사항은 아래로 연락 바랍니다.<br />
            이메일: <a href="mailto:hylee132@gmail.com" style={{ color: "#2563EB" }}>hylee132@gmail.com</a><br />
            서비스: <a href="https://ALPHA-HELIX.com" style={{ color: "#2563EB" }}>https://ALPHA-HELIX.com</a>
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
        fontSize: 21, fontWeight: 800, color: "#111827",
        margin: "0 0 16px", fontFamily: F,
        paddingBottom: 10, borderBottom: "2px solid #E5E7EB",
      }}>
        {title}
      </h2>
      <div style={{ fontSize: 16, color: "#374151", lineHeight: 1.8, fontFamily: F }}>
        {children}
      </div>
    </div>
  );
}
