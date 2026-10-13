/** Vector and rank-fusion helpers for hybrid retrieval (FTS5 + embeddings). */

export function float32ToBuffer(values: number[]): Buffer {
  const array = Float32Array.from(values);
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

export function bufferToFloat32(buffer: Buffer): Float32Array {
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return new Float32Array(copy.buffer);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Reciprocal rank fusion: combine several ranked id lists into one ranking.
 * Ids that rank well in multiple lists float to the top.
 */
export function reciprocalRankFusion(rankings: string[][], k = 60): string[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "is",
  "are",
  "was",
  "were",
  "what",
  "why",
  "how",
  "when",
  "who",
  "which",
  "does",
  "do",
  "did",
  "this",
  "that",
  "it",
  "we",
  "our",
  "us",
  "be",
  "with",
  "about",
  "from",
  "by",
  "at",
  "as",
  "has",
  "have",
  "had",
]);

/** Build a safe FTS5 MATCH expression from free text (OR of quoted terms). */
export function buildFtsQuery(question: string, maxTerms = 12): string | null {
  const terms = question
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  const unique = [...new Set(terms)].slice(0, maxTerms);
  if (unique.length === 0) return null;
  return unique.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");
}
