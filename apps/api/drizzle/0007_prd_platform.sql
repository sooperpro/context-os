CREATE TABLE `conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`subject_key` text NOT NULL,
	`topic_type` text DEFAULT 'delivery_status' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`member_ids` text NOT NULL,
	`canonical_item_id` text,
	`rationale` text,
	`auto_rule` text,
	`resolved_by` text,
	`resolved_at` integer,
	`bounty_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conflicts_project_subject_uq` ON `conflicts` (`project_id`,`subject_key`);--> statement-breakpoint
CREATE INDEX `conflicts_project_status_idx` ON `conflicts` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `connector_scopes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`project_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`is_excluded` integer DEFAULT false NOT NULL,
	`backfill_from` integer,
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
CREATE UNIQUE INDEX `connector_scopes_uq` ON `connector_scopes` (`connection_id`,`project_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `connector_scopes_project_idx` ON `connector_scopes` (`project_id`);--> statement-breakpoint
CREATE TABLE `identity_links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`external_login` text,
	`email` text,
	`status` text DEFAULT 'suggested' NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`linked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_links_user_provider_uq` ON `identity_links` (`workspace_id`,`user_id`,`provider`);--> statement-breakpoint
CREATE INDEX `identity_links_external_idx` ON `identity_links` (`provider`,`external_id`);--> statement-breakpoint
DROP INDEX `points_action_source_user_uq`;--> statement-breakpoint
ALTER TABLE `points_ledger` ADD `currency` text DEFAULT 'rp' NOT NULL;--> statement-breakpoint
ALTER TABLE `points_ledger` ADD `status` text DEFAULT 'posted' NOT NULL;--> statement-breakpoint
ALTER TABLE `points_ledger` ADD `actor_id` text;--> statement-breakpoint
CREATE INDEX `points_user_created_idx` ON `points_ledger` (`workspace_id`,`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `points_action_source_user_uq` ON `points_ledger` (`workspace_id`,`user_id`,`currency`,`action`,`source_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_workspace_slug_uq` ON `projects` (`workspace_id`,`slug`);--> statement-breakpoint
ALTER TABLE `questions` ADD `feedback` text;--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`id`, `name`, `email`, `preferences`, `created_at`) VALUES ('system', 'ContextOS', NULL, '{}', 0);
