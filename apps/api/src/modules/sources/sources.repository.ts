import { and, asc, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  sourceChunks,
  sourceObjects,
  type NewSourceObjectRow,
  type SourceChunkRow,
  type SourceObjectRow,
} from "../../db/schema.js";

export interface FtsHit {
  chunkId: string;
  score: number;
}

export interface ChunkWithSource {
  chunk: SourceChunkRow;
  source: SourceObjectRow;
}

export function createSourceRepository(db: Db) {
  return {
    list(projectId: string): SourceObjectRow[] {
      return db
        .select()
        .from(sourceObjects)
        .where(eq(sourceObjects.projectId, projectId))
        .orderBy(desc(sourceObjects.ingestedAt))
        .all();
    },

    findById(id: string, projectId?: string): SourceObjectRow | undefined {
      return db
        .select()
        .from(sourceObjects)
        .where(
          projectId
            ? and(eq(sourceObjects.id, id), eq(sourceObjects.projectId, projectId))
            : eq(sourceObjects.id, id),
        )
        .get();
    },

    insert(row: NewSourceObjectRow): SourceObjectRow {
      return db.insert(sourceObjects).values(row).returning().get();
    },

    setStatus(
      id: string,
      patch: Pick<SourceObjectRow, "status"> &
        Partial<Pick<SourceObjectRow, "error" | "processedAt">>,
    ): void {
      db.update(sourceObjects).set(patch).where(eq(sourceObjects.id, id)).run();
    },

    delete(id: string): boolean {
      return (
        db
          .delete(sourceObjects)
          .where(eq(sourceObjects.id, id))
          .returning({ id: sourceObjects.id })
          .all().length > 0
      );
    },

    /** chunk counts per source for a project */
    chunkCounts(projectId: string): Map<string, number> {
      const rows = db
        .select({ sourceObjectId: sourceChunks.sourceObjectId, total: count() })
        .from(sourceChunks)
        .where(eq(sourceChunks.projectId, projectId))
        .groupBy(sourceChunks.sourceObjectId)
        .all();
      return new Map(rows.map((r) => [r.sourceObjectId, r.total]));
    },

    deleteChunks(sourceObjectId: string): void {
      db.delete(sourceChunks).where(eq(sourceChunks.sourceObjectId, sourceObjectId)).run();
    },

    /** Inserted in batches: a very long document has thousands of chunks. */
    insertChunks(rows: Array<typeof sourceChunks.$inferInsert>): SourceChunkRow[] {
      if (rows.length === 0) return [];
      return db.transaction(() => {
        const inserted: SourceChunkRow[] = [];
        for (let start = 0; start < rows.length; start += 500)
          inserted.push(
            ...db
              .insert(sourceChunks)
              .values(rows.slice(start, start + 500))
              .returning()
              .all(),
          );
        return inserted;
      });
    },

    setChunkEmbedding(chunkId: string, embedding: Buffer): void {
      db.update(sourceChunks).set({ embedding }).where(eq(sourceChunks.id, chunkId)).run();
    },

    listChunksForSource(sourceObjectId: string): SourceChunkRow[] {
      return db
        .select()
        .from(sourceChunks)
        .where(eq(sourceChunks.sourceObjectId, sourceObjectId))
        .orderBy(asc(sourceChunks.ordinal))
        .all();
    },

    /**
     * Changes whenever the set of searchable vectors in a project changes (a source becomes ready,
     * is re-processed or removed), so an in-memory index knows when to reload.
     */
    embeddingSignature(projectId: string): string {
      const row = db
        .select({
          total: count(),
          top: sql<number | null>`max(${sourceChunks}.rowid)`,
          sum: sql<number | null>`total(${sourceChunks}.rowid)`,
        })
        .from(sourceChunks)
        .innerJoin(sourceObjects, eq(sourceObjects.id, sourceChunks.sourceObjectId))
        .where(
          and(
            eq(sourceChunks.projectId, projectId),
            eq(sourceObjects.status, "ready"),
            isNotNull(sourceChunks.embedding),
          ),
        )
        .get();
      return `${row?.total ?? 0}:${row?.top ?? 0}:${row?.sum ?? 0}`;
    },

    /** Embedded chunks of *ready* sources, for vector scoring. */
    listEmbeddedChunks(
      projectId: string,
      sourceIds?: string[],
    ): Array<Pick<SourceChunkRow, "id" | "embedding" | "sourceObjectId">> {
      if (sourceIds?.length === 0) return [];
      return db
        .select({
          id: sourceChunks.id,
          embedding: sourceChunks.embedding,
          sourceObjectId: sourceChunks.sourceObjectId,
        })
        .from(sourceChunks)
        .innerJoin(sourceObjects, eq(sourceObjects.id, sourceChunks.sourceObjectId))
        .where(
          and(
            eq(sourceChunks.projectId, projectId),
            eq(sourceObjects.status, "ready"),
            isNotNull(sourceChunks.embedding),
            sourceIds ? inArray(sourceObjects.id, sourceIds) : undefined,
          ),
        )
        .all();
    },

    /** Chunks joined with their source; only sources that finished processing are returned. */
    getChunksWithSources(chunkIds: string[]): ChunkWithSource[] {
      if (chunkIds.length === 0) return [];
      return db
        .select({ chunk: sourceChunks, source: sourceObjects })
        .from(sourceChunks)
        .innerJoin(sourceObjects, eq(sourceObjects.id, sourceChunks.sourceObjectId))
        .where(and(inArray(sourceChunks.id, chunkIds), eq(sourceObjects.status, "ready")))
        .all();
    },

    /** BM25 keyword search over the FTS5 index (maintained by triggers). */
    searchChunks(projectId: string, match: string, limit: number, sourceIds?: string[]): FtsHit[] {
      if (sourceIds?.length === 0) return [];
      const sourceFilter = sourceIds
        ? sql`AND ${inArray(sourceChunks.sourceObjectId, sourceIds)}`
        : sql``;
      const allowed = sql`AND chunk_id IN (SELECT source_chunks.id FROM source_chunks JOIN source_objects ON source_objects.id = source_chunks.source_object_id WHERE source_objects.status = 'ready' ${sourceFilter})`;
      return db.all<FtsHit>(sql`
        SELECT chunk_id AS chunkId, bm25(source_chunks_fts) AS score
        FROM source_chunks_fts
        WHERE source_chunks_fts MATCH ${match} AND project_id = ${projectId}
        ${allowed}
        ORDER BY score
        LIMIT ${limit}
      `);
    },
  };
}

export type SourceRepository = ReturnType<typeof createSourceRepository>;
