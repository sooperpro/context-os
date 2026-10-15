import { randomUUID } from "node:crypto";
import {
  AdminIdentityLinkInputSchema,
  IdentityLinkDecisionSchema,
  IdentityLinkInputSchema,
  IdentityProviderSchema,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { connectorConnections, identityLinks, memberships, users } from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import type { createGoogleDriveService } from "../connectors/google-drive.js";
import { createNotifier } from "../platform/notify.js";
import { requireRole } from "./identity.service.js";

const ProviderParam = z.object({ provider: IdentityProviderSchema });

/** Identity linking across sources (PRD §6.6, FR-WS-007). */
export function createIdentityLinkRoutes(
  container: Container,
  drive: ReturnType<typeof createGoogleDriveService>,
) {
  const { db, identity, audit } = container;
  const notifier = createNotifier(db);
  const own = (actor: Actor) =>
    db
      .select()
      .from(identityLinks)
      .where(
        and(eq(identityLinks.workspaceId, actor.workspaceId), eq(identityLinks.userId, actor.id)),
      )
      .all();
  const takenByOther = (actor: Actor, provider: string, externalId: string, userId: string) =>
    db
      .select()
      .from(identityLinks)
      .where(
        and(
          eq(identityLinks.workspaceId, actor.workspaceId),
          eq(identityLinks.provider, provider as "slack"),
          eq(identityLinks.externalId, externalId),
          eq(identityLinks.status, "confirmed"),
          ne(identityLinks.userId, userId),
        ),
      )
      .get();
  const upsert = (
    actor: Actor,
    userId: string,
    input: {
      provider: "slack" | "google" | "jira" | "github";
      externalId: string;
      externalLogin?: string;
      email?: string;
    },
    status: "suggested" | "confirmed",
    source: "oauth" | "admin" | "user" | "auto_match",
  ) => {
    if (takenByOther(actor, input.provider, input.externalId, userId))
      throw new AppError(409, "CONFLICT", "This identity is already linked to another member");
    const linkedAt = status === "confirmed" ? new Date() : null;
    return db
      .insert(identityLinks)
      .values({
        id: randomUUID(),
        workspaceId: actor.workspaceId,
        userId,
        provider: input.provider,
        externalId: input.externalId,
        externalLogin: input.externalLogin ?? null,
        email: input.email ?? null,
        status,
        source,
        linkedAt,
      })
      .onConflictDoUpdate({
        target: [identityLinks.workspaceId, identityLinks.userId, identityLinks.provider],
        set: {
          externalId: input.externalId,
          externalLogin: input.externalLogin ?? null,
          email: input.email ?? null,
          status,
          source,
          linkedAt,
        },
      })
      .returning()
      .get();
  };
  return new Hono<AppEnv>()
    .get("/users/me/identities", (c) => c.json({ items: own(c.get("actor")) }))
    .post(
      "/users/identities/link",
      zValidator("json", IdentityLinkInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        if (input.provider === "google") {
          const connection = db
            .select()
            .from(connectorConnections)
            .where(
              and(
                eq(connectorConnections.workspaceId, actor.workspaceId),
                eq(connectorConnections.userId, actor.id),
                eq(connectorConnections.provider, "google_drive"),
                eq(connectorConnections.status, "connected"),
              ),
            )
            .get();
          if (connection) {
            // The email is the one Google verified when they connected (stored by the OAuth
            // callback), never what the request says: it decides which Drive files they can read.
            const verified = db
              .select({ email: identityLinks.email })
              .from(identityLinks)
              .where(
                and(
                  eq(identityLinks.workspaceId, actor.workspaceId),
                  eq(identityLinks.userId, actor.id),
                  eq(identityLinks.provider, "google"),
                  eq(identityLinks.source, "oauth"),
                ),
              )
              .get();
            const row = upsert(
              actor,
              actor.id,
              {
                provider: "google",
                externalId: connection.accountId,
                email: verified?.email ?? undefined,
              },
              "confirmed",
              "oauth",
            );
            audit.record({
              actor,
              action: "identity.link",
              targetType: "identity_link",
              targetId: row.id,
            });
            return c.json(row, 201);
          }
          // No verified Google identity yet: start the OAuth flow (same consent as Drive).
          return c.json({ status: "authorization_required", ...drive.authorize(actor) }, 202);
        }
        if (!input.externalId && !input.externalLogin)
          throw new BadRequestError("Provide the external account id or login for this provider");
        // Without a provider OAuth app the link stays `suggested` until an admin confirms it.
        const row = upsert(
          actor,
          actor.id,
          { ...input, externalId: input.externalId ?? input.externalLogin! },
          "suggested",
          "user",
        );
        audit.record({
          actor,
          action: "identity.link.request",
          targetType: "identity_link",
          targetId: row.id,
        });
        return c.json(row, 201);
      },
    )
    .patch(
      "/users/identities/:provider",
      zValidator("param", ProviderParam, validationHook),
      zValidator("json", IdentityLinkDecisionSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const row = own(actor).find((link) => link.provider === c.req.valid("param").provider);
        if (!row) throw new NotFoundError("Identity link");
        if (row.status !== "suggested" || row.source === "user")
          throw new AppError(
            409,
            "CONFLICT",
            "Only links suggested by an admin or auto-match await your confirmation",
          );
        const status = c.req.valid("json").status;
        const updated = db
          .update(identityLinks)
          .set({ status, linkedAt: status === "confirmed" ? new Date() : null })
          .where(eq(identityLinks.id, row.id))
          .returning()
          .get();
        audit.record({
          actor,
          action: `identity.${status}`,
          targetType: "identity_link",
          targetId: row.id,
        });
        return c.json(updated);
      },
    )
    .delete(
      "/users/identities/:provider",
      zValidator("param", ProviderParam, validationHook),
      (c) => {
        const actor = c.get("actor");
        const removed = db
          .delete(identityLinks)
          .where(
            and(
              eq(identityLinks.workspaceId, actor.workspaceId),
              eq(identityLinks.userId, actor.id),
              eq(identityLinks.provider, c.req.valid("param").provider),
            ),
          )
          .returning()
          .get();
        if (!removed) throw new NotFoundError("Identity link");
        audit.record({
          actor,
          action: "identity.unlink",
          targetType: "identity_link",
          targetId: removed.id,
        });
        return c.body(null, 204);
      },
    )
    .get("/users/identities/unlinked", (c) => {
      const actor = c.get("actor");
      requireRole(actor, "owner", "admin");
      const links = db
        .select()
        .from(identityLinks)
        .where(eq(identityLinks.workspaceId, actor.workspaceId))
        .all();
      const members = db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .innerJoin(memberships, eq(memberships.userId, users.id))
        .where(
          and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.status, "active")),
        )
        .all();
      const confirmed = new Map<string, Set<string>>();
      for (const link of links.filter((entry) => entry.status === "confirmed")) {
        const set = confirmed.get(link.userId) ?? new Set<string>();
        set.add(link.provider);
        confirmed.set(link.userId, set);
      }
      return c.json({
        pending: links.filter((link) => link.status === "suggested"),
        membersWithoutLinks: members.map((member) => ({
          ...member,
          missingProviders: IdentityProviderSchema.options.filter(
            (provider) => !confirmed.get(member.id)?.has(provider),
          ),
        })),
      });
    })
    .post(
      "/users/:id/identities",
      zValidator("json", AdminIdentityLinkInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireRole(actor, "owner", "admin");
        const userId = c.req.param("id");
        identity.requireMember(actor.workspaceId, userId);
        const row = upsert(actor, userId, c.req.valid("json"), "suggested", "admin");
        notifier.notify(actor.workspaceId, userId, {
          type: "identity.suggested",
          category: "system",
          title: `Confirm your ${row.provider} identity link`,
          link: "/settings/identities",
        });
        audit.record({
          actor,
          action: "identity.suggest",
          targetType: "identity_link",
          targetId: row.id,
          metadata: { userId },
        });
        return c.json(row, 201);
      },
    )
    .patch(
      "/users/:id/identities/:provider",
      zValidator("param", ProviderParam.extend({ id: z.string().min(1).max(200) }), validationHook),
      zValidator("json", IdentityLinkDecisionSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireRole(actor, "owner", "admin");
        const { id, provider } = c.req.valid("param");
        const row = db
          .select()
          .from(identityLinks)
          .where(
            and(
              eq(identityLinks.workspaceId, actor.workspaceId),
              eq(identityLinks.userId, id),
              eq(identityLinks.provider, provider),
            ),
          )
          .get();
        if (!row) throw new NotFoundError("Identity link");
        if (row.status !== "suggested")
          throw new AppError(409, "CONFLICT", "Only suggested links can be decided");
        const status = c.req.valid("json").status;
        // A Google identity carries an email that decides Drive access: only the person's own
        // Google sign-in can confirm it.
        if (status === "confirmed" && provider === "google")
          throw new AppError(
            409,
            "CONFLICT",
            "Google identities are confirmed by the person connecting their Google account",
          );
        if (status === "confirmed" && takenByOther(actor, provider, row.externalId, id))
          throw new AppError(409, "CONFLICT", "This identity is already linked to another member");
        const updated = db
          .update(identityLinks)
          .set({ status, linkedAt: status === "confirmed" ? new Date() : null })
          .where(eq(identityLinks.id, row.id))
          .returning()
          .get();
        audit.record({
          actor,
          action: `identity.admin.${status}`,
          targetType: "identity_link",
          targetId: row.id,
        });
        return c.json(updated);
      },
    );
}
