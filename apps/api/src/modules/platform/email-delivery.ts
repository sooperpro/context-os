import { and, eq, gte } from "drizzle-orm";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/index.js";
import { memberships, platformRecords, users } from "../../db/schema.js";
import type { Logger } from "../../lib/logger.js";
import { escapeHtml, type Mail, type Mailer } from "../../lib/mailer.js";
import { publicOrigin } from "../auth/auth.js";

/** Only recent notifications are emailed, so turning email on doesn't send a backlog. */
const MAX_AGE_MS = 3 * 86_400_000;
/** One email lists at most this many; the rest wait in the bell. */
const MAX_LISTED = 10;
/** Notifications due within this window share one email; security alerts don't wait. */
const BATCH_MS = 10 * 60_000;

type Notification = typeof platformRecords.$inferSelect;

/**
 * Email delivery for notifications (PRD §13, FR-NTF-001). The notifier stores each notification
 * with its channels and the time quiet hours allow (`deliverAfter`); this sends the ones whose email
 * channel is on as one summary per person, and marks them so nothing is sent twice. A failed send is
 * retried at the next run.
 */
export function createEmailDelivery({
  db,
  mailer,
  logger,
  env,
}: {
  db: Db;
  mailer: Mailer;
  logger: Logger;
  env: Env;
}) {
  const mark = (rows: Notification[], patch: Record<string, unknown>) => {
    for (const row of rows)
      db.update(platformRecords)
        .set({ data: { ...row.data, ...patch } })
        .where(eq(platformRecords.id, row.id))
        .run();
  };

  const compose = (to: string, name: string, rows: Notification[]): Mail => {
    const origin = publicOrigin(env);
    const items = rows.slice(0, MAX_LISTED).map((row) => ({
      title: typeof row.data.title === "string" ? row.data.title : "Notification",
      body: typeof row.data.body === "string" ? row.data.body : "",
      url: new URL(typeof row.data.link === "string" ? row.data.link : "/", origin).toString(),
    }));
    const more = rows.length - items.length;
    const subject =
      rows.length === 1 ? items[0]!.title : `${rows.length} new notifications in ContextOS`;
    const settings = new URL("/settings", origin).toString();
    const outro = "You get these because email is on in Settings › Notifications.";
    const text = [
      `Hi ${name},`,
      "",
      ...items.flatMap((item) => [
        `- ${item.title}`,
        ...(item.body ? [`  ${item.body}`] : []),
        `  ${item.url}`,
      ]),
      ...(more > 0 ? ["", `And ${more} more in ContextOS.`] : []),
      "",
      `${outro} ${settings}`,
      "",
    ].join("\n");
    const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1b1b1f">
<p>Hi ${escapeHtml(name)},</p>
<ul style="padding-left:18px">${items
      .map(
        (item) =>
          `<li style="margin-bottom:10px"><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>${
            item.body ? `<br><span style="color:#5f5f66">${escapeHtml(item.body)}</span>` : ""
          }</li>`,
      )
      .join("")}</ul>
${more > 0 ? `<p>And ${more} more in ContextOS.</p>` : ""}
<p style="color:#5f5f66;font-size:13px">${escapeHtml(outro)} <a href="${escapeHtml(settings)}">Change this</a>.</p>
</body></html>`;
    return { to, subject, text, html };
  };

  const run = async (now: Date): Promise<number> => {
    const due = db
      .select()
      .from(platformRecords)
      .where(
        and(
          eq(platformRecords.kind, "notification"),
          gte(platformRecords.createdAt, new Date(now.getTime() - MAX_AGE_MS)),
        ),
      )
      .all()
      .filter(
        (row) =>
          (row.data.channels as { email?: boolean } | undefined)?.email === true &&
          !row.data.emailedAt &&
          !row.data.emailSkipped &&
          (typeof row.data.deliverAfter !== "string" ||
            Date.parse(row.data.deliverAfter) <= now.getTime()),
      );
    const byPerson = new Map<string, Notification[]>();
    for (const row of due) {
      const key = `${row.workspaceId}:${row.ownerId}`;
      byPerson.set(key, [...(byPerson.get(key) ?? []), row]);
    }
    const dueAt = (row: Notification) =>
      typeof row.data.deliverAfter === "string"
        ? Date.parse(row.data.deliverAfter)
        : row.createdAt.getTime();
    let sent = 0;
    for (const rows of byPerson.values()) {
      const { workspaceId, ownerId } = rows[0]!;
      const urgent = rows.some((row) => row.data.category === "security");
      if (!urgent && now.getTime() - Math.min(...rows.map(dueAt)) < BATCH_MS) continue;
      const user = db.select().from(users).where(eq(users.id, ownerId)).get();
      const member = db
        .select({ status: memberships.status })
        .from(memberships)
        .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, ownerId)))
        .get();
      // Nowhere to send it, or no longer a member: don't look at these again.
      if (!user?.email || member?.status !== "active") {
        mark(rows, { emailSkipped: !user?.email ? "no_address" : "not_active" });
        continue;
      }
      try {
        await mailer.send(compose(user.email, user.name, rows));
        mark(rows, { emailedAt: now.toISOString() });
        sent += rows.length;
      } catch (error) {
        logger.error({ err: error, userId: ownerId }, "Notification email could not be sent");
      }
    }
    return sent;
  };

  let inFlight: Promise<number> | null = null;
  return {
    /** Sends what's due; overlapping calls share one run. Resolves to the notifications emailed. */
    deliver(now = new Date()): Promise<number> {
      inFlight ??= run(now).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
export type EmailDelivery = ReturnType<typeof createEmailDelivery>;
