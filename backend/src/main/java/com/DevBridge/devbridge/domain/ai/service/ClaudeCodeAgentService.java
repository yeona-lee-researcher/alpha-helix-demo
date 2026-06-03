package com.DevBridge.devbridge.domain.ai.service;

import com.DevBridge.devbridge.domain.ai.entity.AlphaWorkspace;
import com.DevBridge.devbridge.domain.ai.entity.AlphaWorkspaceChangeSet;
import com.DevBridge.devbridge.domain.ai.repository.AlphaWorkspaceRepository;
import com.DevBridge.devbridge.domain.user.entity.UserApiKey;
import com.DevBridge.devbridge.domain.user.service.UserApiKeyService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.stream.Stream;

/**
 * 헤드리스 Claude Code CLI 를 워크스페이스 코드에 붙여 "진짜 에이전트 편집" 수행 (A1 + A2).
 *
 * 흐름: codeJson → 임시 격리 디렉터리 materialize → `claude -p`(stdin 프롬프트) 로 파일 편집 →
 *       편집 파일 diff → AlphaPatch ops(target=code) → AlphaPatchService.apply() → ChangeSet(PENDING).
 *
 * A2: stream-json 으로 단계별 진행을 잡 스토어에 누적(프론트 폴링) + 변경 before/after(diff) 반환.
 *
 * 보안: app.claude.cli.enabled=false 기본 OFF. 임시 디렉터리 격리 + **허용툴 화이트리스트 + Bash/Web 차단** +
 *       timeout + max-budget. 프롬프트는 stdin(Windows .cmd 인용 회피).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ClaudeCodeAgentService {

    private final AlphaPatchService patchService;
    private final UserApiKeyService userApiKeyService;
    private final AlphaWorkspaceRepository workspaceRepo;
    private final ObjectMapper om = new ObjectMapper();

    @Value("${app.claude.cli.enabled:false}")
    private boolean enabled;

    @Value("${app.claude.cli.path:claude}")
    private String cliPath;

    @Value("${app.claude.cli.timeout-sec:180}")
    private int timeoutSec;

    @Value("${anthropic.api.key:}")
    private String apiKey;

    private static final Set<String> CODE_EXT = Set.of(
            "py", "js", "jsx", "ts", "tsx", "json", "txt", "md", "yaml", "yml", "csv", "ipynb", "java");

    // 워크스페이스(=포트폴리오/repo 단위)별 Claude 멀티세션 ID 는 alpha_workspace.claude_session_id 에 **영속**된다.
    // 같은 워크스페이스의 연속 요청은 같은 세션을 --resume 해 대화 맥락을 이어가며(VSCode Claude Code 동일),
    // 백엔드를 재시작해도 DB 에서 세션을 복구한다. 워크스페이스당 Claude 세션 1개(+ Heli 별도) → 포트폴리오 1개에 2세션.

    public boolean isEnabled() { return enabled; }

    /** 새 대화 시작 — 워크스페이스 Claude 세션 맥락을 비우고(DB 초기화) 작업 디렉터리도 정리(다음 요청은 새 세션). */
    public void resetSession(Long wsId) {
        if (wsId != null) {
            try { workspaceRepo.updateClaudeSessionId(wsId, null); } catch (Exception e) { log.warn("[ClaudeAgent] 세션 리셋 실패 ws={}: {}", wsId, e.getMessage()); }
        }
        try { deleteRecursive(workspaceDir(wsId)); } catch (IOException ignore) { /* 정리 실패 무시 */ }
    }

    /** 변경 파일 한 건의 before/after (프론트 Monaco diff 용). */
    public record FileChange(String path, String filename, String before, String after) {}

    /** 에이전트 1회 실행 결과. changeSet 은 변경이 있을 때만(없으면 null). */
    public record AgentResult(AlphaWorkspaceChangeSet changeSet, String narration,
                              List<String> changedFiles, List<FileChange> changes, long elapsedMs) {}

    // ─────────────────────────────────────── 동기 실행 (호환)

    public AgentResult runAgent(AlphaWorkspace ws, String request, Long uid) {
        guard(request);
        String userKey = resolveKey(uid);
        long t0 = System.currentTimeMillis();
        try {
            Materialized m = materialize(ws);
            String[] outErr = runCliSession(m.tmp, request, false, null, userKey, ws);
            String narration = parseJsonNarration(outErr[0]);
            if (narration == null && !outErr[1].isBlank()) {
                throw new RuntimeException("Claude Code CLI 실패: " + tail(outErr[1], 1200));
            }
            return finishApply(ws, request, m, narration, t0);
        } catch (IOException e) {
            throw new RuntimeException("Claude Code 에이전트 실행 오류: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Claude Code 에이전트 중단됨", e);
        }
        // dir 은 워크스페이스 세션 유지를 위해 삭제하지 않는다(다음 턴 materialize 가 정리).
    }

    // ─────────────────────────────────────── A2: 스트리밍 잡

    private final Map<String, ClaudeJob> jobs = new ConcurrentHashMap<>();
    private static final int MAX_JOBS = 64;

    public String startAgent(AlphaWorkspace ws, String request, Long uid) {
        guard(request);
        String userKey = resolveKey(uid);
        ClaudeJob job = createJob();
        Thread t = new Thread(() -> runStreamingJob(job, ws, request, userKey), "claude-agent-" + job.id);
        t.setDaemon(true);
        t.start();
        return job.id;
    }

    /** BYOK 키 해석: 사용자 본인 Claude 키(복호화). 평문은 즉시 사용·미보관. 없으면 null(→ 서버키/CLI 로그인 폴백). */
    private String resolveKey(Long uid) {
        if (uid == null) return null;
        try { return userApiKeyService.getDecryptedKey(uid, UserApiKey.PROVIDER_ANTHROPIC); }
        catch (Exception e) { return null; }
    }

    public Map<String, Object> jobSnapshot(String jobId, int since) {
        ClaudeJob job = jobs.get(jobId);
        if (job == null) return null;
        return job.snapshot(since);
    }

    private void runStreamingJob(ClaudeJob job, AlphaWorkspace ws, String request, String userKey) {
        long t0 = System.currentTimeMillis();
        try {
            job.setPhase("🤖 Claude Code 에이전트 시작");
            Materialized m = materialize(ws);
            // stream-json: 라인별 이벤트 → 사람이 읽는 진행 로그로 변환해 잡에 누적
            String[] outErr = runCliSession(m.tmp, request, true, line -> streamLineToJob(job, line), userKey, ws);
            String narration = job.finalNarration != null ? job.finalNarration : parseJsonNarration(outErr[0]);
            AgentResult r = finishApply(ws, request, m, narration, t0);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("narration", r.narration());
            result.put("changedFiles", r.changedFiles());
            result.put("changes", r.changes());
            result.put("elapsedMs", r.elapsedMs());
            result.put("changeSetId", r.changeSet() == null ? null : r.changeSet().getId());
            result.put("changeSetTitle", r.changeSet() == null ? null : r.changeSet().getTitle());
            result.put("hasChanges", r.changeSet() != null);
            job.finishOk(result);
        } catch (Exception e) {
            log.error("[ClaudeAgent] streaming job 실패 ws={}", ws.getId(), e);
            job.log("error", "실패: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
            job.finishErr(e.getMessage());
        }
        // dir 은 워크스페이스 세션 유지를 위해 삭제하지 않는다(다음 턴 materialize 가 정리).
    }

    /** stream-json 한 라인 → 진행 메시지. */
    private void streamLineToJob(ClaudeJob job, String line) {
        if (line == null || line.isBlank()) return;
        JsonNode ev;
        try { ev = om.readTree(line); } catch (Exception e) { return; }
        String type = ev.path("type").asText("");
        if ("assistant".equals(type)) {
            JsonNode content = ev.path("message").path("content");
            if (content.isArray()) {
                for (JsonNode c : content) {
                    String ct = c.path("type").asText("");
                    if ("tool_use".equals(ct)) {
                        job.log("info", toolUseMessage(c));
                    } else if ("text".equals(ct)) {
                        String txt = c.path("text").asText("").trim();
                        if (!txt.isEmpty()) job.log("info", "💬 " + txt);
                    } else if ("thinking".equals(ct)) {
                        job.log("info", "💭 분석 중…");
                    }
                }
            }
        } else if ("result".equals(type)) {
            if (ev.hasNonNull("result")) job.finalNarration = ev.get("result").asText();
        }
        // system / user(tool_result) / rate_limit_event 등은 노출 안 함
    }

    private String toolUseMessage(JsonNode toolUse) {
        String name = toolUse.path("name").asText("");
        JsonNode in = toolUse.path("input");
        switch (name) {
            case "Read": return "📖 " + base(in.path("file_path").asText("")) + " 읽기";
            case "Edit": return "✏️ " + base(in.path("file_path").asText("")) + " 편집";
            case "Write": return "📝 " + base(in.path("file_path").asText("")) + " 작성";
            case "Grep": return "🔍 검색: " + in.path("pattern").asText("");
            case "Glob": return "🔍 파일 찾기: " + in.path("pattern").asText("");
            default: return "🔧 " + name;
        }
    }

    // ─────────────────────────────────────── 공유 헬퍼

    private record Materialized(Path tmp, Map<String, String> fileToKey, Map<String, String> original) {}

    private Materialized materialize(AlphaWorkspace ws) throws IOException {
        Map<String, Object> codeMap = readMap(ws.getCodeJson());
        if (codeMap.isEmpty()) codeMap.put("main", "");
        // 세션 --resume 은 cwd 경로로 대화 기록을 찾으므로, 워크스페이스마다 디렉터리 경로를 고정한다.
        // (transcript 는 ~/.claude 전역에 저장 → 프로젝트 파일을 비워도 세션 맥락은 유지됨)
        Path dir = workspaceDir(ws.getId());
        clearRegularFiles(dir); // 이전 턴 잔여 파일 제거 → 항상 dir == 현재 codeJson
        Map<String, String> fileToKey = new LinkedHashMap<>();
        Map<String, String> original = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : codeMap.entrySet()) {
            String key = e.getKey();
            String content = e.getValue() == null ? "" : String.valueOf(e.getValue());
            String filename = key.contains(".") ? key : key + ".py";
            Files.writeString(dir.resolve(filename), content, StandardCharsets.UTF_8);
            fileToKey.put(filename, key);
            original.put(filename, content);
        }
        return new Materialized(dir, fileToKey, original);
    }

    /** 워크스페이스별 고정 작업 디렉터리. 세션 resume 을 위해 경로가 매 요청 동일해야 한다. */
    private Path workspaceDir(Long wsId) throws IOException {
        Path dir = Path.of(System.getProperty("java.io.tmpdir"), "alpha-claude", "ws-" + (wsId == null ? "anon" : wsId));
        Files.createDirectories(dir);
        return dir;
    }

    /** dir 의 일반 파일만 삭제(숨김/.claude·하위 디렉터리는 보존). */
    private void clearRegularFiles(Path dir) {
        try (Stream<Path> s = Files.list(dir)) {
            s.filter(Files::isRegularFile)
             .filter(p -> !p.getFileName().toString().startsWith("."))
             .forEach(p -> { try { Files.deleteIfExists(p); } catch (IOException ignore) {} });
        } catch (IOException ignore) {}
    }

    private List<String> buildCommand(boolean streaming, String sessionId, boolean resume) {
        List<String> cmd = new ArrayList<>(List.of(resolveCli(), "-p",
                "--output-format", streaming ? "stream-json" : "json"));
        if (streaming) cmd.add("--verbose");
        cmd.addAll(List.of(
                "--allowedTools", "Read,Edit,Write,Glob,Grep",
                "--disallowedTools", "Bash,WebFetch,WebSearch",   // 보안: 임의 명령/네트워크 차단
                "--max-budget-usd", "1"));
        // 멀티세션: 첫 턴은 --session-id 로 생성, 이후 턴은 --resume 로 대화 맥락 이어감(VSCode 동일).
        if (sessionId != null && !sessionId.isBlank()) {
            if (resume) { cmd.add("--resume"); cmd.add(sessionId); }
            else { cmd.add("--session-id"); cmd.add(sessionId); }
        }
        return cmd;
    }

    /**
     * 세션 인지 실행: 워크스페이스의 기존 세션을 --resume, 없으면 새 --session-id 생성.
     * resume 이 실패(만료/유실)하면 새 세션으로 1회 재시도해 끊김 없이 이어간다.
     */
    private String[] runCliSession(Path cwd, String request, boolean streaming, Consumer<String> onLine,
                                   String userKey, AlphaWorkspace ws) throws IOException, InterruptedException {
        String prev = ws.getClaudeSessionId();              // DB 영속 세션 ID (재시작에도 유지)
        boolean resume = (prev != null && !prev.isBlank());
        String sid = resume ? prev : UUID.randomUUID().toString();
        String[] r = runCli(cwd, request, streaming, onLine, userKey, sid, resume);
        boolean failed = parseJsonNarration(r[0]) == null && !r[1].isBlank();
        if (resume && failed) {
            log.warn("[ClaudeAgent] 세션 resume 실패 ws={} → 새 세션으로 재시도", ws.getId());
            sid = UUID.randomUUID().toString();
            r = runCli(cwd, request, streaming, onLine, userKey, sid, false);
        }
        // 새로 만들었거나 바뀐 세션이면 DB 에 영속화 → 다음 턴(재시작 후 포함) resume
        if (!sid.equals(prev) && ws.getId() != null) {
            ws.setClaudeSessionId(sid);
            try { workspaceRepo.updateClaudeSessionId(ws.getId(), sid); }
            catch (Exception e) { log.warn("[ClaudeAgent] 세션 영속화 실패 ws={}: {}", ws.getId(), e.getMessage()); }
        }
        return r;
    }

    /** claude CLI 실행. returns [stdout, stderr]. onLine!=null 이면 stdout 라인별 콜백(스트리밍). */
    private String[] runCli(Path cwd, String request, boolean streaming, Consumer<String> onLine, String userKey,
                            String sessionId, boolean resume)
            throws IOException, InterruptedException {
        String prompt = "이 디렉터리는 퀀트 트레이딩 전략 코드입니다. 코드를 직접 편집해 다음 요청을 수행하세요.\n요청: " + request;
        ProcessBuilder pb = new ProcessBuilder(buildCommand(streaming, sessionId, resume));
        pb.directory(cwd.toFile());
        // BYOK: 사용자 본인 키 우선, 없으면 서버 키(개발 폴백). 운영 배포물엔 서버 키가 없으므로 사용자 키가 필수.
        // 복호화된 키는 자식 프로세스 env 로만 전달하고 로그/응답에 절대 싣지 않는다.
        String effectiveKey = (userKey != null && !userKey.isBlank()) ? userKey
                : (apiKey != null && !apiKey.isBlank() ? apiKey : null);
        if (effectiveKey != null) pb.environment().put("ANTHROPIC_API_KEY", effectiveKey);
        log.info("[ClaudeAgent] cwd={} streaming={} timeout={}s byok={} resume={}", cwd, streaming, timeoutSec,
                (userKey != null && !userKey.isBlank()), resume);

        Process proc = pb.start();
        StringBuilder out = new StringBuilder();
        StringBuilder err = new StringBuilder();
        Thread tOut = pump(proc.getInputStream(), out, onLine);
        Thread tErr = pump(proc.getErrorStream(), err, null);
        tOut.start();
        tErr.start();
        try (OutputStream stdin = proc.getOutputStream()) {
            stdin.write(prompt.getBytes(StandardCharsets.UTF_8));
            stdin.flush();
        }
        boolean finished = proc.waitFor(timeoutSec, TimeUnit.SECONDS);
        if (!finished) {
            proc.destroyForcibly();
            throw new RuntimeException("Claude Code CLI 타임아웃 (" + timeoutSec + "s)");
        }
        tOut.join(5000);
        tErr.join(2000);
        return new String[]{out.toString(), err.toString()};
    }

    /** 편집된 파일 diff → ops → AlphaPatchService.apply. */
    private AgentResult finishApply(AlphaWorkspace ws, String request, Materialized m, String narration, long t0)
            throws IOException {
        List<Map<String, Object>> ops = new ArrayList<>();
        List<String> changedFiles = new ArrayList<>();
        List<FileChange> changes = new ArrayList<>();
        try (Stream<Path> walk = Files.list(m.tmp)) {
            for (Path p : walk.filter(Files::isRegularFile).sorted().toList()) {
                String fn = p.getFileName().toString();
                if (fn.startsWith(".")) continue;
                boolean wasOriginal = m.original.containsKey(fn);
                String ext = fn.contains(".") ? fn.substring(fn.lastIndexOf('.') + 1).toLowerCase() : "";
                if (!wasOriginal && !CODE_EXT.contains(ext)) continue;
                String content = Files.readString(p, StandardCharsets.UTF_8);
                String orig = m.original.get(fn);
                if (orig == null || !orig.equals(content)) {
                    String key = m.fileToKey.getOrDefault(fn,
                            fn.contains(".") ? fn.substring(0, fn.lastIndexOf('.')) : fn);
                    Map<String, Object> op = new LinkedHashMap<>();
                    op.put("target", "code");
                    op.put("path", key);
                    op.put("value", content);
                    ops.add(op);
                    changedFiles.add(fn);
                    changes.add(new FileChange(key, fn, orig == null ? "" : orig, content));
                }
            }
        }
        AlphaWorkspaceChangeSet cs = null;
        if (!ops.isEmpty()) {
            String shortReq = request.length() > 60 ? request.substring(0, 60) + "…" : request;
            cs = patchService.apply(ws, "Claude Code: " + shortReq, ops);
        }
        long elapsed = System.currentTimeMillis() - t0;
        log.info("[ClaudeAgent] ws={} 완료 — 변경 {}개, {}ms", ws.getId(), changedFiles.size(), elapsed);
        return new AgentResult(cs, narration == null ? "" : narration, changedFiles, changes, elapsed);
    }

    private void guard(String request) {
        if (!enabled)
            throw new IllegalStateException("Claude Code 에이전트가 비활성화 상태입니다 (app.claude.cli.enabled=true 필요)");
        if (request == null || request.isBlank())
            throw new IllegalArgumentException("요청이 비어있습니다");
    }

    private String resolveCli() {
        String p = (cliPath == null || cliPath.isBlank()) ? "claude" : cliPath.trim();
        boolean win = System.getProperty("os.name", "").toLowerCase().contains("win");
        if (win && !p.contains("/") && !p.contains("\\")
                && !p.toLowerCase().endsWith(".cmd") && !p.toLowerCase().endsWith(".exe")) {
            return p + ".cmd";
        }
        return p;
    }

    private String parseJsonNarration(String stdout) {
        if (stdout == null || stdout.isBlank()) return null;
        try {
            JsonNode n = om.readTree(stdout.trim());
            if (n.hasNonNull("result")) return n.get("result").asText();
        } catch (Exception ignore) { /* JSON 아님 */ }
        return stdout.isBlank() ? null : stdout.trim();
    }

    private Thread pump(InputStream in, StringBuilder sink, Consumer<String> onLine) {
        return new Thread(() -> {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    sink.append(line).append('\n');
                    if (onLine != null) {
                        try { onLine.accept(line); } catch (Exception ignore) { /* 콜백 격리 */ }
                    }
                }
            } catch (IOException ignore) { /* 종료 */ }
        });
    }

    private Map<String, Object> readMap(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try {
            return om.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private void deleteRecursive(Path root) {
        try (Stream<Path> walk = Files.walk(root)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                try { Files.deleteIfExists(p); } catch (IOException ignore) {}
            });
        } catch (IOException ignore) {}
    }

    private static String base(String path) {
        if (path == null || path.isEmpty()) return "";
        int i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        return i >= 0 ? path.substring(i + 1) : path;
    }

    private static String tail(String s, int n) {
        if (s == null) return "";
        return s.length() > n ? s.substring(s.length() - n) : s;
    }

    // ─────────────────────────────────────── 잡 스토어

    private ClaudeJob createJob() {
        if (jobs.size() >= MAX_JOBS) {
            jobs.entrySet().stream()
                    .filter(e -> !"running".equals(e.getValue().status))
                    .map(Map.Entry::getKey).limit(jobs.size() - MAX_JOBS + 1)
                    .forEach(jobs::remove);
        }
        ClaudeJob job = new ClaudeJob(UUID.randomUUID().toString().replace("-", "").substring(0, 12));
        jobs.put(job.id, job);
        return job;
    }

    private static final class ClaudeJob {
        final String id;
        volatile String status = "running";   // running | done | error
        volatile String phase = "queued";
        volatile String finalNarration = null;
        volatile Map<String, Object> result = null;
        volatile String error = null;
        private final List<Map<String, String>> logs = new ArrayList<>();
        private static final int MAX_LOGS = 1000;

        ClaudeJob(String id) { this.id = id; }

        synchronized void log(String type, String msg) {
            if (logs.size() < MAX_LOGS) {
                Map<String, String> e = new LinkedHashMap<>();
                e.put("type", type);
                e.put("msg", msg);
                logs.add(e);
            }
        }

        void setPhase(String p) { this.phase = p; log("info", "▸ " + p); }

        void finishOk(Map<String, Object> r) { this.result = r; this.status = "done"; }

        void finishErr(String e) { this.error = e; this.status = "error"; }

        synchronized Map<String, Object> snapshot(int since) {
            int s = Math.max(0, Math.min(since, logs.size()));
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("jobId", id);
            m.put("status", status);
            m.put("phase", phase);
            m.put("logs", new ArrayList<>(logs.subList(s, logs.size())));
            m.put("next", logs.size());
            m.put("result", result);
            m.put("error", error);
            return m;
        }
    }
}
