package com.DevBridge.devbridge.domain.ai.service;

import com.DevBridge.devbridge.domain.ai.entity.AlphaWorkspace;
import com.DevBridge.devbridge.domain.ai.entity.AlphaWorkspaceChangeSet;
import com.DevBridge.devbridge.domain.git.client.GithubApiClient;
import com.DevBridge.devbridge.domain.git.dto.AlphaGitDto;
import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.user.repository.UserRepository;
import com.DevBridge.devbridge.global.security.AesGcmCryptoService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Claude 에이전트 ChangeSet 이 KEEP 되면 워크스페이스 연동 GitHub repo 에 자동 커밋 (A3).
 *
 * <p>커밋 메시지에 <b>Co-Authored-By: Claude</b> 를 남겨 AI 기여를 git 히스토리에 기록.
 * best-effort — 커밋 실패해도 keep 자체는 성공(결과 맵으로 상태만 반환).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ClaudeGitSyncService {

    private final UserRepository userRepo;
    private final GithubApiClient gh;
    private final AesGcmCryptoService crypto;
    private final ObjectMapper om = new ObjectMapper();

    /** ChangeSet 의 code 변경을 연동 repo 의 워크스페이스 브랜치에 커밋. {committed,files,branch,url,error}. */
    public Map<String, Object> commitChangeSet(AlphaWorkspace ws, AlphaWorkspaceChangeSet cs, Long uid) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("committed", false);

        String repoFull = ws.getGithubRepoFullName();
        if (repoFull == null || !repoFull.contains("/")) { out.put("skipped", "연동 repo 없음"); return out; }
        String token = tokenFor(uid);
        if (token == null) { out.put("error", "GitHub 미연결(토큰 없음)"); return out; }

        List<Map<String, Object>> ops;
        try {
            ops = om.readValue(cs.getOpsJson() == null ? "[]" : cs.getOpsJson(),
                    new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception e) { out.put("error", "ops 파싱 실패"); return out; }

        String[] parts = repoFull.split("/", 2);
        String owner = parts[0], repo = parts[1];
        String branch = (ws.getGithubBranch() == null || ws.getGithubBranch().isBlank()) ? "main" : ws.getGithubBranch();
        String message = (cs.getTitle() == null ? "Claude Code 변경" : cs.getTitle())
                + "\n\nCo-Authored-By: Claude <noreply@anthropic.com>";

        // 대상 브랜치가 없으면 main/master 에서 생성 (전용 테스트 브랜치 등)
        if (gh.getBranchSha(token, owner, repo, branch) == null) {
            String baseSha = gh.getBranchSha(token, owner, repo, "main");
            if (baseSha == null) baseSha = gh.getBranchSha(token, owner, repo, "master");
            if (baseSha != null) gh.createBranch(token, owner, repo, branch, baseSha);
        }

        List<String> files = new ArrayList<>();
        String lastUrl = null, lastErr = null;
        for (Map<String, Object> op : ops) {
            if (!"code".equals(String.valueOf(op.get("target")))) continue;
            String key = String.valueOf(op.get("path"));
            String content = op.get("value") == null ? "" : String.valueOf(op.get("value"));
            String filename = key.contains(".") ? key : key + ".py";   // codeJson 키 → repo 파일명
            String b64 = Base64.getEncoder().encodeToString(content.getBytes(StandardCharsets.UTF_8));
            String sha;
            try { sha = gh.getFileSha(token, owner, repo, filename, branch); } catch (Exception e) { sha = null; }
            AlphaGitDto.PushResult r = gh.putFile(token, owner, repo, filename, branch, message, b64, sha);
            if (r != null && r.ok()) { files.add(filename); lastUrl = r.htmlUrl(); }
            else { lastErr = "putFile 실패: " + filename + (r != null ? " (" + r.error() + ")" : ""); }
        }

        if (!files.isEmpty()) {
            out.put("committed", true);
            out.put("files", files);
            out.put("branch", branch);
            out.put("repo", repoFull);
            out.put("url", lastUrl);
            log.info("[ClaudeGitSync] ws={} → {}@{} {}개 파일 커밋", ws.getId(), repoFull, branch, files.size());
        } else if (lastErr != null) {
            out.put("error", lastErr);
        } else {
            out.put("skipped", "code 변경 없음");
        }
        return out;
    }

    private String tokenFor(Long uid) {
        if (uid == null) return null;
        User u = userRepo.findById(uid).orElse(null);
        if (u == null || u.getGithubTokenEncrypted() == null) return null;
        try {
            return crypto.decrypt(u.getGithubTokenEncrypted());
        } catch (Exception e) {
            log.error("GitHub 토큰 복호화 실패 uid={}", uid, e);
            return null;
        }
    }
}
