/** Text helpers used for evidence verification and entity de-duplication. */

const QUOTE_CHARS = /[‘’‚‛′]/g;
const DQUOTE_CHARS = /[“”„‟″]/g;
const DASHES = /[‐-―−]/g;

/** Normalize text so that near-identical excerpts compare equal (case, quotes, whitespace). */
export function normalizeForMatch(text: string): string {
  return text
    .replace(QUOTE_CHARS, "'")
    .replace(DQUOTE_CHARS, '"')
    .replace(DASHES, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True when `quote` appears verbatim (after normalization) in `content`. */
export function containsQuote(content: string, quote: string): boolean {
  const needle = normalizeForMatch(quote);
  if (needle.length < 8) return false;
  return normalizeForMatch(content).includes(needle);
}

/** Stable key for merging the same subject across sources: "Payments Service" == "payments service". */
export function normalizeKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse a model-provided date (YYYY-MM-DD, YYYY-MM, or ISO) into a Date, or null. */
export function parseLooseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}(-\d{2}(-\d{2})?)?(T.*)?$/.test(trimmed)) return null;
  const ms = Date.parse(trimmed.length === 7 ? `${trimmed}-01` : trimmed);
  if (Number.isNaN(ms)) return null;
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  if (year < 1990 || year > 2100) return null;
  return date;
}

export function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n…[truncated]`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown error";
}
