# EC2 배포 — 복붙 순서 가이드 (Amazon Linux 2023)

> 위에서 아래로 **순서대로 복사·붙여넣기**만 하면 됩니다.
> 🟦 = 내 PC(PowerShell) · 🟩 = 서버(SSH 접속 후)

---

## 0) 🌐 AWS 콘솔 (브라우저, 1회)

- EC2 → 인스턴스 → **보안 그룹** → 인바운드 규칙 편집 → **HTTP(80) 추가**(소스 0.0.0.0/0).
- (22/SSH는 내 IP만 권장)
- 인스턴스 권장: **t3.large 이상**, 디스크 20GB+.
- "퍼블릭 IPv4 주소"를 복사해 둡니다.

---

## 1) 🟦 내 PC PowerShell — 서버 접속

```powershell
ssh -i "C:\경로\내키.pem" ec2-user@<EC2_퍼블릭_IP>
```
- `내키.pem` = 인스턴스 만들 때 받은 키페어 파일 경로
- 프롬프트가 `[ec2-user@ip-...]`로 바뀌면 = **이제부터 서버 안**. 아래는 전부 서버에서.

---

## 2) 🟩 서버 — Docker 설치 (한 번에 복붙)

```bash
sudo dnf -y install docker git && \
sudo systemctl enable --now docker && \
sudo usermod -aG docker ec2-user && \
sudo mkdir -p /usr/libexec/docker/cli-plugins && \
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/libexec/docker/cli-plugins/docker-compose && \
sudo chmod +x /usr/libexec/docker/cli-plugins/docker-compose && \
sudo docker compose version
```

## 3) 🟩 서버 — 코드 받기 + 환경변수 자동생성 + 기동 (한 번에 복붙)

> ⚠️ `.env`는 **있으면 새로 안 만듭니다**(재배포 시 키 유지 = 기존 암호화 데이터 보존). 처음 1회만 자동 생성됩니다.

```bash
git clone https://github.com/ryu-han-kr/Alpha.git && cd Alpha && git checkout main && \
( [ -f .env ] || cat > .env <<EOF
HTTP_PORT=80
DB_NAME=alphahelix_db
DB_USERNAME=alpha
DB_PASSWORD=$(openssl rand -hex 16)
DB_ROOT_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -base64 48)
APP_CRYPTO_KEY=$(openssl rand -base64 32)
APPROVAL_HMAC_SECRET=$(openssl rand -base64 32)
ANALYTICS_INTERNAL_TOKEN=$(openssl rand -hex 24)
DEVELOPER_ALLOWLIST=admin@example.com,dev@example.com
GEMINI_API_KEY=
CORS_ALLOWED_ORIGINS=*
EOF
) && \
sudo docker compose up -d --build
```
(최초 빌드는 analytics ML 의존성 때문에 수 분 걸립니다.)

## 4) 🟩 서버 — 상태 확인

```bash
sudo docker compose ps                 # 전부 running / db·backend healthy
curl -s http://localhost/actuator/health   # {"status":"UP"}
```

## 5) 🟦 브라우저 — 접속

```
http://<EC2_퍼블릭_IP>
```
회원가입 → Developer Studio. **Claude는 사용자가 본인 키(BYOK)를 웹에서 연동**하면 동작.

---

## 이후엔 전부 자동? — ✅ 그렇습니다

- `restart: unless-stopped` + `systemctl enable docker` 덕분에 **컨테이너가 죽거나 서버가 재부팅돼도 자동으로 다시 뜹니다.** 별도 관리 불필요.
- DB·Claude 세션·업로드는 named volume이라 보존됩니다.

## 나중에 코드 업데이트할 때만 (1줄)

```bash
cd ~/Alpha && git pull && sudo docker compose up -d --build
```

## 막힐 때

```bash
sudo docker compose logs backend | tail -50      # 백엔드 오류
sudo docker compose logs --tail 30               # 전체
```
- 외부 접속 안 되면 → AWS 보안그룹 80 확인.
- `APP_CRYPTO_KEY` 관련 오류 → `.env`의 값이 Base64 32바이트인지(자동생성이면 정상).

## (선택) GEMINI 키 추가

```bash
cd ~/Alpha && nano .env      # GEMINI_API_KEY=... 채우고 저장
sudo docker compose up -d    # 반영
```

## (기존 인스턴스 재사용 시) 옛 서비스 먼저 정지

```bash
sudo systemctl stop who-a-backend who-a-analytics nginx 2>/dev/null; true
# 그 후 위 3) 진행 (포트 80 충돌 방지)
```
