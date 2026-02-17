CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`revoked` integer DEFAULT false NOT NULL,
	`revoked_at` integer,
	`last_used_at` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_org_id_idx` ON `api_keys` (`org_id`);