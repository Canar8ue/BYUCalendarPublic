CREATE TABLE `email_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`inbound_id` text NOT NULL,
	`to_address` text NOT NULL,
	`subject` text NOT NULL,
	`body_text` text NOT NULL,
	`sent_by` text NOT NULL,
	`sent_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_replies_inbound_idx` ON `email_replies` (`inbound_id`);--> statement-breakpoint
CREATE TABLE `inbound_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`from_address` text NOT NULL,
	`to_address` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`preview` text DEFAULT '' NOT NULL,
	`body_text` text DEFAULT '' NOT NULL,
	`message_id` text,
	`received_at` text NOT NULL,
	`read_at` text,
	`replied_at` text
);
--> statement-breakpoint
CREATE INDEX `inbound_emails_received_idx` ON `inbound_emails` (`received_at`);