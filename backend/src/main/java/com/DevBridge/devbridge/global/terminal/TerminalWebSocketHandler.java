package com.DevBridge.devbridge.global.terminal;

import lombok.extern.slf4j.Slf4j;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 로컬 전용 셸 터미널 WebSocket 핸들러.
 *
 * <p>세션당 셸 프로세스(bash/powershell/cmd) 1개를 띄워 stdin(WS 입력)→프로세스,
 * 프로세스 stdout/stderr→WS 로 스트리밍한다. 파이프 기반(완전한 PTY 아님)이라 vim 같은
 * 풀스크린 TUI 는 제한되지만, lean/git/python 등 명령 실행에는 충분하다.
 *
 * <p><b>보안</b>: {@code app.terminal.enabled=true} 일 때만 등록되며(운영 기본 OFF),
 * 추가로 loopback(127.0.0.1/::1) 접속만 허용한다 → 웹에서 임의 셸 실행(RCE) 차단.
 */
@Slf4j
public class TerminalWebSocketHandler extends TextWebSocketHandler {

    private final Map<String, Process> procs = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        if (!isLoopback(session)) {
            log.warn("[terminal] 비로컬 접속 거부: {}", session.getRemoteAddress());
            session.close(CloseStatus.POLICY_VIOLATION.withReason("local only"));
            return;
        }
        String shell = shellFor(session);
        ProcessBuilder pb = new ProcessBuilder(shellCmd(shell));
        pb.redirectErrorStream(true);
        pb.directory(new File(System.getProperty("user.dir")));
        Process p = pb.start();
        procs.put(session.getId(), p);

        Thread reader = new Thread(() -> pumpOutput(session, p), "term-out-" + session.getId());
        reader.setDaemon(true);
        reader.start();

        Thread waiter = new Thread(() -> {
            try {
                int code = p.waitFor();
                if (session.isOpen()) {
                    sendSafe(session, "\r\n[프로세스 종료 code=" + code + "]\r\n");
                    session.close();
                }
            } catch (Exception ignore) { }
        }, "term-wait-" + session.getId());
        waiter.setDaemon(true);
        waiter.start();

        sendSafe(session, "[" + shell + " 터미널 연결됨 · cwd=" + System.getProperty("user.dir") + "]\r\n");
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        Process p = procs.get(session.getId());
        if (p == null || !p.isAlive()) return;
        try {
            OutputStream os = p.getOutputStream();
            os.write(message.getPayload().getBytes(StandardCharsets.UTF_8));
            os.flush();
        } catch (Exception e) {
            log.debug("[terminal] stdin write 실패: {}", e.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        Process p = procs.remove(session.getId());
        if (p != null) p.destroyForcibly();
    }

    private void pumpOutput(WebSocketSession session, Process p) {
        byte[] buf = new byte[4096];
        try (InputStream in = p.getInputStream()) {
            int n;
            while ((n = in.read(buf)) != -1) {
                if (!session.isOpen()) break;
                sendSafe(session, new String(buf, 0, n, StandardCharsets.UTF_8));
            }
        } catch (Exception ignore) { }
    }

    private void sendSafe(WebSocketSession session, String text) {
        try {
            synchronized (session) {
                if (session.isOpen()) session.sendMessage(new TextMessage(text));
            }
        } catch (Exception ignore) { }
    }

    private boolean isLoopback(WebSocketSession s) {
        try {
            InetSocketAddress a = s.getRemoteAddress();
            return a != null && a.getAddress() != null && a.getAddress().isLoopbackAddress();
        } catch (Exception e) {
            return false;
        }
    }

    private String shellFor(WebSocketSession s) {
        String q = (s.getUri() == null || s.getUri().getQuery() == null) ? "" : s.getUri().getQuery();
        for (String kv : q.split("&")) {
            if (kv.startsWith("shell=")) return kv.substring(6).toLowerCase();
        }
        return "default";
    }

    private List<String> shellCmd(String shell) {
        boolean win = System.getProperty("os.name", "").toLowerCase().contains("win");
        return switch (shell) {
            case "powershell" -> List.of("powershell.exe", "-NoLogo");
            case "cmd" -> List.of("cmd.exe");
            case "bash", "git-bash", "gitbash" -> win ? List.of("bash.exe", "-i") : List.of("/bin/bash", "-i");
            case "sql", "sqlcl" -> win ? List.of("sql.exe", "/nolog") : List.of("sql", "/nolog"); // Oracle SQLcl (미설치 시 프로세스 실패 → 터미널에 표시)
            default -> win ? List.of("powershell.exe", "-NoLogo") : List.of("/bin/bash", "-i");
        };
    }
}
