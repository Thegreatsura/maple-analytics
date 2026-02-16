CREATE TABLE `scrape_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`scrape_interval_seconds` integer DEFAULT 15 NOT NULL,
	`labels_json` text,
	`auth_type` text DEFAULT 'none' NOT NULL,
	`auth_credentials_ciphertext` text,
	`auth_credentials_iv` text,
	`auth_credentials_tag` text,
	`enabled` integer DEFAULT 1 NOT NULL,
	`last_scrape_at` integer,
	`last_scrape_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scrape_targets_org_idx` ON `scrape_targets` (`org_id`);--> statement-breakpoint
CREATE INDEX `scrape_targets_org_enabled_idx` ON `scrape_targets` (`org_id`,`enabled`);