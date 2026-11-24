-- ============================================================================
-- RQMS - Railway Quarter Management System
-- MySQL / MariaDB schema (compatible with XAMPP's MariaDB and MySQL 8)
--
-- Create an empty database first (utf8mb4_unicode_ci), then import this file into it:
--   phpMyAdmin : select the database -> Import tab -> choose this file
--   CLI        : mysql -u root rqms < database/schema.sql
-- (`npm run db:setup` and the app's AUTO_BOOTSTRAP do all of this for you.)
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS audit_logs, notification_logs, certificates, documents, application_colony_preferences,
    retirement_records, vacation_clearances, vacation_requests, occupancies,
    allotments, waiting_list_entries, quarter_applications, quarters,
    family_members, employee_profiles, permission_role, role_user,
    permissions, roles, users, legacy_waiting_list;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------- users / RBAC
CREATE TABLE users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  mobile        VARCHAR(20)  NULL,
  password      VARCHAR(255) NOT NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME NULL,
  updated_at    DATETIME NULL,
  UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB;

CREATE TABLE roles (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug        VARCHAR(255) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description VARCHAR(255) NULL,
  created_at  DATETIME NULL,
  updated_at  DATETIME NULL,
  UNIQUE KEY roles_slug_unique (slug)
) ENGINE=InnoDB;

CREATE TABLE permissions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug        VARCHAR(255) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  `group`     VARCHAR(255) NULL,
  created_at  DATETIME NULL,
  updated_at  DATETIME NULL,
  UNIQUE KEY permissions_slug_unique (slug)
) ENGINE=InnoDB;

CREATE TABLE role_user (
  role_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, user_id),
  CONSTRAINT role_user_role_fk FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT role_user_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE permission_role (
  permission_id BIGINT UNSIGNED NOT NULL,
  role_id       BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (permission_id, role_id),
  CONSTRAINT permission_role_perm_fk FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE,
  CONSTRAINT permission_role_role_fk FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------- Module 1: employee profile
CREATE TABLE employee_profiles (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id              BIGINT UNSIGNED NOT NULL,
  employee_id          VARCHAR(255) NOT NULL,
  pf_number            VARCHAR(50)  NULL,                              -- Provident Fund number
  father_name          VARCHAR(120) NULL,
  date_of_birth        DATE NULL,
  current_address      VARCHAR(500) NULL,
  designation          VARCHAR(255) NULL,
  department           VARCHAR(255) NULL,
  station              VARCHAR(255) NULL,
  division             VARCHAR(255) NULL,
  railway_zone         VARCHAR(255) NULL,
  category             VARCHAR(255) NOT NULL DEFAULT 'GENERAL',        -- SC|ST|OBC|GENERAL
  service_type         VARCHAR(255) NOT NULL DEFAULT 'non_essential',  -- essential|non_essential
  grade_pay            INT UNSIGNED NULL,
  pay_level            VARCHAR(255) NULL,
  date_of_joining      DATE NULL,
  retirement_date      DATE NULL,
  has_active_allotment TINYINT(1) NOT NULL DEFAULT 0,
  verification_status  VARCHAR(30) NOT NULL DEFAULT 'pending',          -- pending | verified | changes_requested
  verified_by          BIGINT UNSIGNED NULL,                            -- the clerk who verified / reviewed
  verified_at          DATETIME NULL,
  verification_remarks TEXT NULL,                                       -- what the employee must correct
  created_at           DATETIME NULL,
  updated_at           DATETIME NULL,
  UNIQUE KEY employee_profiles_employee_id_unique (employee_id),
  KEY employee_profiles_verification_index (verification_status),
  KEY employee_profiles_station_division_index (station, division),
  CONSTRAINT employee_profiles_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT employee_profiles_verifier_fk FOREIGN KEY (verified_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE family_members (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  employee_profile_id BIGINT UNSIGNED NOT NULL,
  name                VARCHAR(255) NOT NULL,
  relation            VARCHAR(255) NOT NULL,
  date_of_birth       DATE NULL,
  is_dependent        TINYINT(1) NOT NULL DEFAULT 1,
  created_at          DATETIME NULL,
  updated_at          DATETIME NULL,
  CONSTRAINT family_members_profile_fk FOREIGN KEY (employee_profile_id) REFERENCES employee_profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------ Module 2: quarter master
CREATE TABLE quarters (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  quarter_number      VARCHAR(255) NOT NULL,
  quarter_type        VARCHAR(255) NOT NULL,            -- I..VI
  colony_name         VARCHAR(255) NULL,
  address             VARCHAR(255) NULL,
  railway_zone        VARCHAR(255) NULL,
  division            VARCHAR(255) NULL,
  station             VARCHAR(255) NULL,
  block               VARCHAR(255) NULL,
  floor               VARCHAR(255) NULL,
  pool                VARCHAR(50) NULL,                 -- Div / HQ / RPF / Med ...
  remarks             VARCHAR(500) NULL,                -- occupant / condition note from the master data
  status              VARCHAR(255) NOT NULL DEFAULT 'vacant',
  current_occupant_id BIGINT UNSIGNED NULL,
  created_at          DATETIME NULL,
  updated_at          DATETIME NULL,
  UNIQUE KEY quarters_unique_per_type (station(100), colony_name(100), quarter_number(100), quarter_type),
  KEY quarters_type_station_status_index (quarter_type, station, status),
  CONSTRAINT quarters_occupant_fk FOREIGN KEY (current_occupant_id) REFERENCES employee_profiles (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------- Module 3: applications
CREATE TABLE quarter_applications (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reference_no           VARCHAR(255) NOT NULL,
  employee_profile_id    BIGINT UNSIGNED NOT NULL,
  preferred_quarter_type VARCHAR(255) NOT NULL,
  preferred_colony       VARCHAR(255) NULL,
  station                VARCHAR(255) NULL,
  division               VARCHAR(255) NULL,
  service_type           VARCHAR(255) NOT NULL,         -- snapshot at apply time
  category               VARCHAR(255) NOT NULL,         -- snapshot at apply time
  family_size            SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  medical_ground         TINYINT(1) NOT NULL DEFAULT 0,
  special_grounds        TEXT NULL,
  status                 VARCHAR(255) NOT NULL DEFAULT 'submitted',
  priority_score         INT UNSIGNED NULL,
  eligibility_result     LONGTEXT NULL,                 -- JSON (engine breakdown)
  priority_breakdown     LONGTEXT NULL,                 -- JSON (engine breakdown)
  applied_at             DATETIME NULL,
  verified_by            BIGINT UNSIGNED NULL,
  verified_at            DATETIME NULL,
  forwarded_by           BIGINT UNSIGNED NULL,          -- clerk who forwarded it to the admin
  forwarded_at           DATETIME NULL,
  forward_remarks        TEXT NULL,
  decided_by             BIGINT UNSIGNED NULL,
  decided_at             DATETIME NULL,
  remarks                TEXT NULL,
  created_at             DATETIME NULL,
  updated_at             DATETIME NULL,
  UNIQUE KEY quarter_applications_reference_no_unique (reference_no),
  KEY quarter_applications_type_station_status_index (preferred_quarter_type, station, status),
  CONSTRAINT qa_profile_fk  FOREIGN KEY (employee_profile_id) REFERENCES employee_profiles (id) ON DELETE CASCADE,
  CONSTRAINT qa_verified_fk FOREIGN KEY (verified_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT qa_decided_fk  FOREIGN KEY (decided_by)  REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT qa_forwarded_fk FOREIGN KEY (forwarded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------ Module 3: ranked colony preferences (up to 3 per application)
CREATE TABLE application_colony_preferences (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  quarter_application_id BIGINT UNSIGNED NOT NULL,
  priority               TINYINT UNSIGNED NOT NULL,      -- 1 = first choice, 2 = second, 3 = third
  colony_name            VARCHAR(255) NOT NULL,
  created_at             DATETIME NULL,
  updated_at             DATETIME NULL,
  UNIQUE KEY acp_application_priority_unique (quarter_application_id, priority),
  KEY acp_colony_index (colony_name(100)),
  CONSTRAINT acp_application_fk FOREIGN KEY (quarter_application_id) REFERENCES quarter_applications (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------- Module 5: waiting list
CREATE TABLE waiting_list_entries (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  quarter_application_id BIGINT UNSIGNED NOT NULL,
  quarter_type           VARCHAR(255) NOT NULL,         -- queue key
  station                VARCHAR(255) NULL,             -- queue key
  priority_score         INT UNSIGNED NOT NULL,
  `rank`                 INT UNSIGNED NULL,
  waiting_since          DATETIME NOT NULL,
  is_active              TINYINT(1) NOT NULL DEFAULT 1,
  created_at             DATETIME NULL,
  updated_at             DATETIME NULL,
  UNIQUE KEY wle_application_unique (quarter_application_id),
  KEY wle_queue_index (quarter_type, station, is_active),
  CONSTRAINT wle_application_fk FOREIGN KEY (quarter_application_id) REFERENCES quarter_applications (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------- Imported waiting list (requests made before this system)
CREATE TABLE legacy_waiting_list (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_no     VARCHAR(100) NOT NULL,            -- e.g. DRM/BTHP/MAR-17-000002
  request_date   DATE NULL,                        -- in the line since
  name           VARCHAR(255) NULL,
  designation    VARCHAR(255) NULL,
  quarter_type   VARCHAR(10) NOT NULL,             -- I..VI
  category       VARCHAR(20) NULL,                 -- essential / non_essential
  pay_scale      VARCHAR(50) NULL,
  pf_number      VARCHAR(50) NULL,
  unit           VARCHAR(50) NULL,                 -- issuing unit in the request number (BTHP, HP ...)
  list_name      VARCHAR(60) NULL,                 -- which list: Type-II, Transit flat, Type-IV Spl ...
  staff_kind     VARCHAR(20) NULL,                 -- staff / gazetted
  present_accommodation VARCHAR(255) NULL,
  preferred_colonies    VARCHAR(500) NULL,         -- places of registration, in order
  contact_no     VARCHAR(30) NULL,
  remarks        VARCHAR(500) NULL,
  list_order     INT UNSIGNED NULL,                -- position on the source sheet (gazetted lists)
  created_at     DATETIME NULL,
  updated_at     DATETIME NULL,
  UNIQUE KEY lwl_request_unique (request_no),
  KEY lwl_type_date_index (quarter_type, request_date),
  KEY lwl_list_index (list_name, list_order, request_date),
  KEY lwl_pf_index (pf_number)
) ENGINE=InnoDB;

-- ------------------------------------------------------- Modules 6-7: allotment
CREATE TABLE allotments (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  allotment_order_no     VARCHAR(255) NOT NULL,
  quarter_id             BIGINT UNSIGNED NOT NULL,
  quarter_application_id BIGINT UNSIGNED NULL,
  employee_profile_id    BIGINT UNSIGNED NOT NULL,
  status                 VARCHAR(255) NOT NULL DEFAULT 'offered',
  offered_at             DATETIME NULL,
  responded_at           DATETIME NULL,
  possession_date        DATE NULL,
  vacated_on             DATE NULL,
  approved_by            BIGINT UNSIGNED NULL,
  remarks                TEXT NULL,
  created_at             DATETIME NULL,
  updated_at             DATETIME NULL,
  UNIQUE KEY allotments_order_no_unique (allotment_order_no),
  KEY allotments_profile_status_index (employee_profile_id, status),
  CONSTRAINT allotments_quarter_fk     FOREIGN KEY (quarter_id) REFERENCES quarters (id) ON DELETE CASCADE,
  CONSTRAINT allotments_application_fk FOREIGN KEY (quarter_application_id) REFERENCES quarter_applications (id) ON DELETE SET NULL,
  CONSTRAINT allotments_profile_fk     FOREIGN KEY (employee_profile_id) REFERENCES employee_profiles (id) ON DELETE CASCADE,
  CONSTRAINT allotments_approver_fk    FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE occupancies (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  quarter_id          BIGINT UNSIGNED NOT NULL,
  allotment_id        BIGINT UNSIGNED NULL,
  employee_profile_id BIGINT UNSIGNED NOT NULL,
  start_date          DATE NOT NULL,
  end_date            DATE NULL,
  is_current          TINYINT(1) NOT NULL DEFAULT 1,
  created_at          DATETIME NULL,
  updated_at          DATETIME NULL,
  KEY occupancies_quarter_current_index (quarter_id, is_current),
  CONSTRAINT occupancies_quarter_fk   FOREIGN KEY (quarter_id) REFERENCES quarters (id) ON DELETE CASCADE,
  CONSTRAINT occupancies_allotment_fk FOREIGN KEY (allotment_id) REFERENCES allotments (id) ON DELETE SET NULL,
  CONSTRAINT occupancies_profile_fk   FOREIGN KEY (employee_profile_id) REFERENCES employee_profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------- Modules 8-9: vacation + clearance
CREATE TABLE vacation_requests (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reference_no            VARCHAR(255) NOT NULL,
  allotment_id            BIGINT UNSIGNED NOT NULL,
  quarter_id              BIGINT UNSIGNED NOT NULL,
  employee_profile_id     BIGINT UNSIGNED NOT NULL,
  `trigger`               VARCHAR(255) NOT NULL,       -- transfer|retirement|resignation|death|voluntary
  requested_vacation_date DATE NOT NULL,
  reason                  TEXT NULL,
  status                  VARCHAR(255) NOT NULL DEFAULT 'submitted',  -- submitted|in_clearance|completed|rejected
  current_step            VARCHAR(255) NULL,
  completed_at            DATETIME NULL,
  created_at              DATETIME NULL,
  updated_at              DATETIME NULL,
  UNIQUE KEY vacation_requests_reference_no_unique (reference_no),
  KEY vacation_requests_status_step_index (status, current_step),
  CONSTRAINT vr_allotment_fk FOREIGN KEY (allotment_id) REFERENCES allotments (id) ON DELETE CASCADE,
  CONSTRAINT vr_quarter_fk   FOREIGN KEY (quarter_id) REFERENCES quarters (id) ON DELETE CASCADE,
  CONSTRAINT vr_profile_fk   FOREIGN KEY (employee_profile_id) REFERENCES employee_profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE vacation_clearances (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vacation_request_id BIGINT UNSIGNED NOT NULL,
  step                VARCHAR(255) NOT NULL,
  sequence            TINYINT UNSIGNED NOT NULL,
  status              VARCHAR(255) NOT NULL DEFAULT 'pending',   -- pending|approved|rejected
  handled_by          BIGINT UNSIGNED NULL,
  meter_reading       DECIMAL(12,2) NULL,
  dues_amount         DECIMAL(12,2) NULL,
  has_damage          TINYINT(1) NULL,
  remarks             TEXT NULL,
  acted_at            DATETIME NULL,
  created_at          DATETIME NULL,
  updated_at          DATETIME NULL,
  UNIQUE KEY vc_request_step_unique (vacation_request_id, step),
  CONSTRAINT vc_request_fk FOREIGN KEY (vacation_request_id) REFERENCES vacation_requests (id) ON DELETE CASCADE,
  CONSTRAINT vc_handler_fk FOREIGN KEY (handled_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------- Module 10: retirement
CREATE TABLE retirement_records (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  employee_profile_id   BIGINT UNSIGNED NOT NULL,
  allotment_id          BIGINT UNSIGNED NULL,
  retirement_date       DATE NOT NULL,
  retention_granted     TINYINT(1) NOT NULL DEFAULT 0,
  retention_period_days SMALLINT UNSIGNED NULL,
  retention_expiry_date DATE NULL,
  overstay_days         INT UNSIGNED NOT NULL DEFAULT 0,
  penalty_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  status                VARCHAR(255) NOT NULL DEFAULT 'notice',  -- notice|retained|expiring|overstaying|cleared
  last_evaluated_at     DATETIME NULL,
  created_at            DATETIME NULL,
  updated_at            DATETIME NULL,
  KEY retirement_records_status_expiry_index (status, retention_expiry_date),
  CONSTRAINT rr_profile_fk   FOREIGN KEY (employee_profile_id) REFERENCES employee_profiles (id) ON DELETE CASCADE,
  CONSTRAINT rr_allotment_fk FOREIGN KEY (allotment_id) REFERENCES allotments (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------ Modules 11 + 15: docs / certs
CREATE TABLE documents (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  documentable_type VARCHAR(255) NOT NULL,            -- application | allotment | ...
  documentable_id   BIGINT UNSIGNED NOT NULL,
  category        VARCHAR(255) NOT NULL,
  title           VARCHAR(255) NULL,
  original_name   VARCHAR(255) NOT NULL,
  path            VARCHAR(255) NOT NULL,
  disk            VARCHAR(255) NOT NULL DEFAULT 'local',
  mime            VARCHAR(255) NULL,
  size            BIGINT UNSIGNED NOT NULL DEFAULT 0,
  version         INT UNSIGNED NOT NULL DEFAULT 1,
  hash            VARCHAR(64) NULL,                   -- sha256
  uploaded_by     BIGINT UNSIGNED NULL,
  created_at      DATETIME NULL,
  updated_at      DATETIME NULL,
  KEY documents_documentable_index (documentable_type, documentable_id),
  CONSTRAINT documents_uploader_fk FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE certificates (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  certifiable_type VARCHAR(255) NOT NULL,             -- allotment | vacation_request
  certifiable_id   BIGINT UNSIGNED NOT NULL,
  type             VARCHAR(255) NOT NULL,
  number           VARCHAR(255) NOT NULL,
  payload          LONGTEXT NULL,                     -- JSON snapshot
  file_path        VARCHAR(255) NULL,
  is_signed        TINYINT(1) NOT NULL DEFAULT 0,
  signed_by        VARCHAR(255) NULL,
  signed_at        DATETIME NULL,
  issued_by        BIGINT UNSIGNED NULL,
  issued_at        DATETIME NULL,
  created_at       DATETIME NULL,
  updated_at       DATETIME NULL,
  UNIQUE KEY certificates_number_unique (number),
  KEY certificates_certifiable_index (certifiable_type, certifiable_id),
  CONSTRAINT certificates_issuer_fk FOREIGN KEY (issued_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------- Modules 12 + 14: notify / audit
CREATE TABLE notification_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NULL,
  channel    VARCHAR(255) NOT NULL,                   -- email|sms|whatsapp
  event      VARCHAR(255) NOT NULL,
  title      VARCHAR(255) NULL,
  message    TEXT NOT NULL,
  status     VARCHAR(255) NOT NULL DEFAULT 'queued',  -- queued|sent|failed
  response   TEXT NULL,
  sent_at    DATETIME NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  KEY notification_logs_user_event_index (user_id, event),
  CONSTRAINT notification_logs_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id        BIGINT UNSIGNED NULL,
  action         VARCHAR(255) NOT NULL,
  auditable_type VARCHAR(255) NULL,
  auditable_id   BIGINT UNSIGNED NULL,
  description    TEXT NULL,
  properties     LONGTEXT NULL,                       -- JSON
  ip_address     VARCHAR(45) NULL,
  user_agent     TEXT NULL,
  created_at     DATETIME NULL,
  KEY audit_logs_action_created_index (action, created_at),
  KEY audit_logs_auditable_index (auditable_type, auditable_id),
  CONSTRAINT audit_logs_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;
