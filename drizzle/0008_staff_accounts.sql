-- BYU professor/staff verification requests. A request starts pending, or is
-- verified immediately when the address is on the auto-allow directory, and
-- administrators approve, deny, or revoke from /moderation.
CREATE TABLE `staff_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`area` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`auto_verified` integer DEFAULT 0 NOT NULL,
	`requested_at` text NOT NULL,
	`resolved_at` text,
	`resolved_by` text
);
--> statement-breakpoint
CREATE INDEX `staff_accounts_status_idx` ON `staff_accounts` (`status`);
