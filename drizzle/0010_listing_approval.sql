ALTER TABLE `community_listings` ADD COLUMN `approval_status` text NOT NULL DEFAULT 'approved';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `community_listings_approval_idx` ON `community_listings` (`approval_status`, `created_at`);
