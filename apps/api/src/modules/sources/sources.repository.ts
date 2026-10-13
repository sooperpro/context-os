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

    insertChunks(rows: Array<typeof sourceChunks.$inferInsert>): SourceChunkRow[] {
      if (rows.length === 0) return [];
      return db.insert(sourceChunks).values(rows).returning().all();
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

    /** Embedded chunks of *ready* sources, for brute-force vector scoring (pilot scale). */
    listEmbeddedChunks(projectId: string): Array<Pick<SourceChunkRow, "id" | "embedding">> {
      return db
        .select({ id: sourceChunks.id, embedding: sourceChunks.embedding })
        .from(sourceChunks)
        .innerJoin(sourceObjects, eq(sourceObjects.id, sourceChunks.sourceObjectId))
        .where(
          and(
            eq(sourceChunks.projectId, projectId),
            eq(sourceObjects.status, "ready"),
            isNotNull(sourceChunks.embedding),
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
    searchChunks(projectId: string, match: string, limit: number): FtsHit[] {
      return db.all<FtsHit>(sql`
        SELECT chunk_id AS chunkId, bm25(source_chunks_fts) AS score
        FROM source_chunks_fts
        WHERE source_chunks_fts MATCH ${match} AND project_id = ${projectId}
        ORDER BY score
        LIMIT ${limit}
      `);
    },
  };
}

export type SourceRepository = ReturnType<typeof createSourceRepository>;
