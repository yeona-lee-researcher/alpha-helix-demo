import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, RotateCcw } from "lucide-react";
import homeBg from "../assets/home.png";
import mainLogo from "../assets/main_logo.png";

const BASE_FONT = "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function FindPassword() {
  const navigate = useNavigate();

  const [email, setEmail]         = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw]         = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const [showCurrentPw, setShowCurrentPw]   = useState(false);
  const [showNewPw, setShowNewPw]           = useState(false);
  const [showConfirmPw, setShowConfirmPw]   = useState(false);

  const [touched, setTouched] = useState({
    email: false, currentPw: false, newPw: false, confirmPw: false,
  });

  const touch = (field) => setTouched((p) => ({ ...p, [field]: true }));

  // 유효성 검사
  const newPwError = useMemo(() => {
    if (!touched.newPw) return "";
    if (!newPw) return "새 비밀번호를 입력해 주세요";
    const valid = /^(?=.*[0-9]).{8,16}$/.test(newPw);
    if (!valid) return "영문 8자이상 16자 이하, 숫자 포함을 만족해야 합니다";
    return "";
  }, [newPw, touched.newPw]);

  const confirmPwError = useMemo(() => {
    if (!touched.confirmPw) return "";
    if (!confirmPw) return "비밀번호 확인을 입력해 주세요";
    if (confirmPw !== newPw) return "비밀번호가 일치하지 않습니다";
    return "";
  }, [confirmPw, newPw, touched.confirmPw]);

  const isAllFilled = email.trim() && currentPw && newPw && confirmPw && !newPwError && !confirmPwError;

  const handleSubmit = () => {
    setTouched({ email: true, currentPw: true, newPw: true, confirmPw: true });
    if (!isAllFilled) return;
    alert("비밀번호가 재설정되었습니다.");
    navigate("/login");
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      fontFamily: BASE_FONT, position: "relative",
    }}>
      {/* 배경 이미지 */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: `url(${homeBg})`,
        backgroundSize: "cover", backgroundPosition: "center",
        filter: "blur(12px) brightness(0.85)",
        transform: "scale(1.05)",
      }} />

      {/* 좌상단 로고 */}
      <div
        onClick={() => navigate("/")}
        style={{
          position: "fixed", top: 20, left: 28, zIndex: 10,
          display: "flex", alignItems: "center", gap: 8,
          cursor: "pointer",
        }}
      >
        <img src={mainLogo} alt="Alpha-Helix" style={{ width: 30, height: 30, objectFit: "contain", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.3))" }} />
      </div>

      {/* 메인 콘텐츠 */}
      <div style={{
        flex: 1, display: "flex", justifyContent: "center", alignItems: "center",
        position: "relative", zIndex: 1, padding: "40px 20px",
      }}>
        <div style={{
          width: "100%", maxWidth: 460, background: "white",
          borderRadius: 24, padding: "36px 40px 32px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          display: "flex", flexDirection: "column", alignItems: "stretch",
        }}>
          {/* 타이틀 */}
          <h1 style={{
            textAlign: "center", fontSize: 26, fontWeight: 900,
            color: "#111", margin: "0 0 6px", letterSpacing: "-0.5px",
          }}>
            <span style={{
              background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>Alpha-Helix</span> 비밀번호 재설정
          </h1>
          <p style={{
            textAlign: "center", fontSize: 13, color: "#9CA3AF",
            margin: "0 0 32px", fontWeight: 500,
          }}>
            협업의 가치를 잇는 전문가들의 공간
          </p>

          {/* 이메일 */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              이메일
            </label>
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              border: "1px solid #E5E7EB", borderRadius: 14,
              padding: "0 18px", height: 54, backgroundColor: "#F9FAFB",
            }}>
              <Mail size={18} color="#9CA3AF" strokeWidth={1.8} />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => touch("email")}
                placeholder="example@bridgebird.com"
                style={{
                  flex: 1, border: "none", outline: "none", fontSize: 14,
                  color: "#111", backgroundColor: "transparent", fontFamily: BASE_FONT,
                }}
              />
            </div>
          </div>

          {/* 현재 비밀번호 */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              현재 비밀번호
            </label>
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              border: "1px solid #E5E7EB", borderRadius: 14,
              padding: "0 18px", height: 54, backgroundColor: "#fff",
            }}>
              <Lock size={18} color="#9CA3AF" strokeWidth={1.8} />
              <input
                type={showCurrentPw ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                onBlur={() => touch("currentPw")}
                placeholder="현재 사용 중인 비밀번호를 입력해 주세요"
                style={{
                  flex: 1, border: "none", outline: "none", fontSize: 14,
                  color: "#111", backgroundColor: "transparent", fontFamily: BASE_FONT,
                }}
              />
              <button
                type="button"
                onClick={() => setShowCurrentPw((v) => !v)}
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
              >
                {showCurrentPw
                  ? <EyeOff size={18} color="#9CA3AF" strokeWidth={1.8} />
                  : <Eye size={18} color="#9CA3AF" strokeWidth={1.8} />
                }
              </button>
            </div>
          </div>

          {/* 새 비밀번호 */}
          <div style={{ marginBottom: newPwError ? 4 : 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              새 비밀번호
            </label>
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              border: `1px solid ${newPwError ? "#EF4444" : "#E5E7EB"}`, borderRadius: 14,
              padding: "0 18px", height: 54, backgroundColor: "#fff",
            }}>
              <Lock size={18} color="#9CA3AF" strokeWidth={1.8} />
              <input
                type={showNewPw ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                onBlur={() => touch("newPw")}
                placeholder="새 비밀번호를 입력해 주세요"
                style={{
                  flex: 1, border: "none", outline: "none", fontSize: 14,
                  color: "#111", backgroundColor: "transparent", fontFamily: BASE_FONT,
                }}
              />
              <button
                type="button"
                onClick={() => setShowNewPw((v) => !v)}
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
              >
                {showNewPw
                  ? <EyeOff size={18} color="#9CA3AF" strokeWidth={1.8} />
                  : <Eye size={18} color="#9CA3AF" strokeWidth={1.8} />
                }
              </button>
            </div>
          </div>
          {newPwError && (
            <p style={{ fontSize: 11, color: "#EF4444", margin: "0 0 10px 4px" }}>{newPwError}</p>
          )}

          {/* 비밀번호 확인 */}
          <div style={{ marginBottom: confirmPwError ? 4 : 28 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              비밀번호 확인
            </label>
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              border: `1px solid ${confirmPwError ? "#EF4444" : "#E5E7EB"}`, borderRadius: 14,
              padding: "0 18px", height: 54, backgroundColor: "#fff",
            }}>
              <RotateCcw size={18} color="#9CA3AF" strokeWidth={1.8} />
              <input
                type={showConfirmPw ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                onBlur={() => touch("confirmPw")}
                placeholder="비밀번호를 다시 입력해 주세요"
                style={{
                  flex: 1, border: "none", outline: "none", fontSize: 14,
                  color: "#111", backgroundColor: "transparent", fontFamily: BASE_FONT,
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPw((v) => !v)}
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
              >
                {showConfirmPw
                  ? <EyeOff size={18} color="#9CA3AF" strokeWidth={1.8} />
                  : <Eye size={18} color="#9CA3AF" strokeWidth={1.8} />
                }
              </button>
            </div>
          </div>
          {confirmPwError && (
            <p style={{ fontSize: 11, color: "#EF4444", margin: "0 0 18px 4px" }}>{confirmPwError}</p>
          )}

          {/* 재설정 버튼 */}
          <button
            onClick={handleSubmit}
            style={{
              width: "100%", height: 56, borderRadius: 14, border: "none",
              backgroundColor: isAllFilled ? "#3B82F6" : "#B0B0B0",
              color: "white", fontSize: 16, fontWeight: 800,
              cursor: isAllFilled ? "pointer" : "not-allowed",
              fontFamily: BASE_FONT, transition: "background-color 0.2s",
              marginBottom: 0,
            }}
            onMouseEnter={(e) => {
              if (isAllFilled) e.currentTarget.style.backgroundColor = "#2563EB";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isAllFilled ? "#3B82F6" : "#B0B0B0";
            }}
          >
            비밀번호 재설정
          </button>

          {/* 푸터 */}
          <p style={{
            textAlign: "center", fontSize: 11, color: "#D1D5DB",
            margin: "28px 0 0", letterSpacing: "0.06em", fontWeight: 500,
          }}>
            © 2026 ALPHA-HELIX COLLABORATIVE SYSTEMS
          </p>
        </div>
      </div>
    </div>
  );
}

export default FindPassword;
