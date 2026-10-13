import { randomUUID } from "node:crypto";
import {
  AssignmentInputSchema,
  PageQuerySchema,
  ProfileUpdateSchema,
  SourceAccessInputSchema,
  UserUpdateSchema,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, count, eq, inArray, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import {
  assignments,
  auditLog,
  connectorConnections,
  domainEvents,
  memberships,
  oauthStates,
  organizationLinks,
  projectMemberships,
  projects,
  sourceAccess,
  sourceObjects,
  users,
  workspaces,
} from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { AppEnv } from "../../types.js";
import { requireRole } from "./identity.service.js";

const adminRoles = ["owner", "admin"] as const;
const ProjectMemberSchema = z.object({ userId: z.string().min(1).max(200) }).strict();
const InviteSchema = z
  .object({
    email: z.email(),
    role: z.enum(["admin", "manager", "member", "guest"]).default("member"),
  })
  .strict();

export function createIdentityRoutes(container: Container) {
  const { db, identity, audit } = container;
  return new Hono<AppEnv>()
    .get("/workspaces/current", (c) =>
      c.json({
        ...db
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, c.get("actor").workspaceId))
          .get(),
        role: c.get("actor").role,
        authentication: container.env.AUTH_MODE,
      }),
    )
    .get("/users/me", (c) => {
      const actor = c.get("actor");
      return c.json({
        ...db.select().from(users).where(eq(users.id, actor.id)).get(),
        role: actor.role,
        workspaceId: actor.workspaceId,
        assignments: db
          .select()
          .from(assignments)
          .where(
            and(eq(assignments.workspaceId, actor.workspaceId), eq(assignments.userId, actor.id)),
          )
          .all(),
      });
    })
    .patch("/users/me", zValidator("json", ProfileUpdateSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      const row = db.select().from(users).where(eq(users.id, actor.id)).get();
      if (!row) throw new NotFoundError("User");
      return c.json(
        db
          .update(users)
          .set({ name: input.name ?? row.name, preferences: { ...row.preferences, ...input } })
          .where(eq(users.id, actor.id))
          .returning()
          .get(),
      );
    })
    .get("/users", zValidator("query", PageQuerySchema, validationHook), (c) => {
      const actor = c.get("actor");
      if (actor.role === "guest")
        throw new AppError(403, "FORBIDDEN", "Directory access is not permitted");
      const { limit, offset } = c.req.valid("query");
      return c.json({
        items: db
          .select({
            id: users.id,
            name: users.name,
            role: memberships.role,
            status: memberships.status,
          })
          .from(users)
          .innerJoin(memberships, eq(users.id, memberships.userId))
          .where(eq(memberships.workspaceId, actor.workspaceId))
          .limit(limit)
          .offset(offset)
          .all(),
      });
    })
    .patch("/users/:id", zValidator("json", UserUpdateSchema, validationHook), (c) => {
      const actor = c.get("actor");
      requireRole(actor, ...adminRoles);
      const userId = c.req.param("id");
      const target = db
        .select()
        .from(memberships)
        .where(and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.userId, userId)))
        .get();
      if (!target) throw new NotFoundError("Workspace member");
      const input = c.req.valid("json");
      if ((target.role === "owner" || input.role === "owner") && actor.role !== "owner")
        throw new AppError(403, "FORBIDDEN", "Only an owner can manage ownership");
      if (input.managerId) identity.requireMember(actor.workspaceId, input.managerId);
      if (input.managerId === userId) throw new BadRequestError("A user cannot manage themselves");
      if (input.managerId) {
        const seen = new Set([userId]);
        let managerId: string | null = input.managerId;
        while (managerId) {
          if (seen.has(managerId))
            throw new BadRequestError("Reporting lines cannot contain cycles");
          seen.add(managerId);
          managerId = identity.requireMember(actor.workspaceId, managerId).managerId;
        }
      }
      if (
        target.role === "owner" &&
        ((input.role && input.role !== "owner") || (input.status && input.status !== "active"))
      ) {
        const owners = db
          .select({ total: count() })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, actor.workspaceId),
              eq(memberships.role, "owner"),
              eq(memberships.status, "active"),
            ),
          )
          .get()!.total;
        if (owners < 2)
          throw new AppError(409, "CONFLICT", "The last active owner cannot be removed");
      }
      const expires =
        input.guestExpiresAt === undefined
          ? undefined
          : input.guestExpiresAt === null
            ? null
            : new Date(input.guestExpiresAt);
      const effectiveExpiry = expires === undefined ? target.guestExpiresAt : expires;
      if (
        (input.role ?? target.role) === "guest" &&
        (!effectiveExpiry ||
          effectiveExpiry <= new Date() ||
          effectiveExpiry.getTime() > Date.now() + 180 * 86400000)
      )
        throw new BadRequestError("Guests need an expiry within 180 days");
      const updated = db.transaction(() => {
        const updatedMember = db
          .update(memberships)
          .set({ ...input, guestExpiresAt: expires })
          .where(
            and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.userId, userId)),
          )
          .returning()
          .get();
        if (input.status && input.status !== "active") {
          const workspaceProjects = db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.workspaceId, actor.workspaceId));
          const workspaceSources = db
            .select({ id: sourceObjects.id })
            .from(sourceObjects)
            .where(inArray(sourceObjects.projectId, workspaceProjects));
          db.delete(sourceAccess)
            .where(
              and(
                eq(sourceAccess.userId, userId),
                inArray(sourceAccess.sourceId, workspaceSources),
              ),
            )
            .run();
          db.delete(projectMemberships)
            .where(
              and(
                eq(projectMemberships.userId, userId),
                inArray(projectMemberships.projectId, workspaceProjects),
              ),
            )
            .run();
          const removedAssignments = db
            .delete(assignments)
            .where(
              and(
                eq(assignments.workspaceId, actor.workspaceId),
                or(
                  eq(assignments.userId, userId),
                  and(eq(assignments.scopeType, "user"), eq(assignments.scopeId, userId)),
                ),
              ),
            )
            .returning()
            .all();
          db.delete(oauthStates)
            .where(
              and(eq(oauthStates.workspaceId, actor.workspaceId), eq(oauthStates.userId, userId)),
            )
            .run();
          db.update(connectorConnections)
            .set({
              status: "needs_reauth",
              ...(input.status === "offboarded" ? { credentials: "" } : {}),
            })
            .where(
              and(
                eq(connectorConnections.workspaceId, actor.workspaceId),
                eq(connectorConnections.userId, userId),
              ),
            )
            .run();
          db.insert(domainEvents)
            .values({
              id: randomUUID(),
              workspaceId: actor.workspaceId,
              type: `user.${input.status}`,
              data: {
                userId,
                previousStatus: target.status,
                previousManagerId: target.managerId,
                removedAssignments,
              },
            })
            .run();
        }
        audit.record({
          actor,
          action: "user.update",
          targetType: "user",
          targetId: userId,
          metadata: input,
        });
        return updatedMember;
      });
      return c.json(updated);
    })
    .post("/users/invite", zValidator("json", InviteSchema, validationHook), async (c) => {
      const actor = c.get("actor");
      requireRole(actor, ...adminRoles);
      if (!identity.clerk)
        throw new AppError(503, "NOT_CONFIGURED", "Configure Clerk to deliver invitations");
      const input = c.req.valid("json");
      // Invitations enter as members; local scoped roles are assigned after acceptance.
      const organization = db
        .select()
        .from(organizationLinks)
        .where(eq(organizationLinks.workspaceId, actor.workspaceId))
        .get();
      if (!organization)
        throw new AppError(503, "NOT_CONFIGURED", "Workspace organization is not linked");
      const invitation = await identity.clerk.organizations.createOrganizationInvitation({
        organizationId: organization.organizationId,
        emailAddress: input.email,
        inviterUserId: actor.id,
        role: "org:member",
        publicMetadata: { requestedRole: input.role },
      });
      audit.record({
        actor,
        action: "user.invite",
        targetType: "invitation",
        targetId: invitation.id,
      });
      return c.json(
        { id: invitation.id, status: invitation.status, requestedRole: input.role },
        201,
      );
    })
    .get("/assignments", (c) => {
      requireRole(c.get("actor"), ...adminRoles);
      return c.json({
        items: db
          .select()
          .from(assignments)
          .where(eq(assignments.workspaceId, c.get("actor").workspaceId))
          .all(),
      });
    })
    .post("/assignments", zValidator("json", AssignmentInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      requireRole(actor, ...adminRoles);
      const input = c.req.valid("json");
      identity.requireMember(actor.workspaceId, input.userId);
      if (input.scopeType === "project") identity.requireProject(actor, input.scopeId);
      if (input.scopeType === "user") identity.requireMember(actor.workspaceId, input.scopeId);
      if (input.scopeType === "workspace" && input.scopeId !== actor.workspaceId)
        throw new BadRequestError("Invalid workspace scope");
      if (input.expiresAt && new Date(input.expiresAt) <= new Date())
        throw new BadRequestError("Expiry must be in the future");
      const row = db
        .insert(assignments)
        .values({
          ...input,
          id: randomUUID(),
          workspaceId: actor.workspaceId,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        })
        .returning()
        .get();
      audit.record({
        actor,
        action: "assignment.create",
        targetType: "assignment",
        targetId: row.id,
      });
      return c.json(row, 201);
    })
    .delete("/assignments/:id", (c) => {
      const actor = c.get("actor");
      requireRole(actor, ...adminRoles);
      const removed = db
        .delete(assignments)
        .where(
          and(
            eq(assignments.workspaceId, actor.workspaceId),
            eq(assignments.id, c.req.param("id")),
          ),
        )
        .returning()
        .get();
      if (!removed) throw new NotFoundError("Assignment");
      audit.record({
        actor,
        action: "assignment.delete",
        targetType: "assignment",
        targetId: removed.id,
      });
      return c.body(null, 204);
    })
    .post(
      "/projects/:projectId/memberships",
      zValidator("json", ProjectMemberSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireRole(actor, ...adminRoles);
        const projectId = c.req.param("projectId");
        identity.requireProject(actor, projectId);
        identity.requireMember(actor.workspaceId, c.req.valid("json").userId);
        return c.json(
          db
            .insert(projectMemberships)
            .values({ projectId, userId: c.req.valid("json").userId })
            .onConflictDoNothing()
            .returning()
            .get() ?? { projectId, userId: c.req.valid("json").userId },
          201,
        );
      },
    )
    .post(
      "/projects/:projectId/sources/:sourceId/access",
      zValidator("json", SourceAccessInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const { projectId, sourceId } = c.req.param();
        identity.requireSource(actor, projectId, sourceId);
        const source = db.select().from(sourceObjects).where(eq(sourceObjects.id, sourceId)).get()!;
        if (source.connector !== "manual")
          throw new AppError(
            403,
            "FORBIDDEN",
            "Connected source access is controlled by its provider",
          );
        requireRole(actor, ...adminRoles);
        const input = c.req.valid("json");
        identity.requireMember(actor.workspaceId, input.userId);
        const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
        if (expiresAt && expiresAt <= new Date())
          throw new BadRequestError("Expiry must be in the future");
        db.insert(sourceAccess)
          .values({ sourceId: sourceId, userId: input.userId, expiresAt })
          .onConflictDoUpdate({
            target: [sourceAccess.sourceId, sourceAccess.userId],
            set: { expiresAt },
          })
          .run();
        audit.record({
          actor,
          action: "source.access.grant",
          targetType: "source",
          targetId: sourceId,
          metadata: { userId: input.userId },
        });
        return c.json({ sourceId, ...input }, 201);
      },
    )
    .delete("/projects/:projectId/sources/:sourceId/access/:userId", (c) => {
      const actor = c.get("actor");
      requireRole(actor, ...adminRoles);
      identity.requireSource(actor, c.req.param("projectId"), c.req.param("sourceId"));
      const source = db
        .select()
        .from(sourceObjects)
        .where(eq(sourceObjects.id, c.req.param("sourceId")))
        .get()!;
      if (source.connector !== "manual")
        throw new AppError(
          403,
          "FORBIDDEN",
          "Connected source access is controlled by its provider",
        );
      db.delete(sourceAccess)
        .where(
          and(eq(sourceAccess.sourceId, source.id), eq(sourceAccess.userId, c.req.param("userId"))),
        )
        .run();
      audit.record({
        actor,
        action: "source.access.revoke",
        targetType: "source",
        targetId: source.id,
        metadata: { userId: c.req.param("userId") },
      });
      return c.body(null, 204);
    })
    .get("/audit", zValidator("query", PageQuerySchema, validationHook), (c) => {
      const actor = c.get("actor");
      requireRole(actor, ...adminRoles);
      const { limit, offset } = c.req.valid("query");
      const rows = db
        .select()
        .from(auditLog)
        .where(eq(auditLog.workspaceId, actor.workspaceId))
        .limit(limit)
        .offset(offset)
        .all();
      return c.json({
        items: rows.filter((row) => {
          if (!row.projectId) return true;
          try {
            const allowed = new Set(identity.visibleSourceIds(actor, row.projectId));
            return db
              .select({ id: sourceObjects.id })
              .from(sourceObjects)
              .where(eq(sourceObjects.projectId, row.projectId))
              .all()
              .every((source) => allowed.has(source.id));
          } catch {
            return false;
          }
        }),
      });
    });
}
