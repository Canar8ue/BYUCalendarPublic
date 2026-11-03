CREATE TABLE `analytics_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` text NOT NULL,
	`day` text NOT NULL,
	`type` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`detail` text,
	`country` text,
	`device` text,
	`referrer` text
);
--> statement-breakpoint
CREATE INDEX `analytics_day_idx` ON `analytics_events` (`day`,`type`);--> statement-breakpoint
CREATE INDEX `analytics_lookup_idx` ON `analytics_events` (`type`,`name`,`day`);