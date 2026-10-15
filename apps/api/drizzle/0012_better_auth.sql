CREATE TABLE `auth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_accounts_user_idx` ON `auth_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`active_workspace_id` text,
	`auth_method` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_unique` ON `auth_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_users_email_unique` ON `auth_users` (`email`);--> statement-breakpoint
CREATE TABLE `auth_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_verifications_identifier_idx` ON `auth_verifications` (`identifier`);--> statement-breakpoint
CREATE TABLE `sso_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`issuer` text NOT NULL,
	`domain` text NOT NULL,
	`oidc_config` text,
	`saml_config` text,
	`user_id` text,
	`organization_id` text,
	`domain_verified` integer DEFAULT false NOT NULL,
	`verification_token` text,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sso_providers_provider_id_unique` ON `sso_providers` (`provider_id`);--> statement-breakpoint
CREATE INDEX `sso_providers_organization_idx` ON `sso_providers` (`organization_id`);--> statement-breakpoint
ALTER TABLE `workspaces` ADD `sso_enforced` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- People who signed in before keep their id (and every membership, assignment and record tied to it):
-- their verified email becomes their sign-in identity, matched by magic link, Google, Microsoft or SSO.
INSERT OR IGNORE INTO `auth_users` (`id`, `name`, `email`, `email_verified`, `created_at`, `updated_at`)
SELECT `id`, `name`, lower(`email`), 1, `created_at`, `created_at` FROM `users` WHERE `email` IS NOT NULL AND `email` <> '';
