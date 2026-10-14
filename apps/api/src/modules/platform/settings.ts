import { WorkspaceSettingsStateSchema, type WorkspaceSettingsState } from "@contextos/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { workspaces } from "../../db/schema.js";

/** Resolve the stored settings JSON into a fully defaulted settings object. */
export function resolveSettings(raw: Record<string, unknown>): WorkspaceSettingsState {
  const parsed = WorkspaceSettingsStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : WorkspaceSettingsStateSchema.parse({});
}

export function workspaceSettings(db: Db, workspaceId: string): WorkspaceSettingsState {
  const row = db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .get();
  return resolveSettings(row?.settings ?? {});
}

/** Deep-merge a settings patch section by section (top-level sections are objects). */
export function mergeSettings(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const existing = next[key];
    next[key] =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>), ...(value as Record<string, unknown>) }
        : value;
  }
  return next;
}
