import { createHash, randomUUID } from "node:crypto";
import type { CreateSourceInput, SourceObject, SourceObjectDetail } from "@contextos/shared";
import type { ProjectRow, SourceObjectRow } from "../../db/schema.js";
import { NotFoundError } from "../../lib/errors.js";
import type { Actor } from "../../types.js";
import type { AuditService } from "../audit/audit.service.js";
import type { ContextService } from "../context/context.service.js";
import type { JobQueue } from "../jobs/jobs.queue.js";
import type { SourceRepository } from "./sources.repository.js";
import { sourceAccess } from "../../db/schema.js";
import type { Db } from "../../db/index.js";

export interface SourceServiceDeps {
  repo: SourceRepository;
  context: ContextService;
  queue: JobQueue;
  audit: AuditService;
  db: Db;
}

const iso = (date: Date | null) => (date ? date.toISOString() : null);

export function toSourceObject(row: SourceObjectRow, chunkCount: number): SourceObject {
  return {
    id: row.id,
    projectId: row.projectId,
    connector: row.connector,
    kind: row.kind,
    externalId: row.externalId,
    title: row.title,
    url: row.url,
    author: row.author,
    sourceCreatedAt: iso(row.sourceCreatedAt),
    sourceUpdatedAt: iso(row.sourceUpdatedAt),
    ingestedAt: row.ingestedAt.toISOString(),
    processedAt: iso(row.processedAt),
    status: row.status,
    error: row.error,
    contentLength: row.content.length,
    chunkCount,
  };
}

export function createSourceService({ repo, context, queue, audit, db }: SourceServiceDeps) {
  const enqueueProcessing = (source: SourceObjectRow) =>
    queue.enqueue({
      projectId: source.projectId,
      type: "process_source",
      payload: { sourceObjectId: source.id },
      subject: source.title,
    });

  return {
    list(project: ProjectRow): SourceObject[] {
      const counts = repo.chunkCounts(project.id);
      return repo.list(project.id).map((row) => toSourceObject(row, counts.get(row.id) ?? 0));
    },

    get(project: ProjectRow, sourceId: string): SourceObjectDetail {
      const row = repo.findById(sourceId, project.id);
      if (!row) throw new NotFoundError("Source", sourceId);
      const chunkCount = repo.listChunksForSource(row.id).length;
      return { ...toSourceObject(row, chunkCount), content: row.content };
    },

    create(actor: Actor, project: ProjectRow, input: CreateSourceInput): SourceObject {
      return db.transaction(() => {
        const row = repo.insert({
          id: randomUUID(),
          projectId: project.id,
          connector: "manual",
          kind: input.kind,
          externalId: null,
          title: input.title,
          url: input.url ?? null,
          author: input.author?.length ? input.author : null,
          content: input.content,
          contentHash: createHash("sha256").update(input.content).digest("hex"),
          sourceCreatedAt: input.sourceCreatedAt ? new Date(input.sourceCreatedAt) : null,
          sourceUpdatedAt: input.sourceUpdatedAt ? new Date(input.sourceUpdatedAt) : null,
          status: "pending",
          visibility: input.visibility ?? "restricted",
        });
        db.insert(sourceAccess).values({ sourceId: row.id, userId: actor.id }).run();
        enqueueProcessing(row);
        audit.record({
          actor,
          projectId: project.id,
          action: "source.create",
          targetType: "source",
          targetId: row.id,
          metadata: { kind: row.kind, title: row.title, contentLength: row.content.length },
        });
        return toSourceObject(row, 0);
      });
    },

    reprocess(actor: Actor, project: ProjectRow, sourceId: string): SourceObject {
      return db.transaction(() => {
        const row = repo.findById(sourceId, project.id);
        if (!row) throw new NotFoundError("Source", sourceId);
        repo.setStatus(row.id, { status: "pending", error: null });
        const job = enqueueProcessing(row);
        audit.record({
          actor,
          projectId: project.id,
          action: "source.reprocess",
          targetType: "source",
          targetId: row.id,
          metadata: { jobId: job.id },
        });
        return toSourceObject({ ...row, status: "pending", error: null }, 0);
      });
    },

    remove(actor: Actor, project: ProjectRow, sourceId: string): void {
      db.transaction(() => {
        const row = repo.findById(sourceId, project.id);
        if (!row) throw new NotFoundError("Source", sourceId);
        // Preserve full prose dependencies before evidence disappears by cascade.
        const invalidatedOrphans = context.removeDerivedFromSource(project.id, row.id);
        // Evidence and chunks cascade; items left without evidence are removed explicitly.
        repo.delete(row.id);
        const orphaned = invalidatedOrphans + context.removeOrphanedItems(project.id);
        queue.enqueue({
          projectId: project.id,
          type: "refresh_hub",
          payload: {},
          subject: project.name,
          dedupe: true,
        });
        audit.record({
          actor,
          projectId: project.id,
          action: "source.delete",
          targetType: "source",
          targetId: row.id,
          metadata: { title: row.title, orphanedItemsRemoved: orphaned },
        });
      });
    },
  };
}

export type SourceService = ReturnType<typeof createSourceService>;
