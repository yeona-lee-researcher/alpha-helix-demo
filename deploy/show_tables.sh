#!/bin/bash
DPW=$(grep '^DB_PASSWORD=' /home/ec2-user/.env.prod | head -1 | cut -d= -f2- | tr -d '\r\n')
mysql -u devbridge -p"$DPW" devbridge_db -e "SHOW TABLES;"
