package com.DevBridge.devbridge.domain.git.client;

import com.DevBridge.devbridge.domain.git.dto.AlphaGitDto.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.util.*;

/**
 * GitHub REST API v3 클라이언트. 토큰은 호출 시 인자로 받아 헤더에 넣고, 인스턴스 보관 X.
 *
 * <p>레이트 리밋: 인증 5000 req/h. 응답 헤더의 X-RateLimit-Remaining 로깅.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GithubApiClient {

    private static final String BASE = "https://api.github.com";
    private static final String ACCEPT = "application/vnd.github+json";
    private static final String API_VERSION = "2022-11-28";

    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final RestClient http = RestClient.builder()
            .baseUrl(BASE)
            .defaultHeader(HttpHeaders.ACCEPT, ACCEPT)
            .defaultHeader("X-GitHub-Api-Version", API_VERSION)
            .build();

    /** GET /user — 토큰 유효성 검증 + username 추출. */
    public String getAuthenticatedUsername(String token) {
        JsonNode node = get(token, "/user");
        return node.path("login").asText(null);
    }

    /** GET /user/repos — 사용자 repo 목록. */
    public List<RepoSummary> listRepos(String token) {
        JsonNode arr = get(token, "/user/repos?sort=updated&per_page=50&affiliation=owner,collaborator");
        List<RepoSummary> out = new ArrayList<>();
        for (JsonNode r : arr) {
            out.add(new RepoSummary(
                    r.path("full_name").asText(),
                    r.path("name").asText(),
                    r.path("private").asBoolean(false),
                    r.path("default_branch").asText("main"),
                    r.path("html_url").asText(),
                    r.path("updated_at").asText()
            ));
        }
        return out;
    }

    /** GET /repos/{owner}/{repo}/branches — 브랜치 이름만 추출. */
    public List<String> listBranches(String token, String owner, String repo) {
        try {
            JsonNode arr = get(token, "/repos/" + owner + "/" + repo + "/branches?per_page=50");
            List<String> out = new ArrayList<>();
            for (JsonNode b : arr) out.add(b.path("name").asText());
            return out;
        } catch (HttpClientErrorException ex) {
            if (ex.getStatusCode().value() == 409) {
                log.info("빈 저장소 (브랜치 없음): {}/{}", owner, repo);
                return List.of();
            }
            throw ex;
        }
    }

    /** GET /repos/{owner}/{repo} — 기본 브랜치 등 메타. */
    public Map<String, Object> getRepoMeta(String token, String owner, String repo) {
        JsonNode node = get(token, "/repos/" + owner + "/" + repo);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("defaultBranch", node.path("default_branch").asText("main"));
        m.put("private", node.path("private").asBoolean(false));
        m.put("htmlUrl", node.path("html_url").asText());
        m.put("description", node.path("description").asText(""));
        return m;
    }

    /** GET /repos/{owner}/{repo}/commits?sha={branch} — 커밋 리스트. */
    public List<CommitSummary> listCommits(String token, String owner, String repo, String branch, int perPage) {
        String url = "/repos/" + owner + "/" + repo + "/commits?per_page=" + Math.min(Math.max(perPage, 1), 100);
        if (branch != null && !branch.isBlank()) url += "&sha=" + branch;
        try {
            JsonNode arr = get(token, url);
            List<CommitSummary> out = new ArrayList<>();
            for (JsonNode c : arr) {
                JsonNode commit = c.path("commit");
                JsonNode author = c.path("author");
                List<String> parents = new ArrayList<>();
                c.path("parents").forEach(p -> parents.add(p.path("sha").asText()));
                out.add(new CommitSummary(
                        c.path("sha").asText(),
                        commit.path("message").asText(),
                        commit.path("author").path("name").asText(),
                        author.path("avatar_url").asText(null),
                        author.path("login").asText(null),
                        commit.path("author").path("date").asText(),
                        c.path("html_url").asText(),
                        parents
                ));
            }
            return out;
        } catch (HttpClientErrorException ex) {
            if (ex.getStatusCode().value() == 409) {
                log.info("빈 저장소 (커밋 없음): {}/{}", owner, repo);
                return List.of();
            }
            throw ex;
        }
    }

    /** GET /repos/{owner}/{repo}/commits/{sha} — 커밋 상세 + 변경 파일. */
    public CommitDetail getCommit(String token, String owner, String repo, String sha) {
        JsonNode c = get(token, "/repos/" + owner + "/" + repo + "/commits/" + sha);
        JsonNode stats = c.path("stats");
        List<FileChange> files = new ArrayList<>();
        for (JsonNode f : c.path("files")) {
            files.add(new FileChange(
                    f.path("filename").asText(),
                    f.path("status").asText(),
                    f.path("additions").asInt(0),
                    f.path("deletions").asInt(0),
                    f.path("changes").asInt(0),
                    f.path("patch").asText(null),
                    f.path("blob_url").asText(null)
            ));
        }
        return new CommitDetail(
                c.path("sha").asText(),
                c.path("commit").path("message").asText(),
                c.path("commit").path("author").path("name").asText(),
                c.path("commit").path("author").path("date").asText(),
                c.path("html_url").asText(),
                stats.path("additions").asInt(0),
                stats.path("deletions").asInt(0),
                files
        );
    }

    /** GET /repos/{owner}/{repo}/compare/{base}...{head} */
    public CommitDetail compare(String token, String owner, String repo, String base, String head) {
        JsonNode c = get(token, "/repos/" + owner + "/" + repo + "/compare/" + base + "..." + head);
        List<FileChange> files = new ArrayList<>();
        for (JsonNode f : c.path("files")) {
            files.add(new FileChange(
                    f.path("filename").asText(),
                    f.path("status").asText(),
                    f.path("additions").asInt(0),
                    f.path("deletions").asInt(0),
                    f.path("changes").asInt(0),
                    f.path("patch").asText(null),
                    f.path("blob_url").asText(null)
            ));
        }
        return new CommitDetail("compare", base + "..." + head, "—", "",
                c.path("html_url").asText(),
                c.path("ahead_by").asInt(0),
                c.path("behind_by").asInt(0),
                files);
    }

    /** PUT /repos/{owner}/{repo}/contents/{path} — 단일 파일 생성/업데이트. */
    public PushResult putFile(String token, String owner, String repo, String path,
                              String branch, String commitMessage, String contentBase64, String existingSha) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", commitMessage);
        body.put("content", contentBase64);
        body.put("branch", branch);
        if (existingSha != null) body.put("sha", existingSha);
        try {
            String respBody = http.put()
                    .uri("/repos/" + owner + "/" + repo + "/contents/" + path)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);
            JsonNode resp = parse(respBody);
            JsonNode commit = resp.path("commit");
            return new PushResult(true, commit.path("sha").asText(), commit.path("html_url").asText(), null);
        } catch (HttpClientErrorException ex) {
            log.warn("GitHub putFile failed: {} {}", ex.getStatusCode(), ex.getResponseBodyAsString());
            return new PushResult(false, null, null, ex.getStatusText());
        } catch (Exception ex) {
            log.warn("GitHub putFile parse failed: {}", ex.getMessage());
            return new PushResult(false, null, null, ex.getMessage());
        }
    }

    /** GET /repos/{owner}/{repo}/contents/{path}?ref={branch} — 기존 파일 sha 조회 (업데이트 시 필요). */
    public String getFileSha(String token, String owner, String repo, String path, String branch) {
        try {
            JsonNode node = get(token, "/repos/" + owner + "/" + repo + "/contents/" + path + "?ref=" + branch);
            return node.path("sha").asText(null);
        } catch (HttpClientErrorException.NotFound nf) {
            return null;
        }
    }

    /** GET git/refs/heads/{branch} 의 커밋 sha. 브랜치 없으면 null. */
    public String getBranchSha(String token, String owner, String repo, String branch) {
        try {
            JsonNode n = get(token, "/repos/" + owner + "/" + repo + "/git/refs/heads/" + branch);
            String sha = n.path("object").path("sha").asText(null);
            return (sha == null || sha.isEmpty()) ? null : sha;
        } catch (Exception e) {
            return null;
        }
    }

    /** POST git/refs — baseSha 기반 새 브랜치 생성. 성공 시 true. (A3 전용 테스트 브랜치 자동생성 등) */
    public boolean createBranch(String token, String owner, String repo, String newBranch, String baseSha) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("ref", "refs/heads/" + newBranch);
            body.put("sha", baseSha);
            http.post()
                    .uri("/repos/" + owner + "/" + repo + "/git/refs")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);
            return true;
        } catch (Exception e) {
            log.warn("GitHub createBranch failed: {}", e.getMessage());
            return false;
        }
    }

    /** GET /repos/{owner}/{repo}/contents/{path}?ref={branch} — 파일 내용 디코딩 후 반환. */
    public String getFileContent(String token, String owner, String repo, String path, String branch) {
        JsonNode node = get(token, "/repos/" + owner + "/" + repo + "/contents/" + path + "?ref=" + branch);
        String encoded = node.path("content").asText("").replaceAll("\\s", "");
        if (encoded.isEmpty()) return "";
        return new String(java.util.Base64.getDecoder().decode(encoded));
    }

    /** GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1 — 전체 파일 트리 (blob만). */
    public List<FileTreeEntry> getFileTree(String token, String owner, String repo, String branch) {
        try {
            JsonNode node = get(token, "/repos/" + owner + "/" + repo + "/git/trees/" + branch + "?recursive=1");
            List<FileTreeEntry> out = new ArrayList<>();
            for (JsonNode f : node.path("tree")) {
                if ("blob".equals(f.path("type").asText())) {
                    out.add(new FileTreeEntry(
                            f.path("path").asText(),
                            f.path("sha").asText(),
                            f.path("size").asInt(0)
                    ));
                }
            }
            return out;
        } catch (HttpClientErrorException ex) {
            if (ex.getStatusCode().value() == 409) {
                log.info("빈 저장소 (파일 트리 없음): {}/{}", owner, repo);
                return List.of();
            }
            throw ex;
        }
    }

    /** DELETE /repos/{owner}/{repo}/contents/{path} — 파일 삭제 (sha 자동 조회). */
    public void deleteFile(String token, String owner, String repo, String path, String branch, String commitMessage) {
        String sha = getFileSha(token, owner, repo, path, branch);
        if (sha == null) return;
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", commitMessage);
        body.put("sha", sha);
        body.put("branch", branch);
        try {
            http.method(org.springframework.http.HttpMethod.DELETE)
                    .uri("/repos/" + owner + "/" + repo + "/contents/" + path)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (HttpClientErrorException ex) {
            log.warn("GitHub deleteFile failed: {} {}", ex.getStatusCode(), ex.getResponseBodyAsString());
            throw new IllegalStateException("파일 삭제 실패: " + ex.getStatusText());
        }
    }

    /** POST /repos/{owner}/{repo}/pulls — PR 생성. */
    public PrCreateResult createPr(String token, String owner, String repo, PrCreateReq req) {
        try {
            String respBody = http.post()
                    .uri("/repos/" + owner + "/" + repo + "/pulls")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "title", req.title(),
                            "body", req.body() == null ? "" : req.body(),
                            "head", req.head(),
                            "base", req.base()))
                    .retrieve()
                    .body(String.class);
            JsonNode resp = parse(respBody);
            return new PrCreateResult(resp.path("number").asInt(),
                    resp.path("html_url").asText(),
                    resp.path("state").asText());
        } catch (HttpClientErrorException ex) {
            log.warn("GitHub createPr failed: {} {}", ex.getStatusCode(), ex.getResponseBodyAsString());
            throw new IllegalStateException("PR 생성 실패: " + ex.getStatusText());
        }
    }

    private JsonNode parse(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (Exception ex) {
            throw new RuntimeException("GitHub API 응답 파싱 실패: " + ex.getMessage(), ex);
        }
    }

    private JsonNode get(String token, String path) {
        ResponseEntity<String> resp = http.get()
                .uri(path)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .toEntity(String.class);
        String remaining = resp.getHeaders().getFirst("X-RateLimit-Remaining");
        if (remaining != null && Integer.parseInt(remaining) < 100) {
            log.warn("GitHub rate limit low: {} remaining for token", remaining);
        }
        try {
            return parse(resp.getBody());
        } catch (Exception ex) {
            throw new RuntimeException("GitHub API 응답 파싱 실패: " + ex.getMessage(), ex);
        }
    }
}
