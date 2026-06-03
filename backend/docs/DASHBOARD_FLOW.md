# DevBridge 진행 프로젝트 관리 대시보드 — 최종 플로우 & DB 구조

작성일: 2026-04-22 | 버전: v2.0

---

## 1. 전체 시스템 개요

```
[ClientDashboard]          [PartnerDashboard]
       │                          │
       └──────────┬───────────────┘
                  ↓
        ProjectManageTabLive.jsx   ← 파트너/클라이언트 공용 컴포넌트
        role="CLIENT" | "PARTNER"
                  │
        ┌─────────┴─────────┐
        ↓                   ↓
  목록 뷰 (List)       상세 뷰 (Detail)
  ProjectSummaryCard   ProjectDetailLive
                          │
              ┌───────────┼───────────────┐
              ↓           ↓               ↓
         마일스톤       Files/Links     계약세부협의
         진행 패널    첨부파일 패널     (7항목 모달)
```

---

## 2. 역할별 대시보드 이용 플로우

### 🟦 CLIENT (클라이언트) 플로우

```
로그인 → 클라이언트 대시보드
  │
  ├─ [진행 프로젝트 관리] 탭 클릭
  │     │
  │     ├─ 진행 프로젝트 목록 조회 (status: IN_PROGRESS, RECRUITING)
  │     │     └─ ProjectSummaryCard: 마일스톤 진행률 + 상태 목록 표시
  │     │
  │     ├─ 완료 프로젝트 목록 조회 (status: COMPLETED)
  │     │     └─ 초록 카드, 100% 게이지
  │     │
  │     └─ [관리 상세 →] 클릭 → 상세 뷰 진입
  │           │
  │           ├─ 마일스톤 진행 패널
  │           │     ├─ [결제하기] — PENDING 에스크로 결제 (EscrowPayModal)
  │           │     ├─ [승인] — SUBMITTED 마일스톤 승인 → 에스크로 RELEASED
  │           │     └─ [수정 요청] / [수정 철회] — 수정 요청·철회 워크플로우
  │           │
  │           ├─ Files / External Links 탭
  │           │     ├─ [+ 파일 업로드] — 파일명+URL+설명 입력 → DB 저장
  │           │     ├─ [+ 링크 추가] — 링크명+URL+설명 입력 → DB 저장
  │           │     ├─ 파일명 클릭 → 설명 토글 확장
  │           │     ├─ ⬇ 다운로드 아이콘 — 파일 다운로드
  │           │     └─ 📋 복사 아이콘 — 링크 URL 클립보드 복사
  │           │
  │           ├─ 계약 세부 협의 항목 (오른쪽 사이드바)
  │           │     └─ 7개 항목 클릭 → ContractItemModal
  │           │           ├─ 협의 내용(텍스트) 입력/수정
  │           │           └─ 상태 선택: 미확정/논의 중/제안됨/확정/협의완료
  │           │
  │           └─ [미팅으로 이동하기] → project_meeting 탭으로 전환
  │
  └─ [진행 프로젝트 미팅] 탭
        └─ [대시보드 이동] → project_manage 탭으로 복귀 (해당 프로젝트 자동 선택)
```

---

### 🟩 PARTNER (파트너) 플로우

```
로그인 → 파트너 대시보드
  │
  ├─ [진행 프로젝트 관리] 탭 클릭
  │     │
  │     ├─ 수락된 지원 프로젝트 목록 조회
  │     │     (applicationStatus: ACCEPTED/CONTRACTED/IN_PROGRESS/COMPLETED)
  │     │
  │     ├─ 진행 중 / 완료 섹션 분리 표시
  │     │
  │     └─ [관리 상세 →] 클릭 → 상세 뷰 진입
  │           │
  │           ├─ 마일스톤 진행 패널
  │           │     ├─ [제출하기] — IN_PROGRESS 마일스톤 납품 제출 (MilestoneSubmitModal)
  │           │     ├─ [재제출] — REVISION_REQUESTED 상태 재납품
  │           │     └─ 에스크로 상태 표시 (결제 대기 / 보관 중 / 검수 중 / 정산 완료)
  │           │
  │           ├─ Files / External Links 탭 (클라이언트와 동일)
  │           │     ├─ [+ 파일 업로드] / [+ 링크 추가]
  │           │     ├─ ⬇ 다운로드 / 📋 복사 아이콘
  │           │     └─ 파일·링크명 클릭 → 설명 토글
  │           │
  │           ├─ 계약 세부 협의 항목 (파트너도 수정 가능)
  │           │     └─ 항목 클릭 → ContractItemModal
  │           │           ├─ 협의 내용 입력 / 제안
  │           │           └─ 상태를 "제안됨"으로 변경하여 클라이언트에 공유
  │           │
  │           └─ [미팅으로 이동하기] → project_meeting 탭으로 전환
  │
  └─ [진행 프로젝트 미팅] 탭
        └─ [대시보드 이동] → project_manage 탭 복귀
```

---

## 3. 데이터베이스 테이블 구조 및 업데이트 흐름

### 3-1. 주요 테이블

| 테이블 | 역할 | 주요 컬럼 |
|---|---|---|
| `PROJECTS` | 프로젝트 기본 정보 | `id`, `title`, `status`, `deadline` |
| `PROJECT_MILESTONES` | 마일스톤 (진행 단계) | `id`, `project_id`, `seq`, `title`, `status`, `amount`, `submitted_at`, `revision_reason` |
| `PROJECT_ESCROWS` | 에스크로 결제 내역 | `id`, `project_id`, `milestone_id`, `amount`, `status` (PENDING/DEPOSITED/RELEASED/REFUNDED) |
| `PROJECT_MODULES` | 계약 세부협의 7항목 | `id`, `project_id`, `module_key`, `status`, `data` (JSON), `last_modifier_id` |
| `PROJECT_ATTACHMENTS` | 파일·링크 첨부 | `id`, `project_id`, `kind` (FILE/LINK), `name`, `url`, `notes`, `size_bytes` |
| `PROJECT_APPLICATIONS` | 파트너 지원 내역 | `id`, `project_id`, `user_id`, `status` (ACCEPTED/CONTRACTED/IN_PROGRESS/COMPLETED) |

### 3-2. 프로젝트 라이프사이클별 DB 상태 변화

```
프로젝트 등록
  PROJECTS.status = 'RECRUITING'
  PROJECT_MILESTONES 생성 (status=PENDING)
  PROJECT_ESCROWS 생성 (status=PENDING)
        ↓
파트너 매칭·계약
  PROJECT_APPLICATIONS.status = ACCEPTED → CONTRACTED → IN_PROGRESS
        ↓
마일스톤 시작 (클라이언트 결제)
  PROJECT_ESCROWS.status = PENDING → DEPOSITED
  PROJECT_MILESTONES.status = PENDING → IN_PROGRESS
        ↓
파트너 납품 제출 [제출하기 버튼]
  PROJECT_MILESTONES.status = IN_PROGRESS → SUBMITTED
  PROJECT_MILESTONES.submitted_at = NOW()
  PROJECT_MILESTONES.submission_note = "..."
        ↓
클라이언트 검수
  ┌─ [수정 요청] → PROJECT_MILESTONES.status = SUBMITTED → REVISION_REQUESTED
  │                 PROJECT_MILESTONES.revision_reason = "..."
  │                 [수정 철회] → status = REVISION_REQUESTED → SUBMITTED
  │                              revision_reason = null
  │   파트너 재제출 → status = REVISION_REQUESTED → SUBMITTED
  │
  └─ [승인] → PROJECT_MILESTONES.status = SUBMITTED → APPROVED
               PROJECT_ESCROWS.status = DEPOSITED → RELEASED
        ↓
전체 마일스톤 완료
  PROJECTS.status = IN_PROGRESS → COMPLETED
  PROJECT_APPLICATIONS.status = IN_PROGRESS → COMPLETED
```

### 3-3. 계약 세부협의 (PROJECT_MODULES) 업데이트

```
항목 클릭 → ContractItemModal 팝업
  사용자가 내용 입력 + 상태 선택
        ↓
  PUT /api/projects/{id}/modules/{key}
  { status: "협의완료", data: '{"text":"..."}' }
        ↓
  PROJECT_MODULES UPSERT
  (project_id + module_key UNIQUE KEY 기반 INSERT OR UPDATE)
        ↓
  프론트엔드 modules state 즉시 갱신
  사이드바 배지 (진행률 %) 자동 업데이트
```

### 3-4. 파일·링크 첨부 (PROJECT_ATTACHMENTS)

```
[+ 파일 업로드] / [+ 링크 추가] 클릭
  → 이름 + URL + 설명(선택) 입력
  → POST /api/projects/{id}/attachments
  → PROJECT_ATTACHMENTS INSERT
        ↓
파일 목록: ⬇ 다운로드 아이콘
링크 목록: 📋 복사 아이콘 + 열기 ↗
이름 클릭: 설명(notes) 펼침/접기 토글
```

---

## 4. API 엔드포인트 요약

| Method | Path | 역할 |
|---|---|---|
| `GET` | `/api/projects/my` | 클라이언트 프로젝트 목록 |
| `GET` | `/api/applications/my` | 파트너 지원 내역 목록 |
| `GET` | `/api/projects/{id}/dashboard` | 프로젝트 상세 (마일스톤+에스크로+첨부) |
| `GET` | `/api/projects/{id}/modules` | 계약 세부협의 7항목 조회 |
| `PUT` | `/api/projects/{id}/modules/{key}` | 세부협의 항목 저장/수정 |
| `GET` | `/api/projects/{id}/attachments` | 첨부파일·링크 목록 |
| `POST` | `/api/projects/{id}/attachments` | 파일/링크 등록 |
| `DELETE` | `/api/projects/{id}/attachments/{aid}` | 첨부 삭제 |
| `POST` | `/api/projects/{id}/milestones/{mid}/submit` | 마일스톤 납품 제출 |
| `POST` | `/api/projects/{id}/milestones/{mid}/approve` | 마일스톤 승인 (클라이언트) |
| `POST` | `/api/projects/{id}/milestones/{mid}/request-revision` | 수정 요청 |
| `POST` | `/api/projects/{id}/milestones/{mid}/cancel-revision` | 수정 요청 철회 |
| `POST` | `/api/projects/{id}/escrows/{eid}/deposit` | 에스크로 결제 |

---

## 5. 접근 권한 (Access Control)

| 역할 | 접근 가능 조건 |
|---|---|
| CLIENT | `PROJECTS.client_user_id = 현재 사용자 ID` |
| PARTNER | `PROJECT_ESCROWS.payee_user_id = 현재 사용자 ID` **OR** `PROJECT_APPLICATIONS.user_id = 현재 사용자 ID AND status IN (ACCEPTED, CONTRACTED, IN_PROGRESS, COMPLETED)` |

---

## 6. 완료 프로젝트 seed 데이터

### DB에 존재하는 완료 프로젝트 (COMPLETED)

| project_id | 제목 | 마일스톤 | 모듈 상태 |
|---|---|---|---|
| 1104 | Festory (전국 축제 정보 통합 플랫폼) | 3개 APPROVED | 7항목 협의완료 |
| 1105 | Alpha-Helix (MSA 아키텍처 설계) | 3개 APPROVED | 7항목 협의완료 |
| 1106 | DevBridge Platform (DB·알고리즘·배포) | 3개 APPROVED | 7항목 협의완료 |

seed SQL 파일:
- `docs/seed_completed_milestones.sql` — 마일스톤·에스크로·첨부파일
- `docs/seed_completed_modules.sql` — 계약 세부협의 7항목 (협의완료 + 내용)

---

## 7. 파트너/클라이언트 역할 비교표

| 기능 | 클라이언트 | 파트너 |
|---|---|---|
| 프로젝트 조회 기준 | 내가 등록한 프로젝트 | 수락된 지원 프로젝트 |
| 마일스톤 결제 | ✅ [결제하기] 버튼 | ✗ |
| 마일스톤 승인 | ✅ [승인] 버튼 | ✗ |
| 수정 요청 | ✅ [수정 요청] | ✗ |
| 수정 요청 철회 | ✅ [수정 철회] | ✗ |
| 마일스톤 제출 | ✗ | ✅ [제출하기] / [재제출] |
| 파일/링크 등록 | ✅ | ✅ |
| 계약 세부협의 수정 | ✅ | ✅ |
| 메시지 버튼 | "파트너 메시지" | "클라이언트 메시지" |
| 완료 섹션 설명 | "제출물과 정산 내역이 보관..." | "마일스톤 및 정산 내역 확인..." |
