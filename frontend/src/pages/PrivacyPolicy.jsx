import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const F = "'Pretendard', 'Noto Sans KR', sans-serif";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "개인정보처리방침 | ALPHA-HELIX";
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
            개인정보처리방침
          </h1>
          <p style={{ fontSize: 15, color: "#9CA3AF", margin: 0 }}>
            Privacy Policy · 최종 업데이트: 2025년 6월 1일
          </p>
        </div>

        <Section title="개요">
          <p>
            ALPHA-HELIX(이하 "서비스")는 IT 인재 매칭 플랫폼으로서 사용자의 개인정보 보호를 최우선으로 생각합니다.
            본 방침은 Google OAuth를 포함한 서비스 이용 과정에서 수집·이용하는 개인정보에 대해 설명합니다.
          </p>
          <p style={{ marginTop: 12, padding: "12px 16px", background: "#EFF6FF", borderRadius: 8, borderLeft: "3px solid #3B82F6", fontSize: 15 }}>
            본 서비스는 <strong>Google API 서비스 사용자 데이터 정책</strong>을 준수합니다.
            Google API를 통해 획득한 정보를 다른 앱에 공유하거나 상업적 광고 목적으로 제3자에게 제공하지 않습니다.
          </p>
        </Section>

        <Section title="1. 수집하는 개인정보 항목">
          <SubTitle>가. Google 계정 정보 (OAuth 로그인 시)</SubTitle>
          <ul>
            <li>이메일 주소</li>
            <li>프로필 이름 및 프로필 사진</li>
            <li>Google 계정 고유 ID (sub)</li>
          </ul>
          <SubTitle style={{ marginTop: 16 }}>나. Google Calendar 데이터 (일정 연동 시)</SubTitle>
          <ul>
            <li>사용자의 캘린더 일정 목록 및 상세 내용</li>
            <li>일정 생성·수정·삭제 권한</li>
            <li>캘린더 ID 및 타임존 정보</li>
          </ul>
          <SubTitle style={{ marginTop: 16 }}>다. 서비스 이용 과정에서 수집되는 정보</SubTitle>
          <ul>
            <li>닉네임, 전문 분야, 소개글 등 프로필 정보 (사용자 직접 입력)</li>
            <li>프로젝트 등록 정보, 포트폴리오 자료</li>
            <li>서비스 이용 기록 (접속 일시, 이용 기능 등)</li>
          </ul>
        </Section>

        <Section title="2. 개인정보의 이용 목적">
          <ul>
            <li><strong>Google 계정 정보</strong>: 서비스 로그인 및 사용자 식별, 서비스 내 알림 발송에 사용됩니다.</li>
            <li>
              <strong>Google Calendar 권한</strong>: IT 인재 매칭 과정에서 클라이언트와 파트너 간의 면접 일정을
              자동으로 등록하고 관리하기 위한 목적으로만 사용됩니다. 이 데이터는 다른 목적으로 사용하거나
              제3자에게 공유하지 않습니다.
            </li>
            <li><strong>프로필 정보</strong>: 파트너·클라이언트 매칭, 프로젝트 추천 및 검색에 활용됩니다.</li>
            <li><strong>이용 기록</strong>: 서비스 품질 개선 및 문제 해결에 활용됩니다.</li>
          </ul>
        </Section>

        <Section title="3. 데이터 보관 및 파기">
          <ul>
            <li>수집된 개인정보는 서비스 이용 기간 동안 보관됩니다.</li>
            <li>사용자가 서비스 탈퇴를 요청하거나 개인정보 이용 동의를 철회할 경우, 수집된 데이터는 지체 없이 파기합니다.</li>
            <li>Google Calendar 데이터는 해당 세션의 일정 처리 완료 후 서버에 별도 저장하지 않습니다.</li>
            <li>관계 법령에 따라 보존이 필요한 정보는 법령에서 정한 기간 동안 보관 후 파기합니다.</li>
          </ul>
        </Section>

        <Section title="4. 제3자 제공 및 공유 금지">
          <div style={{ padding: "16px 20px", background: "#FEF2F2", borderRadius: 10, borderLeft: "4px solid #EF4444", marginBottom: 16 }}>
            <strong style={{ color: "#DC2626", fontSize: 16 }}>중요</strong>
            <p style={{ margin: "6px 0 0", color: "#7F1D1D", fontSize: 15, lineHeight: 1.7 }}>
              본 서비스는 Google API를 통해 획득한 정보(이메일, 캘린더 데이터 등)를 다른 앱에 공유하거나
              상업적인 광고 목적으로 제3자에게 제공하지 않습니다.
            </p>
          </div>
          <ul>
            <li>수집된 개인정보는 본 방침에 명시된 목적 이외에는 사용되지 않습니다.</li>
            <li>법령에 의한 요청(수사기관 등)이 있는 경우에만 예외적으로 제공할 수 있으며, 이 경우 사용자에게 사전 고지합니다.</li>
            <li>서비스 인프라 운영을 위한 클라우드 제공사(AWS)에는 보안 계약 하에 데이터가 저장될 수 있습니다.</li>
          </ul>
        </Section>

        <Section title="5. Google API 서비스 사용자 데이터 정책 준수">
          <p>
            본 서비스는{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#2563EB", textDecoration: "underline" }}
            >
              Google API 서비스 사용자 데이터 정책
            </a>
            을 준수합니다. 특히 아래 사항을 엄격히 지킵니다:
          </p>
          <ul>
            <li>Google API에서 획득한 데이터는 사용자에게 직접 제공하는 기능 개선 목적으로만 사용합니다.</li>
            <li>Google 사용자 데이터를 광고 제공 또는 데이터 브로커에게 판매하지 않습니다.</li>
            <li>인간이 사용자 데이터를 읽는 경우, 사용자의 명시적 동의를 받거나 보안·법적 목적에 한합니다.</li>
          </ul>
        </Section>

        <Section title="6. 사용자의 권리">
          <ul>
            <li>사용자는 언제든지 수집된 개인정보의 조회, 수정, 삭제를 요청할 수 있습니다.</li>
            <li>Google 계정 연동 해제는 Google 계정 설정의 "앱 접근 권한"에서 직접 취소할 수 있습니다.</li>
            <li>개인정보 관련 문의: <a href="mailto:hylee132@gmail.com" style={{ color: "#2563EB" }}>hylee132@gmail.com</a></li>
          </ul>
        </Section>

        <Section title="7. 문의처">
          <p>
            개인정보처리와 관련한 문의사항은 아래로 연락 바랍니다.<br />
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

function SubTitle({ children, style }) {
  return (
    <p style={{ fontSize: 15, fontWeight: 700, color: "#1D4ED8", margin: "12px 0 6px", ...style }}>
      {children}
    </p>
  );
}
