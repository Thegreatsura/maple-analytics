ALTER TABLE `alert_incidents` ADD `group_key` text;--> statement-breakpoint
UPDATE `alert_incidents` SET `group_key` = COALESCE(`service_name`, '__total__') WHERE `group_key` IS NULL;--> statement-breakpoint
UPDATE `alert_rules` SET `group_by` = '["service.name"]' WHERE `group_by` = 'service';
