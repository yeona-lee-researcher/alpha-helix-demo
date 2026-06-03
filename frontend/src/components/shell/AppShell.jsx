import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import LeftSidebar from "./LeftSidebar";
import TopBar from "./TopBar";
import RightChatDock from "./RightChatDock";
import GuideDock from "./GuideDock";
import Footer from "../ui/Footer";

/**
 * VS Code 스타일 셸 wrapper.
 * - 좌측 52px Activity Bar
 * - 상단 44px (검색 + AI 토글)
 * - 좌측에 옵션 가이드 패널 (⋯ 토글)
 * - 우측 도크 채팅 (TopBar 의 AI 버튼이 토글, vscode 처럼 화면 분할)
 */
export default function AppShell({ children, hideChat = false }) {
  const loc = useLocation();
  const isDeveloper = loc.pathname.startsWith("/alpha/developer") || loc.pathname.startsWith("/vision_board");
  const [chatOpen, setChatOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    const handler = () => setChatOpen(true);
    window.addEventListener("alpha:open-chat", handler);
    return () => window.removeEventListener("alpha:open-chat", handler);
  }, []);
  const [chatWidth, setChatWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem("aiDockWidth") || "0", 10);
    return saved >= 280 && saved <= 900 ? saved : 380;
  });
  const guideWidth = 320;

  const handleResize = (w) => {
    setChatWidth(w);
    localStorage.setItem("aiDockWidth", String(w));
  };

  const leftOffset = 52 + (guideOpen ? guideWidth : 0);
  const rightOffset = !hideChat && chatOpen ? chatWidth : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC" }}>
      <LeftSidebar
        guideOpen={guideOpen}
        onToggleGuide={() => setGuideOpen(o => !o)}
      />
      <GuideDock open={guideOpen} onClose={() => setGuideOpen(false)} width={guideWidth} />
      <TopBar
        onToggleChat={() => setChatOpen(o => !o)}
        chatOpen={chatOpen}
        rightOffset={rightOffset}
        leftOffset={52 + (guideOpen ? guideWidth : 0)}
      />
      <main style={{
        marginLeft: leftOffset,
        paddingTop: 44,
        marginRight: rightOffset,
        minHeight: "100vh",
        transition: "margin-left 0.18s ease, margin-right 0.18s ease",
      }}>
        {children}
        {!isDeveloper && <Footer />}
      </main>
      {!hideChat && (
        <RightChatDock
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          width={chatWidth}
          onResize={handleResize}
        />
      )}
    </div>
  );
}
