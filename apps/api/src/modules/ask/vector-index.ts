import { bufferToFloat32 } from "../../lib/retrieval.js";
import type { SourceRepository } from "../sources/sources.repository.js";

/** Projects whose vectors stay in memory (most recently asked first). */
const MAX_PROJECTS = 8;
/** Above this many values a project is scored straight from the database instead of cached. */
const MAX_VALUES = 200_000_000;

interface ProjectVectors {
  signature: string;
  dimensions: number;
  ids: string[];
  sourceIds: string[];
  /** Unit vectors quantized to int8, one row per chunk: a quarter of float32's memory. */
  values: Int8Array;
}

const normalize = (vector: Float32Array) => {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return vector.map((value) => value / norm);
};

/**
 * Chunk vectors per project, held in memory and reloaded only when the project's searchable
 * chunks change. A question is scored against it instead of reading every vector from the
 * database, which keeps chat fast on projects with thousands of documents.
 */
export function createVectorIndex(sources: SourceRepository) {
  const cache = new Map<string, ProjectVectors>();

  const load = (projectId: string, signature: string): ProjectVectors | null => {
    const rows = sources
      .listEmbeddedChunks(projectId)
      .filter((row): row is typeof row & { embedding: Buffer } => row.embedding !== null);
    const dimensions = rows[0] ? rows[0].embedding.byteLength / 4 : 0;
    if (!dimensions || rows.length * dimensions > MAX_VALUES) return null;
    const values = new Int8Array(rows.length * dimensions);
    const ids: string[] = [];
    const sourceIds: string[] = [];
    for (const row of rows) {
      const vector = bufferToFloat32(row.embedding);
      if (vector.length !== dimensions) continue;
      const unit = normalize(vector);
      const offset = ids.length * dimensions;
      for (let i = 0; i < dimensions; i += 1) values[offset + i] = Math.round(unit[i]! * 127);
      ids.push(row.id);
      sourceIds.push(row.sourceObjectId);
    }
    return {
      signature,
      dimensions,
      ids,
      sourceIds,
      values: values.subarray(0, ids.length * dimensions),
    };
  };

  return {
    /**
     * The `limit` chunk ids most similar to `query`, among chunks of `allowed` sources when given.
     * Returns null when the project is too large to hold in memory (callers score from the DB).
     */
    search(
      projectId: string,
      query: number[],
      limit: number,
      allowed?: Set<string>,
    ): string[] | null {
      const signature = sources.embeddingSignature(projectId);
      let entry = cache.get(projectId);
      if (entry?.signature !== signature) {
        const loaded = load(projectId, signature);
        cache.delete(projectId);
        if (!loaded) return loaded === null && signature.startsWith("0:") ? [] : null;
        entry = loaded;
      } else cache.delete(projectId);
      cache.set(projectId, entry); // Most recently used last.
      while (cache.size > MAX_PROJECTS) cache.delete(cache.keys().next().value!);
      if (query.length !== entry.dimensions) return null;
      const unit = normalize(Float32Array.from(query));
      const top: Array<{ index: number; score: number }> = [];
      const { dimensions, values } = entry;
      for (let row = 0; row < entry.ids.length; row += 1) {
        if (allowed && !allowed.has(entry.sourceIds[row]!)) continue;
        let score = 0;
        const offset = row * dimensions;
        for (let i = 0; i < dimensions; i += 1) score += values[offset + i]! * unit[i]!;
        if (top.length < limit || score > top[top.length - 1]!.score) {
          top.push({ index: row, score });
          top.sort((a, b) => b.score - a.score);
          if (top.length > limit) top.pop();
        }
      }
      return top.map((hit) => entry.ids[hit.index]!);
    },
  };
}

export type VectorIndex = ReturnType<typeof createVectorIndex>;
