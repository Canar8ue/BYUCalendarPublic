-- Public RSVP records: one row per member per saved event, written whenever
-- saved preferences change, plus each member's public profile (an optional
-- avatar data URL and the hide-from-RSVV-lists switch). Hidden members never
-- appear in RSVP lists at all.
CREATE TABLE `event_saves` (
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`saved_at` text NOT NULL,
	PRIMARY KEY (`user_id`, `event_id`)
);
--> statement-breakpoint
CREATE INDEX `event_saves_event_idx` ON `event_saves` (`event_id`);
--> statement-breakpoint
CREATE TABLE `public_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`avatar` text,
	`hidden` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
