-- P1f-2 (B1, B2): auth_event gains a counter for merged rejections and the kind sessions_revoked.
-- SQLite cannot change a CHECK in place, so the log table is rebuilt; existing rows are kept and
-- their detail is cut to 100 characters. The previous release can still write to the new table.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_auth_event` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`kind` text NOT NULL,
	`passkey_id` text,
	`ip_hash` text,
	`detail` text,
	`count` integer DEFAULT 1 NOT NULL,
	`last_ts` text,
	CONSTRAINT "auth_event_kind_chk" CHECK("__new_auth_event"."kind" IN ('setup_started', 'passkey_registered', 'passkey_revoked', 'login_ok', 'login_failed', 'recovery_login_ok', 'recovery_login_failed', 'recovery_codes_created', 'step_up_ok', 'step_up_failed', 'logout', 'sessions_revoked', 'rate_limited', 'origin_rejected'))
);
--> statement-breakpoint
INSERT INTO `__new_auth_event`("id", "ts", "kind", "passkey_id", "ip_hash", "detail") SELECT "id", "ts", "kind", "passkey_id", "ip_hash", substr("detail", 1, 100) FROM `auth_event`;--> statement-breakpoint
DROP TABLE `auth_event`;--> statement-breakpoint
ALTER TABLE `__new_auth_event` RENAME TO `auth_event`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `auth_event_ts_idx` ON `auth_event` (`ts`);