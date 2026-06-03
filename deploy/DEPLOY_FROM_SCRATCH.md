# DevBridge 새 EC2 인스턴스에 처음부터 배포 (Clean Deploy)

기존 인스턴스(`i-000faaa4241df22cc`, IP `3.87.135.197`)는 Hibernate `validate` 실패 → systemd 무한 재시작 루프 → CPU 100% → SSH 응답 불가 상태입니다. EC2 User Data는 **최초 부팅 시에만 실행**되므로 stop/start로는 복구가 어렵습니다. 가장 깨끗한 방법은 **신규 인스턴스에서 처음부터 자동 부트스트랩**하는 것입니다.

JAR은 이미 `validate` 모드로 로컬 재빌드 완료 (`backend/build/libs/devbridge-0.0.1-SNAPSHOT.jar`, 64MB). 엔티티-DB 스키마 정합성도 검증 끝났습니다.

---

## 0. 준비물 (로컬에 이미 있음)
- `backend/build/libs/devbridge-0.0.1-SNAPSHOT.jar` (Spring Boot 4 / Java 17 / `validate`)
- `frontend/dist/` (Vite build 산출물 — 없으면 1단계 전 `cd frontend; npm install; npm run build`)
- `backend/docs/devbridge_db_full_dump.sql` (10MB, 시드 데이터 포함)
- `deploy/cloud-init-bootstrap.sh` (User Data로 사용)
- `deploy/ENV_TEMPLATE.txt` (`/etc/devbridge/env` 작성용 템플릿)
- `devbridge-key.pem` (기존 키 그대로 재사용 가능)

> 기존 인스턴스의 `/etc/devbridge/env` 안에 들어있던 **JWT_SECRET / GEMINI_API_KEY / STREAM_CHAT_API_KEY / STREAM_CHAT_API_SECRET / MAIL_USERNAME / MAIL_PASSWORD** 값은 사용자만 알고 있습니다(저장소에 없음). 미리 메모 또는 1Password 등에서 꺼내두세요. 모르겠으면 새로 발급해도 동작은 합니다(기존 토큰/세션은 모두 무효).

---

## 1. 기존 인스턴스 종료 (선택)

데이터 보존이 필요하면 **EBS 스냅샷부터 만들고** 종료하세요. DB는 어차피 시드로 재구성 가능하니 스냅샷 없어도 무방.

AWS 콘솔 → EC2 → Instances → `i-000faaa4241df22cc` 선택 → **Instance state ▸ Terminate**.

---

## 2. 신규 EC2 인스턴스 생성

EC2 콘솔 → **Launch instances**.

| 항목 | 값 |
| --- | --- |
| Name | `devbridge-prod` |
| AMI | **Ubuntu Server 24.04 LTS (HVM), SSD** (x86_64) |
| Instance type | **t3.micro** (1 vCPU / 1 GiB) — 스왑 2GB는 부트스트랩이 자동으로 추가 |
| Key pair | 기존 `devbridge-key` 재사용 (또는 신규 생성) |
| Network ▸ Security group | **신규 생성** — 인바운드 규칙: SSH(22) `My IP`, HTTP(80) `Anywhere-IPv4`, HTTPS(443) `Anywhere-IPv4` |
| Storage | 16 GiB gp3 (8 GiB도 충분하지만 여유) |
| Advanced details ▸ User data | **`deploy/cloud-init-bootstrap.sh`의 전체 내용을 복사해 붙여넣기** |

> User data는 **최초 부팅 시 단 한 번만 실행**됩니다. 붙여넣기 누락 시 처음부터 다시 만들어야 합니다.

**Launch instance** → 1~2분 후 Public IPv4 주소 확인 (예: `54.xxx.xxx.xxx`). 이게 새 IP입니다. **Elastic IP를 연결**하면 stop/start 시 IP 변경 방지됩니다(권장).

---

## 3. 부트스트랩 완료 대기 & 확인

User Data가 패키지 설치(JDK + MySQL + nginx)까지 끝내려면 **3~5분** 정도 걸립니다. 그 후 SSH:

```powershell
ssh -i "C:\Team2_DevBridge\devbridge-key.pem" ubuntu@<NEW_IP> "cat /tmp/devbridge-bootstrap-done.log; sudo systemctl status mysql nginx --no-pager | head -20"
```

`BOOTSTRAP_DONE …` 라인이 보이면 성공. 없으면:
```bash
sudo tail -100 /var/log/devbridge-bootstrap.log
sudo tail -100 /var/log/cloud-init-output.log
```

---

## 4. 산출물 업로드 (로컬 PowerShell)

```powershell
$IP = "<NEW_IP>"
$KEY = "C:\Team2_DevBridge\devbridge-key.pem"

# 4-1) JAR
scp -i $KEY "C:\Team2_DevBridge\backend\build\libs\devbridge-0.0.1-SNAPSHOT.jar" `
    ubuntu@${IP}:/home/ubuntu/DevBridge/backend/build/libs/

# 4-2) Frontend dist (폴더 통째로)
scp -i $KEY -r "C:\Team2_DevBridge\frontend\dist\*" `
    ubuntu@${IP}:/home/ubuntu/DevBridge/frontend/dist/

# 4-3) DB 시드 dump
scp -i $KEY "C:\Team2_DevBridge\backend\docs\devbridge_db_full_dump.sql" `
    ubuntu@${IP}:/tmp/devbridge_db_full_dump.sql
```

---

## 5. 환경 파일 작성 (서버에서)

```bash
ssh -i "C:\Team2_DevBridge\devbridge-key.pem" ubuntu@<NEW_IP>
sudo nano /etc/devbridge/env     # deploy/ENV_TEMPLATE.txt 내용을 붙이고 __REPLACE_ME__ 채움
sudo chmod 600 /etc/devbridge/env
sudo chown root:root /etc/devbridge/env
```

`CORS_ALLOWED_ORIGINS`는 **새 IP**로 반드시 갱신 (`http://<NEW_IP>` 또는 도메인).

---

## 6. DB 스키마 import (⚠️ from-scratch 필수)

빈 DB 에서는 Flyway 마이그레이션(V2~V16)만으로 스키마가 만들어지지 **않습니다** — 이들은 ALTER 뿐이고
`broker_account`·`alpha_workspace`·`order_proposal`·`ai_usage_log` 등 Alpha-Helix 핵심 테이블을 CREATE 하는
곳이 없습니다. 따라서 **현재 전체 스키마**(`backend/docs/schema_full_current.sql`, 36테이블)를 먼저 import 해야
애플리케이션 기동 시 `ddl-auto=validate` 가 통과합니다. import 후 Flyway 는 이 스키마를 baseline-version(16)
기준으로 마킹하고 V17+ 만 적용합니다.

```bash
# 6-1) (먼저 업로드) backend/docs/schema_full_current.sql 를 서버로 scp
#      scp -i $KEY backend/docs/schema_full_current.sql ubuntu@${IP}:/tmp/

# 6-2) 빈 DB 생성 후 현재 전체 스키마 import (DB 이름/계정은 env 와 일치시킬 것)
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS alphahelix_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p alphahelix_db < /tmp/schema_full_current.sql

# 6-3) 검증 — 36개 테이블 + 핵심 테이블 존재 확인
mysql -u root -p alphahelix_db -e "
SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema='alphahelix_db';
SHOW TABLES LIKE 'broker_account';
SHOW TABLES LIKE 'alpha_workspace';
"
```

> **(선택) 레거시 시드 데이터** — DevBridge 프리랜서매칭 화면용 시드(`backend/docs/devbridge_db_full_dump.sql`,
> 32테이블·users/projects/partner_* 등)가 필요한 경우에만 추가로 import 합니다. Alpha-Helix 퀀트 기능 동작에는
> 불필요하며, 스키마가 겹치는 테이블은 위 6-2 가 이미 생성하므로 `--insert-ignore` 등으로 데이터만 넣으세요.

---

## 7. 서비스 기동

```bash
sudo systemctl enable devbridge
sudo systemctl start devbridge
sleep 25
sudo systemctl is-active devbridge          # active 기대
sudo journalctl -u devbridge --no-pager | tail -50
```

`Started DevBridge` + `Tomcat started on port 8080` 로그가 보이면 성공.

---

## 8. 최종 검증

```bash
# 백엔드 헬스 (인증 필요 → 401이 정상)
curl -s -o /dev/null -w "API:%{http_code}\n" http://localhost:8080/api/auth/me

# nginx 프록시
curl -s -o /dev/null -w "PROXY:%{http_code}\n" http://localhost/api/auth/me

# 정적 페이지
curl -sI http://localhost/ | head -3
```

브라우저에서 `http://<NEW_IP>` 접속 → hyleeyou(id=3043) / client_hylee(id=3044) 로그인 테스트.

---

## 9. (강력 권장) Elastic IP 할당

EC2 ▸ **Elastic IPs** ▸ Allocate → 인스턴스에 Associate. 이후 stop/start 해도 IP가 고정되어 이번 같은 사고가 재발하지 않습니다.

---

## 트러블슈팅 빠른 참조

| 증상 | 확인 | 조치 |
| --- | --- | --- |
| SSH banner timeout | `top` 진입 불가 | EC2 ▸ Monitoring ▸ CPU 그래프 확인. 100% 지속이면 systemd 재시작 루프. `sudo systemctl stop devbridge` 후 원인 분석 |
| `validate` 실패 (`missing column`) | `journalctl -u devbridge` | 누락된 컬럼만 ALTER TABLE로 추가 (이번 처럼 dump에 포함시켜 두는 게 정석) |
| `502 Bad Gateway` | `curl localhost:8080` | 백엔드 미기동 또는 포트 충돌. `journalctl` 확인 |
| 한글 깨짐 | `mysql ... STATUS` | `character_set_*` 모두 `utf8mb4` 인지 확인 |
| 프론트 빈 화면 | DevTools Network | `CORS_ALLOWED_ORIGINS`에 새 IP 들어갔는지 확인, 서비스 재시작 |
