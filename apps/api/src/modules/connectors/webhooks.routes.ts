import { createHmac, timingSafeEqual } from "node:crypto";
import { WebhookProviderSchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { connectorScopes, domainEvents } from "../../db/schema.js";
import { AppError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import { matchConnectorEvent } from "../platform/learning.events.js";

const SLACK_WINDOW_SECONDS = 300;

const equal = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Public webhook receivers (PRD §17.5, §20): verify the provider signature, respond fast,
 * store the event in the outbox and match real-work checkpoint triggers (FR-CHK-004).
 * Slack/Jira/GitHub ingestion connectors are not implemented; events are recorded only.
 */
export function createWebhookRoutes(container: Container) {
  const { db, env, identity, queue, logger } = container;
  /** Replay defence: provider delivery ids seen recently (bounded, per process). */
  const seenDeliveries = new Set<string>();
  const seen = (id: string | undefined) => {
    if (!id) return false;
    if (seenDeliveries.has(id)) return true;
    seenDeliveries.add(id);
    if (seenDeliveries.size > 5000) seenDeliveries.delete(seenDeliveries.values().next().value!);
    return false;
  };
  /** Outbox record per workspace the event was attributed to (tenant resolution via identity links). */
  const record = (workspaceIds: string[], type: string, data: Record<string, unknown>) => {
    for (const workspaceId of workspaceIds)
      db.insert(domainEvents).values({ id: crypto.randomUUID(), workspaceId, type, data }).run();
    if (!workspaceIds.length)
      logger.info({ type, ...data }, "Webhook event not attributed to a workspace");
  };
  return new Hono().post(
    "/webhooks/:provider",
    zValidator("param", z.object({ provider: WebhookProviderSchema }), validationHook),
    async (c) => {
      const provider = c.req.valid("param").provider;
      const raw = await c.req.text();
      const parse = (): Record<string, unknown> => {
        try {
          const value: unknown = JSON.parse(raw);
          return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
        } catch {
          return {};
        }
      };
      if (provider === "slack") {
        if (!env.SLACK_SIGNING_SECRET)
          throw new AppError(503, "NOT_CONFIGURED", "Slack webhooks are not configured");
        const timestamp = c.req.header("x-slack-request-timestamp") ?? "";
        const signature = c.req.header("x-slack-signature") ?? "";
        if (
          !/^\d+$/.test(timestamp) ||
          Math.abs(Date.now() / 1000 - Number(timestamp)) > SLACK_WINDOW_SECONDS
        )
          throw new AppError(401, "UNAUTHENTICATED", "Stale or missing Slack timestamp");
        const expected = `v0=${createHmac("sha256", env.SLACK_SIGNING_SECRET).update(`v0:${timestamp}:${raw}`).digest("hex")}`;
        if (!equal(expected, signature))
          throw new AppError(401, "UNAUTHENTICATED", "Invalid Slack signature");
        const body = parse();
        if (body.type === "url_verification") return c.json({ challenge: body.challenge });
        const event = (body.event ?? {}) as Record<string, unknown>;
        if (seen(typeof body.event_id === "string" ? `slack:${body.event_id}` : undefined))
          return c.json({ accepted: true, duplicate: true }, 202);
        let result = { matched: 0, workspaceIds: [] as string[] };
        if (
          event.type === "message" &&
          typeof event.user === "string" &&
          typeof event.channel === "string"
        )
          result = matchConnectorEvent(db, identity, {
            provider: "slack",
            externalId: event.user,
            trigger: "slack.message.posted_in_channel",
            ref: `slack:${event.channel}:${typeof event.ts === "string" ? event.ts : ""}`,
          });
        record(result.workspaceIds, "webhook.slack", {
          event: event.type ?? null,
          team: body.team_id ?? null,
          matched: result.matched,
        });
        return c.json({ accepted: true, matched: result.matched }, 202);
      }
      if (provider === "github") {
        if (!env.GITHUB_WEBHOOK_SECRET)
          throw new AppError(503, "NOT_CONFIGURED", "GitHub webhooks are not configured");
        const signature = c.req.header("x-hub-signature-256") ?? "";
        const expected = `sha256=${createHmac("sha256", env.GITHUB_WEBHOOK_SECRET).update(raw).digest("hex")}`;
        if (!equal(expected, signature))
          throw new AppError(401, "UNAUTHENTICATED", "Invalid GitHub signature");
        const eventName = c.req.header("x-github-event") ?? "unknown";
        const delivery = c.req.header("x-github-delivery");
        const body = parse();
        if (seen(delivery ? `github:${delivery}` : undefined))
          return c.json({ accepted: true, duplicate: true }, 202);
        let result = { matched: 0, workspaceIds: [] as string[] };
        const pr = body.pull_request as
          | { merged?: boolean; user?: { login?: string; id?: number }; html_url?: string }
          | undefined;
        if (
          eventName === "pull_request" &&
          body.action === "closed" &&
          pr?.merged &&
          pr.user?.login
        )
          result = matchConnectorEvent(db, identity, {
            provider: "github",
            externalId: String(pr.user.id ?? ""),
            externalLogin: pr.user.login,
            trigger: "github.pr.merged",
            ref: pr.html_url ?? "",
          });
        const review = body.review as
          { user?: { login?: string; id?: number }; html_url?: string } | undefined;
        if (
          eventName === "pull_request_review" &&
          body.action === "submitted" &&
          review?.user?.login
        )
          result = matchConnectorEvent(db, identity, {
            provider: "github",
            externalId: String(review.user.id ?? ""),
            externalLogin: review.user.login,
            trigger: "github.pr.review_submitted",
            ref: review.html_url ?? "",
          });
        record(result.workspaceIds, "webhook.github", {
          event: eventName,
          action: body.action ?? null,
          repository: (body.repository as { full_name?: string } | undefined)?.full_name ?? null,
          matched: result.matched,
        });
        return c.json({ accepted: true, matched: result.matched }, 202);
      }
      if (provider === "jira") {
        if (!env.JIRA_WEBHOOK_SECRET)
          throw new AppError(503, "NOT_CONFIGURED", "Jira webhooks are not configured");
        const signature = c.req.header("x-hub-signature") ?? "";
        const expected = `sha256=${createHmac("sha256", env.JIRA_WEBHOOK_SECRET).update(raw).digest("hex")}`;
        if (!equal(expected, signature))
          throw new AppError(401, "UNAUTHENTICATED", "Invalid Jira signature");
        const body = parse();
        const issue = body.issue as
          | {
              key?: string;
              fields?: {
                assignee?: { accountId?: string };
                reporter?: { accountId?: string };
                status?: { name?: string };
              };
            }
          | undefined;
        let result = { matched: 0, workspaceIds: [] as string[] };
        if (body.webhookEvent === "jira:issue_created" && issue?.fields?.reporter?.accountId)
          result = matchConnectorEvent(db, identity, {
            provider: "jira",
            externalId: issue.fields.reporter.accountId,
            trigger: "jira.issue.created",
            ref: issue.key ?? "",
          });
        const changelog = body.changelog as
          { items?: Array<{ field?: string; toString?: string }> } | undefined;
        const toDone = changelog?.items?.some(
          (item) => item.field === "status" && /done/i.test(item.toString ?? ""),
        );
        if (
          body.webhookEvent === "jira:issue_updated" &&
          toDone &&
          issue?.fields?.assignee?.accountId
        )
          result = matchConnectorEvent(db, identity, {
            provider: "jira",
            externalId: issue.fields.assignee.accountId,
            trigger: "jira.issue.transitioned_to_done",
            ref: issue.key ?? "",
          });
        record(result.workspaceIds, "webhook.jira", {
          event: body.webhookEvent ?? null,
          issue: issue?.key ?? null,
          matched: result.matched,
        });
        return c.json({ accepted: true, matched: result.matched }, 202);
      }
      // Google Drive push notifications: channel token must match; the channel id maps to a scope cursor.
      if (!env.GOOGLE_WEBHOOK_TOKEN)
        throw new AppError(503, "NOT_CONFIGURED", "Google Drive webhooks are not configured");
      if (!equal(env.GOOGLE_WEBHOOK_TOKEN, c.req.header("x-goog-channel-token") ?? ""))
        throw new AppError(401, "UNAUTHENTICATED", "Invalid Google channel token");
      const channelId = c.req.header("x-goog-channel-id") ?? "";
      const state = c.req.header("x-goog-resource-state") ?? "";
      let queued = 0;
      const workspaceIds: string[] = [];
      if (state === "change" && channelId)
        for (const scope of db.select().from(connectorScopes).all())
          if (scope.cursor?.channelId === channelId) {
            queue.enqueue({
              projectId: scope.projectId,
              type: "sync_connector",
              payload: { connectionId: scope.connectionId, scopeId: scope.id },
              subject: scope.name,
              dedupe: true,
            });
            workspaceIds.push(scope.workspaceId);
            queued += 1;
          }
      record(workspaceIds, "webhook.google_drive", { channelId, state, queued });
      logger.debug({ provider, channelId, queued }, "Drive push notification received");
      return c.json({ accepted: true, queued }, 202);
    },
  );
}
