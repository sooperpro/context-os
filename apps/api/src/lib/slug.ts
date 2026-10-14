/** Lowercase URL slug from a display name; falls back to `project` for empty input. */
export function slugify(name: string, maxLength = 50): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return base.length >= 3 ? base : `${base || "project"}-hub`.replace(/^-/, "");
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID_PATTERN.test(value);
