import { randomUUID } from "node:crypto";
import { AskInputSchema, ThreadInputSchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Container } from "../../container.js";
import { askThreads, questions, threadMessages } from "../../db/schema.js";
import { NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { createCheckPause } from "../learning/check-pause.js";

export function createThreadRoutes(container: Container) {
  const { db, identity, services, audit } = container;
  const checkPause = createCheckPause(db);
  const get = (actor: Actor, id: string) => {
    const row = db
      .select()
      .from(askThreads)
      .where(
        and(
          eq(askThreads.id, id),
          eq(askThreads.userId, actor.id),
          eq(askThreads.workspaceId, actor.workspaceId),
        ),
      )
      .get();
    if (!row) throw new NotFoundError("Conversation");
    identity.requireProject(actor, row.projectId);
    return row;
  };
  return new Hono<AppEnv>()
    .post("/ask/threads", zValidator("json", ThreadInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      identity.requireProject(actor, input.projectId);
      if (input.sourceId) identity.requireSource(actor, input.projectId, input.sourceId);
      return c.json(
        db
          .insert(askThreads)
          .values({ ...input, id: randomUUID(), userId: actor.id, workspaceId: actor.workspaceId })
          .returning()
          .get(),
        201,
      );
    })
    .get("/ask/threads", (c) => {
      const actor = c.get("actor");
      const items = db
        .select()
        .from(askThreads)
        .where(and(eq(askThreads.workspaceId, actor.workspaceId), eq(askThreads.userId, actor.id)))
        .orderBy(desc(askThreads.createdAt))
        .limit(100)
        .all()
        .filter((thread) => {
          try {
            identity.requireProject(actor, thread.projectId);
            return true;
          } catch {
            return false;
          }
        });
      return c.json({ items });
    })
    .get("/ask/threads/:id", (c) => {
      const actor = c.get("actor");
      const thread = get(actor, c.req.param("id"));
      const allowed = new Set(identity.visibleSourceIds(actor, thread.projectId));
      const messages = db
        .select({ answer: questions.answer, sourceIds: questions.sourceIds })
        .from(threadMessages)
        .innerJoin(questions, eq(threadMessages.questionId, questions.id))
        .where(and(eq(threadMessages.threadId, thread.id), eq(questions.actorId, actor.id)))
        .orderBy(questions.createdAt)
        .all()
        .filter((row) => row.sourceIds?.every((id) => allowed.has(id)) === true)
        .map((row) => row.answer);
      return c.json({ ...thread, messages });
    })
    .delete("/ask/threads/:id", (c) => {
      const actor = c.get("actor");
      const thread = get(actor, c.req.param("id"));
      db.transaction((tx) => {
        const refs = tx
          .select()
          .from(threadMessages)
          .where(eq(threadMessages.threadId, thread.id))
          .all();
        for (const ref of refs)
          tx.delete(questions)
            .where(and(eq(questions.id, ref.questionId), eq(questions.actorId, actor.id)))
            .run();
        tx.delete(askThreads).where(eq(askThreads.id, thread.id)).run();
      });
      audit.record({ actor, action: "thread.delete", targetType: "thread", targetId: thread.id });
      return c.body(null, 204);
    })
    .post("/ask/threads/:id/messages", zValidator("json", AskInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const thread = get(actor, c.req.param("id"));
      const project = identity.requireProject(actor, thread.projectId);
      const input = c.req.valid("json");
      // Refused before the stream opens, so the reason reaches the asker instead of a generic error.
      checkPause.assertNotPaused(actor);
      return streamSSE(c, async (stream) => {
        await stream.writeSSE({ event: "status", data: JSON.stringify({ state: "retrieving" }) });
        try {
          const answer = await services.ask.ask(
            actor,
            project,
            input,
            thread.sourceId ?? undefined,
          );
          const permitted = new Set(identity.visibleSourceIds(actor, project.id));
          if (!answer.citations.every((citation) => permitted.has(citation.sourceObjectId)))
            throw new NotFoundError("Source evidence");
          db.insert(threadMessages)
            .values({ id: randomUUID(), threadId: thread.id, questionId: answer.id })
            .run();
          await stream.writeSSE({ event: "answer", data: JSON.stringify(answer), id: answer.id });
          await stream.writeSSE({ event: "done", data: "{}" });
        } catch {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({
              code: "ANSWER_UNAVAILABLE",
              message: "The answer could not be generated. Please try again.",
            }),
          });
        }
      });
    });
}
