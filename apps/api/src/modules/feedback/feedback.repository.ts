import { desc, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { feedback, type FeedbackRow } from "../../db/schema.js";

export function createFeedbackRepository(db: Db) {
  return {
    insert(row: typeof feedback.$inferInsert): FeedbackRow {
      return db.insert(feedback).values(row).returning().get();
    },
    list(projectId: string, limit = 100): FeedbackRow[] {
      return db
        .select()
        .from(feedback)
        .where(eq(feedback.projectId, projectId))
        .orderBy(desc(feedback.createdAt))
        .limit(limit)
        .all();
    },
  };
}

export type FeedbackRepository = ReturnType<typeof createFeedbackRepository>;
