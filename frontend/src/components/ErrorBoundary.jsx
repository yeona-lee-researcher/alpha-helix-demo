import { Component } from "react";

const F = "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/**
 * 최상위 Error Boundary.
 * 자식 트리에서 throw 된 렌더링/생명주기 에러를 잡아 화이트스크린을 막고
 * 친화적 폴백 화면 + 새로고침 / 홈 이동 버튼을 노출.
 *
 * - 비동기 에러(fetch 실패 등)는 못 잡음 — 그건 try/catch 또는 axios interceptor 가 처리.
 * - 에러 보고는 console.error 로만. (운영 빌드에선 vite drop 으로 제거됨.)
 *   필요 시 Sentry 같은 외부 보고 채널 추가 가능.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] uncaught:", error, info?.componentStack);
    // 첫 진입 시 hydration/race 로 인한 일시적 에러는 자동 1회 새로고침으로 회복.
    // 무한 루프 방지: sessionStorage 플래그(경로별 1회).
    try {
      const key = "__eb_reload_" + (typeof window !== "undefined" ? window.location.pathname : "_");
      if (typeof window !== "undefined" && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        setTimeout(() => window.location.reload(), 50);
      }
    } catch (_) { /* ignore storage errors */ }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)",
        padding: 20,
        fontFamily: F,
      }}>
        <div style={{
          maxWidth: 460,
          width: "100%",
          background: "white",
          borderRadius: 18,
          padding: "36px 32px",
          textAlign: "center",
          boxShadow: "0 8px 32px rgba(15,23,42,0.08)",
          border: "1px solid #E2E8F0",
        }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🚧</div>
          <h2 style={{
            fontSize: 20,
            fontWeight: 800,
            color: "#1E293B",
            margin: "0 0 10px",
            letterSpacing: "-0.01em",
          }}>
            화면을 불러오는 중 문제가 생겼어요
          </h2>
          <p style={{
            fontSize: 14,
            color: "#64748B",
            margin: "0 0 22px",
            lineHeight: 1.7,
          }}>
            잠시 후 다시 시도해 주세요. 문제가 계속되면 새로고침 또는 홈으로 이동해 주세요.
          </p>
          {this.state.error?.message && (
            <details style={{
              textAlign: "left",
              fontSize: 12,
              color: "#94A3B8",
              background: "#F8FAFC",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 20,
            }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>오류 상세</summary>
              <code style={{ display: "block", marginTop: 6, wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
                {String(this.state.error.message)}
              </code>
            </details>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: "11px 22px",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)",
                color: "white",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: F,
              }}
            >
              새로고침
            </button>
            <button
              onClick={this.handleHome}
              style={{
                padding: "11px 22px",
                borderRadius: 10,
                border: "1.5px solid #E2E8F0",
                background: "white",
                color: "#475569",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: F,
              }}
            >
              홈으로
            </button>
          </div>
        </div>
      </div>
    );
  }
}
