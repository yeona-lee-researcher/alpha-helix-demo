package com.DevBridge.devbridge.domain.git.dto;

import java.util.List;
import java.util.Map;

/**
 * AlphaHelix Developer Studio Git 연동 DTO 모음.
 */
public final class AlphaGitDto {
    private AlphaGitDto() {}

    /** GitHub PAT 연결 요청. */
    public record ConnectReq(String token) {}

    /** GitHub 연결 상태. */
    public record ConnectStatus(boolean connected, String username, String connectedAt) {}

    /** Repo picker 항목. */
    public record RepoSummary(String fullName, String name, boolean isPrivate,
                              String defaultBranch, String htmlUrl, String updatedAt) {}

    /** 워크스페이스 ↔ repo 매핑 요청. */
    public record LinkReq(String repoFullName, String branch) {}

    /** 워크스페이스의 Git 연동 상태. */
    public record WorkspaceGitStatus(Long workspaceId, String repoFullName, String branch,
                                     boolean connected, String defaultBranch,
                                     List<String> branches) {}

    /** 커밋 리스트 항목 (요약). */
    public record CommitSummary(String sha, String message, String authorName, String authorAvatar,
                                String authorLogin, String authoredAt, String htmlUrl,
                                List<String> parents) {}

    /** 커밋 상세 + 변경 파일. */
    public record CommitDetail(String sha, String message, String authorName, String authoredAt,
                               String htmlUrl, int additions, int deletions,
                               List<FileChange> files) {}

    /** 단일 파일 변경. */
    public record FileChange(String filename, String status, int additions, int deletions,
                             int changes, String patch, String blobUrl) {}

    /** Push 요청 (file_path → contents). */
    public record PushReq(String branch, String commitMessage, Map<String, String> files) {}

    /** Push 결과. */
    public record PushResult(boolean ok, String sha, String htmlUrl, String error) {}

    /** PR 생성 요청. */
    public record PrCreateReq(String title, String body, String head, String base) {}

    /** PR 생성 결과. */
    public record PrCreateResult(int number, String htmlUrl, String state) {}

    /** 레포 파일 트리 항목 (blob 전용). */
    public record FileTreeEntry(String path, String sha, int size) {}
}
