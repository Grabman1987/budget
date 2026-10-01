CREATE TABLE `investment_preference` (
	`id` text PRIMARY KEY NOT NULL,
	`cost_method` text DEFAULT 'average' NOT NULL,
	CONSTRAINT "investment_preference_id_chk" CHECK("investment_preference"."id" = 'portfolio'),
	CONSTRAINT "investment_cost_method_chk" CHECK("investment_preference"."cost_method" IN ('average', 'fifo'))
);
