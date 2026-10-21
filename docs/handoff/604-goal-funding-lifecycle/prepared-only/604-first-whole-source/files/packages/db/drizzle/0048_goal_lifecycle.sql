-- Add user intent only. Existing goals retain their original creation/start fallback.
ALTER TABLE savings_goal ADD COLUMN start_month TEXT CONSTRAINT savings_goal_start_month_chk CHECK (start_month GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]');
--> statement-breakpoint
ALTER TABLE savings_goal ADD COLUMN manual_completed_on TEXT CONSTRAINT savings_goal_manual_completed_on_chk CHECK (manual_completed_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]');
