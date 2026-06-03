ALTER TABLE partner_review
  ADD COLUMN expertise DOUBLE NULL,
  ADD COLUMN `schedule` DOUBLE NULL,
  ADD COLUMN communication DOUBLE NULL,
  ADD COLUMN proactivity DOUBLE NULL;

ALTER TABLE client_review
  ADD COLUMN expertise DOUBLE NULL,
  ADD COLUMN `schedule` DOUBLE NULL,
  ADD COLUMN communication DOUBLE NULL,
  ADD COLUMN proactivity DOUBLE NULL;
