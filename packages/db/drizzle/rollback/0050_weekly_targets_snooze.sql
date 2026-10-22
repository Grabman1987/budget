-- Rollback removes only new weekly/snooze intent; legacy target/assignment rows remain.
DROP TABLE `category_target_snooze`;
ALTER TABLE `category_target` DROP COLUMN `weekly_day`;
