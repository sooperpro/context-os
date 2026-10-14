import { IdSchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { contextItems, evidence, sourceChunks, sourceObjects } from "../../db/schema.js";
import { NotFoundError } from "../../lib/errors.js";
import { normalizeForMatch } from "../../lib/text.js";
import { validationHook } from "../../middleware/validation.js";
import type { AppEnv } from "../../types.js";

/** Source Drawer payload: the evidence span, its source and surrounding context (§20 evidence). */
export function createEvidenceRoutes(container: Container) {
  const { db, identity } = container;
  return new Hono<AppEnv>().get(
    "/evidence/:id",
    zValidator("param", z.object({ id: IdSchema }), validationHook),
    (c) => {
      const actor = c.get("actor");
      const row = db
        .select({ evidence, item: contextItems, source: sourceObjects })
        .from(evidence)
        .innerJoin(contextItems, eq(contextItems.id, evidence.contextItemId))
        .innerJoin(sourceObjects, eq(sourceObjects.id, evidence.sourceObjectId))
        .where(eq(evidence.id, c.req.valid("param").id))
        .get();
      if (!row) throw new NotFoundError("Evidence");
      const project = identity.requireProject(actor, row.item.projectId);
      // Never reveal restricted evidence exists: inaccessible sources 404 like unknown ids.
      if (!identity.visibleSourceIds(actor, project.id).includes(row.source.id))
        throw new NotFoundError("Evidence");
      const chunk = row.evidence.chunkId
        ? db.select().from(sourceChunks).where(eq(sourceChunks.id, row.evidence.chunkId)).get()
        : undefined;
      const neighbour = (ordinal: number) =>
        db
          .select({
            id: sourceChunks.id,
            ordinal: sourceChunks.ordinal,
            content: sourceChunks.content,
          })
          .from(sourceChunks)
          .where(
            and(eq(sourceChunks.sourceObjectId, row.source.id), eq(sourceChunks.ordinal, ordinal)),
          )
          .get() ?? null;
      const haystack = chunk ? normalizeForMatch(chunk.content) : "";
      const start = haystack.indexOf(normalizeForMatch(row.evidence.quote));
      return c.json({
        id: row.evidence.id,
        quote: row.evidence.quote,
        quoteVerified: row.evidence.quoteVerified,
        span:
          chunk && start >= 0
            ? [start, start + normalizeForMatch(row.evidence.quote).length]
            : null,
        item: {
          id: row.item.id,
          projectId: row.item.projectId,
          kind: row.item.kind,
          title: row.item.title,
          verification: row.item.verification,
          confidence: row.item.confidence,
        },
        source: {
          id: row.source.id,
          title: row.source.title,
          kind: row.source.kind,
          connector: row.source.connector,
          url: row.source.url,
          author: row.source.author,
          sourceCreatedAt: row.source.sourceCreatedAt?.toISOString() ?? null,
          sourceUpdatedAt: row.source.sourceUpdatedAt?.toISOString() ?? null,
        },
        chunk: chunk ? { id: chunk.id, ordinal: chunk.ordinal, content: chunk.content } : null,
        context: chunk
          ? { before: neighbour(chunk.ordinal - 1), after: neighbour(chunk.ordinal + 1) }
          : { before: null, after: null },
        extractionRunId: row.evidence.extractionRunId,
        createdAt: row.evidence.createdAt.toISOString(),
      });
    },
  );
}
