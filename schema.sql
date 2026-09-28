-- ============================================================================
-- VIGOR SMART PORT OPERATIONS / VESSEL CYCLE MANAGEMENT
-- COMPLETE RELATIONAL DATABASE SCHEMA - FRESH INSTALL (v1.0)
-- Target: MySQL 8.0.16+ or MariaDB 10.4+ | InnoDB | utf8mb4
-- Intended database in cPanel: petroleumco_vigor_vessels
-- ============================================================================
-- INSTRUCTIONS:
-- 1. Select the EMPTY petroleumco_vigor_vessels database in phpMyAdmin.
-- 2. Import this file ONCE. This file does not CREATE/USE a database and
--    deliberately does not DROP any existing table or insert demo accounts.
-- 3. Do not additionally import the old schema.sql over this one.
-- 4. Store all application-supplied DATETIME values in UTC; display in EAT
--    (Africa/Dar_es_Salaam) in the user interface. Set API MySQL sessions to UTC.
-- 5. Passwords must be securely hashed by the backend; never seed known logins.
-- 6. Financial balances are derived from POSTED payment_transactions, not
--    manually edited totals. Queue forecasts are not manufacturer confirmations.
-- 7. There are deliberately NO AIS/GPS/live-location/tracking tables.
-- 8. The Express backend must be wired to these tables using parameterized SQL
--    and transactions. Importing a schema alone does NOT enable persistence.
-- 9. Use versioned ALTER migrations for later updates, not reimporting a schema.
-- ============================================================================

SET NAMES utf8mb4;

-- 01. Schema version tracking (no seed data included)
CREATE TABLE `schema_migrations` (
  `version` VARCHAR(60) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 02. Corporate roles / configurable permission catalog
CREATE TABLE `roles` (
  `id` VARCHAR(36) NOT NULL,
  `role_name` VARCHAR(50) NOT NULL,
  `description` VARCHAR(255) NOT NULL DEFAULT '',
  `permissions` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_name` (`role_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 03. Users. role values keep current backend naming plus Finance/Marine.
-- Company-domain validation must ALSO be implemented by the backend.
CREATE TABLE `users` (
  `id` VARCHAR(36) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `department` VARCHAR(100) NOT NULL DEFAULT 'Operations',
  `role` ENUM('Admin','Management','Operations','Finance','MarineOperations','Viewer') NOT NULL DEFAULT 'Viewer',
  `status` ENUM('Active','Disabled','Pending') NOT NULL DEFAULT 'Pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_login_at` DATETIME NULL DEFAULT NULL,
  `password_changed_at` DATETIME NULL DEFAULT NULL,
  `must_change_password` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_role_status` (`role`,`status`),
  CONSTRAINT `chk_users_company_email` CHECK (`email` LIKE '%@turkysgroup.co.tz')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 04. Optional revocable sessions (store token hashes, NEVER access tokens)
CREATE TABLE `user_sessions` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `token_hash` VARCHAR(128) NOT NULL,
  `issued_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  `revoked_at` DATETIME NULL DEFAULT NULL,
  `last_seen_at` DATETIME NULL DEFAULT NULL,
  `user_agent` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_sessions_token_hash` (`token_hash`),
  KEY `idx_user_sessions_user_expiry` (`user_id`,`expires_at`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 05. Permanent fleet records. One vessel has many voyages/visits.
CREATE TABLE `vessels` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `imo_reference` VARCHAR(30) NULL,
  `mmsi` VARCHAR(30) NULL, -- master identifier only, not live tracking
  `reference` VARCHAR(60) NULL,
  `capacity_t` DECIMAL(12,2) NOT NULL DEFAULT 10000.00,
  `agent_name` VARCHAR(150) NULL,
  `agent_phone` VARCHAR(50) NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vessels_name` (`name`),
  KEY `idx_vessels_imo` (`imo_reference`),
  CONSTRAINT `chk_vessels_capacity` CHECK (`capacity_t` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 06. B01 is today's sole VIGOR berth. Additional berths can be planned.
-- status = operational state; lifecycle_status = infrastructure availability.
CREATE TABLE `berths` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `location` VARCHAR(150) NOT NULL DEFAULT 'Zanzibar Port',
  `type` VARCHAR(80) NOT NULL DEFAULT 'Bulk Cement Dedicated',
  `length_m` DECIMAL(8,2) NULL,
  `max_draft_m` DECIMAL(5,2) NULL,
  `maximum_vessel_size_t` DECIMAL(12,2) NULL,
  `default_unloading_rate_tph` DECIMAL(8,2) NULL,
  `operational_hours` VARCHAR(120) NULL,
  `status` ENUM('AVAILABLE','OCCUPIED','MAINTENANCE','RESERVED','PLANNED','UNDER_CONSTRUCTION','INACTIVE') NOT NULL DEFAULT 'AVAILABLE',
  `lifecycle_status` ENUM('ACTIVE','PLANNED','UNDER_CONSTRUCTION','MAINTENANCE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `available_from` DATETIME NULL DEFAULT NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_berths_name` (`name`),
  KEY `idx_berths_status` (`status`,`lifecycle_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 07. The actual cement supplier/manufacturer, not a VIGOR berth
CREATE TABLE `manufacturers` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `location` VARCHAR(180) NULL,
  `contact_name` VARCHAR(120) NULL,
  `contact_phone` VARCHAR(60) NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `default_loading_rate_tph` DECIMAL(10,2) NULL,
  `default_payment_rule_type` ENUM('FULL','PERCENTAGE','AMOUNT','MANUAL') NOT NULL DEFAULT 'FULL',
  `default_payment_rule_value` DECIMAL(18,2) NOT NULL DEFAULT 100.00,
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_manufacturers_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 08. Manufacturer-controlled loading berths (different from VIGOR berths)
CREATE TABLE `manufacturer_berths` (
  `id` VARCHAR(36) NOT NULL,
  `manufacturer_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `loading_rate_tph` DECIMAL(10,2) NULL,
  `status` ENUM('ACTIVE','MAINTENANCE','INACTIVE','PLANNED') NOT NULL DEFAULT 'ACTIVE',
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_manufacturer_berth_name` (`manufacturer_id`,`name`),
  CONSTRAINT `fk_manufacturer_berths_manufacturer` FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturers` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 09. Fuel supplier directory
CREATE TABLE `fuel_suppliers` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `location` VARCHAR(180) NULL,
  `contact_name` VARCHAR(120) NULL,
  `contact_phone` VARCHAR(60) NULL,
  `email` VARCHAR(191) NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fuel_suppliers_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Existing key/value configuration contract
CREATE TABLE `system_settings` (
  `setting_key` VARCHAR(80) NOT NULL,
  `setting_value` TEXT NOT NULL,
  `description` VARCHAR(255) NULL,
  `updated_by` VARCHAR(150) NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Complete VIGOR -> manufacturer -> VIGOR vessel cycle.
-- Current stage should be synchronized FROM its current PRIMARY activity.
CREATE TABLE `voyages` (
  `id` VARCHAR(36) NOT NULL,
  `vessel_id` VARCHAR(36) NOT NULL,
  `voyage_number` VARCHAR(60) NOT NULL,
  `status` ENUM('PLANNED','ACTIVE','COMPLETED','CANCELLED','ON_HOLD') NOT NULL DEFAULT 'PLANNED',
  `origin` VARCHAR(160) NULL,
  `destination` VARCHAR(160) NULL,
  `manufacturer_id` VARCHAR(36) NULL,
  `assigned_berth_id` VARCHAR(36) NULL,
  `cargo_type` VARCHAR(100) NOT NULL DEFAULT 'Bulk Cement',
  `planned_cargo_t` DECIMAL(12,2) NULL,
  `actual_cargo_t` DECIMAL(12,2) NULL,
  `cycle_start` DATETIME NULL DEFAULT NULL,
  `cycle_end` DATETIME NULL DEFAULT NULL,
  `current_stage` VARCHAR(80) NOT NULL DEFAULT 'PLANNED',
  `health` ENUM('READY','AT_RISK','BLOCKED','DELAYED') NOT NULL DEFAULT 'READY',
  `risk` ENUM('ON_TRACK','AT_RISK','DELAYED','ARRIVAL_OVERDUE','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  `current_blocker` VARCHAR(80) NOT NULL DEFAULT 'NONE',
  `blocker_description` TEXT NULL,
  `fuel_required` TINYINT(1) NOT NULL DEFAULT 0,
  `outbound_departure_planned` DATETIME NULL,
  `outbound_departure_forecast` DATETIME NULL,
  `outbound_departure_actual` DATETIME NULL,
  `manufacturer_eta_planned` DATETIME NULL,
  `manufacturer_eta_forecast` DATETIME NULL,
  `manufacturer_actual_arrival` DATETIME NULL,
  `manufacturer_slot_planned` DATETIME NULL,
  `manufacturer_slot_forecast` DATETIME NULL,
  `manufacturer_slot_confirmed` DATETIME NULL,
  `manufacturer_departure_planned` DATETIME NULL,
  `manufacturer_departure_forecast` DATETIME NULL,
  `manufacturer_departure_actual` DATETIME NULL,
  `return_eta_planned` DATETIME NULL,
  `return_eta_forecast` DATETIME NULL,
  `return_eta_confirmed` DATETIME NULL,
  `return_actual_arrival` DATETIME NULL,
  `berth_conflict` TINYINT(1) NOT NULL DEFAULT 0,
  `predicted_anchorage_wait_minutes` INT NULL,
  `conflict_notes` TEXT NULL,
  `notes` TEXT NULL,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_voyages_reference` (`voyage_number`),
  KEY `idx_voyages_vessel_status` (`vessel_id`,`status`),
  KEY `idx_voyages_return_eta` (`return_eta_forecast`),
  KEY `idx_voyages_manufacturer` (`manufacturer_id`),
  CONSTRAINT `fk_voyages_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_voyages_manufacturer` FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_voyages_berth` FOREIGN KEY (`assigned_berth_id`) REFERENCES `berths` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Each call/unloading at VIGOR is a separate visit (not a voyage ID)
CREATE TABLE `vessel_visits` (
  `id` VARCHAR(36) NOT NULL,
  `vessel_id` VARCHAR(36) NOT NULL,
  `voyage_id` VARCHAR(36) NULL,
  `berth_id` VARCHAR(36) NULL,
  `voyage_number` VARCHAR(60) NOT NULL,
  `cargo_type` VARCHAR(100) NOT NULL DEFAULT 'Bulk Cement',
  `cargo_total_t` DECIMAL(12,2) NOT NULL,
  `unloaded_t` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `unloading_rate_tph` DECIMAL(10,2) NULL,
  `planned_arrival` DATETIME NULL,
  `revised_eta` DATETIME NULL,
  `confirmed_eta` DATETIME NULL,
  `eta_source` VARCHAR(80) NULL,
  `eta_updated_at` DATETIME NULL,
  `actual_arrival` DATETIME NULL,
  `berthing_at` DATETIME NULL,
  `unload_start` DATETIME NULL,
  `unload_end` DATETIME NULL,
  `planned_departure` DATETIME NULL,
  `actual_departure` DATETIME NULL,
  `forecast_unload_end` DATETIME NULL,
  `expected_berth_release` DATETIME NULL,
  `post_unloading_minutes` INT NOT NULL DEFAULT 90,
  `status` ENUM('PLANNED','ARRIVED','BERTHED','UNLOADING','COMPLETED','DEPARTED','CANCELLED') NOT NULL DEFAULT 'PLANNED',
  `berth_conflict` TINYINT(1) NOT NULL DEFAULT 0,
  `conflict_notes` TEXT NULL,
  `created_by` VARCHAR(36) NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_visits_vessel_status` (`vessel_id`,`status`),
  KEY `idx_visits_voyage` (`voyage_id`),
  KEY `idx_visits_berth_arrival` (`berth_id`,`planned_arrival`),
  KEY `idx_visits_release` (`expected_berth_release`),
  CONSTRAINT `fk_visits_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_visits_voyage` FOREIGN KEY (`voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_visits_berth` FOREIGN KEY (`berth_id`) REFERENCES `berths` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_visits_cargo` CHECK (`cargo_total_t` > 0 AND `unloaded_t` >= 0 AND `unloaded_t` <= `cargo_total_t`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Berth reservations and future slots; overlap checks run in the backend
CREATE TABLE `berth_reservations` (
  `id` VARCHAR(36) NOT NULL,
  `berth_id` VARCHAR(36) NOT NULL,
  `vessel_id` VARCHAR(36) NOT NULL,
  `voyage_id` VARCHAR(36) NULL,
  `visit_id` VARCHAR(36) NULL,
  `status` ENUM('TENTATIVE','PLANNED','CONFIRMED','IN_USE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PLANNED',
  `source` ENUM('PLANNED','FORECAST','CONFIRMED','ACTUAL','SIMULATED') NOT NULL DEFAULT 'PLANNED',
  `planned_start` DATETIME NULL,
  `planned_end` DATETIME NULL,
  `forecast_start` DATETIME NULL,
  `forecast_end` DATETIME NULL,
  `confirmed_start` DATETIME NULL,
  `confirmed_end` DATETIME NULL,
  `actual_start` DATETIME NULL,
  `actual_end` DATETIME NULL,
  `preparation_minutes` INT NOT NULL DEFAULT 60,
  `post_unload_buffer_minutes` INT NOT NULL DEFAULT 90,
  `conflict_flag` TINYINT(1) NOT NULL DEFAULT 0,
  `predicted_wait_minutes` INT NULL,
  `conflict_reason` TEXT NULL,
  `notes` TEXT NULL,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reservations_berth_plan` (`berth_id`,`planned_start`,`status`),
  KEY `idx_reservations_vessel` (`vessel_id`,`voyage_id`),
  CONSTRAINT `fk_reservations_berth` FOREIGN KEY (`berth_id`) REFERENCES `berths` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_reservations_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_reservations_voyage` FOREIGN KEY (`voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_reservations_visit` FOREIGN KEY (`visit_id`) REFERENCES `vessel_visits` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Existing upcoming-call API compatibility + ETA details
CREATE TABLE `upcoming_vessel_calls` (
  `id` VARCHAR(36) NOT NULL,
  `vessel_id` VARCHAR(36) NOT NULL,
  `voyage_id` VARCHAR(36) NULL,
  `berth_id` VARCHAR(36) NOT NULL,
  `expected_arrival` DATETIME NOT NULL,
  `cargo_type` VARCHAR(100) NOT NULL DEFAULT 'Bulk Cement',
  `cargo_quantity_t` DECIMAL(12,2) NOT NULL,
  `expected_rate_tph` DECIMAL(10,2) NULL,
  `call_alert_at` DATETIME NULL,
  `confirmation_due_at` DATETIME NULL,
  `confirmed_at` DATETIME NULL,
  `berth_preparation_minutes` INT NOT NULL DEFAULT 60,
  `status` ENUM('PLANNED','CONFIRMED','ARRIVED','CANCELLED') NOT NULL DEFAULT 'PLANNED',
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_calls_berth_eta` (`berth_id`,`expected_arrival`),
  KEY `idx_calls_vessel_status` (`vessel_id`,`status`),
  CONSTRAINT `fk_calls_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_calls_voyage` FOREIGN KEY (`voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_calls_berth` FOREIGN KEY (`berth_id`) REFERENCES `berths` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. Manual/agent-supplied arrival forecasts; NO live location data
CREATE TABLE `eta_updates` (
  `id` VARCHAR(36) NOT NULL,
  `voyage_id` VARCHAR(36) NOT NULL,
  `vessel_id` VARCHAR(36) NOT NULL,
  `visit_id` VARCHAR(36) NULL,
  `destination_type` ENUM('VIGOR','MANUFACTURER','OTHER') NOT NULL,
  `eta_type` ENUM('PLANNED','REVISED','CONFIRMED','ACTUAL') NOT NULL,
  `eta_at` DATETIME NOT NULL,
  `source` ENUM('VESSEL_AGENT','CAPTAIN_COMMUNICATION','OPERATIONS','MANUFACTURER','PORT','MANUAL','OTHER') NOT NULL DEFAULT 'OPERATIONS',
  `reported_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notes` TEXT NULL,
  `entered_by` VARCHAR(36) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_eta_voyage_type` (`voyage_id`,`destination_type`,`reported_at`),
  CONSTRAINT `fk_eta_voyage` FOREIGN KEY (`voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_eta_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_eta_visit` FOREIGN KEY (`visit_id`) REFERENCES `vessel_visits` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. Periodic unloading data, compatible with existing MVP requests
CREATE TABLE `operational_readings` (
  `id` VARCHAR(36) NOT NULL,
  `visit_id` VARCHAR(36) NOT NULL,
  `recorded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `source` ENUM('MANUAL','CSV','DEMO','TELEMETRY') NOT NULL DEFAULT 'MANUAL',
  `unloaded_t` DECIMAL(12,2) NOT NULL,
  `observed_rate_tph` DECIMAL(10,2) NULL,
  `buffer_level_t` DECIMAL(12,2) NULL,
  `buffer_capacity_t` DECIMAL(12,2) NULL,
  `packaging_rate_tph` DECIMAL(10,2) NULL,
  `unloading_status` ENUM('ACTIVE','STOPPED','COMPLETED') NOT NULL DEFAULT 'ACTIVE',
  `packaging_status` ENUM('ACTIVE','STOPPED','NOT_APPLICABLE') NULL,
  `notes` TEXT NULL,
  `entered_by` VARCHAR(150) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reading_visit_time` (`visit_id`,`recorded_at`),
  CONSTRAINT `fk_readings_visit` FOREIGN KEY (`visit_id`) REFERENCES `vessel_visits` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_readings_unloaded` CHECK (`unloaded_t` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. Persisted unloading and berth-release predictions; never replace actuals
CREATE TABLE `predictions` (
  `id` VARCHAR(36) NOT NULL,
  `visit_id` VARCHAR(36) NOT NULL,
  `generated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `remaining_t` DECIMAL(12,2) NULL,
  `progress_pct` DECIMAL(5,2) NULL,
  `effective_rate_tph` DECIMAL(10,2) NULL,
  `estimated_unload_finish` DATETIME NULL,
  `expected_berth_release` DATETIME NULL,
  `method` VARCHAR(100) NULL,
  `data_quality` ENUM('VALID','STALE','INSUFFICIENT','INVALID') NOT NULL DEFAULT 'INSUFFICIENT',
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_predictions_visit_time` (`visit_id`,`generated_at`),
  CONSTRAINT `fk_predictions_visit` FOREIGN KEY (`visit_id`) REFERENCES `vessel_visits` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. Confirmed delay events (predicted risk is a separate concept)
CREATE TABLE `delay_events` (
  `id` VARCHAR(36) NOT NULL,
  `visit_id` VARCHAR(36) NULL,
  `voyage_id` VARCHAR(36) NULL,
  `vessel_id` VARCHAR(36) NULL,
  `start_time` DATETIME NOT NULL,
  `end_time` DATETIME NULL,
  `category` VARCHAR(60) NOT NULL DEFAULT 'Technical',
  `cause` VARCHAR(255) NOT NULL,
  `responsible_area` VARCHAR(100) NOT NULL DEFAULT 'Operations',
  `equipment` VARCHAR(100) NULL,
  `description` TEXT NULL,
  `resolved` TINYINT(1) NOT NULL DEFAULT 0,
  `recorded_by` VARCHAR(150) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_delays_visit` (`visit_id`,`start_time`),
  KEY `idx_delays_voyage` (`voyage_id`,`start_time`),
  KEY `idx_delays_resolved` (`resolved`),
  CONSTRAINT `fk_delays_visit` FOREIGN KEY (`visit_id`) REFERENCES `vessel_visits` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_delays_voyage` FOREIGN KEY (`voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_delays_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. Manufacturer, fuel, port and other accounts share payment logic
-- paid_amount and remaining_amount MUST be calculated from posted transactions.
CREATE TABLE `payment_accounts` (
  `id` VARCHAR(36) NOT NULL,
  `vessel_id` VARCHAR(36) NOT NULL,
  `voyage_id` VARCHAR(36) NOT NULL,
  `category` ENUM('MANUFACTURER','FUEL','PORT','OTHER') NOT NULL,
  `manufacturer_id` VARCHAR(36) NULL,
  `fuel_supplier_id` VARCHAR(36) NULL,
  `counterparty_id` VARCHAR(36) NULL,
  `counterparty_name` VARCHAR(180) NULL,
  `purpose` VARCHAR(200) NULL,
  `invoice_number` VARCHAR(100) NULL,
  `required_amount` DECIMAL(18,2) NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'TZS',
  `eligibility_threshold_type` ENUM('FULL','PERCENTAGE','AMOUNT','MANUAL') NOT NULL DEFAULT 'FULL',
  `eligibility_threshold_value` DECIMAL(18,2) NOT NULL DEFAULT 100.00,
  `deadline` DATETIME NULL,
  `status` ENUM('PENDING','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `is_eligible` TINYINT(1) NOT NULL DEFAULT 0,
  `eligible_at` DATETIME NULL,
  `manual_approved_at` DATETIME NULL,
  `manual_approved_by` VARCHAR(36) NULL,
  `notes` TEXT NULL,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_payments_voyage_cat` (`voyage_id`,`category`),
  KEY `idx_payments_deadline_status` (`deadline`,`status`),
  KEY `idx_payments_manufacturer` (`manufacturer_id`),
  CONSTRAINT `fk_payments_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_payments_voyage` FOREIGN KEY (`voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_payments_manufacturer` FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_payments_fuel_supplier` FOREIGN KEY (`fuel_supplier_id`) REFERENCES `fuel_suppliers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_payments_required` CHECK (`required_amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. Immutable financial history: VOID rather than DELETE; sum POSTED rows only
CREATE TABLE `payment_transactions` (
  `id` VARCHAR(36) NOT NULL,
  `payment_account_id` VARCHAR(36) NOT NULL,
  `vessel_id` VARCHAR(36) NOT NULL,
  `voyage_id` VARCHAR(36) NOT NULL,
  `category` ENUM('MANUFACTURER','FUEL','PORT','OTHER') NOT NULL,
  `amount` DECIMAL(18,2) NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'TZS',
  `transaction_date` DATETIME NOT NULL,
  `payment_method` VARCHAR(80) NULL,
  `reference_number` VARCHAR(120) NULL,
  `status` ENUM('POSTED','VOIDED') NOT NULL DEFAULT 'POSTED',
  `voided_at` DATETIME NULL,
  `voided_by` VARCHAR(36) NULL,
  `void_reason` TEXT NULL,
  `notes` TEXT NULL,
  `entered_by` VARCHAR(36) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_transactions_account_date` (`payment_account_id`,`transaction_date`),
  KEY `idx_transactions_voyage` (`voyage_id`),
  KEY `idx_transactions_status` (`status`),
  CONSTRAINT `fk_transactions_account` FOREIGN KEY (`payment_account_id`) REFERENCES `payment_accounts` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_transactions_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_transactions_voyage` FOREIGN KEY (`voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_transaction_positive` CHECK (`amount` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21. Payment eligibility audit; preserve the FIRST time threshold was reached
CREATE TABLE `payment_eligibility_events` (
  `id` VARCHAR(36) NOT NULL,
  `payment_account_id` VARCHAR(36) NOT NULL,
  `event_type` ENUM('BECAME_ELIGIBLE','ELIGIBILITY_REVOKED','MANUAL_OVERRIDE','RULE_CHANGED') NOT NULL,
  `amount_paid_at_event` DECIMAL(18,2) NULL,
  `is_eligible_after` TINYINT(1) NOT NULL,
  `reason` TEXT NULL,
  `performed_by` VARCHAR(36) NULL,
  `occurred_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_eligibility_account_time` (`payment_account_id`,`occurred_at`),
  CONSTRAINT `fk_eligibility_account` FOREIGN KEY (`payment_account_id`) REFERENCES `payment_accounts` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 22. Fuel scheduling/actual delivery, linked to a generic payment account
CREATE TABLE `fuel_operations` (
  `id` VARCHAR(36) NOT NULL,
  `voyage_id` VARCHAR(36) NOT NULL,
  `vessel_id` VARCHAR(36) NOT NULL,
  `supplier_id` VARCHAR(36) NULL,
  `payment_account_id` VARCHAR(36) NULL,
  `fuel_type` VARCHAR(80) NOT NULL,
  `quantity` DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  `actual_quantity` DECIMAL(14,3) NULL,
  `unit` VARCHAR(30) NOT NULL DEFAULT 'L',
  `estimated_cost` DECIMAL(18,2) NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'TZS',
  `requested_at` DATETIME NULL,
  `scheduled_start` DATETIME NULL,
  `scheduled_end` DATETIME NULL,
  `actual_start` DATETIME NULL,
  `actual_end` DATETIME NULL,
  `status` ENUM('NOT_REQUIRED','REQUESTED','PAYMENT_PENDING','PARTIALLY_PAID','PAID','SCHEDULED','IN_PROGRESS','COMPLETED','DELAYED','CANCELLED') NOT NULL DEFAULT 'REQUESTED',
  `invoice_number` VARCHAR(100) NULL,
  `notes` TEXT NULL,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fuel_voyage_status` (`voyage_id`,`status`),
  KEY `idx_fuel_schedule` (`scheduled_start`),
  CONSTRAINT `fk_fuel_voyage` FOREIGN KEY (`voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_fuel_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_fuel_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `fuel_suppliers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_fuel_payment` FOREIGN KEY (`payment_account_id`) REFERENCES `payment_accounts` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_fuel_quantity` CHECK (`quantity` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 23. Cement order at the manufacturer, payment, and actual schedule
CREATE TABLE `manufacturer_orders` (
  `id` VARCHAR(36) NOT NULL,
  `voyage_id` VARCHAR(36) NOT NULL,
  `vessel_id` VARCHAR(36) NOT NULL,
  `manufacturer_id` VARCHAR(36) NOT NULL,
  `payment_account_id` VARCHAR(36) NULL,
  `order_reference` VARCHAR(100) NULL,
  `cargo_type` VARCHAR(100) NOT NULL DEFAULT 'Bulk Cement',
  `cargo_quantity_t` DECIMAL(12,2) NOT NULL,
  `status` ENUM('PLANNED','PAYMENT_PENDING','PARTIALLY_PAID','ELIGIBLE','QUEUED','BERTH_CONFIRMED','LOADING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PLANNED',
  `planned_arrival` DATETIME NULL,
  `confirmed_arrival` DATETIME NULL,
  `actual_arrival` DATETIME NULL,
  `predicted_loading_start` DATETIME NULL,
  `confirmed_loading_start` DATETIME NULL,
  `actual_loading_start` DATETIME NULL,
  `estimated_loading_finish` DATETIME NULL,
  `actual_loading_finish` DATETIME NULL,
  `actual_departure` DATETIME NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_orders_voyage` (`voyage_id`),
  KEY `idx_orders_manufacturer_status` (`manufacturer_id`,`status`),
  CONSTRAINT `fk_orders_voyage` FOREIGN KEY (`voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_orders_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_orders_manufacturer` FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_orders_payment` FOREIGN KEY (`payment_account_id`) REFERENCES `payment_accounts` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_order_cargo` CHECK (`cargo_quantity_t` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 24. Predicted and manufacturer-confirmed queue slots, including other ships
CREATE TABLE `manufacturer_queue_entries` (
  `id` VARCHAR(36) NOT NULL,
  `manufacturer_id` VARCHAR(36) NOT NULL,
  `manufacturer_order_id` VARCHAR(36) NULL,
  `manufacturer_berth_id` VARCHAR(36) NULL,
  `voyage_id` VARCHAR(36) NULL,
  `vessel_id` VARCHAR(36) NULL,
  `is_external` TINYINT(1) NOT NULL DEFAULT 0,
  `external_vessel_name` VARCHAR(150) NULL,
  `eta` DATETIME NULL,
  `payment_status` ENUM('PAID','PARTIAL','PENDING','NOT_REQUIRED','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  `is_eligible` TINYINT(1) NOT NULL DEFAULT 0,
  `eligible_since` DATETIME NULL,
  `position` INT NULL,
  `predicted_queue_position` INT NULL,
  `confirmed_queue_position` INT NULL,
  `predicted_slot` DATETIME NULL,
  `confirmed_slot` DATETIME NULL,
  `queue_source` ENUM('AUTOMATIC_PREDICTION','MANUAL_OVERRIDE','MANUFACTURER_CONFIRMED') NOT NULL DEFAULT 'AUTOMATIC_PREDICTION',
  `status` ENUM('PENDING','WAITING','BERTHED','LOADING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `priority_override` INT NULL,
  `priority_reason` TEXT NULL,
  `berth_name` VARCHAR(120) NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_queue_order` (`manufacturer_order_id`),
  KEY `idx_queue_manufacturer_slot` (`manufacturer_id`,`predicted_slot`),
  KEY `idx_queue_eligibility` (`manufacturer_id`,`eligible_since`),
  CONSTRAINT `fk_queue_manufacturer` FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_queue_order` FOREIGN KEY (`manufacturer_order_id`) REFERENCES `manufacturer_orders` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_queue_mberth` FOREIGN KEY (`manufacturer_berth_id`) REFERENCES `manufacturer_berths` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_queue_voyage` FOREIGN KEY (`voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_queue_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 25. Queue/supplier confirmation revisions (historical traceability)
CREATE TABLE `manufacturer_queue_events` (
  `id` VARCHAR(36) NOT NULL,
  `queue_entry_id` VARCHAR(36) NOT NULL,
  `event_type` VARCHAR(80) NOT NULL,
  `old_position` INT NULL,
  `new_position` INT NULL,
  `old_slot` DATETIME NULL,
  `new_slot` DATETIME NULL,
  `source` ENUM('AUTOMATIC_PREDICTION','MANUAL_OVERRIDE','MANUFACTURER_CONFIRMED') NOT NULL,
  `reason` TEXT NULL,
  `performed_by` VARCHAR(36) NULL,
  `occurred_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_queue_events_entry_time` (`queue_entry_id`,`occurred_at`),
  CONSTRAINT `fk_queue_events_entry` FOREIGN KEY (`queue_entry_id`) REFERENCES `manufacturer_queue_entries` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 26. Manufacturer cement loading progress
CREATE TABLE `loading_operations` (
  `id` VARCHAR(36) NOT NULL,
  `manufacturer_order_id` VARCHAR(36) NOT NULL,
  `voyage_id` VARCHAR(36) NOT NULL,
  `vessel_id` VARCHAR(36) NOT NULL,
  `manufacturer_id` VARCHAR(36) NOT NULL,
  `manufacturer_berth_id` VARCHAR(36) NULL,
  `manufacturer_berth` VARCHAR(120) NULL,
  `cargo_total_t` DECIMAL(12,2) NOT NULL,
  `loaded_t` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `loading_rate_tph` DECIMAL(10,2) NULL,
  `planned_start` DATETIME NULL,
  `actual_start` DATETIME NULL,
  `forecast_finish` DATETIME NULL,
  `actual_finish` DATETIME NULL,
  `status` ENUM('PLANNED','READY','IN_PROGRESS','STOPPED','COMPLETED','CANCELLED','DELAYED') NOT NULL DEFAULT 'PLANNED',
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_loading_voyage_status` (`voyage_id`,`status`),
  CONSTRAINT `fk_loading_order` FOREIGN KEY (`manufacturer_order_id`) REFERENCES `manufacturer_orders` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_loading_voyage` FOREIGN KEY (`voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_loading_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_loading_manufacturer` FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_loading_mberth` FOREIGN KEY (`manufacturer_berth_id`) REFERENCES `manufacturer_berths` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_loading_progress` CHECK (`cargo_total_t` > 0 AND `loaded_t` >= 0 AND `loaded_t` <= `cargo_total_t`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 27. Periodic manufacturer loading readings (independent of unloaded readings)
CREATE TABLE `loading_readings` (
  `id` VARCHAR(36) NOT NULL,
  `loading_operation_id` VARCHAR(36) NOT NULL,
  `recorded_at` DATETIME NOT NULL,
  `loaded_t` DECIMAL(12,2) NOT NULL,
  `observed_rate_tph` DECIMAL(10,2) NULL,
  `source` ENUM('MANUAL','CSV','DEMO','MANUFACTURER') NOT NULL DEFAULT 'MANUAL',
  `notes` TEXT NULL,
  `recorded_by` VARCHAR(36) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_loading_reading_time` (`loading_operation_id`,`recorded_at`),
  CONSTRAINT `fk_loading_readings_operation` FOREIGN KEY (`loading_operation_id`) REFERENCES `loading_operations` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_loading_reading_nonnegative` CHECK (`loaded_t` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 28. Planned/forecast/confirmed/actual milestones shown in Control Tower
CREATE TABLE `schedule_events` (
  `id` VARCHAR(36) NOT NULL,
  `voyage_id` VARCHAR(36) NOT NULL,
  `vessel_id` VARCHAR(36) NOT NULL,
  `activity_id` VARCHAR(36) NULL, -- may reference a polymorphic/mapped activity after creation
  `event_type` VARCHAR(80) NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `planned_start` DATETIME NULL,
  `planned_end` DATETIME NULL,
  `forecast_start` DATETIME NULL,
  `forecast_end` DATETIME NULL,
  `confirmed_start` DATETIME NULL,
  `confirmed_end` DATETIME NULL,
  `actual_start` DATETIME NULL,
  `actual_end` DATETIME NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'PLANNED',
  `source` ENUM('PLANNED','FORECAST','CONFIRMED','ACTUAL','SIMULATED') NOT NULL DEFAULT 'PLANNED',
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_events_voyage_start` (`voyage_id`,`forecast_start`),
  KEY `idx_events_vessel_start` (`vessel_id`,`forecast_start`),
  CONSTRAINT `fk_schedule_voyage` FOREIGN KEY (`voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_schedule_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 29. Record of forecast edits without overwriting original planned values
CREATE TABLE `schedule_event_revisions` (
  `id` VARCHAR(36) NOT NULL,
  `schedule_event_id` VARCHAR(36) NOT NULL,
  `old_forecast_start` DATETIME NULL,
  `old_forecast_end` DATETIME NULL,
  `new_forecast_start` DATETIME NULL,
  `new_forecast_end` DATETIME NULL,
  `reason` TEXT NULL,
  `trigger_entity_type` VARCHAR(80) NULL,
  `trigger_entity_id` VARCHAR(36) NULL,
  `changed_by` VARCHAR(36) NULL,
  `changed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_schedule_rev_event` (`schedule_event_id`,`changed_at`),
  CONSTRAINT `fk_schedule_rev_event` FOREIGN KEY (`schedule_event_id`) REFERENCES `schedule_events` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 30. PRIMARY and SUPPORT activity workflow engine. Keep previous names.
-- IMPORTANT: Backend transaction must enforce max one IN_PROGRESS PRIMARY
-- activity per vessel and validate state transitions/dependency overrides.
CREATE TABLE `vessel_activities` (
  `id` VARCHAR(36) NOT NULL,
  `vessel_id` VARCHAR(36) NOT NULL,
  `voyage_id` VARCHAR(36) NULL,
  `visit_id` VARCHAR(36) NULL,
  `berth_id` VARCHAR(36) NULL,
  `activity_type` VARCHAR(80) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `description` TEXT NULL,
  `execution_mode` ENUM('PRIMARY','SUPPORT') NOT NULL,
  `status` ENUM('PLANNED','READY','IN_PROGRESS','STOPPED','BLOCKED','COMPLETED','CANCELLED','SKIPPED') NOT NULL DEFAULT 'PLANNED',
  `sequence_no` INT NOT NULL,
  `priority` ENUM('LOW','NORMAL','HIGH','CRITICAL') NOT NULL DEFAULT 'NORMAL',
  `location` VARCHAR(160) NULL,
  `planned_start` DATETIME NULL,
  `planned_end` DATETIME NULL,
  `forecast_start` DATETIME NULL,
  `forecast_end` DATETIME NULL,
  `actual_start` DATETIME NULL,
  `actual_end` DATETIME NULL,
  `stopped_at` DATETIME NULL,
  `estimated_duration_minutes` INT NULL,
  `progress_pct` DECIMAL(5,2) NULL,
  `blocks_next` TINYINT(1) NOT NULL DEFAULT 1,
  `linked_entity_type` VARCHAR(60) NULL,
  `linked_entity_id` VARCHAR(36) NULL,
  `stop_reason` TEXT NULL,
  `blocker_reason` TEXT NULL,
  `cancellation_reason` TEXT NULL,
  `completion_notes` TEXT NULL,
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vessel_activities_vessel` (`vessel_id`),
  KEY `idx_vessel_activities_voyage` (`voyage_id`),
  KEY `idx_vessel_activities_status` (`status`),
  KEY `idx_vessel_activities_seq` (`vessel_id`,`sequence_no`),
  KEY `idx_vessel_activities_planned_start` (`planned_start`),
  KEY `idx_vessel_primary_active` (`vessel_id`,`execution_mode`,`status`),
  CONSTRAINT `fk_activities_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_activities_voyage` FOREIGN KEY (`voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_activities_visit` FOREIGN KEY (`visit_id`) REFERENCES `vessel_visits` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_activities_berth` FOREIGN KEY (`berth_id`) REFERENCES `berths` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_activity_progress` CHECK (`progress_pct` IS NULL OR (`progress_pct` BETWEEN 0 AND 100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 31. Activity prerequisites: e.g. FUEL after UNLOADING; support activities parallel
CREATE TABLE `activity_dependencies` (
  `id` VARCHAR(36) NOT NULL,
  `activity_id` VARCHAR(36) NOT NULL,
  `depends_on_activity_id` VARCHAR(36) NOT NULL,
  `required_status` VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_activity_dependency` (`activity_id`,`depends_on_activity_id`),
  KEY `idx_dep_depends_on` (`depends_on_activity_id`),
  CONSTRAINT `fk_dep_activity` FOREIGN KEY (`activity_id`) REFERENCES `vessel_activities` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_dep_depends_on` FOREIGN KEY (`depends_on_activity_id`) REFERENCES `vessel_activities` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_dep_not_self` CHECK (`activity_id` <> `depends_on_activity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 32. Operational history: START, STOP, RESUME, COMPLETE, CANCEL, SKIP, etc.
CREATE TABLE `vessel_activity_events` (
  `id` VARCHAR(36) NOT NULL,
  `activity_id` VARCHAR(36) NOT NULL,
  `vessel_id` VARCHAR(36) NOT NULL,
  `voyage_id` VARCHAR(36) NULL,
  `event_type` VARCHAR(60) NOT NULL,
  `previous_status` VARCHAR(50) NULL,
  `new_status` VARCHAR(50) NOT NULL,
  `reason` TEXT NULL,
  `notes` TEXT NULL,
  `performed_by` VARCHAR(150) NULL,
  `occurred_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_act_events_activity` (`activity_id`,`occurred_at`),
  KEY `idx_act_events_vessel` (`vessel_id`,`occurred_at`),
  CONSTRAINT `fk_act_events_activity` FOREIGN KEY (`activity_id`) REFERENCES `vessel_activities` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_act_events_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_act_events_voyage` FOREIGN KEY (`voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 33. Accurate STOPPED duration with repeated stop/resume pairs
CREATE TABLE `vessel_activity_pauses` (
  `id` VARCHAR(36) NOT NULL,
  `activity_id` VARCHAR(36) NOT NULL,
  `paused_at` DATETIME NOT NULL,
  `resumed_at` DATETIME NULL,
  `reason` TEXT NOT NULL,
  `recorded_by` VARCHAR(36) NULL,
  `resumed_by` VARCHAR(36) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pauses_activity_time` (`activity_id`,`paused_at`),
  CONSTRAINT `fk_pauses_activity` FOREIGN KEY (`activity_id`) REFERENCES `vessel_activities` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 34-36. Configurable standard voyage-activity plans (no automatic demo seeds)
CREATE TABLE `activity_templates` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(140) NOT NULL,
  `description` TEXT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_activity_template_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `activity_template_steps` (
  `id` VARCHAR(36) NOT NULL,
  `template_id` VARCHAR(36) NOT NULL,
  `activity_type` VARCHAR(80) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `execution_mode` ENUM('PRIMARY','SUPPORT') NOT NULL DEFAULT 'PRIMARY',
  `sequence_no` INT NOT NULL,
  `estimated_duration_minutes` INT NULL,
  `is_optional` TINYINT(1) NOT NULL DEFAULT 0,
  `blocks_next` TINYINT(1) NOT NULL DEFAULT 1,
  `notes` TEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_template_step_sequence` (`template_id`,`sequence_no`),
  CONSTRAINT `fk_template_steps_template` FOREIGN KEY (`template_id`) REFERENCES `activity_templates` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `activity_template_dependencies` (
  `id` VARCHAR(36) NOT NULL,
  `step_id` VARCHAR(36) NOT NULL,
  `depends_on_step_id` VARCHAR(36) NOT NULL,
  `required_status` VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_template_dependency` (`step_id`,`depends_on_step_id`),
  CONSTRAINT `fk_tdep_step` FOREIGN KEY (`step_id`) REFERENCES `activity_template_steps` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_tdep_depends` FOREIGN KEY (`depends_on_step_id`) REFERENCES `activity_template_steps` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_tdep_not_self` CHECK (`step_id` <> `depends_on_step_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 37. Physical berth occupancy changes (actual release requires staff confirmation)
CREATE TABLE `berth_status_events` (
  `id` VARCHAR(36) NOT NULL,
  `berth_id` VARCHAR(36) NOT NULL,
  `vessel_id` VARCHAR(36) NULL,
  `visit_id` VARCHAR(36) NULL,
  `previous_status` VARCHAR(40) NULL,
  `new_status` VARCHAR(40) NOT NULL,
  `reason` TEXT NULL,
  `performed_by` VARCHAR(36) NULL,
  `occurred_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_berth_status_events_berth` (`berth_id`,`occurred_at`),
  CONSTRAINT `fk_berth_events_berth` FOREIGN KEY (`berth_id`) REFERENCES `berths` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_berth_events_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_berth_events_visit` FOREIGN KEY (`visit_id`) REFERENCES `vessel_visits` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 38. Executive/operational alerts. Not GPS/AIS notifications.
CREATE TABLE `notifications` (
  `id` VARCHAR(36) NOT NULL,
  `type` VARCHAR(80) NULL,
  `title` VARCHAR(200) NOT NULL,
  `message` TEXT NOT NULL,
  `severity` ENUM('INFO','WARNING','CRITICAL') NOT NULL DEFAULT 'INFO',
  `category` VARCHAR(60) NOT NULL DEFAULT 'OPERATIONS',
  `vessel_id` VARCHAR(36) NULL,
  `voyage_id` VARCHAR(36) NULL,
  `visit_id` VARCHAR(36) NULL,
  `berth_id` VARCHAR(36) NULL,
  `activity_id` VARCHAR(36) NULL,
  `payment_account_id` VARCHAR(36) NULL,
  `deduplication_key` VARCHAR(191) NULL,
  `acknowledged` TINYINT(1) NOT NULL DEFAULT 0,
  `acknowledged_by` VARCHAR(36) NULL,
  `acknowledged_at` DATETIME NULL,
  `resolved_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notification_deduplication` (`deduplication_key`),
  KEY `idx_notifications_priority` (`acknowledged`,`severity`,`created_at`),
  KEY `idx_notifications_vessel` (`vessel_id`),
  CONSTRAINT `fk_notifications_vessel` FOREIGN KEY (`vessel_id`) REFERENCES `vessels` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_notifications_voyage` FOREIGN KEY (`voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_notifications_visit` FOREIGN KEY (`visit_id`) REFERENCES `vessel_visits` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_notifications_berth` FOREIGN KEY (`berth_id`) REFERENCES `berths` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_notifications_activity` FOREIGN KEY (`activity_id`) REFERENCES `vessel_activities` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_notifications_payment` FOREIGN KEY (`payment_account_id`) REFERENCES `payment_accounts` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 39. Existing generic user audit log (DIFFERENT from vessel_activity_events)
CREATE TABLE `activity_logs` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NULL,
  `user_email` VARCHAR(191) NOT NULL,
  `action` VARCHAR(80) NOT NULL,
  `target_entity` VARCHAR(80) NOT NULL,
  `target_id` VARCHAR(80) NULL,
  `details` TEXT NULL,
  `previous_value` JSON NULL,
  `new_value` JSON NULL,
  `ip_address` VARCHAR(50) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_user` (`user_email`),
  KEY `idx_activity_entity` (`target_entity`,`target_id`),
  KEY `idx_activity_created` (`created_at`),
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 40. Invoice/confirmation attachments: metadata/path ONLY; binaries are stored
-- in private backend-controlled storage; never in public frontend assets.
CREATE TABLE `document_attachments` (
  `id` VARCHAR(36) NOT NULL,
  `entity_type` VARCHAR(80) NOT NULL,
  `entity_id` VARCHAR(36) NOT NULL,
  `original_filename` VARCHAR(255) NOT NULL,
  `storage_key` VARCHAR(500) NOT NULL,
  `mime_type` VARCHAR(120) NULL,
  `file_size_bytes` BIGINT UNSIGNED NULL,
  `uploaded_by` VARCHAR(36) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_attachments_entity` (`entity_type`,`entity_id`),
  CONSTRAINT `fk_attachments_user` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 41. Saved hypothetical scenarios; MUST NOT directly modify actual operations
CREATE TABLE `what_if_scenarios` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `description` TEXT NULL,
  `base_voyage_id` VARCHAR(36) NULL,
  `scenario_inputs` JSON NOT NULL,
  `scenario_results` JSON NULL,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_scenario_voyage` FOREIGN KEY (`base_voyage_id`) REFERENCES `voyages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_scenario_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 42. Optional generated report file metadata (reports themselves query actual data)
CREATE TABLE `report_exports` (
  `id` VARCHAR(36) NOT NULL,
  `report_type` VARCHAR(80) NOT NULL,
  `format` ENUM('CSV','PDF','PRINT') NOT NULL,
  `filter_parameters` JSON NULL,
  `storage_key` VARCHAR(500) NULL,
  `generated_by` VARCHAR(36) NULL,
  `generated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_report_exports_type_time` (`report_type`,`generated_at`),
  CONSTRAINT `fk_report_exports_user` FOREIGN KEY (`generated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 43. Transition-only legacy /operations/state support. Normalized tables
-- above are the SOURCE OF TRUTH; this should not replace their API writes.
CREATE TABLE `operational_state_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `revision` BIGINT UNSIGNED NOT NULL,
  `state_json` JSON NOT NULL,
  `updated_by` VARCHAR(36) NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_state_revision` (`revision`),
  CONSTRAINT `fk_state_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- END OF FRESH-INSTALL SCHEMA. NO DEMO USERS, PASSWORDS OR TRANSACTIONS INSERTED.
-- ============================================================================
