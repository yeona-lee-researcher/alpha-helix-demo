import React, { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

/**
 * 단일 터미널 세션 (셸 고정). TerminalTabs 가 여러 개를 탭으로 관리한다.
 * 백엔드 /ws/terminal?shell=... (app.terminal.enabled + loopback 게이트) 에 붙어 실제 셸 구동.
 * 파이프 기반(완전한 PTY 아님) — lean/git/python 등 명령 실행용.
 */
export default function TerminalPane({ shell = "powershell", active = true }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const fitRef = useRef(null);

  // xterm + WS (셸 고정이라 1회 초기화)
  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13.5,
      fontFamily: "'Fira Code','Cascadia Code','Consolas',monospace",
      theme: { background: "#0d1117", foreground: "#cbd5e1", cursor: "#60a5fa" },
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    try { fit.fit(); } catch { /* noop */ }
    termRef.current = term;
    fitRef.current = fit;

    const onResize = () => { try { fit.fit(); } catch { /* noop */ } };
    window.addEventListener("resize", onResize);

    // 입력 → WS (+ 로컬 에코; 파이프 셸은 TTY 에코가 없음)
    term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data === "\r" ? "\n" : data);
        term.write(data === "\r" ? "\r\n" : data);
      }
    });

    term.write(`\x1b[90m[${shell} 연결 중…]\x1b[0m\r\n`);
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/terminal?shell=${shell}`);
    wsRef.current = ws;
    ws.onopen = () => { try { fit.fit(); } catch { /* noop */ } };
    ws.onmessage = (e) => { if (typeof e.data === "string") term.write(e.data); };
    ws.onclose = () => term.write("\r\n\x1b[90m[연결 종료]\x1b[0m\r\n");
    ws.onerror = () => term.write("\r\n\x1b[31m[WS 오류 — app.terminal.enabled / 로컬 접속 확인]\x1b[0m\r\n");

    return () => {
      window.removeEventListener("resize", onResize);
      try { ws.close(); } catch { /* noop */ }
      term.dispose();
    };
  }, [shell]);

  // 비활성(display:none) → 활성 복귀 시 크기 재계산
  useEffect(() => {
    if (active) {
      const id = setTimeout(() => { try { fitRef.current?.fit(); } catch { /* noop */ } }, 30);
      return () => clearTimeout(id);
    }
  }, [active]);

  return <div ref={containerRef} className="dark-scroll" style={{ width: "100%", height: "100%", padding: 4, overflow: "hidden" }} />;
}
