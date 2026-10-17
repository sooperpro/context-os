import { DirectMessageInputSchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, count, eq, gte } from "drizzle-orm";
import { Hono } from "hono";
import type { Container } from "../../container.js";
import { platformRecords, users } from "../../db/schema.js";
import { AppError, BadRequestError } from "../../lib/errors.js";
import { linkEmail } from "../../lib/mailer.js";
import { validationHook } from "../../middleware/validation.js";
import type { AppEnv } from "../../types.js";
import { publicOrigin } from "../auth/auth.js";
import { createNotifier } from "./notify.js";

/** Messages one person may send in an hour, so the email copies can't become spam. */
const HOURLY_LIMIT = 30;

/**
 * Message a colleague (ALL-3): it lands in their notifications, linking back to what it's about
 * (or the sender's profile, to reply), and an email copy goes to their address. The text is kept
 * as a `direct_message` record for the sender's hourly limit; the audit log notes only that a
 * message was sent.
 */
export function createDirectMessageRoutes(container: Container) {
  const { db, identity, store, mailer, env, logger, audit } = container;
  const notifier = createNotifier(db);
  return new Hono<AppEnv>().post(
    "/people/:id/messages",
    zValidator("json", DirectMessageInputSchema, validationHook),
    async (c) => {
      const actor = c.get("actor");
      // Guests see only the projects they were added to, never the directory.
      if (actor.role === "guest")
        throw new AppError(403, "FORBIDDEN", "Guests can't message people here");
      const toId = c.req.param("id");
      if (toId === actor.id) throw new BadRequestError("You can't message yourself");
      identity.requireMember(actor.workspaceId, toId);
      const recent = db
        .select({ total: count() })
        .from(platformRecords)
        .where(
          and(
            eq(platformRecords.workspaceId, actor.workspaceId),
            eq(platformRecords.kind, "direct_message"),
            eq(platformRecords.ownerId, actor.id),
            gte(platformRecords.createdAt, new Date(Date.now() - 3_600_000)),
          ),
        )
        .get()!.total;
      if (recent >= HOURLY_LIMIT)
        throw new AppError(
          429,
          "RATE_LIMITED",
          "You've sent a lot of messages this hour. Try again a little later.",
        );
      const { text, about } = c.req.valid("json");
      const recipient = db.select().from(users).where(eq(users.id, toId)).get()!;
      const link = about?.link ?? `/people/${encodeURIComponent(actor.id)}`;
      store.insert({
        workspaceId: actor.workspaceId,
        ownerId: actor.id,
        kind: "direct_message",
        status: "sent",
        data: { to: toId, text, about: about ?? null },
      });
      const title = about
        ? `${actor.name} sent you a message about ${about.title}`
        : `${actor.name} sent you a message`;
      const notice = notifier.notify(actor.workspaceId, toId, {
        type: "message.received",
        category: "system",
        title,
        body: text,
        link,
        data: { from: actor.id },
      });
      let emailed = false;
      if (recipient.email) {
        const origin = publicOrigin(env);
        try {
          await mailer.send(
            linkEmail({
              to: recipient.email,
              subject: title,
              intro: `${actor.name} wrote: “${text}”`,
              action: about ? `Open ${about.title}` : `Reply to ${actor.name}`,
              url: new URL(link, origin).toString(),
              outro: `To reply, open ${actor.name}'s profile in ContextOS and choose Message.`,
            }),
          );
          emailed = true;
        } catch (error) {
          logger.warn({ err: error }, "The email copy of a message could not be sent");
        }
        // The notification digest must not email it a second time.
        if (notice && emailed)
          db.update(platformRecords)
            .set({ data: { ...notice.data, emailedAt: new Date().toISOString() } })
            .where(eq(platformRecords.id, notice.id))
            .run();
      }
      audit.record({ actor, action: "message.send", targetType: "user", targetId: toId });
      return c.json({ inApp: notice !== null, emailed });
    },
  );
}
