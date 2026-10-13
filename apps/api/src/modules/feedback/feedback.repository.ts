import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { feedback, type FeedbackRow } from "../../db/schema.js";

export function createFeedbackRepository(db: Db) {
  return {
    insert(row: typeof feedback.$inferInsert): FeedbackRow {
      return db.insert(feedback).values(row).returning().get();
    },
    list(projectId: string, actorId: string, limit = 100): FeedbackRow[] {
      return db
        .select()
        .from(feedback)
        .where(and(eq(feedback.projectId, projectId), eq(feedback.actorId, actorId)))
        .orderBy(desc(feedback.createdAt))
        .limit(limit)
        .all();
    },
  };
}

export type FeedbackRepository = ReturnType<typeof createFeedbackRepository>;
