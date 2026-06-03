-- Remove deprecated columns from USERS table
ALTER TABLE USERS
    DROP COLUMN IF EXISTS fax_number,
    DROP COLUMN IF EXISTS interests,
    DROP COLUMN IF EXISTS slogan;
