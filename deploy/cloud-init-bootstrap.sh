#!/bin/bash
# =============================================================================
# DevBridge EC2 부트스트랩 (User Data로 사용)
# 대상: Ubuntu 24.04 LTS, t3.micro (스왑 2GB로 메모리 보강)
# 동작: 패키지 설치 + MySQL/nginx 설정 + 디렉터리 골격 생성
#       (JAR / frontend dist / DB 시드는 별도 SCP 업로드 후 수동 진행)
# 결과 마커: /tmp/devbridge-bootstrap-done.log
# =============================================================================
set -eux
exec > >(tee -a /var/log/devbridge-bootstrap.log) 2>&1

# 0) 스왑 2GB (t3.micro 1GiB RAM 보강)
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 1) APT 패키지
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y openjdk-17-jdk mysql-server nginx curl unzip ufw

# 2) 방화벽 (SSH/HTTP만 개방, 8080은 nginx만 접근하므로 외부 미개방)
ufw --force enable || true
ufw allow OpenSSH || true
ufw allow 'Nginx HTTP' || true

# 3) MySQL 설정 (localhost only, devbridge DB/user 생성)
sed -i 's/^bind-address.*/bind-address = 127.0.0.1/' /etc/mysql/mysql.conf.d/mysqld.cnf || true
systemctl enable mysql
systemctl restart mysql

mysql -u root <<'SQL'
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
chmod 755 /var/devbridge /var/devbridge/uploads

# 5) systemd 서비스 (env 파일과 JAR이 업로드된 뒤 enable/start)
cat >/etc/systemd/system/devbridge.service <<'UNIT'
[Unit]
Description=DevBridge Spring Boot
After=network.target mysql.service
Requires=mysql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/DevBridge/backend
EnvironmentFile=/etc/devbridge/env
ExecStart=/usr/bin/java -Xms256m -Xmx512m -jar /home/ubuntu/DevBridge/backend/build/libs/devbridge-0.0.1-SNAPSHOT.jar --spring.profiles.active=prod
SuccessExitStatus=143
Restart=on-failure
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload

# 6) nginx 사이트
cat >/etc/nginx/sites-available/devbridge <<'NGINX'
server {
    listen 80 default_server;
    server_name _;

    client_max_body_size 50m;
    root /home/ubuntu/DevBridge/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    location /uploads/ {
        alias /var/devbridge/uploads/;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/devbridge /etc/nginx/sites-enabled/devbridge
nginx -t && systemctl enable nginx && systemctl restart nginx

echo "BOOTSTRAP_DONE $(date -u +%FT%TZ)" > /tmp/devbridge-bootstrap-done.log
