-- Every selected folder moves to the two-day background schedule (15m/hourly/daily are retired).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_connector_scopes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`project_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`is_excluded` integer DEFAULT false NOT NULL,
	`backfill_from` integer,
	`visibility` text DEFAULT 'restricted' NOT NULL,
	`sync_frequency` text DEFAULT '2d' NOT NULL,
	`cursor` text,
	`status` text DEFAULT 'selected' NOT NULL,
	`last_sync_requested_at` integer,
	`last_synced_at` integer,
	`item_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `connector_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_connector_scopes`("id", "workspace_id", "connection_id", "project_id", "scope_type", "external_id", "name", "is_excluded", "backfill_from", "visibility", "sync_frequency", "cursor", "status", "last_sync_requested_at", "last_synced_at", "item_count", "last_error", "created_at") SELECT "id", "workspace_id", "connection_id", "project_id", "scope_type", "external_id", "name", "is_excluded", "backfill_from", "visibility", '2d', "cursor", "status", "last_sync_requested_at", "last_synced_at", "item_count", "last_error", "created_at" FROM `connector_scopes`;--> statement-breakpoint
DROP TABLE `connector_scopes`;--> statement-breakpoint
ALTER TABLE `__new_connector_scopes` RENAME TO `connector_scopes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `connector_scopes_uq` ON `connector_scopes` (`connection_id`,`project_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `connector_scopes_project_idx` ON `connector_scopes` (`project_id`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `priority` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `concurrency_key` text;--> statement-breakpoint
CREATE INDEX `jobs_claim_idx` ON `jobs` (`status`,`priority`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_key_idx` ON `jobs` (`concurrency_key`,`status`);