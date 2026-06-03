#!/bin/bash
# nginx 설정에서 프론트 서빙 root 찾기
echo "=== nginx root ==="
sudo grep -RE 'root|alias' /etc/nginx/conf.d/ 2>/dev/null | head -20
echo "=== fe-dist ==="
ls -la /home/ec2-user/fe-dist 2>/dev/null | head -8
echo "=== /usr/share/nginx/html ==="
ls -la /usr/share/nginx/html 2>/dev/null | head -8
