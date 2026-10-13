import type { ContextItemKind } from "@contextos/shared";
import { and, asc, count, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  contextItems,
  evidence,
  extractionRuns,
  sourceObjects,
  type ContextItemRow,
  type EvidenceRow,
  type ExtractionRunRow,
  type NewContextItemRow,
  type NewEvidenceRow,
  type SourceObjectRow,
} from "../../db/schema.js";

export interface EvidenceWithSource {
  evidence: EvidenceRow;
  source: Pick<SourceObjectRow, "id" | "title" | "kind" | "url" | "sourceCreatedAt" | "status">;
}

export function createContextRepository(db: Db) {
  const sourceColumns = {
    id: sourceObjects.id,
    title: sourceObjects.title,
    kind: sourceObjects.kind,
    url: sourceObjects.url,
    sourceCreatedAt: sourceObjects.sourceCreatedAt,
    status: sourceObjects.status,
  };

  return {
    listReadySourceIds(projectId: string): string[] {
      return db
        .select({ id: sourceObjects.id })
        .from(sourceObjects)
        .where(and(eq(sourceObjects.projectId, projectId), eq(sourceObjects.status, "ready")))
        .all()
        .map((row) => row.id);
    },
    /** Evidence deletion must not erase the provenance of already-merged prose. */
    preserveGenerationSources(sourceId: string): void {
      const affected = db
        .selectDistinct({ id: evidence.contextItemId })
        .from(evidence)
        .where(eq(evidence.sourceObjectId, sourceId))
        .all()
        .map((row) => row.id);
      if (!affected.length) return;
      for (const row of db
        .select()
        .from(contextItems)
        .where(inArray(contextItems.id, affected))
        .all()) {
        const supporting = db
          .select({ id: evidence.sourceObjectId })
          .from(evidence)
          .where(eq(evidence.contextItemId, row.id))
          .all()
          .map((ref) => ref.id);
        const previous = Array.isArray(row.data._generationSources)
          ? row.data._generationSources.filter((id): id is string => typeof id === "string")
          : [];
        db.update(contextItems)
          .set({
            data: { ...row.data, _generationSources: [...new Set([...previous, ...supporting])] },
          })
          .where(eq(contextItems.id, row.id))
          .run();
      }
    },
    // ----- extraction runs -----
    startRun(row: typeof extractionRuns.$inferInsert): ExtractionRunRow {
      return db.insert(extractionRuns).values(row).returning().get();
    },

    finishRun(
      id: string,
      patch: Pick<ExtractionRunRow, "status"> & Partial<Pick<ExtractionRunRow, "error" | "stats">>,
    ): void {
      db.update(extractionRuns)
        .set({ ...patch, finishedAt: new Date() })
        .where(eq(extractionRuns.id, id))
        .run();
    },

    // ----- items -----
    listItems(projectId: string, kind?: ContextItemKind): ContextItemRow[] {
      return db
        .select()
        .from(contextItems)
        .where(
          kind
            ? and(eq(contextItems.projectId, projectId), eq(contextItems.kind, kind))
            : eq(contextItems.projectId, projectId),
        )
        .orderBy(desc(contextItems.eventAt), desc(contextItems.asOf), asc(contextItems.createdAt))
        .all();
    },

    findItem(id: string, projectId: string): ContextItemRow | undefined {
      return db
        .select()
        .from(contextItems)
        .where(and(eq(contextItems.id, id), eq(contextItems.projectId, projectId)))
        .get();
    },

    findByKey(projectId: string, normalizedKey: string): ContextItemRow[] {
      return db
        .select()
        .from(contextItems)
        .where(
          and(eq(contextItems.projectId, projectId), eq(contextItems.normalizedKey, normalizedKey)),
        )
        .all();
    },

    insertItem(row: NewContextItemRow): ContextItemRow {
      return db.insert(contextItems).values(row).returning().get();
    },

    updateItem(
      id: string,
      patch: Partial<Pick<ContextItemRow, "summary" | "data" | "verification" | "confidence">>,
    ): ContextItemRow | undefined {
      return db
        .update(contextItems)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(contextItems.id, id))
        .returning()
        .get();
    },

    countsByKind(projectId: string): Map<ContextItemKind, number> {
      const rows = db
        .select({ kind: contextItems.kind, total: count() })
        .from(contextItems)
        .where(eq(contextItems.projectId, projectId))
        .groupBy(contextItems.kind)
        .all();
      return new Map(rows.map((r) => [r.kind, r.total]));
    },

    /** Items that have evidence in any of the given sources (used to expand retrieval). */
    listItemsLinkedToSources(
      projectId: string,
      sourceIds: string[],
      limit: number,
    ): ContextItemRow[] {
      if (sourceIds.length === 0) return [];
      const linked = db
        .selectDistinct({ id: evidence.contextItemId })
        .from(evidence)
        .where(inArray(evidence.sourceObjectId, sourceIds))
        .all()
        .map((r) => r.id);
      if (linked.length === 0) return [];
      return db
        .select()
        .from(contextItems)
        .where(and(eq(contextItems.projectId, projectId), inArray(contextItems.id, linked)))
        .orderBy(desc(contextItems.confidence))
        .limit(limit)
        .all();
    },

    /** Delete items that no longer have any evidence (after a source was removed). */
    deleteOrphanedItems(projectId: string): number {
      const withEvidence = db
        .selectDistinct({ id: evidence.contextItemId })
        .from(evidence)
        .innerJoin(contextItems, eq(contextItems.id, evidence.contextItemId))
        .where(eq(contextItems.projectId, projectId))
        .all()
        .map((r) => r.id);
      const deleted = db
        .delete(contextItems)
        .where(
          withEvidence.length > 0
            ? and(eq(contextItems.projectId, projectId), notInArray(contextItems.id, withEvidence))
            : eq(contextItems.projectId, projectId),
        )
        .returning({ id: contextItems.id })
        .all();
      return deleted.length;
    },

    // ----- evidence -----
    insertEvidence(row: NewEvidenceRow): EvidenceRow {
      return db.insert(evidence).values(row).returning().get();
    },

    deleteEvidenceForSource(sourceObjectId: string): void {
      db.delete(evidence).where(eq(evidence.sourceObjectId, sourceObjectId)).run();
    },

    listEvidenceForItems(itemIds: string[]): Map<string, EvidenceWithSource[]> {
      const result = new Map<string, EvidenceWithSource[]>();
      if (itemIds.length === 0) return result;
      const rows = db
        .select({ evidence, source: sourceColumns })
        .from(evidence)
        .innerJoin(sourceObjects, eq(sourceObjects.id, evidence.sourceObjectId))
        .where(inArray(evidence.contextItemId, itemIds))
        .orderBy(asc(evidence.createdAt))
        .all();
      for (const row of rows) {
        const list = result.get(row.evidence.contextItemId) ?? [];
        list.push(row);
        result.set(row.evidence.contextItemId, list);
      }
      return result;
    },

    hasAnyItems(projectId: string): boolean {
      return (
        (db
          .select({ one: sql<number>`1` })
          .from(contextItems)
          .where(eq(contextItems.projectId, projectId))
          .limit(1)
          .get() ?? null) !== null
      );
    },
  };
}

export type ContextRepository = ReturnType<typeof createContextRepository>;
