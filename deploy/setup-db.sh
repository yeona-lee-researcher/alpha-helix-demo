#!/bin/bash
set -e
sudo mysql <<'SQL'
CREATE DATABASE IF NOT EXISTS devbridge_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'devbridge'@'localhost' IDENTIFIED BY 'changeme';
GRANT ALL ON devbridge_db.* TO 'devbridge'@'localhost';
FLUSH PRIVILEGES;
SQL
mysql -udevbridge -pchangeme -e 'SHOW DATABASES;' 2>&1 | grep -v "Warning"
echo "DB_OK"
