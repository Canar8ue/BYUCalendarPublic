-- "Picked for you" personalization: chat-built interest profiles and
-- decaying activity taste counters (categories/tags only, never event ids).
CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `profile_activity` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade,
	PRIMARY KEY (`user_id`, `kind`, `value`)
);
