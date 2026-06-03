# fix(ai): Heli 도크 전략 인지 버그(P1.1) + 퀀트 IDE 고도화 로드맵 (flow_finish → main)

> 직전 PR #52(교재+검증+실버그2)는 main 머지 완료. 이 PR은 그 위(최신 main, 44fc154 포함)에서 작업.
> 작은 버그 수정 1건 + 설계 문서 1건. 안전.

| 항목 | 값 |
|---|---|
| 범위 | `main...flow_finish` |
| 커밋 | **1** (18ff147) |
| 코드 | 프론트 2파일(RightChatDock·StrategyWorkspace) |
| 문서 | `docs/design/quant_ide_roadmap.md`(신규) |
| 검증 | `vite build` ✅ |

---

## 🐞 P1.1 — Heli 도크가 `/strategy` 화면에서 현재 전략을 못 찾던 버그

**근본 원인**: Heli 도크의 wsId 정규식이 `/alpha/w/(\d+)` 만 매칭하는데, 전략 화면은 `/strategy/:id`(StrategyWorkspace). 게다가 StrategyWorkspace가 `localStorage.alpha.lastWsId` 를 세팅하지 않아 → 도크가 현재 워크스페이스를 못 찾음 → 컨텍스트 빈 채 전송 → **"현재 워크스페이스에 로드된 전략 코드가 없어 구체적 분석 어렵다"** 오답.

**수정**:
- `RightChatDock.jsx`: 라우트 정규식에 `/strategy/:id` 추가 + **전송 시점에 wsId 신선하게 재해석**(렌더 시점 stale 방지).
- `StrategyWorkspace.jsx`: `activeId` 변경 시 `localStorage.alpha.lastWsId` 동기화.

→ 이제 `/strategy` 화면에서도 Heli가 현재 전략(설정+백테스트 수치)을 인지해, 백테스트 결과 근거로 수익률·승률 개선을 답함.

## 🗺 `docs/design/quant_ide_roadmap.md` — 고도화 로드맵 박제

다음 단계 작업을 설계로 고정(사용자 요구 반영):
- **P1~P4**: 코드 영속화 / 구독 게이팅 / AI 개선 제안서(진단·선택지·전후비교) / Claude 패치 통합.
- **Claude CLI BYOK(VSCode급)**: 사용자 본인 Claude 키 연동, STANDARD+ 부터 Developer Studio 오픈.
- **채팅 UI**: Developer=Claude+Heli 탭 / Studio=Heli만, 외곽 라일락보라·버튼 연하늘+호버·마이크.
- **🔒 보안**: 사용자 키/계좌는 AES-GCM 암호화(기존 브로커 키 패턴), 배포물(repo/.env)에 절대 미노출. allowlist도 서버사이드(프론트 하드코딩 금지).

> 이 PR 머지 후 로드맵 순서대로 진행: **P1.2+보안/BYOK → P2 게이팅+채팅UI → P3 제안서 → P4 통합** (각 단계 라이브 검증 후 push).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
