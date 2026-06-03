/*
 * DevBridge ERD - 32 tables
 *
 * Usage: paste this whole file into one of:
 *   https://dbdiagram.io/home   (Import > Import From SQL > MySQL)
 *   https://www.eraser.io
 *   https://drawsql.app
 *
 * Tables are ordered by FK dependency (USERS first, then SKILL_MASTER,
 * CLIENT/PARTNER_PROFILE, PROJECTS, and child tables) so the script
 * runs in MySQL as-is without FK violations.
 */

CREATE TABLE USERS (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(100) NOT NULL UNIQUE,
  phone VARCHAR(20) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  user_type VARCHAR(32) NOT NULL,
  interests TEXT NOT NULL,
  contact_email VARCHAR(100),
  gender VARCHAR(32),
  birth_date DATE,
  region VARCHAR(50),
  tax_email VARCHAR(100),
  fax_number VARCHAR(50),
  bank_name VARCHAR(50),
  bank_account_number VARCHAR(50),
  bank_account_holder_name VARCHAR(50),
  bank_verified BOOLEAN NOT NULL DEFAULT FALSE,
  profile_image_url TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE SKILL_MASTER (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PROJECT_FIELD_MASTER (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  parent_category VARCHAR(100) NOT NULL,
  field_name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE CLIENT_PROFILE (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  client_type VARCHAR(32) NOT NULL,
  slogan VARCHAR(255) NOT NULL,
  industry VARCHAR(50),
  grade VARCHAR(32),
  slogan_sub VARCHAR(255),
  short_bio VARCHAR(200),
  bio TEXT,
  strength_desc TEXT,
  preferred_levels JSON,
  preferred_work_type INT,
  budget_min INT,
  budget_max INT,
  avg_project_budget INT,
  avatar_color VARCHAR(16),
  hero_key VARCHAR(30),
  FOREIGN KEY (user_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PARTNER_PROFILE (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  title VARCHAR(200),
  hero_key VARCHAR(30),
  service_field VARCHAR(50),
  slogan_sub VARCHAR(255),
  strength_desc TEXT,
  avatar_color VARCHAR(16),
  work_category VARCHAR(32) NOT NULL,
  job_roles JSON NOT NULL,
  partner_type VARCHAR(32) NOT NULL,
  preferred_project_type VARCHAR(32) NOT NULL,
  work_available_hours JSON NOT NULL,
  communication_channels JSON NOT NULL,
  dev_level VARCHAR(32) NOT NULL,
  dev_experience VARCHAR(32) NOT NULL,
  work_preference VARCHAR(32) NOT NULL,
  slogan VARCHAR(200) NOT NULL,
  salary_hour INT,
  salary_month INT,
  github_url VARCHAR(500),
  blog_url VARCHAR(500),
  youtube_url VARCHAR(500),
  portfolio_file_url VARCHAR(1000),
  portfolio_file_tag JSON,
  bio_file_url VARCHAR(1000),
  bio_file_tag JSON,
  hashtags JSON,
  short_bio VARCHAR(200),
  bio TEXT,
  grade VARCHAR(32),
  FOREIGN KEY (user_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PROJECTS (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  project_type VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  slogan VARCHAR(255),
  slogan_sub VARCHAR(255),
  `desc` TEXT,
  service_field VARCHAR(50),
  grade VARCHAR(32),
  work_scope JSON,
  category JSON,
  reference_file_url VARCHAR(1000),
  visibility VARCHAR(32),
  budget_min INT,
  budget_max INT,
  budget_amount INT,
  is_partner_free BOOLEAN,
  start_date_negotiable BOOLEAN,
  start_date DATE,
  duration_months INT,
  schedule_negotiable BOOLEAN,
  detail_content TEXT,
  meeting_type VARCHAR(32),
  meeting_freq VARCHAR(32),
  meeting_tools JSON,
  deadline DATE,
  gov_support BOOLEAN,
  req_tags JSON,
  questions JSON,
  it_exp BOOLEAN,
  collab_planning INT,
  collab_design INT,
  collab_publishing INT,
  collab_dev INT,
  additional_file_url VARCHAR(1000),
  additional_comment TEXT,
  status VARCHAR(32),
  avatar_color VARCHAR(16),
  outsource_project_type VARCHAR(32),
  ready_status VARCHAR(32),
  work_style VARCHAR(32),
  work_location VARCHAR(255),
  work_days VARCHAR(32),
  work_hours VARCHAR(32),
  contract_months INT,
  monthly_rate INT,
  dev_stage VARCHAR(32),
  team_size VARCHAR(32),
  current_stacks JSON,
  current_status TEXT,
  contract_terms JSON,
  created_at DATETIME NOT NULL,
  updated_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE CLIENT_PREFERRED_SKILL (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_profile_id BIGINT NOT NULL,
  skill_id BIGINT NOT NULL,
  UNIQUE KEY uk_client_pref_skill (client_profile_id, skill_id),
  FOREIGN KEY (client_profile_id) REFERENCES CLIENT_PROFILE(id),
  FOREIGN KEY (skill_id) REFERENCES SKILL_MASTER(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PARTNER_SKILL (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  partner_profile_id BIGINT NOT NULL,
  skill_id BIGINT NOT NULL,
  UNIQUE KEY uk_partner_skill (partner_profile_id, skill_id),
  FOREIGN KEY (partner_profile_id) REFERENCES PARTNER_PROFILE(id),
  FOREIGN KEY (skill_id) REFERENCES SKILL_MASTER(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PROJECT_SKILL_MAPPING (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  skill_id BIGINT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uk_project_skill (project_id, skill_id),
  FOREIGN KEY (project_id) REFERENCES PROJECTS(id),
  FOREIGN KEY (skill_id) REFERENCES SKILL_MASTER(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PROJECT_TAGS (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  tag VARCHAR(100) NOT NULL,
  FOREIGN KEY (project_id) REFERENCES PROJECTS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PROJECT_MILESTONES (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  seq INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  completion_criteria TEXT,
  amount BIGINT NOT NULL,
  start_date DATE,
  end_date DATE,
  submitted_at DATETIME,
  submission_note TEXT,
  submission_file_url VARCHAR(1000),
  approved_at DATETIME,
  revision_reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  created_at DATETIME NOT NULL,
  updated_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES PROJECTS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PROJECT_MODULES (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  module_key VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT '미확정',
  last_modifier_id BIGINT,
  last_modifier_name VARCHAR(100),
  data JSON,
  created_at DATETIME NOT NULL,
  updated_at DATETIME,
  UNIQUE KEY uk_project_module (project_id, module_key),
  FOREIGN KEY (project_id) REFERENCES PROJECTS(id),
  FOREIGN KEY (last_modifier_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PROJECT_MEETINGS (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL UNIQUE,
  frequency_label VARCHAR(50),
  next_at DATETIME,
  location_label VARCHAR(100),
  agenda TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES PROJECTS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PROJECT_ATTACHMENTS (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  kind VARCHAR(10) NOT NULL,
  name VARCHAR(300) NOT NULL,
  url VARCHAR(1000) NOT NULL,
  mime_type VARCHAR(100),
  size_bytes BIGINT,
  notes VARCHAR(500),
  uploader_user_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (project_id) REFERENCES PROJECTS(id),
  FOREIGN KEY (uploader_user_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PROJECT_APPLICATION (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  partner_user_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'APPLIED',
  message TEXT,
  applied_at DATETIME NOT NULL,
  updated_at DATETIME,
  UNIQUE KEY uk_proj_partner (project_id, partner_user_id),
  FOREIGN KEY (project_id) REFERENCES PROJECTS(id),
  FOREIGN KEY (partner_user_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PROJECT_ESCROWS (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  milestone_id BIGINT,
  amount BIGINT NOT NULL,
  payer_user_id BIGINT NOT NULL,
  payee_user_id BIGINT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  payment_method VARCHAR(50),
  payment_method_id BIGINT,
  payment_tx_id VARCHAR(100),
  deposited_at DATETIME,
  released_at DATETIME,
  refunded_at DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES PROJECTS(id),
  FOREIGN KEY (milestone_id) REFERENCES PROJECT_MILESTONES(id),
  FOREIGN KEY (payer_user_id) REFERENCES USERS(id),
  FOREIGN KEY (payee_user_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE CLIENT_PROFILE_STATS (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_profile_id BIGINT NOT NULL UNIQUE,
  completed_projects INT,
  posted_projects INT,
  rating DOUBLE,
  repeat_rate INT,
  FOREIGN KEY (client_profile_id) REFERENCES CLIENT_PROFILE(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PARTNER_PROFILE_STATS (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  partner_profile_id BIGINT NOT NULL UNIQUE,
  experience_years INT,
  completed_projects INT,
  rating DOUBLE,
  response_rate INT,
  repeat_rate INT,
  availability_days INT,
  FOREIGN KEY (partner_profile_id) REFERENCES PARTNER_PROFILE(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE CLIENT_REVIEW (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_profile_id BIGINT NOT NULL,
  reviewer_user_id BIGINT NOT NULL,
  project_id BIGINT,
  rating DOUBLE NOT NULL,
  expertise DOUBLE,
  schedule DOUBLE,
  communication DOUBLE,
  proactivity DOUBLE,
  content TEXT,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (client_profile_id) REFERENCES CLIENT_PROFILE(id),
  FOREIGN KEY (reviewer_user_id) REFERENCES USERS(id),
  FOREIGN KEY (project_id) REFERENCES PROJECTS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PARTNER_REVIEW (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  partner_profile_id BIGINT NOT NULL,
  reviewer_user_id BIGINT NOT NULL,
  project_id BIGINT,
  rating DOUBLE NOT NULL,
  expertise DOUBLE,
  schedule DOUBLE,
  communication DOUBLE,
  proactivity DOUBLE,
  content TEXT,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (partner_profile_id) REFERENCES PARTNER_PROFILE(id),
  FOREIGN KEY (reviewer_user_id) REFERENCES USERS(id),
  FOREIGN KEY (project_id) REFERENCES PROJECTS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE partner_portfolios (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  source_key VARCHAR(100) NOT NULL,
  source_project_id BIGINT,
  title VARCHAR(255),
  period VARCHAR(100),
  role VARCHAR(100),
  thumbnail_url VARCHAR(500),
  work_content LONGTEXT,
  vision LONGTEXT,
  core_features LONGTEXT,
  technical_challenge LONGTEXT,
  solution LONGTEXT,
  tech_tags LONGTEXT,
  github_url VARCHAR(500),
  live_url VARCHAR(500),
  video_url VARCHAR(500),
  sections_json LONGTEXT,
  is_added BOOLEAN NOT NULL DEFAULT TRUE,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME,
  UNIQUE KEY uk_partner_portfolio_user_source (user_id, source_key),
  FOREIGN KEY (user_id) REFERENCES USERS(id),
  FOREIGN KEY (source_project_id) REFERENCES PROJECTS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE USER_PROFILE_DETAIL (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  bio TEXT,
  strength_desc TEXT,
  short_bio VARCHAR(200),
  github_url VARCHAR(500),
  github_handle VARCHAR(100),
  github_repo_url VARCHAR(500),
  profile_menu_toggles JSON,
  verified_email_type VARCHAR(20),
  verified_email VARCHAR(255),
  updated_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE USER_SKILL_DETAIL (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  tech_name VARCHAR(100),
  custom_tech VARCHAR(100),
  proficiency VARCHAR(20),
  experience VARCHAR(20),
  mode VARCHAR(20),
  sort_order INT,
  FOREIGN KEY (user_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE USER_CAREER (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  company_name VARCHAR(200),
  main_tech VARCHAR(200),
  job_title VARCHAR(200),
  start_date VARCHAR(20),
  end_date VARCHAR(20),
  is_current BOOLEAN,
  employment_type VARCHAR(30),
  role VARCHAR(100),
  level VARCHAR(30),
  description TEXT,
  projects JSON,
  verified_company BOOLEAN,
  verified_email VARCHAR(255),
  sort_order INT,
  FOREIGN KEY (user_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE USER_EDUCATION (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  school_type VARCHAR(30),
  school_name VARCHAR(200),
  track VARCHAR(100),
  major VARCHAR(200),
  degree_type VARCHAR(30),
  status VARCHAR(20),
  admission_date VARCHAR(20),
  graduation_date VARCHAR(20),
  gpa VARCHAR(20),
  gpa_scale VARCHAR(10),
  research_topic VARCHAR(500),
  verified_school BOOLEAN,
  verified_email VARCHAR(255),
  sort_order INT,
  FOREIGN KEY (user_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE USER_CERTIFICATION (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  cert_name VARCHAR(200),
  issuer VARCHAR(200),
  acquired_date VARCHAR(20),
  sort_order INT,
  FOREIGN KEY (user_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE USER_AWARD (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  award_name VARCHAR(200),
  awarding VARCHAR(200),
  award_date VARCHAR(20),
  description TEXT,
  sort_order INT,
  FOREIGN KEY (user_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE USER_INTEREST_PARTNERS (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  partner_profile_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_uipa (user_id, partner_profile_id),
  FOREIGN KEY (user_id) REFERENCES USERS(id),
  FOREIGN KEY (partner_profile_id) REFERENCES PARTNER_PROFILE(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE USER_INTEREST_PROJECTS (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_uip (user_id, project_id),
  FOREIGN KEY (user_id) REFERENCES USERS(id),
  FOREIGN KEY (project_id) REFERENCES PROJECTS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PAYMENT_METHODS (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  brand VARCHAR(20) NOT NULL,
  last4 VARCHAR(4) NOT NULL,
  holder_name VARCHAR(100) NOT NULL,
  exp_month INT NOT NULL,
  exp_year INT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  nickname VARCHAR(50),
  created_at DATETIME NOT NULL,
  updated_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE NOTIFICATION (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  related_entity_type VARCHAR(50),
  related_entity_id BIGINT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE CHAT_ROOM (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user1_id BIGINT NOT NULL,
  user2_id BIGINT NOT NULL,
  room_type VARCHAR(30) NOT NULL DEFAULT 'DIRECT_MESSAGE',
  contract_negotiation_id BIGINT,
  stream_channel_id VARCHAR(255) NOT NULL UNIQUE,
  stream_channel_type VARCHAR(50) NOT NULL DEFAULT 'messaging',
  created_at DATETIME NOT NULL,
  FOREIGN KEY (user1_id) REFERENCES USERS(id),
  FOREIGN KEY (user2_id) REFERENCES USERS(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
