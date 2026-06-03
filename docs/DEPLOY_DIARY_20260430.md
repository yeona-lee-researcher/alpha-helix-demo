# EC2에 Spring Boot + React 풀스택 배포기 — 좀비 인스턴스를 버리고 새로 시작한 하루

> 2026-04-30 / DevBridge 프로젝트 / Java 17 · Spring Boot 4 · React(Vite) · MySQL 8.4 · Ubuntu 24.04

---

## TL;DR

- 기존 EC2 인스턴스가 systemd `Restart=always` 무한 루프로 **CPU 점유 → SSH 영구 차단**
- 살리는 시도(EC2 Serial Console, Stop-Start, Reboot) 모두 실패 → **새 인스턴스 + cloud-init 자동 부트스트랩**으로 갈아탐
- User Data 스크립트 한 방으로 JDK / MySQL / nginx / 스왑 / systemd unit / 방화벽 모두 자동 설치
- JAR · 빌드된 dist · DB 덤프만 SCP로 올리고 `systemctl start devbridge` → **공개 IP 200 OK**
- 결과: `http://52.90.243.173` 정상 서비스, API 응답 6.7MB JSON 잘 내려옴

---

## 1. 사건의 발단 — 좀비 인스턴스

기존 인스턴스에서 백엔드를 띄웠는데, 잘못된 환경변수 + JDK 메모리 부족(OOM)으로 부팅 실패가 반복됨.

`devbridge.service`에 이런 설정을 했던 게 화근:

```ini
Restart=always
RestartSec=2
```

→ 죽으면 2초 후 재시작 → 또 죽음 → ...
→ JVM이 1초마다 부트하면서 t3.micro RAM 1GB 다 잡아먹음
→ **SSH 데몬이 메모리 부족으로 응답 안 함**
→ 터미널 진입 자체가 불가능

EC2 콘솔에서 Stop → Start, Reboot, Serial Console 다 시도했지만 부팅 직후 바로 같은 루프 진입. **사실상 벽돌**.

> **교훈**: `Restart=always`는 위험. 최소 `Restart=on-failure` + `RestartSec=10` + `StartLimitBurst=5` 로 폭주를 막아야 함.

---

## 2. 결정 — 살리지 말고 새로 만들자

진단·복구에 시간 쓰는 것보다 **재현 가능한 부트스트랩 스크립트**를 만들어두는 게 장기적으로 이득. cloud-init User Data로 모든 셋업을 자동화하기로 함.

### 2-1. 신규 인스턴스 스펙

| 항목 | 값 |
|---|---|
| AMI | Ubuntu Server 24.04 LTS (x86_64) |
| 타입 | t3.micro (1 vCPU / 1 GiB RAM) |
| 스토리지 | 32 GiB gp3 |
| 보안그룹 | SSH 22 / HTTP 80 / HTTPS 443 (0.0.0.0/0) |
| 키페어 | 기존 PEM 재사용 |

### 2-2. cloud-init 부트스트랩 스크립트 (User Data)

`Launch instances ▸ Advanced details ▸ User data` 영역에 통째로 붙여넣음. 부팅이 끝나면 즉시 실행됨.

```bash
#!/bin/bash
set -eux
exec > >(tee -a /var/log/devbridge-bootstrap.log) 2>&1

# 0) 스왑 2GB — t3.micro RAM 1GiB 보강
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 1) 패키지
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y openjdk-17-jdk mysql-server nginx curl unzip ufw

# 2) 방화벽
ufw --force enable
ufw allow OpenSSH
ufw allow 'Nginx HTTP'

# 3) MySQL — localhost only
sed -i 's/^bind-address.*/bind-address = 127.0.0.1/' /etc/mysql/mysql.conf.d/mysqld.cnf
systemctl enable --now mysql
mysql -u root <<SQL
CREATE DATABASE IF NOT EXISTS devbridge_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'devbridge'@'localhost' IDENTIFIED BY 'changeme';
GRANT ALL PRIVILEGES ON devbridge_db.* TO 'devbridge'@'localhost';
FLUSH PRIVILEGES;
SQL

# 4) 디렉터리 골격
install -d -o ubuntu -g ubuntu /home/ubuntu/DevBridge/backend/build/libs
install -d -o ubuntu -g ubuntu /home/ubuntu/DevBridge/frontend/dist
install -d -o root   -g root   /etc/devbridge
install -d -o ubuntu -g ubuntu /var/devbridge/uploads

# 5) systemd unit (안전한 재시작 정책)
cat >/etc/systemd/system/devbridge.service <<'UNIT'
[Unit]
Description=DevBridge Spring Boot
After=network.target mysql.service
Requires=mysql.service

[Service]
Type=simple
User=ubuntu
EnvironmentFile=/etc/devbridge/env
ExecStart=/usr/bin/java -Xms256m -Xmx512m -jar \
  /home/ubuntu/DevBridge/backend/build/libs/devbridge-0.0.1-SNAPSHOT.jar \
  --spring.profiles.active=prod
Restart=on-failure
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload

# 6) nginx 리버스 프록시
cat >/etc/nginx/sites-available/devbridge <<'NGINX'
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 50m;
    root /home/ubuntu/DevBridge/frontend/dist;
    index index.html;

    location /api/      { proxy_pass http://127.0.0.1:8080; ... }
    location /uploads/  { alias /var/devbridge/uploads/; }
    location /          { try_files $uri $uri/ /index.html; }
}
NGINX
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/devbridge /etc/nginx/sites-enabled/devbridge
nginx -t && systemctl enable --now nginx

echo "BOOTSTRAP_DONE $(date -u +%FT%TZ)" > /tmp/devbridge-bootstrap-done.log
```

> 부팅 ~3분 후 `/tmp/devbridge-bootstrap-done.log` 파일이 생기면 완료. SSH로 들어가서 `cat` 한 번 찍으면 끝.

---

## 3. 아티팩트 업로드

cloud-init은 인프라만 깔아둠. 실제 코드/데이터는 SCP로 올림.

```powershell
# 빌드 산출물 + DB 덤프 업로드
$IP="52.90.243.173"
$KEY="C:\Team2_DevBridge\devbridge-key.pem"

scp -i $KEY backend\build\libs\devbridge-0.0.1-SNAPSHOT.jar `
  ubuntu@${IP}:/home/ubuntu/DevBridge/backend/build/libs/

scp -i $KEY -r frontend\dist\* `
  ubuntu@${IP}:/home/ubuntu/DevBridge/frontend/dist/

scp -i $KEY backend\docs\devbridge_db_full_dump.sql `
  ubuntu@${IP}:/tmp/

scp -i $KEY deploy\env.prod ubuntu@${IP}:/tmp/
```

### 함정 1: PowerShell의 `scp -r dist/.`

`dist/.` 또는 `dist/*`로 던지면 PowerShell이 와일드카드를 멋대로 풀어서 폴더 하나(`assets`)만 올라가는 사고 발생. **개별 파일·폴더를 명시**하거나 tar로 묶어서 올리는 게 안전.

---

## 4. 환경변수 파일 설치

`/etc/devbridge/env` 는 root:root 600. JAR이 절대 못 읽지 않을까 싶지만, systemd가 `EnvironmentFile=`로 읽어서 child 프로세스에 환경변수로 전달하므로 OK.

```bash
sudo mv /tmp/env.prod /etc/devbridge/env
sudo chown root:root /etc/devbridge/env
sudo chmod 600 /etc/devbridge/env
```

env 내용 (시크릿은 마스킹):

```ini
SPRING_PROFILES_ACTIVE=prod
DB_URL=jdbc:mysql://127.0.0.1:3306/devbridge_db?useSSL=false&serverTimezone=Asia/Seoul
DB_USERNAME=devbridge
DB_PASSWORD=changeme
JWT_SECRET=...64bytes...
GEMINI_API_KEY=...
STREAM_CHAT_API_KEY=...
STREAM_CHAT_API_SECRET=...
MAIL_USERNAME=hylee132@gmail.com
MAIL_PASSWORD=...앱비밀번호...
CORS_ALLOWED_ORIGINS=http://52.90.243.173
```

---

## 5. DB 임포트 + 스키마 정합성 맞추기

```bash
mysql -u devbridge -p'changeme' devbridge_db < /tmp/devbridge_db_full_dump.sql
```

import 자체는 잘 됐는데 (users 2002 / projects 1006 행 입력 확인), Spring Boot의 **Hibernate `ddl-auto=validate`** 가 부팅 시 컬럼 누락을 잡아냄:

```
Schema-validation: missing column [expertise] in table [partner_review]
```

덤프가 옛날 버전이라 신규 4개 컬럼이 없었음. ALTER로 보완:

```sql
-- align_columns.sql
ALTER TABLE partner_review
  ADD COLUMN expertise INT NULL,
  ADD COLUMN `schedule` INT NULL,
  ADD COLUMN communication INT NULL,
  ADD COLUMN proactivity INT NULL;

ALTER TABLE client_review
  ADD COLUMN expertise INT NULL,
  ADD COLUMN `schedule` INT NULL,
  ADD COLUMN communication INT NULL,
  ADD COLUMN proactivity INT NULL;
```

### 함정 2: MySQL 8.4에는 `ADD COLUMN IF NOT EXISTS` 없음

MariaDB와 헷갈리기 쉬움. MySQL 8은 미지원이라 그냥 `ADD COLUMN`만 사용.

### 함정 3: `schedule`은 예약어

backtick 필수. 그런데 PowerShell → ssh → bash로 명령을 인라인으로 보내면 backtick이 PowerShell 이스케이프 문자라서 깨짐. **SQL 파일로 분리해서 SCP → mysql 실행**으로 우회.

---

## 6. 서비스 기동

```bash
sudo systemctl enable --now devbridge
sudo systemctl status devbridge
```

```
● devbridge.service - DevBridge Spring Boot
     Active: active (running)
     Started DevbridgeApplication in 16.846 seconds (process running for 18.612)
     Tomcat started on port 8080 (http) with context path '/'
```

부팅 로그에서 통합 모듈 모두 정상 인식 확인:

- `StreamChatConfig keyPresent=true`
- `GeminiService apiKeyPresent=true`
- `EmailVerification 발신자=hylee132@gmail.com`
- `Hibernate validate: PASS` ← 5번 ALTER 덕분

---

## 7. nginx 500 Internal Server Error

브라우저로 들어갔더니 **500**. nginx 에러 로그:

```
[crit] stat() "/home/ubuntu/DevBridge/frontend/dist/index.html" failed (13: Permission denied)
[error] rewrite or internal redirection cycle while internally redirecting to "/index.html"
```

원인: Ubuntu 24.04는 `/home/ubuntu` 기본 권한이 **`drwxr-x---`** (others 비트 0). nginx는 `www-data` 유저로 도는데 `/home/ubuntu`로 진입조차 못 함 → 그 안의 dist는 못 읽음 → 404 → SPA fallback `/index.html` → 또 못 읽음 → 무한 redirect.

해결 한 줄:

```bash
sudo chmod o+x /home/ubuntu
sudo chmod -R o+rX /home/ubuntu/DevBridge/frontend/dist /var/devbridge/uploads
sudo systemctl reload nginx
```

> `o+x`만 주면 디렉터리 진입은 되지만 listing은 막힘. dist 안쪽만 `o+rX`(대문자 X = 디렉터리만 실행권한)로 풀어주면 끝.

---

## 8. 최종 검증

```bash
$ curl -o /dev/null -w '%{http_code}\n' http://localhost/
200
$ curl -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/projects
200
$ curl http://localhost:8080/api/projects | head -c 100
[{"id":31,"clientId":"client_00002","title":"AI 기반 이상 거래 탐지 시스템...
```

PowerShell에서 외부 IP로:

```
ROOT_STATUS:200 LEN:920
API_STATUS:200 LEN:6696282
```

✅ **공개 6.7MB JSON 정상 응답.** 배포 완료.

---

## 9. 남은 일 (HTTPS / 운영화)

브라우저가 `🔺 주의 요함`을 띄우는 건 **HTTPS가 없기 때문**. 데모용은 그냥 둬도 되지만, 정식 운영하려면:

1. **Elastic IP 할당** — 인스턴스 stop/start 시 IP 변경 방지 (현재 `52.90.243.173`은 Elastic 아님)
2. **도메인 연결** — Route53 / 가비아 / 무료라면 duckdns.org
3. **Let's Encrypt** — 인증서 자동 발급:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d devbridge.example.com
   ```
4. **CORS 환경변수 갱신**:
   ```bash
   sudo sed -i 's|http://52\.90\.243\.173|https://devbridge.example.com|' /etc/devbridge/env
   sudo systemctl restart devbridge
   ```
5. **JWT_SECRET 회전** — 부트스트랩에 임시값을 박아뒀음. 운영 트래픽 받기 전에 교체 (단, 회전 시 모든 기존 토큰 무효화).
6. **CloudWatch / 로그 로테이션** — `/var/log/devbridge-bootstrap.log`, `/var/log/nginx/*` 보관 정책.

---

## 회고

- **가장 큰 교훈**: systemd `Restart=always`는 절대 금지. `on-failure` + `RestartSec=10` + `StartLimitBurst=5`가 최소 안전 장치.
- **두 번째 교훈**: 배포 자동화는 "재현 가능성"이 핵심. 좀비 인스턴스 하나 살리려고 2시간 쓰는 것보다, cloud-init 스크립트 30분 다듬어서 5분 만에 새 인스턴스 띄우는 게 훨씬 빠르고 안전.
- **세 번째 교훈**: Ubuntu 24.04의 `/home/$USER` 권한 변경(other-bit 제거). nginx 같은 시스템 데몬이 사용자 홈을 못 읽는 게 기본값임을 알아둘 것.
- **네 번째 교훈**: `ddl-auto=validate`는 운영 환경 필수. 옛날 덤프와 최신 엔티티 차이를 부팅 시점에 잡아내는 안전망.

---

### 부록: 디렉터리 구조

```
/etc/devbridge/env                # 600 root:root, systemd가 읽음
/home/ubuntu/DevBridge/
  ├─ backend/build/libs/devbridge-0.0.1-SNAPSHOT.jar
  └─ frontend/dist/               # nginx root
/var/devbridge/uploads/           # 사용자 업로드 영구 저장
/etc/systemd/system/devbridge.service
/etc/nginx/sites-enabled/devbridge
```

### 부록: 주요 명령어 치트시트

```bash
# 서비스 상태
sudo systemctl status devbridge
sudo journalctl -u devbridge -f

# 재배포 (코드만 바꾼 경우)
scp -i key.pem app.jar ubuntu@IP:/home/ubuntu/DevBridge/backend/build/libs/
ssh -i key.pem ubuntu@IP "sudo systemctl restart devbridge"

# nginx
sudo nginx -t && sudo systemctl reload nginx
sudo tail -f /var/log/nginx/error.log
```


---

## Phase 1-4 배포 체크리스트 (2026-05 추가)

### 1단계: EC2 환경변수 추가
```bash
# EC2에서 실행
cat >> /home/ec2-user/analytics/.env << 'EOF'
POLYGON_API_KEY=your_polygon_key_here
FRED_API_KEY=your_fred_key_here
BINANCE_API_KEY=your_binance_key_here
BINANCE_API_SECRET=your_binance_secret_here
BINANCE_TESTNET=1
EOF
```

### 2단계: DB 마이그레이션
```bash
scp -i who-a.pem backend/docs/migrate_phase1_phase3.sql ec2-user@52.4.109.35:/tmp/
ssh -i who-a.pem ec2-user@52.4.109.35
mysql -u devbridge -p devbridge_db < /tmp/migrate_phase1_phase3.sql
```

### 3단계: analytics 의존성 업데이트
```bash
cd /home/ec2-user/analytics
source venv/bin/activate
pip install -r requirements.txt
```

### 4단계: analytics 배포
```bash
scp -i who-a.pem -r analytics/app ec2-user@52.4.109.35:/home/ec2-user/analytics/
scp -i who-a.pem analytics/requirements.txt ec2-user@52.4.109.35:/home/ec2-user/analytics/
ssh -i who-a.pem ec2-user@52.4.109.35 sudo systemctl restart who-a-analytics.service
```

### 5단계: Spring Boot 빌드 & 배포
```bash
# 로컬에서 빌드
cd backend ; ./gradlew bootJar
# EC2로 전송 & 재시작
scp -i who-a.pem build/libs/devbridge-*.jar ec2-user@52.4.109.35:/home/ec2-user/
ssh -i who-a.pem ec2-user@52.4.109.35 sudo systemctl restart who-a-backend.service
```

### 검증
```bash
# analytics 데이터 상태
curl -H "X-Internal-Token: TOKEN" http://52.4.109.35:8000/data/status

# 선물 백테스트
curl -X POST -H "X-Internal-Token: TOKEN" -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","strategy":"sma_cross","leverage":5,"period":"1y"}' \
  http://52.4.109.35:8000/futures/backtest
```

### API 키 발급 링크
- Polygon.io: https://polygon.io (무료 플랜 가능)
- FRED: https://fred.stlouisfed.org/docs/api/api_key.html (무료)
- Binance 테스트넷: https://testnet.binance.vision (GitHub 로그인)