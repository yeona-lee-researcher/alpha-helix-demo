# Alpha-Helix · `ai` 브랜치 작업 일지

> 본 문서는 `ai` 브랜치에서 진행한 작업을 시간 순으로 정리한 변경 일지입니다.
> 기간: **2026-05-26 ~ 2026-05-27**
> 대상 배포: `https://who-a.com` (EC2 + Nginx + systemd `who-a-backend` / `who-a-analytics`)

---

## 한 줄 요약

**Alpha Ezer 라이브 패치 시스템(Step 2)** 을 도입했습니다.
사용자가 우측 도크의 Alpha Ezer와 자연어로 대화 → AI가 패치 의도를 감지해 백엔드에 변경 세트를 적용 → **유지 / 실행 취소** 버튼이 채팅 입력박스 바로 위에 나타나는 흐름입니다.
함께 UX 개선(툴팁 가독성, 마크다운 렌더링, 패널 가로 리사이즈, Trust Score 탭 레이아웃 최적화, Calmar 폴백 등)도 다수 적용했습니다.

---

## 1. Alpha Ezer 라이브 패치 (Step 2) — 새 기능

자연어 대화로 백테스트/리스크 설정을 즉시 바꾸고, 마음에 안 들면 **한 번에 되돌릴 수 있는** 변경 세트 시스템.

### 1-A. 백엔드 (Spring Boot, Java 21)

| 파일 | 역할 |
|------|------|
| `backend/.../domain/ai/entity/AlphaWorkspaceChangeSet.java` | 변경 세트 엔티티 (id, wsId, title, opsJson, prevSnapshot, status, createdAt) |
| `backend/.../domain/ai/repository/AlphaWorkspaceChangeSetRepository.java` | JPA 리포지토리 + 워크스페이스별 최신 변경 조회 |
| `backend/.../domain/ai/service/AlphaPatchService.java` | apply / undo / list 로직. apply 시 현재 `strategyConfig` 또는 `riskProfile`에 점 표기(`backtest.slippage_bps` 등)로 ops 적용 후 prev snapshot 저장 |
| `backend/.../domain/ai/controller/AlphaPatchController.java` | REST 3개 엔드포인트 |

#### REST 엔드포인트

```
POST   /api/alpha/workspaces/{wsId}/patch        # 변경 세트 적용
DELETE /api/alpha/workspaces/{wsId}/patch/{id}   # 실행 취소 (prev snapshot 복원)
GET    /api/alpha/workspaces/{wsId}/patches      # 최근 변경 세트 목록
```

요청 바디 예시:
```json
{
  "title": "슬리피지 10bps 적용",
  "ops": [
    { "target": "backtest", "path": "slippage_bps", "value": 10 }
  ]
}
```

#### DB 스키마

`ddl-auto=update` 로 자동 생성된 테이블:
```sql
CREATE TABLE alpha_workspace_changeset (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  workspace_id    BIGINT NOT NULL,
  title           VARCHAR(255),
  ops_json        TEXT,
  prev_snapshot   LONGTEXT,
  status          VARCHAR(32) DEFAULT 'APPLIED',
  created_at      DATETIME(6)
);
```

### 1-B. 프론트엔드 (React + Vite)

| 파일 | 역할 |
|------|------|
| `frontend/src/alpha/alphaApi.js` | `applyPatch / undoPatch / listPatches` 3개 함수 추가 |
| `frontend/src/components/shell/RightChatDock.jsx` | Alpha Ezer SYS 프롬프트에 패치 도구 명세 추가. 응답에서 ` ```alpha-ezer-patch ... ``` ` 블록을 감지해 `applyPatch()` 자동 호출 → `alphaPatchApplied` 이벤트 dispatch |
| `frontend/src/alpha/ChangeBar.jsx` | "✅ 적용됨: ${title} — [유지] [실행 취소]" 알림 바. `alphaPatchApplied` 수신 → 적용 직후 표시. 실행 취소 시 `alphaWorkspaceReload` 발사 |
| `frontend/src/alpha/Workspace.jsx` | `alphaWorkspaceReload` 이벤트 리스너 → 자동 reload |

#### Alpha Ezer SYS 프롬프트 추가 규칙 (요약)

> 사용자가 백테스트 파라미터 변경(예: "슬리피지 10bps 적용")을 요청하면, **자연어 설명 다음에** 아래 코드블록을 출력하세요.
> ```alpha-ezer-patch
> { "title": "...", "ops": [ { "target": "backtest|risk", "path": "slippage_bps", "value": 10 } ] }
> ```

→ RightChatDock 파서가 정규식으로 감지 후 자동 적용. 사용자는 따로 "적용" 버튼을 누르지 않아도 됩니다.

#### ChangeBar 위치 (오늘 변경)

처음에는 Workspace 본문 상단에 두었으나, **사용자가 채팅 화면에서 바로 유지/실행 취소를 누를 수 있도록 RightChatDock의 채팅 입력박스 바로 위로 이동**시켰습니다. (URL이 `/alpha/w/:id` 일 때만 표시)

---

## 2. UX 폴리시 (오늘)

### 2-A. 툴팁 아이콘 `?` → `!` (파스텔 연두 + 동그라미 테두리)

이전: 회색/주황 `?` 마크.
변경: **연두색 배경 + 진한 초록 동그라미 테두리 + 진한 초록 `!`** — Warning이 아닌 "도움말" 톤으로 명확화.

| 파일 | 변경 |
|------|------|
| `frontend/src/alpha/tabs/helpers.jsx` | `Stat`, `SubScoreBar`, `HelpLabel` 3개 컴포넌트의 hint 아이콘 통일 |

```jsx
style={{
  background: "#DCFCE7", color: "#16A34A",
  border: "1.2px solid #16A34A",
  width: 14, height: 14, borderRadius: 999,
  fontSize: 10, fontWeight: 900, cursor: "help",
}}
// title 속성을 아이콘 span 자체에 부여 → 아이콘 위에 정확히 hover해도 즉시 표시
```

### 2-B. 채팅 메시지 마크다운 `**bold**` 렌더링

이전: Alpha Ezer 응답의 `**굵게**` 가 `**굵게**` 그대로 노출.
변경: `RightChatDock.jsx` 에 `renderRichText()` 추가 — `**...**` 굵게 렌더 + `alpha-ezer-patch` raw JSON 코드블록은 자동 숨김.

### 2-C. 우측 전략 요약 패널 좌우 드래그 리사이즈

`Workspace.jsx` 의 오른쪽 패널(기본 300px) 좌측 가장자리에 6px 너비의 col-resize 핸들 추가.
드래그로 220 ~ 640px 범위 조절. 폭은 `localStorage("alpha.rightPanelWidth")` 에 저장되어 다음 방문 시 복원.

### 2-D. Trust Score 탭 레이아웃 최적화

Trust Score 탭은 본문 글자가 많아 우측 패널과 같이 보면 분할이 심했습니다.
→ **Trust Score 탭일 때만** 우측 패널(전략 요약/REGIME/TRUST SCORE/주요 리스크)을 좌측 사이드바 하단으로 이동시키고, 메인 영역을 더 넓게 사용합니다. 다른 탭은 기존과 동일.

### 2-E. 좌측 워크스페이스 목록 굵기 강화

`< 워크스페이스 목록` 텍스트 가독성 향상:
```diff
- fontSize: 12, (default weight)
+ fontSize: 13, fontWeight: 600
```

### 2-F. Calmar 측정값 폴백

이전: 백테스트 결과의 Calmar가 종종 `—` 로 비어있었음. vectorbt `pf.calmar_ratio()` 가 NaN을 반환하는 경우가 있어서.

| 위치 | 변경 |
|------|------|
| `analytics/app/backtest/vbt_engine.py` | `pf.calmar_ratio()` 가 None/NaN이면 raw float 변환 후 `annualized_return × 100 / |max_drawdown_%|` 로 수동 재계산 |
| `frontend/src/alpha/tabs/ReportPanel.jsx` | 백엔드가 null을 주더라도 프론트에서 같은 공식으로 즉시 계산. 기존 백테스트 결과도 표시 가능 |

### 2-G. heli 썸네일 용량 축소

`frontend/src/assets/heli_thumb/*.png` (256×256) — 약 **21MB → 710KB** (3% 수준). 첫 페이지 로딩 속도 개선.

---

## 3. 인프라 / 운영

- 백엔드: `tar.gz` → SCP → EC2 `/home/ec2-user/who-a-backend.jar` 갱신 → `sudo systemctl restart who-a-backend` → `journalctl -u who-a-backend -f` 로 부팅 검증
- 프론트: `npm run build` → `dist/` tar → SCP → `/var/www/who-a` 교체 → `sudo systemctl reload nginx` → `grep -oE 'index-[A-Za-z0-9_-]+\.(js|css)' /var/www/who-a/index.html` 로 새 해시 검증
- Analytics: `vbt_engine.py` SCP 후 `sudo systemctl restart who-a-analytics`
- 검증: HTTP 200 + DB 테이블 존재 (`SHOW TABLES LIKE 'alpha_workspace_changeset'`) + 비로그인 호출 시 401 가드 정상

---

## 4. E2E 시나리오 (수동 확인 완료)

워크스페이스 ID `2`, `3`, `7`, `8`, `9` 에서 확인:

1. `/alpha/w/2` 진입 → 우측 Alpha Ezer 채팅창 열기
2. "슬리피지 10bps 적용해줘" 입력
3. Alpha Ezer 응답에 굵은 글씨 정상, raw JSON은 숨김
4. 채팅 입력박스 바로 위에 `✅ 적용됨: 슬리피지 10bps 적용 (#1) — [유지] [실행 취소]` 표시
5. **실행 취소** 클릭 → 자동 reload → 백테스트 설정 원복 확인
6. Trust Score 탭 진입 → 우측 패널이 좌측 하단으로 이동, 메인 영역 확장 확인

---

## 5. 다음 작업 후보

- [ ] HERO 메인 배너 mp4 교체 (`배너후보.mp4` 대기)
- [ ] Alpha Ezer 패치 op 확장 (현재는 단일 path 점 표기, 향후 배열/조건 op)
- [ ] ChangeBar에 변경 세트 히스토리 토글 (현재는 최신 한 건만 표시)

---

## 변경 파일 목록

```
backend/src/main/java/com/DevBridge/devbridge/domain/ai/
  entity/AlphaWorkspaceChangeSet.java                (new)
  repository/AlphaWorkspaceChangeSetRepository.java  (new)
  service/AlphaPatchService.java                     (new)
  controller/AlphaPatchController.java               (new)

frontend/src/alpha/
  alphaApi.js                  (+patch endpoints)
  ChangeBar.jsx                (new)
  Workspace.jsx                (resize handle, trust layout, list weight)
  tabs/helpers.jsx             (! icon, hover tooltip)
  tabs/ReportPanel.jsx         (calmar fallback)
  heroAssets.js                (256px thumb refs)

frontend/src/components/shell/
  RightChatDock.jsx            (patch parser, markdown, ChangeBar mount)

frontend/src/assets/heli_thumb/ (new — 256×256 thumbnails)

analytics/app/backtest/
  vbt_engine.py                (robust calmar fallback)
```
