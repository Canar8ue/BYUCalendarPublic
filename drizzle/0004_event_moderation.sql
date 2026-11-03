ALTER TABLE `listing_moderation` ADD `snapshot` text;--> statement-breakpoint
CREATE TABLE `event_overrides` (
	`event_id` text PRIMARY KEY NOT NULL,
	`patch` text NOT NULL,
	`reviewed_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`reviewed_by`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE no action
);
