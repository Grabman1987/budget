CREATE TABLE `auth_challenge` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`purpose` text NOT NULL,
	`session_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	CONSTRAINT "auth_challenge_purpose_chk" CHECK("auth_challenge"."purpose" IN ('register_setup', 'register', 'login', 'step_up'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_challenge_challenge_unique` ON `auth_challenge` (`challenge`);--> statement-breakpoint
CREATE TABLE `auth_event` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`kind` text NOT NULL,
	`passkey_id` text,
	`ip_hash` text,
	`detail` text,
	CONSTRAINT "auth_event_kind_chk" CHECK("auth_event"."kind" IN ('setup_started', 'passkey_registered', 'passkey_revoked', 'login_ok', 'login_failed', 'recovery_login_ok', 'recovery_login_failed', 'recovery_codes_created', 'step_up_ok', 'step_up_failed', 'logout', 'rate_limited', 'origin_rejected'))
);
--> statement-breakpoint
CREATE INDEX `auth_event_ts_idx` ON `auth_event` (`ts`);--> statement-breakpoint
CREATE TABLE `auth_session` (
	`id` text PRIMARY KEY NOT NULL,
	`passkey_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`expires_at` text NOT NULL,
	`step_up_at` text,
	`via_recovery` integer DEFAULT false NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`passkey_id`) REFERENCES `passkey`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `auth_session_expires_idx` ON `auth_session` (`expires_at`);--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports_json` text,
	`device_type` text,
	`backed_up` integer DEFAULT false NOT NULL,
	`device_name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_used_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `passkey_credential_id_unique` ON `passkey` (`credential_id`);--> statement-breakpoint
CREATE INDEX `passkey_active_idx` ON `passkey` (`revoked_at`);--> statement-breakpoint
CREATE TABLE `recovery_code` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`used_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_code_code_hash_unique` ON `recovery_code` (`code_hash`);