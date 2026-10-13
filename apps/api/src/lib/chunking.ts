export interface TextChunk {
  ordinal: number;
  content: string;
}

export interface ChunkOptions {
  /** Target upper bound per chunk, in characters. */
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 1200;

/**
 * Paragraph-aware chunking: paragraphs are packed into chunks up to `maxChars`;
 * oversized paragraphs are split on sentence boundaries, then hard-wrapped.
 * Chunks never cross paragraph boundaries, which keeps quotes locatable.
 */
export function chunkText(text: string, { maxChars = DEFAULT_MAX_CHARS }: ChunkOptions = {}) {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: TextChunk[] = [];
  let current = "";

  const flush = () => {
    if (current.trim().length > 0) {
      chunks.push({ ordinal: chunks.length, content: current.trim() });
    }
    current = "";
  };

  for (const paragraph of paragraphs) {
    const pieces = paragraph.length > maxChars ? splitLong(paragraph, maxChars) : [paragraph];
    for (const piece of pieces) {
      if (current.length > 0 && current.length + piece.length + 2 > maxChars) {
        flush();
      }
      current = current.length > 0 ? `${current}\n\n${piece}` : piece;
    }
  }
  flush();
  return chunks;
}

function splitLong(paragraph: string, maxChars: number): string[] {
  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (buffer) out.push(buffer);
      buffer = "";
      for (let i = 0; i < sentence.length; i += maxChars) {
        out.push(sentence.slice(i, i + maxChars));
      }
      continue;
    }
    if (buffer.length + sentence.length + 1 > maxChars) {
      out.push(buffer);
      buffer = sentence;
    } else {
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
    }
  }
  if (buffer) out.push(buffer);
  return out;
}
