CREATE TABLE `email_digests` (
	`user_id` text PRIMARY KEY NOT NULL,
	`opted_out` integer DEFAULT false NOT NULL,
	`last_day` text DEFAULT '' NOT NULL,
	`last_sent_at` text,
	`last_count` integer,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
