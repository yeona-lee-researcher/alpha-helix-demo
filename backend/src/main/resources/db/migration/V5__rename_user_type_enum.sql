-- Rename UserType enum values: CLIENT → USER, PARTNER → PRO
UPDATE USERS SET user_type = 'USER' WHERE user_type = 'CLIENT';
UPDATE USERS SET user_type = 'PRO'  WHERE user_type = 'PARTNER';
