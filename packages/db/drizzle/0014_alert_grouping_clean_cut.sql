UPDATE `alert_rules`
SET `service_names_json` = json_array(`service_name`)
WHERE `service_name` IS NOT NULL
  AND (`service_names_json` IS NULL OR `service_names_json` = '');
--> statement-breakpoint
UPDATE `alert_rules`
SET `group_by` = '["service.name"]'
WHERE `group_by` = 'service';
--> statement-breakpoint
UPDATE `alert_incidents`
SET `group_key` = COALESCE(`group_key`, `service_name`, '__total__')
WHERE `group_key` IS NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS `alert_rules_org_service_idx`;
--> statement-breakpoint
ALTER TABLE `alert_rules` DROP COLUMN `service_name`;
--> statement-breakpoint
ALTER TABLE `alert_incidents` DROP COLUMN `service_name`;
