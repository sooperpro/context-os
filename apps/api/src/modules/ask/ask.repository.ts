import { desc, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { questions, type QuestionRow } from "../../db/schema.js";

export function createAskRepository(db: Db) {
  return {
    insert(row: typeof questions.$inferInsert): QuestionRow {
      return db.insert(questions).values(row).returning().get();
    },
    list(projectId: string, limit: number): QuestionRow[] {
      return db
        .select()
        .from(questions)
        .where(eq(questions.projectId, projectId))
        .orderBy(desc(questions.createdAt))
        .limit(limit)
        .all();
    },
  };
}

export type AskRepository = ReturnType<typeof createAskRepository>;
