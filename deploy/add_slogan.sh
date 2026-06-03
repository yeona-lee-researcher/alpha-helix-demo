#!/bin/bash
DH=$(grep '^DB_HOST=' /home/ec2-user/.env.prod | head -1 | cut -d= -f2- | tr -d '\r\n')
DP=$(grep '^DB_PORT=' /home/ec2-user/.env.prod | head -1 | cut -d= -f2- | tr -d '\r\n')
DN=$(grep '^DB_NAME=' /home/ec2-user/.env.prod | head -1 | cut -d= -f2- | tr -d '\r\n')
DU=$(grep '^DB_USERNAME=' /home/ec2-user/.env.prod | head -1 | cut -d= -f2- | tr -d '\r\n')
DPW=$(grep '^DB_PASSWORD=' /home/ec2-user/.env.prod | head -1 | cut -d= -f2- | tr -d '\r\n')
echo "Host=$DH Port=$DP DB=$DN User=$DU"
mysql -h "$DH" -P "$DP" -u "$DU" -p"$DPW" "$DN" -e "ALTER TABLE users ADD COLUMN IF NOT EXISTS slogan VARCHAR(500) NULL; SHOW COLUMNS FROM users LIKE 'slogan';"
