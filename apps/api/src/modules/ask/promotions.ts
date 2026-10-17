import type { PlatformRecord } from "../platform/store.js";
import type { Container } from "../../container.js";
import type { ProjectRow } from "../../db/schema.js";
import { sourceAccess } from "../../db/schema.js";
import type { Actor } from "../../types.js";
import { createNotifier } from "../platform/notify.js";
import { awardReputation } from "../platform/reputation.js";
import { createPlatformStore } from "../platform/store.js";

/**
 * Accept or reject a proposed Hub answer (FR-ASK-009). Accepting publishes it as a FAQ note the
 * asker keeps access to. Callers check who may decide; this applies the decision, notifies the
 * author and writes the audit log. Used by `/promotions/:id/decide` and the manager review queue.
 */
export function decidePromotion(
  container: Container,
  actor: Actor,
  row: PlatformRecord,
  project: ProjectRow,
  input: { accepted: boolean; reason: string; version: number },
) {
  const { db, services, audit } = container;
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);
  const decision = {
    by: actor.id,
    accepted: input.accepted,
    reason: input.reason,
    at: new Date().toISOString(),
  };
  const result = db.transaction(() => {
    const updated = store.update(actor, row, input.version, {
      status: input.accepted ? "accepted" : "rejected",
      data: { ...row.data, decisions: [decision] },
    });
    if (input.accepted) {
      const source = services.sources.create(actor, project, {
        kind: "note",
        title: `FAQ: ${String(row.data.title)}`,
        content: `Question: ${String(row.data.question)}\n\nAnswer: ${String(row.data.answer)}\n\nPromoted from Ask ContextOS; verified by a domain owner.`,
        visibility: "restricted",
      });
      // The asker keeps access to the FAQ note derived from their own answer.
      db.insert(sourceAccess)
        .values({ sourceId: source.id, userId: row.ownerId })
        .onConflictDoNothing()
        .run();
      awardReputation(db, actor, row.ownerId, "ask_promoted", row.id);
      store.event(actor, "answer.promoted", {
        promotionId: row.id,
        sourceId: source.id,
        projectId: project.id,
      });
      store.patch(updated, { data: { ...updated.data, sourceId: source.id } });
    }
    return updated;
  });
  notifier.notify(actor.workspaceId, row.ownerId, {
    type: input.accepted ? "promotion.accepted" : "promotion.rejected",
    category: "maintenance",
    title: input.accepted ? "Your answer was added to the hub" : "Your hub proposal was declined",
    body: input.reason,
    link: `/projects/${project.id}`,
    projectId: project.id,
  });
  audit.record({
    actor,
    projectId: project.id,
    action: "promotion.decide",
    targetType: "promotion",
    targetId: row.id,
    metadata: { accepted: input.accepted },
  });
  return result;
}
