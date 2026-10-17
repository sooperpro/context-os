import {
  RoleRequestDecisionInputSchema,
  type MembersOverview,
  type RoleRequest,
  type SystemRole,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Container } from "../../container.js";
import { memberships, users } from "../../db/schema.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import type { Logger } from "../../lib/logger.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { requireRole } from "../identity/identity.service.js";
import { createNotifier } from "./notify.js";
import { createPlatformStore } from "./store.js";

const REQUEST = "role_request";
const SYNC_RUN = "directory_sync";
/** Accounts the API creates for itself; directory sync never touches them. */
const SYSTEM_USERS = new Set(["system"]);

const ROLE_NAME: Record<SystemRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  hr: "HR",
  member: "Employee",
  guest: "Guest",
};
/** "an Admin", "an HR", "an Employee", "a Manager". */
const article = (role: SystemRole) => (/^[AEIOU]|^HR/.test(ROLE_NAME[role]) ? "an" : "a");

/** Directory sync runs, newest first (also shown in the admin's sync activity). */
export function directorySyncRuns(container: Container, workspaceId: string, limit = 20) {
  return createPlatformStore(container.db).listWhere(workspaceId, SYNC_RUN, {}, limit);
}

/**
 * Members & roles beyond the live member list (role access spec §4.8): seats and directory sync from
 * the identity provider, and role requests that any member can make and admins decide.
 */
export function createMemberAdminRoutes(container: Container) {
  const { db, identity, audit, env, logger } = container;
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);
  const admin = (actor: Actor) => requireRole(actor, "owner", "admin");
  const provider = env.AUTH_MODE === "accounts" ? "ContextOS sign-in" : "Development sign-in";

  const personRef = (workspaceId: string, userId: string) => {
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    const membership = db
      .select({ organization: memberships.organization })
      .from(memberships)
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
      .get();
    const title = membership?.organization.jobTitle;
    return {
      id: userId,
      name: user?.name ?? "Former member",
      title: typeof title === "string" ? title : null,
    };
  };

  const activeOwners = (workspaceId: string) =>
    db
      .select({ total: count() })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.role, "owner"),
          eq(memberships.status, "active"),
        ),
      )
      .get()!.total;

  return new Hono<AppEnv>()
    .get("/admin/members/overview", async (c) => {
      const actor = c.get("actor");
      admin(actor);
      const used = db
        .select({ total: count() })
        .from(memberships)
        .where(
          and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.status, "active")),
        )
        .get()!.total;
      let seatLimit: number | null = null;
      try {
        seatLimit = (await identity.directory(actor.workspaceId))?.seatLimit ?? null;
      } catch (error) {
        logWarn(logger, error, "Seat limit could not be read from the identity provider");
      }
      const last = directorySyncRuns(container, actor.workspaceId, 1)[0];
      return c.json({
        seats: { used, total: seatLimit },
        directorySync: {
          provider,
          // No external directory feed yet (SCIM): members join by invitation or company SSO.
          enabled: false,
          lastRunAt: last?.createdAt.toISOString() ?? null,
        },
      } satisfies MembersOverview);
    })
    .post("/admin/directory-sync", async (c) => {
      const actor = c.get("actor");
      admin(actor);
      const startedAt = Date.now();
      const directory = await identity.directory(actor.workspaceId);
      let created = 0;
      let updated = 0;
      let deactivated = 0;
      if (directory) {
        const listed = new Set(directory.members.map((entry) => entry.userId));
        db.transaction(() => {
          for (const entry of directory.members) {
            const user = db.select().from(users).where(eq(users.id, entry.userId)).get();
            if (!user)
              db.insert(users)
                .values({ id: entry.userId, name: entry.name, email: entry.email })
                .run();
            else if (user.name !== entry.name || (entry.email && user.email !== entry.email)) {
              db.update(users)
                .set({ name: entry.name, email: entry.email ?? user.email })
                .where(eq(users.id, entry.userId))
                .run();
              updated += 1;
            }
            const membership = db
              .select()
              .from(memberships)
              .where(
                and(
                  eq(memberships.workspaceId, actor.workspaceId),
                  eq(memberships.userId, entry.userId),
                ),
              )
              .get();
            if (!membership) {
              db.insert(memberships)
                .values({
                  workspaceId: actor.workspaceId,
                  userId: entry.userId,
                  role: entry.admin ? "admin" : "member",
                })
                .run();
              created += 1;
            } else if (
              membership.status === "suspended" &&
              membership.organization.suspendedBy === "directory"
            ) {
              const { suspendedBy: _dropped, ...organization } = membership.organization;
              db.update(memberships)
                .set({ status: "active", organization })
                .where(
                  and(
                    eq(memberships.workspaceId, actor.workspaceId),
                    eq(memberships.userId, entry.userId),
                  ),
                )
                .run();
              updated += 1;
            }
          }
          // People removed from the directory lose access here too. Owners and the person running
          // the sync are left alone so a workspace can't lock itself out.
          for (const membership of db
            .select()
            .from(memberships)
            .where(
              and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.status, "active")),
            )
            .all()) {
            if (
              listed.has(membership.userId) ||
              SYSTEM_USERS.has(membership.userId) ||
              membership.userId === actor.id ||
              membership.role === "owner"
            )
              continue;
            db.update(memberships)
              .set({
                status: "suspended",
                organization: { ...membership.organization, suspendedBy: "directory" },
              })
              .where(
                and(
                  eq(memberships.workspaceId, actor.workspaceId),
                  eq(memberships.userId, membership.userId),
                ),
              )
              .run();
            deactivated += 1;
          }
        });
      }
      const run = store.create(
        actor,
        SYNC_RUN,
        { provider, created, updated, deactivated, durationMs: Date.now() - startedAt },
        { status: "done" },
      );
      audit.record({
        actor,
        action: "directory.sync",
        targetType: "workspace",
        targetId: actor.workspaceId,
        metadata: { provider, created, updated, deactivated },
      });
      return c.json({ ranAt: run.createdAt.toISOString(), created, updated, deactivated });
    })
    .get("/admin/role-requests", (c) => {
      const actor = c.get("actor");
      admin(actor);
      const items = store
        .listWhere(actor.workspaceId, REQUEST, { status: "open" }, 200)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((row): RoleRequest => ({
          id: row.id,
          person: personRef(actor.workspaceId, row.ownerId),
          role: row.data.role as SystemRole,
          reason: typeof row.data.reason === "string" ? row.data.reason : "",
          requestedAt: row.createdAt.toISOString(),
        }));
      return c.json({ items });
    })
    .post(
      "/admin/role-requests/:id/decision",
      zValidator("json", RoleRequestDecisionInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        admin(actor);
        const row = store.find(actor.workspaceId, REQUEST, c.req.param("id"));
        if (!row) throw new NotFoundError("Role request");
        if (row.status !== "open")
          throw new AppError(409, "CONFLICT", "This request was already decided");
        if (row.ownerId === actor.id)
          throw new AppError(403, "FORBIDDEN", "You can't decide your own role request");
        const { decision } = c.req.valid("json");
        const role = row.data.role as SystemRole;
        db.transaction(() => {
          if (decision === "approve") {
            const target = identity.requireMember(actor.workspaceId, row.ownerId);
            if (target.role === "owner" && actor.role !== "owner")
              throw new AppError(403, "FORBIDDEN", "Only an owner can manage ownership");
            if (target.role === "owner" && activeOwners(actor.workspaceId) < 2)
              throw new AppError(409, "CONFLICT", "The last active owner cannot be removed");
            db.update(memberships)
              .set({ role })
              .where(
                and(
                  eq(memberships.workspaceId, actor.workspaceId),
                  eq(memberships.userId, row.ownerId),
                ),
              )
              .run();
            audit.record({
              actor,
              action: "user.update",
              targetType: "user",
              targetId: row.ownerId,
              metadata: { before: { role: target.role }, after: { role }, via: "role_request" },
            });
          }
          store.patch(row, {
            status: decision === "approve" ? "approved" : "declined",
            data: { ...row.data, decidedBy: actor.id, decidedAt: new Date().toISOString() },
          });
          audit.record({
            actor,
            action: `role.request.${decision}`,
            targetType: "role_request",
            targetId: row.id,
            metadata: { userId: row.ownerId, role },
          });
        });
        notifier.notify(actor.workspaceId, row.ownerId, {
          type: decision === "approve" ? "role.approved" : "role.declined",
          category: "system",
          title:
            decision === "approve"
              ? `You are now ${article(role)} ${ROLE_NAME[role]}`
              : `Your request to become ${article(role)} ${ROLE_NAME[role]} was declined`,
          link: "/settings",
        });
        return c.json({ id: row.id, decision });
      },
    );
}

function logWarn(logger: Logger, error: unknown, message: string) {
  logger.warn({ err: error }, message);
}
