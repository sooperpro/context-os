import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { auditLog } from "../../db/schema.js";
import type { Logger } from "../../lib/logger.js";
import type { Actor } from "../../types.js";

export interface AuditEntry {
  actor: Actor;
  projectId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

/** Audit actions that record People Ops work: onboarding, probation and check-ins. */
const PEOPLE_OPS_ACTION = /^(onboarding|probation|checkin)\./;
/**
 * Details of People Ops events only People Ops may read: a check-in's pulse, the probation
 * recommendation and the employment decision (role access spec §3). Everyone else with audit
 * access still sees that the event happened.
 */
const PEOPLE_DATA_KEYS = new Set([
  "pulse",
  "recommendation",
  "outcome",
  "extensionDays",
  "effectiveOn",
]);

/**
 * An audit row as the viewer may read it. The entry hash covers the full metadata, so a redacted
 * row no longer verifies against it.
 */
export function auditRowFor<T extends { action: string; metadata: Record<string, unknown> | null }>(
  viewer: Pick<Actor, "role">,
  row: T,
): T {
  if (viewer.role === "hr" || !row.metadata || !PEOPLE_OPS_ACTION.test(row.action)) return row;
  return {
    ...row,
    metadata: Object.fromEntries(
      Object.entries(row.metadata).filter(([key]) => !PEOPLE_DATA_KEYS.has(key)),
    ),
  };
}

/** Append-only audit trail. Failed writes throw so enclosing transactions can roll back. */
export function createAuditService(db: Db, logger: Logger) {
  return {
    record(entry: AuditEntry): void {
      try {
        const previous = db.get<{ entryHash: string | null }>(
          sql`SELECT entry_hash AS entryHash FROM audit_log WHERE workspace_id = ${entry.actor.workspaceId} ORDER BY rowid DESC LIMIT 1`,
        );
        const id = randomUUID();
        const createdAt = new Date();
        const previousHash = previous?.entryHash ?? null;
        const entryHash = createHash("sha256")
          .update(
            JSON.stringify({
              previousHash,
              id,
              workspaceId: entry.actor.workspaceId,
              actorId: entry.actor.id,
              action: entry.action,
              targetType: entry.targetType,
              targetId: entry.targetId,
              metadata: entry.metadata ?? null,
              createdAt: createdAt.toISOString(),
            }),
          )
          .digest("hex");
        db.insert(auditLog)
          .values({
            id,
            workspaceId: entry.actor.workspaceId,
            projectId: entry.projectId ?? null,
            actorId: entry.actor.id,
            actorName: entry.actor.name,
            action: entry.action,
            targetType: entry.targetType,
            targetId: entry.targetId,
            metadata: entry.metadata ?? null,
            previousHash,
            entryHash,
            createdAt,
          })
          .run();
      } catch (error) {
        logger.error({ err: error, action: entry.action }, "Failed to write audit log");
        throw error;
      }
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;
