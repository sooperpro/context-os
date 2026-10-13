CREATE UNIQUE INDEX item_progress_parent_item_uq ON platform_records (workspace_id, parent_id, json_extract(data, '$.itemId')) WHERE kind = 'item_progress';
--> statement-breakpoint
CREATE UNIQUE INDEX onboarding_active_user_uq ON platform_records (workspace_id, owner_id) WHERE kind = 'onboarding_plan' AND status IN ('active', 'scheduled');
--> statement-breakpoint
UPDATE source_objects SET visibility = 'restricted' WHERE visibility = 'workspace' AND NOT EXISTS (SELECT 1 FROM source_access WHERE source_access.source_id = source_objects.id);
