import type { SourceObjectRow } from "../../db/schema.js";
import type { GeminiClient } from "../../lib/gemini.js";
import type { Logger } from "../../lib/logger.js";
import {
  bufferToFloat32,
  buildFtsQuery,
  cosineSimilarity,
  reciprocalRankFusion,
} from "../../lib/retrieval.js";
import type { SourceRepository } from "../sources/sources.repository.js";

export interface RetrievedPassage {
  chunkId: string;
  ordinal: number;
  content: string;
  source: SourceObjectRow;
}

export interface RetrievalDeps {
  sources: SourceRepository;
  gemini: GeminiClient;
  logger: Logger;
}

export interface RetrievalOptions {
  limit?: number;
  candidates?: number;
  sourceIds?: string[];
}

/**
 * Hybrid retrieval: BM25 over FTS5 + cosine over Gemini embeddings, fused with
 * reciprocal rank fusion. Degrades to keyword-only when embeddings fail.
 */
export async function retrievePassages(
  { sources, gemini, logger }: RetrievalDeps,
  projectId: string,
  question: string,
  { limit = 8, candidates = 20, sourceIds }: RetrievalOptions = {},
): Promise<RetrievedPassage[]> {
  const rankings: string[][] = [];

  const match = buildFtsQuery(question);
  if (match) {
    try {
      rankings.push(
        sources.searchChunks(projectId, match, candidates, sourceIds).map((hit) => hit.chunkId),
      );
    } catch (error) {
      logger.warn({ err: error }, "FTS query failed; continuing with vector search only");
    }
  }

  const embedded = sources.listEmbeddedChunks(projectId, sourceIds);
  if (embedded.length > 0) {
    try {
      const [queryVector] = await gemini.embed([question], "RETRIEVAL_QUERY");
      if (queryVector && queryVector.length > 0) {
        const query = Float32Array.from(queryVector);
        const scored = embedded
          .filter((row): row is { id: string; embedding: Buffer } => row.embedding !== null)
          .map((row) => ({
            id: row.id,
            score: cosineSimilarity(query, bufferToFloat32(row.embedding)),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, candidates);
        rankings.push(scored.map((s) => s.id));
      }
    } catch (error) {
      logger.warn({ err: error }, "Embedding the question failed; using keyword results only");
    }
  }

  const fused = reciprocalRankFusion(rankings).slice(0, limit);
  const rows = sources.getChunksWithSources(fused);
  const byId = new Map(rows.map((row) => [row.chunk.id, row]));
  return fused
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .map((row) => ({
      chunkId: row.chunk.id,
      ordinal: row.chunk.ordinal,
      content: row.chunk.content,
      source: row.source,
    }));
}
