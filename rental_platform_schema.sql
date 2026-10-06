-- =====================================================================
-- Rental Platform: Database Schema (MySQL 8.0.16+ / InnoDB / utf8mb4)
-- Roles: tenant, landlord, admin. Revenue: placement fee split between
-- landlord and tenant, driven by admin-configured commission rules.
-- Money columns are DECIMAL(12,2). All timestamps are UTC.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. USERS AND AUTH
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role                ENUM('tenant','landlord','admin') NOT NULL,
  full_name           VARCHAR(150) NOT NULL,
  phone               VARCHAR(20)  NOT NULL,            -- E.164, e.g. +263771234567
  email               VARCHAR(190) NULL,
  password_hash       VARCHAR(255) NULL,                -- null if OTP-only login
  phone_verified_at   DATETIME NULL,
  verification_status ENUM('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified',
  whatsapp_opt_in     TINYINT(1) NOT NULL DEFAULT 0,
  status              ENUM('active','suspended','deleted') NOT NULL DEFAULT 'active',
  last_login_at       DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_status (role, status)
) ENGINE=InnoDB;

CREATE TABLE otp_codes (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone       VARCHAR(20) NOT NULL,
  code_hash   VARCHAR(255) NOT NULL,                    -- never store the raw code
  purpose     ENUM('register','login','reset','phone_change') NOT NULL,
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at  DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_otp_phone (phone, purpose, expires_at)
) ENGINE=InnoDB;

CREATE TABLE verification_docs (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  doc_type     ENUM('national_id','passport','proof_of_ownership','authority_to_let','proof_of_address','employer_letter','payslip','other') NOT NULL,
  file_path    VARCHAR(500) NOT NULL,                   -- private storage, served via signed URL
  status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewed_by  BIGINT UNSIGNED NULL,
  reviewed_at  DATETIME NULL,
  review_note  VARCHAR(255) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_vdocs_user (user_id, status),
  CONSTRAINT fk_vdocs_user     FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_vdocs_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE device_tokens (                             -- Android push (FCM)
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  fcm_token  VARCHAR(500) NOT NULL,
  platform   ENUM('android','ios','web') NOT NULL DEFAULT 'android',
  last_seen_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_device_token (fcm_token(255)),
  KEY idx_device_user (user_id),
  CONSTRAINT fk_device_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. LOCATIONS, PROPERTIES, LISTINGS
-- ---------------------------------------------------------------------
CREATE TABLE locations (                                 -- country > city > suburb
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  parent_id  BIGINT UNSIGNED NULL,
  name       VARCHAR(120) NOT NULL,
  type       ENUM('country','region','city','suburb') NOT NULL,
  latitude   DECIMAL(9,6) NULL,
  longitude  DECIMAL(9,6) NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_location (parent_id, name),
  KEY idx_loc_type (type, is_active),
  CONSTRAINT fk_loc_parent FOREIGN KEY (parent_id) REFERENCES locations(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE properties (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  landlord_id   BIGINT UNSIGNED NOT NULL,
  location_id   BIGINT UNSIGNED NOT NULL,                -- suburb
  address_line  VARCHAR(255) NOT NULL,                   -- hidden until contacts are released
  property_type ENUM('house','flat','cottage','single_room','shared_room','backroom','other') NOT NULL,
  latitude      DECIMAL(9,6) NULL,
  longitude     DECIMAL(9,6) NULL,
  description   TEXT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_prop_landlord (landlord_id),
  CONSTRAINT fk_prop_landlord FOREIGN KEY (landlord_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_prop_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE amenities (
  id        SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name      VARCHAR(80) NOT NULL,
  slug      VARCHAR(80) NOT NULL,
  category  VARCHAR(40) NULL,                            -- utilities, security, comfort
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_amenity_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE listings (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  property_id      BIGINT UNSIGNED NOT NULL,
  landlord_id      BIGINT UNSIGNED NOT NULL,             -- denormalised for data scoping
  -- search columns copied from the property so filters hit one table
  location_id      BIGINT UNSIGNED NOT NULL,
  property_type    ENUM('house','flat','cottage','single_room','shared_room','backroom','other') NOT NULL,
  latitude         DECIMAL(9,6) NULL,
  longitude        DECIMAL(9,6) NULL,
  title            VARCHAR(160) NOT NULL,
  description      TEXT NULL,
  rent             DECIMAL(12,2) NOT NULL,
  currency         CHAR(3) NOT NULL DEFAULT 'USD',
  deposit          DECIMAL(12,2) NULL,
  bedrooms         TINYINT UNSIGNED NOT NULL DEFAULT 1,
  bathrooms        TINYINT UNSIGNED NOT NULL DEFAULT 1,
  furnishing       ENUM('furnished','semi_furnished','unfurnished') NOT NULL DEFAULT 'unfurnished',
  available_from   DATE NULL,
  min_lease_months TINYINT UNSIGNED NULL,
  tenant_conditions JSON NULL,                           -- e.g. {"family":true,"students":true,"pets":false}
  status           ENUM('draft','pending_review','published','rejected','reserved','let','archived') NOT NULL DEFAULT 'draft',
  rejection_reason VARCHAR(255) NULL,
  reviewed_by      BIGINT UNSIGNED NULL,
  published_at     DATETIME NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_listing_rent CHECK (rent > 0),
  KEY idx_listing_search (status, location_id, rent, bedrooms),
  KEY idx_listing_type   (status, property_type, furnishing),
  KEY idx_listing_avail  (status, available_from),
  KEY idx_listing_geo    (status, latitude, longitude),
  KEY idx_listing_landlord (landlord_id, status),
  FULLTEXT KEY ft_listing_text (title, description),
  CONSTRAINT fk_listing_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE RESTRICT,
  CONSTRAINT fk_listing_landlord FOREIGN KEY (landlord_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_listing_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_listing_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE listing_images (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id BIGINT UNSIGNED NOT NULL,
  file_path  VARCHAR(500) NOT NULL,
  thumb_path VARCHAR(500) NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  file_hash  CHAR(64) NULL,                              -- detect duplicate/stolen photos
  KEY idx_img_listing (listing_id, sort_order),
  KEY idx_img_hash (file_hash),
  CONSTRAINT fk_img_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE listing_amenities (
  listing_id BIGINT UNSIGNED NOT NULL,
  amenity_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (listing_id, amenity_id),
  KEY idx_la_amenity (amenity_id),
  CONSTRAINT fk_la_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_la_amenity FOREIGN KEY (amenity_id) REFERENCES amenities(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. TENANT SEARCH HELPERS
-- ---------------------------------------------------------------------
CREATE TABLE saved_searches (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT UNSIGNED NOT NULL,
  name             VARCHAR(100) NULL,
  filters          JSON NOT NULL,                        -- same keys as GET /listings
  alert_channel    ENUM('push','whatsapp','sms','none') NOT NULL DEFAULT 'push',
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  last_alerted_at  DATETIME NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ss_user (user_id, is_active),
  CONSTRAINT fk_ss_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE favourites (
  user_id    BIGINT UNSIGNED NOT NULL,
  listing_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, listing_id),
  CONSTRAINT fk_fav_user    FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fav_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE search_logs (                               -- find demand without supply
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NULL,
  channel      ENUM('web','android','whatsapp') NOT NULL,
  filters      JSON NOT NULL,
  result_count INT UNSIGNED NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sl_created (created_at),
  KEY idx_sl_zero (result_count, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. ENQUIRIES, VIEWINGS, APPLICATIONS
-- ---------------------------------------------------------------------
CREATE TABLE enquiries (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id  BIGINT UNSIGNED NOT NULL,
  tenant_id   BIGINT UNSIGNED NOT NULL,
  landlord_id BIGINT UNSIGNED NOT NULL,
  message     TEXT NOT NULL,
  reply       TEXT NULL,
  status      ENUM('open','replied','closed') NOT NULL DEFAULT 'open',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_enq_landlord (landlord_id, status),
  KEY idx_enq_tenant (tenant_id),
  KEY idx_enq_listing (listing_id),
  CONSTRAINT fk_enq_listing  FOREIGN KEY (listing_id)  REFERENCES listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_enq_tenant   FOREIGN KEY (tenant_id)   REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_enq_landlord FOREIGN KEY (landlord_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE viewings (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id   BIGINT UNSIGNED NOT NULL,
  tenant_id    BIGINT UNSIGNED NOT NULL,
  landlord_id  BIGINT UNSIGNED NOT NULL,
  proposed_at  DATETIME NOT NULL,
  confirmed_at DATETIME NULL,
  status       ENUM('requested','confirmed','rescheduled','completed','cancelled','no_show') NOT NULL DEFAULT 'requested',
  note         VARCHAR(255) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_view_landlord (landlord_id, status, proposed_at),
  KEY idx_view_tenant (tenant_id, status),
  CONSTRAINT fk_view_listing  FOREIGN KEY (listing_id)  REFERENCES listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_view_tenant   FOREIGN KEY (tenant_id)   REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_view_landlord FOREIGN KEY (landlord_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE applications (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id    BIGINT UNSIGNED NOT NULL,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  landlord_id   BIGINT UNSIGNED NOT NULL,
  message       TEXT NULL,
  household_size TINYINT UNSIGNED NULL,
  desired_move_in DATE NULL,
  status        ENUM('submitted','under_review','accepted','rejected','withdrawn','declined','expired','confirmed') NOT NULL DEFAULT 'submitted',
  accepted_at   DATETIME NULL,
  respond_by    DATETIME NULL,                           -- tenant confirmation deadline
  decided_at    DATETIME NULL,
  decline_reason VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_app_listing_tenant (listing_id, tenant_id),
  KEY idx_app_landlord (landlord_id, status),
  KEY idx_app_tenant (tenant_id, status),
  KEY idx_app_deadline (status, respond_by),
  CONSTRAINT fk_app_listing  FOREIGN KEY (listing_id)  REFERENCES listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_tenant   FOREIGN KEY (tenant_id)   REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_landlord FOREIGN KEY (landlord_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. COMMISSION RULES (ADMIN-CONFIGURED) AND PLACEMENTS
-- ---------------------------------------------------------------------
CREATE TABLE commission_rules (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(100) NOT NULL,
  fee_type           ENUM('percentage','flat') NOT NULL,
  value              DECIMAL(10,4) NOT NULL,             -- 10 = 10% or 10.00 currency units
  min_fee            DECIMAL(12,2) NULL,
  max_fee            DECIMAL(12,2) NULL,
  landlord_share_pct DECIMAL(5,2) NOT NULL,
  tenant_share_pct   DECIMAL(5,2) NOT NULL,
  scope_type         ENUM('global','city','suburb') NOT NULL DEFAULT 'global',
  scope_id           BIGINT UNSIGNED NULL,               -- locations.id when scoped
  rent_min           DECIMAL(12,2) NULL,
  rent_max           DECIMAL(12,2) NULL,
  currency           CHAR(3) NOT NULL DEFAULT 'USD',
  priority           SMALLINT NOT NULL DEFAULT 0,        -- tie-break between equal matches
  effective_from     DATE NOT NULL,
  effective_to       DATE NULL,
  is_active          TINYINT(1) NOT NULL DEFAULT 1,
  created_by         BIGINT UNSIGNED NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_rule_value   CHECK (value >= 0),
  CONSTRAINT chk_rule_shares  CHECK (landlord_share_pct >= 0 AND tenant_share_pct >= 0
                                     AND landlord_share_pct + tenant_share_pct = 100),
  CONSTRAINT chk_rule_minmax  CHECK (min_fee IS NULL OR max_fee IS NULL OR min_fee <= max_fee),
  CONSTRAINT chk_rule_scope   CHECK ((scope_type = 'global' AND scope_id IS NULL)
                                     OR (scope_type <> 'global' AND scope_id IS NOT NULL)),
  KEY idx_rule_lookup (is_active, scope_type, scope_id, effective_from, effective_to),
  CONSTRAINT fk_rule_scope   FOREIGN KEY (scope_id)   REFERENCES locations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_rule_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE commission_rule_audit (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rule_id    BIGINT UNSIGNED NOT NULL,
  action     ENUM('create','update','activate','deactivate','delete') NOT NULL,
  changed_by BIGINT UNSIGNED NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cra_rule (rule_id, changed_at),
  CONSTRAINT fk_cra_rule FOREIGN KEY (rule_id)    REFERENCES commission_rules(id) ON DELETE CASCADE,
  CONSTRAINT fk_cra_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE placements (                                -- created when the tenant confirms
  id                   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id       BIGINT UNSIGNED NOT NULL,
  listing_id           BIGINT UNSIGNED NOT NULL,
  landlord_id          BIGINT UNSIGNED NOT NULL,
  tenant_id            BIGINT UNSIGNED NOT NULL,
  rule_id              BIGINT UNSIGNED NULL,             -- reference only; snapshot is the truth
  rule_snapshot        JSON NOT NULL,                    -- exact rule values at confirmation
  currency             CHAR(3) NOT NULL,
  first_rent           DECIMAL(12,2) NOT NULL,
  total_fee            DECIMAL(12,2) NOT NULL,
  landlord_fee         DECIMAL(12,2) NOT NULL,
  tenant_fee           DECIMAL(12,2) NOT NULL,
  status               ENUM('awaiting_payment','part_paid','paid','active','cancelled','disputed') NOT NULL DEFAULT 'awaiting_payment',
  confirmed_at         DATETIME NOT NULL,
  payment_deadline     DATETIME NULL,
  contacts_released_at DATETIME NULL,
  move_in_date         DATE NULL,
  cancelled_at         DATETIME NULL,
  cancel_reason        VARCHAR(255) NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_placement_application (application_id),
  CONSTRAINT chk_placement_split CHECK (landlord_fee + tenant_fee = total_fee),
  CONSTRAINT chk_placement_amounts CHECK (first_rent > 0 AND total_fee >= 0
                                          AND landlord_fee >= 0 AND tenant_fee >= 0),
  KEY idx_pl_status (status, payment_deadline),
  KEY idx_pl_landlord (landlord_id, status),
  KEY idx_pl_tenant (tenant_id, status),
  KEY idx_pl_listing (listing_id),
  CONSTRAINT fk_pl_app      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pl_listing  FOREIGN KEY (listing_id)     REFERENCES listings(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pl_landlord FOREIGN KEY (landlord_id)    REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pl_tenant   FOREIGN KEY (tenant_id)      REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pl_rule     FOREIGN KEY (rule_id)        REFERENCES commission_rules(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. INVOICES, PAYMENTS, LEDGER
-- ---------------------------------------------------------------------
CREATE TABLE invoices (                                  -- two per placement: landlord and tenant
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  placement_id BIGINT UNSIGNED NOT NULL,
  payer_id     BIGINT UNSIGNED NOT NULL,
  payer_role   ENUM('landlord','tenant') NOT NULL,
  invoice_no   VARCHAR(30) NOT NULL,
  amount       DECIMAL(12,2) NOT NULL,
  currency     CHAR(3) NOT NULL,
  due_date     DATE NOT NULL,
  status       ENUM('unpaid','paid','void','refunded','waived') NOT NULL DEFAULT 'unpaid',
  paid_at      DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invoice_no (invoice_no),
  UNIQUE KEY uq_invoice_party (placement_id, payer_role),
  KEY idx_inv_payer (payer_id, status),
  KEY idx_inv_due (status, due_date),
  CONSTRAINT fk_inv_placement FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE RESTRICT,
  CONSTRAINT fk_inv_payer     FOREIGN KEY (payer_id)     REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE payments (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id        BIGINT UNSIGNED NOT NULL,
  amount            DECIMAL(12,2) NOT NULL,
  currency          CHAR(3) NOT NULL,
  method            ENUM('mobile_money','card','bank_transfer','cash','credit') NOT NULL,
  gateway           VARCHAR(40) NULL,
  gateway_reference VARCHAR(120) NULL,
  status            ENUM('pending','succeeded','failed','refunded') NOT NULL DEFAULT 'pending',
  gateway_payload   JSON NULL,
  paid_at           DATETIME NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payment_gateway_ref (gateway, gateway_reference),   -- idempotent webhooks
  KEY idx_pay_invoice (invoice_id, status),
  CONSTRAINT chk_payment_amount CHECK (amount > 0),
  CONSTRAINT fk_pay_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE ledger_entries (                            -- append-only record of money events
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  placement_id BIGINT UNSIGNED NOT NULL,
  invoice_id   BIGINT UNSIGNED NULL,
  payment_id   BIGINT UNSIGNED NULL,
  party        ENUM('landlord','tenant','platform') NOT NULL,
  entry_type   ENUM('charge','payment','refund','waiver','adjustment') NOT NULL,
  direction    ENUM('debit','credit') NOT NULL,
  amount       DECIMAL(12,2) NOT NULL,
  currency     CHAR(3) NOT NULL,
  note         VARCHAR(255) NULL,
  created_by   BIGINT UNSIGNED NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_ledger_amount CHECK (amount > 0),
  KEY idx_led_placement (placement_id),
  KEY idx_led_invoice (invoice_id),
  KEY idx_led_created (created_at),
  CONSTRAINT fk_led_placement FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE RESTRICT,
  CONSTRAINT fk_led_invoice   FOREIGN KEY (invoice_id)   REFERENCES invoices(id)   ON DELETE RESTRICT,
  CONSTRAINT fk_led_payment   FOREIGN KEY (payment_id)   REFERENCES payments(id)   ON DELETE RESTRICT,
  CONSTRAINT fk_led_user      FOREIGN KEY (created_by)   REFERENCES users(id)      ON DELETE SET NULL
) ENGINE=InnoDB;

-- Ledger rows can never be edited or deleted; corrections are new entries.
CREATE TRIGGER trg_ledger_no_update BEFORE UPDATE ON ledger_entries
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ledger_entries is append-only';
CREATE TRIGGER trg_ledger_no_delete BEFORE DELETE ON ledger_entries
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ledger_entries is append-only';

CREATE TABLE fee_adjustments (                           -- waivers, promotions, refunds
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  placement_id BIGINT UNSIGNED NOT NULL,
  party        ENUM('landlord','tenant','both') NOT NULL,
  type         ENUM('waiver','discount','promo','refund','correction') NOT NULL,
  amount       DECIMAL(12,2) NOT NULL,
  reason       VARCHAR(255) NOT NULL,
  approved_by  BIGINT UNSIGNED NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_adj_placement (placement_id),
  CONSTRAINT fk_adj_placement FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE RESTRICT,
  CONSTRAINT fk_adj_admin     FOREIGN KEY (approved_by)  REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. NOTIFICATIONS AND WHATSAPP
-- ---------------------------------------------------------------------
CREATE TABLE notifications (                             -- one row per channel attempt
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             BIGINT UNSIGNED NOT NULL,
  event               VARCHAR(60) NOT NULL,              -- application_accepted, placement_confirmed, ...
  channel             ENUM('in_app','push','whatsapp','sms','email') NOT NULL,
  related_type        VARCHAR(40) NULL,                  -- application, placement, invoice, listing
  related_id          BIGINT UNSIGNED NULL,
  title               VARCHAR(150) NULL,
  body                TEXT NULL,
  payload             JSON NULL,
  status              ENUM('queued','sent','delivered','read','failed') NOT NULL DEFAULT 'queued',
  attempts            TINYINT UNSIGNED NOT NULL DEFAULT 0,
  provider_message_id VARCHAR(150) NULL,
  error               VARCHAR(255) NULL,
  next_retry_at       DATETIME NULL,
  sent_at             DATETIME NULL,
  delivered_at        DATETIME NULL,
  read_at             DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notif_user (user_id, channel, status),
  KEY idx_notif_retry (status, next_retry_at),
  KEY idx_notif_related (related_type, related_id),
  KEY idx_notif_provider (provider_message_id),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE whatsapp_sessions (                         -- bot conversation state
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone             VARCHAR(20) NOT NULL,
  user_id           BIGINT UNSIGNED NULL,
  state             VARCHAR(60) NOT NULL DEFAULT 'start',
  context           JSON NULL,                           -- filters collected so far, page, etc.
  last_inbound_at   DATETIME NULL,
  window_expires_at DATETIME NULL,                       -- 24h free-form reply window
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_phone (phone),
  CONSTRAINT fk_wa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. AUDIT LOG
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NULL,
  action      VARCHAR(80) NOT NULL,                      -- e.g. user.verify, listing.approve
  entity_type VARCHAR(40) NOT NULL,
  entity_id   BIGINT UNSIGNED NULL,
  old_values  JSON NULL,
  new_values  JSON NULL,
  ip_address  VARCHAR(45) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_user (user_id, created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 9. SEED DATA
-- ---------------------------------------------------------------------
INSERT INTO amenities (name, slug, category) VALUES
 ('Borehole',            'borehole',        'utilities'),
 ('Municipal water',     'municipal-water', 'utilities'),
 ('Prepaid electricity', 'prepaid-meter',   'utilities'),
 ('Solar power',         'solar',           'utilities'),
 ('Backup generator',    'generator',       'utilities'),
 ('Parking',             'parking',         'comfort'),
 ('Wi-Fi / fibre',       'wifi',            'comfort'),
 ('Garden',              'garden',          'comfort'),
 ('Security / guard',    'security',        'security'),
 ('Walled / gated',      'gated',           'security'),
 ('Pets allowed',        'pets-allowed',    'conditions'),
 ('Student friendly',    'student-friendly','conditions');

-- Starting commission rule: 10% of first rent, 60% landlord / 40% tenant.
-- Admins change this from the console; do not hard-code these numbers in app code.
INSERT INTO commission_rules
  (name, fee_type, value, min_fee, max_fee, landlord_share_pct, tenant_share_pct,
   scope_type, scope_id, currency, effective_from, is_active)
VALUES
  ('Default placement fee', 'percentage', 10, 5.00, 100.00, 60, 40,
   'global', NULL, 'USD', CURDATE(), 1);

-- ---------------------------------------------------------------------
-- 10. REFERENCE QUERIES
-- ---------------------------------------------------------------------
-- Pick the best rule for a listing (most specific scope, then priority, then newest):
--
-- SELECT r.* FROM commission_rules r
-- WHERE r.is_active = 1
--   AND r.currency = :currency
--   AND r.effective_from <= CURDATE()
--   AND (r.effective_to IS NULL OR r.effective_to >= CURDATE())
--   AND (r.rent_min IS NULL OR :rent >= r.rent_min)
--   AND (r.rent_max IS NULL OR :rent <= r.rent_max)
--   AND (r.scope_type = 'global'
--        OR (r.scope_type = 'suburb' AND r.scope_id = :suburb_id)
--        OR (r.scope_type = 'city'   AND r.scope_id = :city_id))
-- ORDER BY FIELD(r.scope_type,'suburb','city','global'), r.priority DESC, r.id DESC
-- LIMIT 1;
--
-- Fee maths (do in application code, in a transaction, with the rule snapshot):
--   total      = fee_type='percentage' ? rent * value/100 : value
--   total      = clamp(total, min_fee, max_fee)
--   tenant_fee = ROUND(total * tenant_share_pct/100, 2)
--   landlord_fee = total - tenant_fee
--
-- Radius search (Haversine, km), after a cheap bounding-box filter on lat/lng:
--   6371 * ACOS(COS(RADIANS(:lat)) * COS(RADIANS(latitude)) *
--     COS(RADIANS(longitude) - RADIANS(:lng)) + SIN(RADIANS(:lat)) * SIN(RADIANS(latitude)))
