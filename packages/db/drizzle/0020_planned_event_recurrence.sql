ALTER TABLE `planned_event` ADD `recurrence` text DEFAULT 'once' NOT NULL;--> statement-breakpoint
ALTER TABLE `planned_event` ADD `recurrence_months` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `planned_event` ADD `recurrence_until` text;--> statement-breakpoint
-- Preserve undo of pre-migration event actions: their snapshots need the same additive defaults.
UPDATE `audit_log` SET
  `before_json` = CASE WHEN `before_json` IS NULL THEN NULL ELSE json_set(`before_json`, '$.recurrence', 'once', '$.recurrence_months', json('[]'), '$.recurrence_until', NULL) END,
  `after_json` = CASE WHEN `after_json` IS NULL THEN NULL ELSE json_set(`after_json`, '$.recurrence', 'once', '$.recurrence_months', json('[]'), '$.recurrence_until', NULL) END
WHERE `entity_type` = 'planned_event';
