import { randomUUID } from "node:crypto";
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

/** Append-only audit trail of consequential actions. Never throws into request flow. */
export function createAuditService(db: Db, logger: Logger) {
  return {
    record(entry: AuditEntry): void {
      try {
        db.insert(auditLog)
          .values({
            id: randomUUID(),
            workspaceId: entry.actor.workspaceId,
            projectId: entry.projectId ?? null,
            actorId: entry.actor.id,
            actorName: entry.actor.name,
            action: entry.action,
            targetType: entry.targetType,
            targetId: entry.targetId,
            metadata: entry.metadata ?? null,
          })
          .run();
      } catch (error) {
        logger.error({ err: error, action: entry.action }, "Failed to write audit log");
      }
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;
