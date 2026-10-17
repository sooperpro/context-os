import type { LessonState } from "@contextos/shared";
import { inArray } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { sourceObjects } from "../../db/schema.js";
import type { PlatformRecord } from "../platform/store.js";

/** The parts of a tutorial record that decide where it stands. */
interface TutorialStateData {
  content: unknown;
  sources?: Array<{ id: string; hash: string }>;
  generation?: { state: "running" | "failed" | "done" };
  draftRevision?: number;
  publishedRevision?: number | null;
  review?: { state: "in_review" | "changes_requested" } | null;
  update?: unknown;
}

/** How many of a tutorial's sources changed or went away since it was written (by content hash). */
export function staleSourceCount(db: Db, sources: Array<{ id: string; hash: string }>): number {
  if (!sources.length) return 0;
  const current = new Map(
    db
      .select({ id: sourceObjects.id, hash: sourceObjects.contentHash })
      .from(sourceObjects)
      .where(
        inArray(
          sourceObjects.id,
          sources.map((source) => source.id),
        ),
      )
      .all()
      .map((row) => [row.id, row.hash]),
  );
  return sources.filter((source) => current.get(source.id) !== source.hash).length;
}

/**
 * The one thing to act on first for a module's lessons, the same on the Tutorials page and in a
 * template: being written or failed, then review, then a draft never published, then what is
 * waiting on a published one (a Hub update, edits, changed sources).
 */
export function lessonState(row: PlatformRecord, staleSources: number): LessonState {
  const data = row.data as unknown as TutorialStateData;
  if (row.status === "archived") return "archived";
  if (!data.content) return data.generation?.state === "failed" ? "failed" : "writing";
  if (data.review?.state === "in_review") return "in_review";
  if (data.review?.state === "changes_requested") return "sent_back";
  if (row.status !== "published") return "draft";
  const edited = data.publishedRevision !== data.draftRevision;
  if (edited && data.update) return "update_ready";
  if (edited) return "unpublished_edits";
  if (staleSources > 0) return "sources_changed";
  return "published";
}

/** States with a draft waiting that a reviewer can publish with the template. */
export const WAITING_UPDATE: ReadonlySet<LessonState> = new Set([
  "update_ready",
  "unpublished_edits",
  "in_review",
]);
