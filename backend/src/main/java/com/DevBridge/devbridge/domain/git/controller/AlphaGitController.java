package com.DevBridge.devbridge.domain.git.controller;

import com.DevBridge.devbridge.domain.ai.entity.AlphaWorkspace;
import com.DevBridge.devbridge.domain.ai.repository.AlphaWorkspaceRepository;
import com.DevBridge.devbridge.domain.git.client.GithubApiClient;
import com.DevBridge.devbridge.domain.git.dto.AlphaGitDto.*;
import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.user.repository.UserRepository;
import com.DevBridge.devbridge.global.security.AesGcmCryptoService;
import com.DevBridge.devbridge.global.security.AuthContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpClientErrorException;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Developer Studio Git 연동: PAT 관리, repo 매핑, 커밋/diff 조회, push, PR.
 *
 * <pre>
 *   POST  /api/alpha/git/connect                          PAT 등록
 *   DELETE /api/alpha/git/connect                         PAT 해제
 *   GET   /api/alpha/git/status                           연동 상태
 *   GET   /api/alpha/git/repos                            repo picker
 *   POST  /api/alpha/workspaces/{id}/git/link             ws ↔ repo 매핑
 *   DELETE /api/alpha/workspaces/{id}/git/link            매핑 해제
 *   GET   /api/alpha/workspaces/{id}/git/status           ws 연동 상태
 *   GET   /api/alpha/workspaces/{id}/git/commits          커밋 리스트
 *   GET   /api/alpha/workspaces/{id}/git/commits/{sha}    커밋 상세 + diff
 *   GET   /api/alpha/workspaces/{id}/git/compare          base..head 비교
 *   POST  /api/alpha/workspaces/{id}/git/push             파일들 push
 *   POST  /api/alpha/workspaces/{id}/git/pr               PR 생성
 * </pre>
 */
@Slf4j
@RestController
@RequestMapping("/api/alpha")
@RequiredArgsConstructor
public class AlphaGitController {

    private final UserRepository userRepo;
    private final AlphaWorkspaceRepository wsRepo;
    private final GithubApiClient gh;
    private final AesGcmCryptoService crypto;

    // ─────────────────────────── 1. PAT 연결 관리

    @PostMapping("/git/connect")
    @Transactional
    public ResponseEntity<?> connect(@RequestBody ConnectReq req) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        if (req == null || req.token() == null || req.token().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "token 필수"));
        }
        String username;
        try {
            username = gh.getAuthenticatedUsername(req.token());
        } catch (Exception ex) {
            log.warn("GitHub 토큰 검증 실패: {}", ex.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "토큰이 유효하지 않습니다"));
        }
        if (username == null || username.isBlank()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "GitHub 사용자 정보를 가져올 수 없습니다"));
        }
        User u = userRepo.findById(uid).orElseThrow();
        u.setGithubUsername(username);
        u.setGithubTokenEncrypted(crypto.encrypt(req.token()));
        u.setGithubConnectedAt(LocalDateTime.now());
        userRepo.save(u);
        return ResponseEntity.ok(new ConnectStatus(true, username, LocalDateTime.now().toString()));
    }

    @DeleteMapping("/git/connect")
    @Transactional
    public ResponseEntity<?> disconnect() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        User u = userRepo.findById(uid).orElseThrow();
        u.setGithubUsername(null);
        u.setGithubTokenEncrypted(null);
        u.setGithubConnectedAt(null);
        userRepo.save(u);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/git/status")
    public ResponseEntity<?> status() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        User u = userRepo.findById(uid).orElseThrow();
        boolean connected = u.getGithubTokenEncrypted() != null && u.getGithubUsername() != null;
        return ResponseEntity.ok(new ConnectStatus(
                connected,
                u.getGithubUsername(),
                u.getGithubConnectedAt() == null ? null : u.getGithubConnectedAt().toString()));
    }

    // ─────────────────────────── 2. Repo picker

    @GetMapping("/git/repos")
    public ResponseEntity<?> repos() {
        String token = requireToken();
        if (token == null) return unauth();
        try {
            return ResponseEntity.ok(gh.listRepos(token));
        } catch (org.springframework.web.client.HttpClientErrorException ex) {
            log.warn("GitHub repos 조회 실패 {}: {}", ex.getStatusCode(), ex.getResponseBodyAsString());
            if (ex.getStatusCode().value() == 401 || ex.getStatusCode().value() == 403) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "GitHub 토큰이 만료되었거나 권한이 부족합니다. GitHub으로 다시 로그인하세요."));
            }
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "GitHub API 오류: " + ex.getStatusText()));
        } catch (Exception ex) {
            log.error("GitHub repos 조회 예외", ex);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "서버 오류: " + ex.getMessage()));
        }
    }

    // ─────────────────────────── 3. Workspace ↔ repo 매핑

    @PostMapping("/workspaces/{wsId}/git/link")
    @Transactional
    public ResponseEntity<?> link(@PathVariable Long wsId, @RequestBody LinkReq req) {
        AlphaWorkspace ws = requireOwnedWs(wsId);
        if (ws == null) return forbidden();
        if (req == null || req.repoFullName() == null || !req.repoFullName().contains("/")) {
            return ResponseEntity.badRequest().body(Map.of("error", "repoFullName 은 owner/repo 형식"));
        }
        ws.setGithubRepoFullName(req.repoFullName());
        ws.setGithubBranch((req.branch() == null || req.branch().isBlank()) ? "main" : req.branch());
        wsRepo.save(ws);
        return ResponseEntity.ok(toWsStatus(ws, true, List.of()));
    }

    @DeleteMapping("/workspaces/{wsId}/git/link")
    @Transactional
    public ResponseEntity<?> unlink(@PathVariable Long wsId) {
        AlphaWorkspace ws = requireOwnedWs(wsId);
        if (ws == null) return forbidden();
        ws.setGithubRepoFullName(null);
        ws.setGithubBranch("main");
        wsRepo.save(ws);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/workspaces/{wsId}/git/status")
    public ResponseEntity<?> wsStatus(@PathVariable Long wsId) {
        AlphaWorkspace ws = requireOwnedWs(wsId);
        if (ws == null) return forbidden();
        boolean connected = ws.getGithubRepoFullName() != null;
        List<String> branches = List.of();
        if (connected) {
            String token = requireToken();
            if (token != null) {
                String[] or = ws.getGithubRepoFullName().split("/", 2);
                try {
                    branches = gh.listBranches(token, or[0], or[1]);
                } catch (Exception ex) {
                    log.warn("브랜치 목록 조회 실패: {}", ex.getMessage());
                }
            }
        }
        return ResponseEntity.ok(toWsStatus(ws, connected, branches));
    }

    // ─────────────────────────── 4. Commits + Diff

    @GetMapping("/workspaces/{wsId}/git/commits")
    public ResponseEntity<?> commits(@PathVariable Long wsId,
                                     @RequestParam(required = false) String branch,
                                     @RequestParam(defaultValue = "30") int perPage) {
        AlphaWorkspace ws = requireLinkedWs(wsId);
        if (ws == null) return forbidden();
        String token = requireToken();
        if (token == null) return unauth();
        String[] or = ws.getGithubRepoFullName().split("/", 2);
        String br = (branch == null || branch.isBlank()) ? ws.getGithubBranch() : branch;
        try {
            return ResponseEntity.ok(gh.listCommits(token, or[0], or[1], br, perPage));
        } catch (Exception ex) {
            log.warn("커밋 목록 조회 실패: {}", ex.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "GitHub API 오류: " + ex.getMessage()));
        }
    }

    @GetMapping("/workspaces/{wsId}/git/commits/{sha}")
    public ResponseEntity<?> commit(@PathVariable Long wsId, @PathVariable String sha) {
        AlphaWorkspace ws = requireLinkedWs(wsId);
        if (ws == null) return forbidden();
        String token = requireToken();
        if (token == null) return unauth();
        String[] or = ws.getGithubRepoFullName().split("/", 2);
        try {
            return ResponseEntity.ok(gh.getCommit(token, or[0], or[1], sha));
        } catch (Exception ex) {
            log.warn("커밋 상세 조회 실패: {}", ex.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "GitHub API 오류: " + ex.getMessage()));
        }
    }

    @GetMapping("/workspaces/{wsId}/git/compare")
    public ResponseEntity<?> compare(@PathVariable Long wsId,
                                     @RequestParam String base,
                                     @RequestParam String head) {
        AlphaWorkspace ws = requireLinkedWs(wsId);
        if (ws == null) return forbidden();
        String token = requireToken();
        if (token == null) return unauth();
        String[] or = ws.getGithubRepoFullName().split("/", 2);
        try {
            return ResponseEntity.ok(gh.compare(token, or[0], or[1], base, head));
        } catch (Exception ex) {
            log.warn("compare 조회 실패: {}", ex.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "GitHub API 오류: " + ex.getMessage()));
        }
    }

    // ─────────────────────────── 5. 파일 트리

    @GetMapping("/workspaces/{wsId}/git/tree")
    public ResponseEntity<?> fileTree(@PathVariable Long wsId,
                                      @RequestParam(required = false) String branch) {
        AlphaWorkspace ws = requireLinkedWs(wsId);
        if (ws == null) return forbidden();
        String token = requireToken();
        if (token == null) return unauth();
        String[] or = ws.getGithubRepoFullName().split("/", 2);
        String br = (branch == null || branch.isBlank()) ? ws.getGithubBranch() : branch;
        try {
            return ResponseEntity.ok(gh.getFileTree(token, or[0], or[1], br));
        } catch (Exception ex) {
            log.warn("파일 트리 조회 실패: {}", ex.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "GitHub API 오류: " + ex.getMessage()));
        }
    }

    // ─────────────────────────── 7. 파일 삭제
    @DeleteMapping("/workspaces/{wsId}/git/file")
    public ResponseEntity<?> deleteGitFile(@PathVariable Long wsId,
                                            @RequestParam String path,
                                            @RequestParam(required = false, defaultValue = "Delete via AlphaHelix Developer Studio") String message) {
        AlphaWorkspace ws = requireLinkedWs(wsId);
        if (ws == null) return forbidden();
        String token = requireToken();
        if (token == null) return unauth();
        String[] or = ws.getGithubRepoFullName().split("/", 2);
        try {
            gh.deleteFile(token, or[0], or[1], path, ws.getGithubBranch(), message);
            return ResponseEntity.ok(Map.of("ok", true, "deleted", path));
        } catch (Exception ex) {
            log.warn("파일 삭제 실패 {}: {}", path, ex.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "GitHub API 오류: " + ex.getMessage()));
        }
    }

    // ─────────────────────────── 6. Pull (파일 내용 가져오기)

    @GetMapping("/workspaces/{wsId}/git/file")
    public ResponseEntity<?> pullFile(@PathVariable Long wsId,
                                      @RequestParam(defaultValue = "main.py") String path) {
        AlphaWorkspace ws = requireLinkedWs(wsId);
        if (ws == null) return forbidden();
        String token = requireToken();
        if (token == null) return unauth();
        String[] or = ws.getGithubRepoFullName().split("/", 2);
        try {
            String content = gh.getFileContent(token, or[0], or[1], path, ws.getGithubBranch());
            return ResponseEntity.ok(Map.of("path", path, "content", content));
        } catch (HttpClientErrorException.NotFound ex) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "파일을 찾을 수 없습니다: " + path));
        } catch (Exception ex) {
            log.warn("파일 내용 조회 실패: {}", ex.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "GitHub API 오류: " + ex.getMessage()));
        }
    }

    // ─────────────────────────── 6. Push + PR

    @PostMapping("/workspaces/{wsId}/git/push")
    public ResponseEntity<?> push(@PathVariable Long wsId, @RequestBody PushReq req) {
        AlphaWorkspace ws = requireLinkedWs(wsId);
        if (ws == null) return forbidden();
        String token = requireToken();
        if (token == null) return unauth();
        if (req == null || req.files() == null || req.files().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "files 가 비어있습니다"));
        }
        String[] or = ws.getGithubRepoFullName().split("/", 2);
        String branch = (req.branch() == null || req.branch().isBlank()) ? ws.getGithubBranch() : req.branch();
        String msg = (req.commitMessage() == null || req.commitMessage().isBlank())
                ? "Update from AlphaHelix Developer Studio (" + DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(LocalDateTime.now()) + ")"
                : req.commitMessage();
        List<PushResult> results = new ArrayList<>();
        for (var e : req.files().entrySet()) {
            String path = e.getKey();
            String content = e.getValue();
            String existingSha = gh.getFileSha(token, or[0], or[1], path, branch);
            String contentB64 = Base64.getEncoder().encodeToString(content.getBytes());
            results.add(gh.putFile(token, or[0], or[1], path, branch, msg, contentB64, existingSha));
        }
        boolean allOk = results.stream().allMatch(PushResult::ok);
        return ResponseEntity.status(allOk ? HttpStatus.OK : HttpStatus.MULTI_STATUS).body(results);
    }

    @PostMapping("/workspaces/{wsId}/git/pr")
    public ResponseEntity<?> pr(@PathVariable Long wsId, @RequestBody PrCreateReq req) {
        AlphaWorkspace ws = requireLinkedWs(wsId);
        if (ws == null) return forbidden();
        String token = requireToken();
        if (token == null) return unauth();
        if (req == null || req.title() == null || req.head() == null || req.base() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "title/head/base 필수"));
        }
        String[] or = ws.getGithubRepoFullName().split("/", 2);
        return ResponseEntity.ok(gh.createPr(token, or[0], or[1], req));
    }

    // ─────────────────────────── helpers

    private WorkspaceGitStatus toWsStatus(AlphaWorkspace ws, boolean connected, List<String> branches) {
        return new WorkspaceGitStatus(ws.getId(), ws.getGithubRepoFullName(),
                ws.getGithubBranch(), connected,
                ws.getGithubBranch(), branches);
    }

    /** 현재 사용자의 복호화된 GitHub 토큰. 미연결 시 null. */
    private String requireToken() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return null;
        User u = userRepo.findById(uid).orElse(null);
        if (u == null || u.getGithubTokenEncrypted() == null) return null;
        try {
            return crypto.decrypt(u.getGithubTokenEncrypted());
        } catch (Exception ex) {
            log.error("토큰 복호화 실패 uid={}", uid, ex);
            return null;
        }
    }

    private AlphaWorkspace requireOwnedWs(Long wsId) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return null;
        return wsRepo.findById(wsId).filter(w -> w.getUser().getId().equals(uid)).orElse(null);
    }

    private AlphaWorkspace requireLinkedWs(Long wsId) {
        AlphaWorkspace ws = requireOwnedWs(wsId);
        if (ws == null) return null;
        return ws.getGithubRepoFullName() == null ? null : ws;
    }

    private ResponseEntity<?> unauth() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "인증 필요"));
    }

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "워크스페이스 접근 불가 또는 Git 미연동"));
    }
}
