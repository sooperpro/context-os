import { randomUUID } from "node:crypto";
import type { Db } from "../../db/index.js";
import { workspaces, type WorkspaceRow } from "../../db/schema.js";

/** V0 runs a single workspace; this creates it on first boot. */
export function ensureDefaultWorkspace(db: Db, name: string): WorkspaceRow {
  const existing = db.select().from(workspaces).limit(1).get();
  if (existing) return existing;
  return db.insert(workspaces).values({ id: randomUUID(), name }).returning().get();
}
