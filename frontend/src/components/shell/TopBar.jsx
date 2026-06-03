import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, MessageCircle, Home, BarChart3, BrainCircuit, Layers,
  Wallet, ShoppingCart, Code2, Newspaper, Bell, User, CreditCard,
  Tag, Trello, BookOpen,
} from "lucide-react";

// ── 검색 인덱스 ───────────────────────────────────────────────────────────────
const SEARCH_INDEX = [
  {
    label: "홈", desc: "메인 대시보드",
    path: "/home", icon: Home,
    kw: ["홈", "home", "메인", "대시보드", "dashboard", "시작"],
  },
  {
    label: "전략 워크스페이스", desc: "AI 채팅으로 전략 생성·백테스트 실행",
    path: "/strategy", icon: BarChart3,
    kw: ["전략", "strategy", "백테스트", "backtest", "ai 채팅", "채팅", "시그널", "signal",
         "주문", "퀀트", "quant", "모델", "model", "포트폴리오", "portfolio", "종목", "자동매매"],
  },
  {
    label: "워크홈", desc: "실시간 전략 요약·Trust Score·브리핑",
    path: "/workhome", icon: BrainCircuit,
    kw: ["워크홈", "workhome", "실시간", "신뢰점수", "trust score", "trust", "전략 요약",
         "요약", "현황", "성과"],
  },
  {
    label: "Alpha 워크스페이스", desc: "AI 퀀트 워크스페이스 목록",
    path: "/alpha", icon: Layers,
    kw: ["알파", "alpha", "워크스페이스", "workspace", "목록", "list", "헬릭스", "helix"],
  },
  {
    label: "거래 계좌", desc: "KIS 증권 계좌 연결·모의투자 설정",
    path: "/alpha/account", icon: Wallet,
    kw: ["계좌", "거래", "kis", "증권", "모의", "투자", "account", "broker",
         "api", "한국투자", "연동", "브로커", "실거래"],
  },
  {
    label: "주문 제안", desc: "AI 주문 제안 큐·승인·OrderProposal",
    path: "/alpha/proposals", icon: ShoppingCart,
    kw: ["주문", "제안", "proposal", "승인", "order", "큐", "queue", "매수", "매도",
         "체결", "오더"],
  },
  {
    label: "Developer Studio", desc: "코드 편집기·터미널·Git 연동",
    path: "/alpha/developer", icon: Code2,
    kw: ["개발자", "developer", "studio", "코드", "code", "터미널", "terminal",
         "git", "편집기", "editor", "ide", "파이썬", "python", "리포지토리", "repo"],
  },
  {
    label: "일일 브리핑", desc: "Living Market Briefing 시황 리포트",
    path: "/briefing", icon: Newspaper,
    kw: ["브리핑", "briefing", "일일", "리포트", "시장", "시황", "뉴스", "market"],
  },
  {
    label: "알림", desc: "시그널·체결·만료 알림 센터",
    path: "/notifications", icon: Bell,
    kw: ["알림", "notification", "공지", "시그널", "체결", "만료", "notice", "bell"],
  },
  {
    label: "마이페이지", desc: "프로필·계정 설정·비밀번호 변경",
    path: "/mypage", icon: User,
    kw: ["마이페이지", "mypage", "프로필", "profile", "계정", "설정", "비밀번호",
         "password", "이름", "이메일", "회원"],
  },
  {
    label: "구독 관리", desc: "요금제 변경·결제 내역 확인",
    path: "/subscription/manage", icon: CreditCard,
    kw: ["구독", "subscription", "요금제", "결제", "플랜", "plan", "관리",
         "갱신", "해지", "카드"],
  },
  {
    label: "요금제 안내", desc: "FREE·STANDARD·PREMIUM 플랜 비교",
    path: "/pricing", icon: Tag,
    kw: ["요금제", "pricing", "가격", "프리미엄", "premium", "스탠다드", "standard",
         "무료", "free", "expert", "플랜", "구독 안내"],
  },
  {
    label: "비전 보드", desc: "아이디어 메모·그림판·스티커",
    path: "/vision_board", icon: Trello,
    kw: ["비전", "vision", "보드", "board", "메모", "그림판", "스티커", "노트", "캔버스"],
  },
  {
    label: "Alpha 가이드", desc: "Alpha-Helix 사용법·입문자 가이드",
    path: "/alpha_guide", icon: BookOpen,
    kw: ["가이드", "guide", "도움말", "help", "사용법", "튜토리얼", "tutorial",
         "설명", "매뉴얼", "시작하기"],
  },
];

function highlight(text, query) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "rgba(99,102,241,0.18)", color: "#6366f1",
        borderRadius: 2, padding: "0 1px" }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function searchResults(query) {
  if (!query.trim()) return [];
  const q = query.toLowerCase().trim();
  return SEARCH_INDEX
    .map(item => {
      const labelMatch  = item.label.toLowerCase().includes(q);
      const descMatch   = item.desc.toLowerCase().includes(q);
      const kwMatch     = item.kw.some(k => k.includes(q));
      const score = labelMatch ? 3 : kwMatch ? 2 : descMatch ? 1 : 0;
      return { ...item, score };
    })
    .filter(i => i.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);
}

/**
 * 상단바 (사이드바 오른쪽, 메인 위, 높이 44 — 슬림).
 * - 왼쪽: 둥근 검색 입력 + 드롭다운 자동완성
 * - 그 옆 보라 그라데이션 AI 토글
 * - 비로그인 시: 우측에 "로그인" 버튼
 */
export default function TopBar({ onToggleChat, chatOpen, rightOffset = 0, leftOffset = 52 }) {
  const nav = useNavigate();
  const isAuthed = !!localStorage.getItem("dbId");

  const [query, setQuery]     = useState("");
  const [open, setOpen]       = useState(false);
  const [cursor, setCursor]   = useState(-1);
  const inputRef              = useRef(null);
  const wrapRef               = useRef(null);

  const results = searchResults(query);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setCursor(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const go = useCallback((path) => {
    nav(path);
    setQuery("");
    setOpen(false);
    setCursor(-1);
    inputRef.current?.blur();
  }, [nav]);

  const onKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (!open || results.length === 0) {
      if (e.key === "Escape") { setOpen(false); setCursor(-1); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = cursor >= 0 ? results[cursor] : results[0];
      if (target) go(target.path);
    } else if (e.key === "Escape") {
      setOpen(false);
      setCursor(-1);
    }
  };

  return (
    <div style={{
      position: "fixed", top: 0, right: rightOffset, height: 44,
      left: leftOffset,
      transition: "right 0.18s ease, left 0.18s ease",
      display: "flex", alignItems: "center", justifyContent: "flex-start",
      gap: 8, padding: "0 12px",
      background: "rgba(255,255,255,0.85)",
      backdropFilter: "blur(8px)",
      borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
      zIndex: 900,
    }}>

      {/* ── 검색 ── */}
      <div ref={wrapRef} style={{ position: "relative", width: 420 }}>
        <div style={{
          width: "100%", height: 32,
          display: "flex", alignItems: "center", gap: 8,
          padding: "0 4px 0 14px",
          background: "white",
          border: `1px solid ${open && results.length > 0 ? "#a5b4fc" : "#E5E7EB"}`,
          borderRadius: open && results.length > 0 ? "10px 10px 0 0" : 999,
          boxShadow: open && results.length > 0
            ? "0 2px 0 rgba(99,102,241,0.1)"
            : "0 2px 8px rgba(99,102,241,0.06)",
          transition: "border-color 0.15s, border-radius 0.15s",
          boxSizing: "border-box",
        }}>
          <Search size={13} style={{ color: open ? "#6366f1" : "#94A3B8", flexShrink: 0, transition: "color 0.15s" }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="기능 검색 (예: 백테스트, 계좌, 알림…)"
            onChange={e => { setQuery(e.target.value); setOpen(true); setCursor(-1); }}
            onFocus={() => { if (query) setOpen(true); }}
            onKeyDown={onKeyDown}
            style={{
              flex: 1, minWidth: 0, height: "100%", border: "none", outline: "none",
              background: "transparent", fontSize: 12.5, color: "#0F172A",
            }}
          />
          {query && (
            <button
              onMouseDown={e => { e.preventDefault(); setQuery(""); setOpen(false); setCursor(-1); }}
              style={{ background: "none", border: "none", cursor: "pointer",
                color: "#94A3B8", padding: "0 6px", fontSize: 14, lineHeight: 1 }}>
              ×
            </button>
          )}
        </div>

        {/* ── 드롭다운 ── */}
        {open && results.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 1000,
            background: "white",
            border: "1px solid #a5b4fc",
            borderTop: "1px solid #e5e7eb",
            borderRadius: "0 0 10px 10px",
            boxShadow: "0 8px 24px rgba(99,102,241,0.14)",
            overflow: "hidden",
          }}>
            {results.map((item, i) => {
              const Icon = item.icon;
              const isActive = i === cursor;
              return (
                <div
                  key={item.path}
                  onMouseDown={e => { e.preventDefault(); go(item.path); }}
                  onMouseEnter={() => setCursor(i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 14px",
                    cursor: "pointer",
                    background: isActive ? "rgba(99,102,241,0.07)" : "transparent",
                    borderLeft: isActive ? "2px solid #6366f1" : "2px solid transparent",
                    transition: "background 0.1s",
                  }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isActive ? "rgba(99,102,241,0.12)" : "rgba(148,163,184,0.1)",
                  }}>
                    <Icon size={14} color={isActive ? "#6366f1" : "#64748b"} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600,
                      color: isActive ? "#4338ca" : "#1e293b", lineHeight: 1.3 }}>
                      {highlight(item.label, query)}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.desc}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "#c7d2fe", flexShrink: 0 }}>
                    {item.path}
                  </div>
                </div>
              );
            })}
            <div style={{ padding: "5px 14px", fontSize: 10, color: "#cbd5e1",
              borderTop: "1px solid #f1f5f9", display: "flex", gap: 10 }}>
              <span>↑↓ 이동</span><span>Enter 이동</span><span>Esc 닫기</span>
            </div>
          </div>
        )}

        {/* 검색어는 있는데 결과 없음 */}
        {open && query.trim() && results.length === 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 1000,
            background: "white", border: "1px solid #e5e7eb",
            borderTop: "none", borderRadius: "0 0 10px 10px",
            padding: "12px 14px", fontSize: 12, color: "#94a3b8",
            boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
          }}>
            "<b style={{ color: "#475569" }}>{query}</b>" 에 대한 결과가 없습니다.
          </div>
        )}
      </div>

      {/* ── AI 말풍선 ── */}
      <button
        onClick={onToggleChat}
        title={chatOpen ? "AI 채팅 닫기" : "AI 채팅 열기"}
        style={{
          width: 32, height: 32, borderRadius: "50%",
          border: "none",
          background: "linear-gradient(135deg, #60a5fa 0%, #6366f1 100%)",
          color: "white",
          cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          boxShadow: chatOpen
            ? "0 4px 14px rgba(99,102,241,0.55), inset 0 0 0 2px rgba(255,255,255,0.4)"
            : "0 3px 10px rgba(99,102,241,0.35)",
          transition: "background 0.15s, box-shadow 0.15s, transform 0.05s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "linear-gradient(135deg, #3b82f6 0%, #4f46e5 100%)";
          e.currentTarget.style.boxShadow = "0 6px 16px rgba(99,102,241,0.5)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "linear-gradient(135deg, #60a5fa 0%, #6366f1 100%)";
          e.currentTarget.style.boxShadow = chatOpen
            ? "0 4px 14px rgba(99,102,241,0.55), inset 0 0 0 2px rgba(255,255,255,0.4)"
            : "0 3px 10px rgba(99,102,241,0.35)";
        }}
        onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.94)"; }}
        onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      >
        <MessageCircle size={15} strokeWidth={2.2} />
      </button>

      {/* ── 비로그인 시 로그인 버튼 ── */}
      {!isAuthed && (
        <button
          onClick={() => nav("/login")}
          style={{
            marginLeft: "auto",
            height: 30, padding: "0 16px", borderRadius: 8,
            border: "none",
            background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)",
            color: "white", cursor: "pointer",
            fontSize: 12.5, fontWeight: 700,
            boxShadow: "0 2px 6px rgba(59,130,246,0.3)",
            transition: "filter 0.15s, transform 0.05s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(0.95)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
          onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          로그인
        </button>
      )}
    </div>
  );
}
