CREATE TABLE `app_setting` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "app_setting_id_chk" CHECK(length("app_setting"."id") BETWEEN 1 AND 64)
);
