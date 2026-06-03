# Alpha-Helix 퀀트 IDE 고도화 로드맵 (P1~P4 + Claude BYOK 통합)

> 비전: **VSCode+Copilot/Claude = 범용 IDE. Alpha-Helix = '퀀트' 전용 IDE.**
> 자동완성의 단위가 "다음 줄"이 아니라 **"백테스트 증거로 입증된 전략 변경(수익률↑/MDD↓)"**.
> 이 문서는 사용자 요구를 박제한 작업 명세 — 단계별로 구현하며 갱신.

---

## 핵심 원칙

**전략 코드는 1급 시민(first-class artifact).** 누가 Studio를 쓰든 안 쓰든, 모든 전략은 확정 시 코드가 생성·서버 저장되어 Heli·Studio·백테스트·AI개선이 같은 하나의 코드를 본다.

---

## 단계 로드맵

### P1 — 코드 영속화 + Heli 인지 (근본 수정)
- **P1.1 (완료·이번 PR)**: Heli 도크 wsId 라우트 버그 수정 — 도크 정규식에 `/strategy/:id` 추가 + 전송 시점 fresh 해석 + `StrategyWorkspace`가 `alpha.lastWsId` 세팅. → `/strategy` 화면에서도 Heli가 현재 전략(설정+백테스트)을 인지 → **"전략 코드 없음" 오답 해소**.
- **P1.2 (다음)**: formalize 직후 **codeJson 서버 저장** — 모든 전략이 코드를 갖게. 기존 `generateCodeFromConfig`(프론트, Lean Python 템플릿) 재사용해 영속화. 비구독 회원 전략도 코드 보유.

### P2 — 구독 게이팅 UX
- **Developer Studio = STANDARD 플랜부터 열림**(그때부터 본인 Claude 키 연동 가능).
- 비구독: 코드 읽기전용 + **"Developer Studio로 고도화" 업그레이드 배너/버튼**.
- 구독: 전략 카드/리포트에서 **"🛠 Studio에서 열기" 버튼/탭** → 해당 전략 코드로 진입.
- **관리자 allowlist(즉시 활성)**: `admin@example.com`, `dev@example.com` 은 플랜 무관 전체 기능 허용.
  - ⚠️ **반드시 서버사이드 config/env 또는 DB 플래그**로(프론트 하드코딩 금지 — M6에서 제거한 실명 PII 재발 방지).

### P3 — AI 개선 제안서 v1 (코어 가치)
사용자가 말한 3요소를 하나의 "개선 제안서"로:
- **🩺 진단(AI 추천 근거)**: 왜 유지/수정/보류인지 수치(MDD·Sharpe·승률·거래수) 근거로 쉽게.
- **🔀 선택지 비교**: 기존 유지 / 안정형 조정 / 공격형 조정 — 파라미터 diff + 트레이드오프.
- **📊 변경 전후 결과 비교**: 각 변형 백테스트 → 수익률·MDD·변동성·Sharpe 비교표 + [적용].
- 재사용: `AlphaPatchService`(apply/keep/undo)·vbt 엔진·`strategyConfig.candidates`.

### P4 — Claude 패치 통합
- Studio 라이브패치(`ClaudeCodeAgentService`)도 같은 제안서·전후비교 포맷으로 통일 → "🔀 Claude diff" + 전후 백테스트 한 화면.

---

## Claude CLI BYOK(Bring-Your-Own-Key) 통합 — VSCode급

> "Claude CLI 당겨서 쓰는 것 = VSCode에서 쓰는 수준 그대로 사용 가능." (헤드리스 `claude -p` + 사용자 키)

- **BYOK**: 사용자가 **본인 Claude API 키**를 UI에서 연동. STANDARD+ 부터.
- **VSCode Claude 기능 패리티**: 코드 편집·다중파일·diff·설명 등. 현재 `ClaudeCodeAgentService`(헤드리스 `claude -p`, `--allowedTools Read,Edit,Write,Glob,Grep --disallowedTools Bash,WebFetch,WebSearch`) 확장.
- **채팅 탭 구성**:
  - **Developer Studio**: **Claude 탭 + Heli 탭 둘 다**.
  - **Workspace(/strategy)**: **Heli 탭만**.

### 채팅 UI 사양 (스크린샷 = Claude Code 패널 참조)
- 상단 탭: `채팅` / `CLAUDE CODE` (또는 Heli/Claude 전환).
- **색상**: 외곽 = **밝은 라일락 보라색**, 버튼 = **연하늘색 + 호버**.
- **마이크(음성 입력)** 지원.
- 대화 히스토리·코드블록·diff 인라인.

---

## 🔒 보안 설계 (배포 시 사용자 키/계좌 미노출) — 필수

**사용자의 Claude API 키·브로커 계좌 등 민감정보가 배포물(repo/빌드/.env)에 절대 들어가지 않게.**

- **저장**: 사용자 Claude 키는 기존 브로커 키와 **동일 패턴 — AES-GCM 암호화**(`CryptoService`/`AesGcmCryptoService`, 마스터키 `APP_CRYPTO_KEY` env). 평문 DB 저장 금지.
- **테이블**: `user_api_key`(user_id, provider='ANTHROPIC', key_enc TEXT, ...) 신설 or User 확장. 마이그레이션 V19.
- **사용 시점**: Claude CLI 호출 직전에만 복호화해 환경변수(`ANTHROPIC_API_KEY`)로 자식 프로세스에 주입, 로그/응답에 노출 금지.
- **배포물 검사**: 사용자 키/계좌는 전부 DB(암호화). repo/.env엔 마스터키만. allowlist도 env/DB(프론트 하드코딩 금지).
- **기존 자산 재사용**: 브로커 키(`BrokerAccount.*Enc`)가 이미 이 패턴 — 그대로 확장.

---

## 작업 분해 / 의존성

| 단계 | 핵심 작업 | 의존 |
|---|---|---|
| P1.1 ✅ | 도크 wsId 수정 | — |
| P1.2 | formalize→codeJson 영속화 | P1.1 |
| 보안 | `user_api_key`(V19) + 암호화 + 복호화 주입 | — (BYOK 선행) |
| BYOK | Claude 키 연동 UI + 서비스가 사용자 키로 `claude -p` | 보안 |
| P2 | Developer STANDARD+ 게이팅 + allowlist(서버) + 배너/버튼 | BYOK |
| 채팅UI | Claude/Heli 탭 + 라일락/연하늘 + 마이크 | P2 |
| P3 | 개선 제안서(진단·선택지·전후비교) | P1.2 |
| P4 | Claude 패치 ↔ 제안서 통합 | P3·BYOK |

> 진행 순서 제안: **P1.2 + 보안/BYOK(키 암호화 영속화)** → **P2 게이팅 + 채팅UI** → **P3 제안서** → **P4 통합**. 각 단계 라이브 검증 후 push.
