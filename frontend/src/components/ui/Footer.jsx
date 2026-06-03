import { useLanguage } from "../../i18n/LanguageContext";
import { useNavigate } from "react-router-dom";
import devBridgeLogo from "../../assets/main_logo.png";

const F = "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const SOCIAL = [
  {
    label: "GitHub",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#475569" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.167 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.604-3.369-1.34-3.369-1.34-.454-1.154-1.11-1.462-1.11-1.462-.907-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
      </svg>
    ),
  },
  {
    label: "Twitter",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#475569" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.5-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.2-1.95-.5v.03c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 0 1-1.93.07 4.28 4.28 0 0 0 4 2.98 8.521 8.521 0 0 1-5.33 1.84c-.34 0-.68-.02-1.02-.06C3.44 20.29 5.7 21 8.12 21 16 21 20.33 14.46 20.33 8.79c0-.19 0-.37-.01-.56.84-.6 1.56-1.36 2.14-2.23z"/>
      </svg>
    ),
  },
];

export default function Footer() {
  const { t, lang, setLang } = useLanguage();
  const navigate = useNavigate();

  const COLS = [
    {
      titleKey: "footer.service",
      links: [
        { key: "footer.links.findProject" },
        { key: "footer.links.freelancerGuide" },
        { key: "footer.links.developerCommunity" },
        { key: "footer.links.solutionMarket" },
      ],
    },
    {
      titleKey: "footer.resources",
      links: [
        { key: "footer.links.usageGuide" },
        { key: "footer.links.announcements" },
        { key: "footer.links.faq" },
      ],
    },
    {
      titleKey: "footer.company",
      links: [
        { key: "footer.links.aboutUs" },
        { key: "footer.links.careers" },
        { key: "footer.links.privacyPolicy", href: "/alpha_privacy" },
        { key: "footer.links.termsOfService", href: "/alpha_terms" },
      ],
    },
  ];

  const LANGS = [
    { code: "en", label: "English" },
    { code: "ko", label: "한국어" },
    { code: "zh", label: "中文" },
  ];

  return (
    <footer style={{
      background: "white",
      borderTop: "1px solid #E5E7EB",
      padding: "48px 20px 32px",
      fontFamily: F,
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 60, marginBottom: 40, flexWrap: "wrap" }}>

          {/* Brand area */}
          <div style={{ minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <img src={devBridgeLogo} alt="Alpha-Helix" style={{ height: 28, objectFit: "contain" }} />
              <span style={{
                fontSize: 21.7, fontWeight: 900, fontFamily: F,
                background: "linear-gradient(90deg, #7DD3FC 0%, #38BDF8 25%, #818CF8 65%, #93C5FD 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>Alpha-Helix</span>
            </div>
            <p style={{
              fontSize: 13, color: "#64748B", fontFamily: F,
              lineHeight: 1.8, margin: "0 0 18px", maxWidth: 200,
            }}>
              {t("footer.tagline")}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              {SOCIAL.map(s => (
                <div key={s.label} style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "#F1F5F9", border: "1px solid #E2E8F0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "#E2E8F0"}
                  onMouseLeave={e => e.currentTarget.style.background = "#F1F5F9"}
                >{s.icon}</div>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLS.map(col => (
            <div key={col.titleKey}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", fontFamily: F, marginBottom: 16 }}>
                {t(col.titleKey)}
              </div>
              {col.links.map(link => (
                <div key={link.key} style={{
                  fontSize: 13, color: "#64748B", fontFamily: F,
                  marginBottom: 10, cursor: "pointer",
                  transition: "color 0.15s",
                }}
                  onClick={() => link.href ? navigate(link.href) : undefined}
                  onMouseEnter={e => e.currentTarget.style.color = "#3B82F6"}
                  onMouseLeave={e => e.currentTarget.style.color = "#64748B"}
                >{t(link.key)}</div>
              ))}
            </div>
          ))}
        </div>

        {/* 금융 면책 조항 */}
        <div style={{
          background: "#F8FAFC",
          border: "1px solid #E2E8F0",
          borderRadius: 10,
          padding: "16px 20px",
          marginBottom: 28,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8, letterSpacing: "0.02em" }}>
            ⚠️ 투자 위험 고지 및 면책 조항 (Financial Disclaimer)
          </div>
          <p style={{ fontSize: 11.5, color: "#6B7280", lineHeight: 1.85, margin: 0 }}>
            본 서비스는 <strong>학술·포트폴리오 목적으로 제작된 정보 제공 플랫폼</strong>으로, 투자자문업법상 투자자문·투자일임 서비스가 아닙니다.
            제공되는 모든 분석 결과·백테스트 데이터·매매 시그널은 <strong>투자 권유·추천이 아니며</strong>, 단순 참고 목적의 정보입니다.
            금융 시장은 원금 손실 위험이 있으며, <strong>과거 성과가 미래 수익을 보장하지 않습니다.</strong>
            시장 데이터는 외부 금융 데이터 API를 통해 제공되며 정확성·완전성을 보장하지 않습니다.
            모든 투자 결정과 그에 따른 손익은 <strong>이용자 본인의 책임</strong>입니다.
            본 서비스 이용 전 반드시 전문 금융투자업자의 조언을 구하시기 바랍니다.
          </p>
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop: "1px solid #E5E7EB", paddingTop: 20,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 12,
        }}>
          <span style={{ fontSize: 13, color: "#94A3B8", fontFamily: F }}>
            {t("footer.copyright")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <a href="/alpha_privacy" style={{ fontSize: 12, color: "#94A3B8", textDecoration: "none", fontFamily: F }}
              onMouseEnter={e => e.currentTarget.style.color = "#3B82F6"}
              onMouseLeave={e => e.currentTarget.style.color = "#94A3B8"}>
              {t("footer.links.privacyPolicy")}
            </a>
            <a href="/alpha_terms" style={{ fontSize: 12, color: "#94A3B8", textDecoration: "none", fontFamily: F }}
              onMouseEnter={e => e.currentTarget.style.color = "#3B82F6"}
              onMouseLeave={e => e.currentTarget.style.color = "#94A3B8"}>
              {t("footer.links.termsOfService")}
            </a>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {LANGS.map(l => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                style={{
                  fontSize: 13,
                  fontFamily: F,
                  cursor: "pointer",
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: lang === l.code ? "1.5px solid #3B82F6" : "1.5px solid #E5E7EB",
                  background: lang === l.code ? "#EFF6FF" : "transparent",
                  color: lang === l.code ? "#1D4ED8" : "#64748B",
                  fontWeight: lang === l.code ? 700 : 400,
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { if (lang !== l.code) e.currentTarget.style.color = "#1E293B"; }}
                onMouseLeave={e => { if (lang !== l.code) e.currentTarget.style.color = "#64748B"; }}
              >{l.label}</button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
