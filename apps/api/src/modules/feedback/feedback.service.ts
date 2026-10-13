import { randomUUID } from "node:crypto";
import type { CreateFeedbackInput, Feedback } from "@contextos/shared";
import type { FeedbackRow, ProjectRow } from "../../db/schema.js";
import type { Actor } from "../../types.js";
import type { AuditService } from "../audit/audit.service.js";
import type { FeedbackRepository } from "./feedback.repository.js";

export interface FeedbackServiceDeps {
  repo: FeedbackRepository;
  audit: AuditService;
}

const toFeedback = (row: FeedbackRow): Feedback => ({
  id: row.id,
  projectId: row.projectId,
  targetType: row.targetType,
  targetId: row.targetId,
  kind: row.kind,
  note: row.note,
  actorName: row.actorName,
  createdAt: row.createdAt.toISOString(),
});

export function createFeedbackService({ repo, audit }: FeedbackServiceDeps) {
  return {
    create(actor: Actor, project: ProjectRow, input: CreateFeedbackInput): Feedback {
      const row = repo.insert({
        id: randomUUID(),
        projectId: project.id,
        targetType: input.targetType,
        targetId: input.targetId,
        kind: input.kind,
        note: input.note?.length ? input.note : null,
        actorId: actor.id,
        actorName: actor.name,
      });
      audit.record({
        actor,
        projectId: project.id,
        action: "feedback.create",
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: { kind: input.kind },
      });
      return toFeedback(row);
    },
    list(project: ProjectRow): Feedback[] {
      return repo.list(project.id).map(toFeedback);
    },
  };
}

export type FeedbackService = ReturnType<typeof createFeedbackService>;
