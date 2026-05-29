CREATE TABLE `abandoned_carts` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`contact_id` text,
	`cart_id` text NOT NULL,
	`total_amount_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`abandoned_at` integer NOT NULL,
	`reminder_sent_at` integer,
	`recovered_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `abandoned_carts_tenant_cart_idx` ON `abandoned_carts` (`tenant_id`,`cart_id`);--> statement-breakpoint
CREATE INDEX `abandoned_carts_tenant_idx` ON `abandoned_carts` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`hashed_key` text NOT NULL,
	`role` text DEFAULT 'read_only' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_hash_idx` ON `api_keys` (`hashed_key`);--> statement-breakpoint
CREATE INDEX `api_keys_prefix_idx` ON `api_keys` (`prefix`);--> statement-breakpoint
CREATE INDEX `api_keys_tenant_idx` ON `api_keys` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text,
	`api_key_id` text,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_tenant_time_idx` ON `audit_log` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_resource_idx` ON `audit_log` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `audit_action_idx` ON `audit_log` (`action`);--> statement-breakpoint
CREATE TABLE `contact_labels` (
	`contact_id` text NOT NULL,
	`label_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_labels_pk` ON `contact_labels` (`contact_id`,`label_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`session_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`assignee_user_id` text,
	`last_message_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversations_tenant_status_idx` ON `conversations` (`tenant_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_tenant_contact_idx` ON `conversations` (`tenant_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `conversations_assignee_idx` ON `conversations` (`assignee_user_id`);--> statement-breakpoint
CREATE TABLE `crm_contact_tags` (
	`contact_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `crm_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_contact_tags_pk` ON `crm_contact_tags` (`contact_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `crm_contact_tags_tag_idx` ON `crm_contact_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `crm_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`phone_number` text NOT NULL,
	`name` text,
	`email` text,
	`wa_jid` text,
	`metadata` text,
	`mart_customer_id` text,
	`opted_out_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_contacts_tenant_phone_idx` ON `crm_contacts` (`tenant_id`,`phone_number`);--> statement-breakpoint
CREATE INDEX `crm_contacts_tenant_idx` ON `crm_contacts` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `crm_contacts_mart_customer_idx` ON `crm_contacts` (`tenant_id`,`mart_customer_id`);--> statement-breakpoint
CREATE TABLE `crm_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#1f6feb' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_tags_tenant_name_idx` ON `crm_tags` (`tenant_id`,`name`);--> statement-breakpoint
CREATE TABLE `labels` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#1f6feb' NOT NULL,
	`wa_label_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `labels_tenant_name_idx` ON `labels` (`tenant_id`,`name`);--> statement-breakpoint
CREATE INDEX `labels_tenant_idx` ON `labels` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `mart_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`store_url` text NOT NULL,
	`secret_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`store_metadata` text,
	`last_sync_at` integer,
	`linked_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mart_integrations_tenant_idx` ON `mart_integrations` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `message_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`variables` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_templates_tenant_name_idx` ON `message_templates` (`tenant_id`,`name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`phone_number` text,
	`push_name` text,
	`proxy_url` text,
	`do_instance_id` text,
	`last_connected_at` integer,
	`last_disconnected_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_tenant_name_idx` ON `sessions` (`tenant_id`,`name`);--> statement-breakpoint
CREATE INDEX `sessions_tenant_idx` ON `sessions` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `sessions_status_idx` ON `sessions` (`status`);--> statement-breakpoint
CREATE TABLE `status_views` (
	`status_id` text NOT NULL,
	`viewer_jid` text NOT NULL,
	`viewed_at` integer NOT NULL,
	FOREIGN KEY (`status_id`) REFERENCES `statuses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `status_views_pk` ON `status_views` (`status_id`,`viewer_jid`);--> statement-breakpoint
CREATE TABLE `statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`session_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text,
	`media_key` text,
	`background_color` text,
	`font` text,
	`view_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `statuses_tenant_idx` ON `statuses` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `statuses_session_idx` ON `statuses` (`session_id`);--> statement-breakpoint
CREATE TABLE `tenant_members` (
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`invited_by_user_id` text,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_members_pk` ON `tenant_members` (`tenant_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `tenant_members_user_idx` ON `tenant_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `tenant_plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`config` text,
	`installed_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_plugins_tenant_plugin_idx` ON `tenant_plugins` (`tenant_id`,`plugin_id`);--> statement-breakpoint
CREATE TABLE `tenant_settings` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`notify_on_incoming_message` integer DEFAULT true NOT NULL,
	`notify_on_session_disconnect` integer DEFAULT true NOT NULL,
	`notify_email` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`d1_database_id` text,
	`stripe_customer_id` text,
	`settings` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_slug_idx` ON `tenants` (`slug`);--> statement-breakpoint
CREATE INDEX `tenants_status_idx` ON `tenants` (`status`);--> statement-breakpoint
CREATE TABLE `usage_counters` (
	`tenant_id` text NOT NULL,
	`period` text NOT NULL,
	`metric` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_counters_pk` ON `usage_counters` (`tenant_id`,`period`,`metric`);--> statement-breakpoint
CREATE INDEX `usage_counters_period_idx` ON `usage_counters` (`period`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`password_hash` text,
	`email_verified_at` integer,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`session_id` text,
	`url` text NOT NULL,
	`events` text NOT NULL,
	`secret` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`description` text,
	`last_delivery_at` integer,
	`last_delivery_status` integer,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `webhooks_tenant_idx` ON `webhooks` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `webhooks_session_idx` ON `webhooks` (`session_id`);