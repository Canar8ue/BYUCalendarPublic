CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`last_success` text NOT NULL,
	`last_attempt` text,
	`error` text,
	`lock_until` integer DEFAULT 0 NOT NULL
);
