# Alpha-Helix — Docker 자동 배포 (AWS EC2)

`docker compose up -d --build` 한 번으로 **DB · Analytics · Backend(+claude CLI) · Frontend** 전체 스택이 뜹니다.
외부로 노출되는 포트는 **frontend(HTTP) 하나**뿐이고, 나머지는 컨테이너 내부 네트워크로만 통신합니다.

```
 인터넷 :80
   │
   ▼
 frontend (nginx)  ── 정적(React dist) + /api 프록시 ─┐
                                                      ▼
                                              backend (Spring Boot + claude CLI) :9091
                                                 │            │
                                                 ▼            ▼
                                              db(MySQL8)   analytics(FastAPI) :8001
```

---

## 0. EC2 준비 (1회)

- 인스턴스: **t3.large 이상 권장**(analytics ML 의존성 빌드 + 백테스트). 디스크 20GB+.
- 보안그룹 인바운드: **80**(HTTP) , 22(SSH, 본인 IP만). DB/analytics/backend 포트는 **열지 마세요**(내부 전용).
- Docker + Compose 설치:

```bash
# Amazon Linux 2023
sudo dnf -y install docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user      # 재로그인 후 sudo 없이 docker 사용
# Compose v2 플러그인
sudo mkdir -p /usr/libexec/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/libexec/docker/cli-plugins/docker-compose
sudo chmod +x /usr/libexec/docker/cli-plugins/docker-compose
docker compose version
```

---

## 1. 코드 가져오기

> 운영 배포 소스는 **main**(flow_finish → main PR 머지 후). 검증용으로 flow_finish 를 바로 받아도 됩니다.

```bash
git clone https://github.com/ryu-han-kr/Alpha.git
cd Alpha
# git checkout main   (머지 후)
```

## 2. 환경변수

```bash
cp .env.docker.example .env
nano .env
```

반드시 채울 값:

| 키 | 설명 |
|---|---|
| `JWT_SECRET` | 32바이트+ 랜덤 — `openssl rand -base64 48` |
| `APP_CRYPTO_KEY` | **Base64 32바이트** — `openssl rand -base64 32` (KIS/Binance/사용자 Claude 키 암호화) |
| `APPROVAL_HMAC_SECRET` | 주문 승인링크 서명키 |
| `DB_PASSWORD` / `DB_ROOT_PASSWORD` | DB 비밀번호 |
| `DEVELOPER_ALLOWLIST` | Developer Studio 상시 허용 이메일(콤마). 그 외엔 STANDARD/PREMIUM 구독자 |
| `GEMINI_API_KEY` | (선택) Heli/룰 폴백. 비우면 룰베이스 |

> ⚠️ `APP_CRYPTO_KEY` 를 한 번 정하면 **바꾸지 마세요**(이미 암호화 저장된 KIS/Claude 키를 못 풉니다).

## 3. 기동

```bash
docker compose up -d --build      # 최초 빌드는 수 분(analytics ML 의존성)
docker compose ps                 # 모두 running/healthy 확인
docker compose logs -f backend    # 기동 로그
```

## 4. 확인

```bash
curl -s http://localhost/actuator/health      # {"status":"UP"}
```
브라우저로 `http://<EC2_PUBLIC_IP>` 접속 → 회원가입/로그인 → **Developer Studio**.

---

## Claude / BYOK (중요)

- **claude CLI 는 backend 이미지에 이미 포함**(`npm i -g @anthropic-ai/claude-code`)됩니다 — 서버에서 따로 설치할 필요 없음.
- **서버 공용 Claude 키를 두지 않습니다.** 사용자가 웹의 *Claude 연동(BYOK)* 에서 **본인 ANTHROPIC 키**를 넣으면 DB 에 **AES-256 암호화** 저장되고, 요청 시에만 자식 프로세스 env 로 복호화 주입됩니다(로그/응답/이미지에 평문 없음).
- `DEVELOPER_ALLOWLIST` 이메일은 구독과 무관하게 Developer Studio 사용 가능.
- 멀티세션 대화 맥락은 `db_data`(claude_session_id) + `claude_home` 볼륨(transcript)에 영속 → **컨테이너 재시작에도 유지**.

## 업데이트(재배포)

```bash
git pull            # (main)
docker compose up -d --build
```
DB/세션/업로드는 named volume(`db_data`·`claude_home`·`uploads`)이라 재빌드해도 보존됩니다.

## HTTPS (권장)

도메인이 있으면 앞단에 **Caddy** 또는 ALB+ACM 으로 TLS 종단:
- 간단: `caddy reverse-proxy --to localhost:80` (Caddy 가 Let's Encrypt 자동) 또는 별도 caddy 컨테이너.
- `.env` 의 `CORS_ALLOWED_ORIGINS=https://your-domain` 로 좁히세요.

## 트러블슈팅

| 증상 | 조치 |
|---|---|
| backend unhealthy | `docker compose logs backend` — 대개 `APP_CRYPTO_KEY` 미설정/형식오류(Base64 32B) 또는 DB 연결 |
| Developer Studio 503 | backend 로그에 claude 경로 확인. 이미지 재빌드(`--no-cache backend`) |
| Claude "키 필요" | 정상 — 사용자가 본인 ANTHROPIC 키를 웹에서 연동해야 함(BYOK) |
| 포트 충돌 | `.env` 의 `HTTP_PORT` 변경 |
| analytics 빌드 느림/실패 | 디스크/메모리 부족 — 인스턴스 상향(t3.large+) |
