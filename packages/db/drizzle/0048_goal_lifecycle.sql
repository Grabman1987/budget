-- Add user intent only. Existing goals retain their original creation/start fallback.
ALTER TABLE savings_goal ADD COLUMN start_month TEXT CONSTRAINT savings_goal_start_month_chk CHECK (start_month GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]');
--> statement-breakpoint
ALTER TABLE savings_goal ADD COLUMN manual_completed_on TEXT CONSTRAINT savings_goal_manual_completed_on_chk CHECK (manual_completed_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]');
--> statement-breakpoint
ALTER TABLE savings_goal ADD COLUMN lifecycle_anchor_json TEXT CONSTRAINT savings_goal_lifecycle_anchor_chk CHECK (lifecycle_anchor_json IS NULL OR (json_valid(lifecycle_anchor_json) AND length(lifecycle_anchor_json)<=2048));
