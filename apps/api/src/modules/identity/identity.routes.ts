import { randomUUID } from "node:crypto";
import {
  AssignmentInputSchema,
  AssignmentScopeTypeSchema,
  AssignmentTypeSchema,
  HubSectionKeySchema,
  InviteInputSchema,
  PageQuerySchema,
  ProfileUpdateSchema,
  SourceAccessInputSchema,
  UserDirectoryQuerySchema,
  UserUpdateSchema,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, count, desc, eq, inArray, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import {
  assignments,
  auditLog,
  connectorConnections,
  domainEvents,
  identityLinks,
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
import { createNotifier } from "../platform/notify.js";
import { ledgerSummary } from "../platform/reputation.js";
import { resolveSettings, workspaceSettings } from "../platform/settings.js";
import { createPlatformStore } from "../platform/store.js";
import { requireRole } from "./identity.service.js";

const adminRoles = ["owner", "admin"] as const;
const ProjectMemberSchema = z.object({ userId: z.string().min(1).max(200) }).strict();
const AuditQuerySchema = PageQuerySchema.extend({
  action: z.string().max(100).optional(),
  actorId: z.string().max(200).optional(),
  targetType: z.string().max(100).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});
const ChecklistUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    areas: z
      .array(
        z.object({
          key: z.string().min(1).max(300),
          status: z.enum(["reassigned", "unowned"]),
          assigneeId: z.string().min(1).max(200).optional(),
        }),
      )
      .min(1)
      .max(200),
  })
  .strict();
const INVITATION_DAYS = 14;

export function createIdentityRoutes(container: Container) {
  const { db, identity, audit } = container;
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);
  const csvEscape = (value: unknown) => {
    const text =
      value === null || value === undefined
        ? ""
        : typeof value === "string"
          ? value
          : JSON.stringify(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return new Hono<AppEnv>()
    .get("/workspaces/current", (c) => {
      const actor = c.get("actor");
      const row = db.select().from(workspaces).where(eq(workspaces.id, actor.workspaceId)).get();
      const settings = resolveSettings(row?.settings ?? {});
      return c.json({
        ...row,
        settings,
        activeModules: {
          gamification: settings.gamification.enabled,
          leaderboards: settings.gamification.enabled && settings.gamification.leaderboardsEnabled,
          rewards: settings.rewards.enabled,
          epm: settings.epm.enabled,
        },
        role: actor.role,
        authentication: container.env.AUTH_MODE,
      });
    })
    .get("/users/me", (c) => {
      const actor = c.get("actor");
      const membership = identity.requireMember(actor.workspaceId, actor.id);
      return c.json({
        ...db.select().from(users).where(eq(users.id, actor.id)).get(),
        role: actor.role,
        workspaceId: actor.workspaceId,
        managerId: membership.managerId,
        organization: membership.organization,
        assignments: db
          .select()
          .from(assignments)
          .where(
            and(eq(assignments.workspaceId, actor.workspaceId), eq(assignments.userId, actor.id)),
          )
          .all(),
        identities: db
          .select({
            provider: identityLinks.provider,
            status: identityLinks.status,
            externalLogin: identityLinks.externalLogin,
            linkedAt: identityLinks.linkedAt,
          })
          .from(identityLinks)
          .where(
            and(
              eq(identityLinks.workspaceId, actor.workspaceId),
              eq(identityLinks.userId, actor.id),
            ),
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
    .get("/users", zValidator("query", UserDirectoryQuerySchema, validationHook), (c) => {
      const actor = c.get("actor");
      if (actor.role === "guest")
        throw new AppError(403, "FORBIDDEN", "Directory access is not permitted");
      const { limit, offset, q, role, status, departmentId, teamId } = c.req.valid("query");
      const settings = workspaceSettings(db, actor.workspaceId);
      const needle = q?.toLocaleLowerCase();
      const rows = db
        .select({ user: users, membership: memberships })
        .from(users)
        .innerJoin(memberships, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.workspaceId, actor.workspaceId),
            role ? eq(memberships.role, role) : undefined,
            status ? eq(memberships.status, status) : undefined,
          ),
        )
        .orderBy(users.name)
        .all()
        .filter(({ user, membership }) => {
          const organization = membership.organization;
          if (departmentId && organization.departmentId !== departmentId) return false;
          if (teamId && organization.teamId !== teamId) return false;
          if (
            needle &&
            !`${user.name} ${user.email ?? ""} ${typeof organization.jobTitle === "string" ? organization.jobTitle : ""}`
              .toLocaleLowerCase()
              .includes(needle)
          )
            return false;
          return true;
        });
      return c.json({
        total: rows.length,
        items: rows.slice(offset, offset + limit).map(({ user, membership }) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: membership.role,
          status: membership.status,
          managerId: membership.managerId,
          organization: membership.organization,
          tier:
            settings.gamification.enabled && user.preferences.hideTier !== true
              ? ledgerSummary(db, actor.workspaceId, user.id, settings).tier
              : null,
        })),
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
      const { lastDay, ...input } = c.req.valid("json");
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
      if (lastDay && lastDay < new Date().toISOString().slice(0, 10))
        throw new BadRequestError("lastDay must be today or later");
      const organization = lastDay ? { ...target.organization, lastDay } : target.organization;
      const updated = db.transaction(() => {
        const updatedMember = db
          .update(memberships)
          .set({ ...input, guestExpiresAt: expires, organization })
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
                effectiveDate: lastDay ?? new Date().toISOString().slice(0, 10),
              },
            })
            .run();
          if (input.status === "offboarded") {
            // Knowledge continuity (PRD §8.11): freeze identity links, build the manager's checklist.
            db.update(identityLinks)
              .set({ status: "rejected" })
              .where(
                and(
                  eq(identityLinks.workspaceId, actor.workspaceId),
                  eq(identityLinks.userId, userId),
                ),
              )
              .run();
            for (const plan of store.listWhere(actor.workspaceId, "onboarding_plan", {
              ownerId: userId,
            }))
              if (["active", "scheduled"].includes(plan.status))
                store.patch(plan, { status: "cancelled" });
            const ownedAreas = removedAssignments
              .filter((row) => row.userId === userId)
              .map((row) => ({
                key: `${row.type}:${row.scopeType}:${row.scopeId}`,
                type: row.type,
                scopeType: row.scopeType,
                scopeId: row.scopeId,
                status: "unowned",
                assigneeId: null,
              }));
            const managerId = target.managerId ?? actor.id;
            const checklist = store.insert({
              workspaceId: actor.workspaceId,
              ownerId: managerId,
              kind: "continuity_checklist",
              status: ownedAreas.length ? "open" : "completed",
              data: { leaverId: userId, areas: ownedAreas, createdBy: actor.id },
            });
            notifier.notify(actor.workspaceId, managerId, {
              type: "offboarding.continuity",
              category: "system",
              title: `Knowledge continuity checklist for ${target.userId}`,
              body: `${ownedAreas.length} owned areas need reassignment`,
              link: `/continuity/checklists/${checklist.id}`,
            });
          }
        }
        audit.record({
          actor,
          action: "user.update",
          targetType: "user",
          targetId: userId,
          metadata: { ...input, lastDay },
        });
        return updatedMember;
      });
      if (input.role && input.role !== target.role) {
        const payload = {
          type: "security.role_changed",
          category: "security" as const,
          title: `Role changed from ${target.role} to ${input.role}`,
          data: { userId, from: target.role, to: input.role, by: actor.id },
          link: "/settings",
        };
        notifier.notify(actor.workspaceId, userId, payload);
        notifier.notifyAdmins(actor.workspaceId, payload);
      }
      return c.json(updated);
    })
    .post("/users/invite", zValidator("json", InviteInputSchema, validationHook), async (c) => {
      const actor = c.get("actor");
      requireRole(actor, "owner", "admin", "manager");
      const body = c.req.valid("json");
      const invitations = "invitations" in body ? body.invitations : [body];
      // Managers may only invite into their own team (PRD §6.4).
      const actorMembership = identity.requireMember(actor.workspaceId, actor.id);
      if (actor.role === "manager")
        for (const invitation of invitations)
          if (
            invitation.role !== "member" ||
            (invitation.managerId && invitation.managerId !== actor.id) ||
            (invitation.teamId && invitation.teamId !== actorMembership.organization.teamId)
          )
            throw new AppError(
              403,
              "FORBIDDEN",
              "Managers can invite members into their own team only",
            );
      const organization = db
        .select()
        .from(organizationLinks)
        .where(eq(organizationLinks.workspaceId, actor.workspaceId))
        .get();
      if (identity.clerk && !organization)
        throw new AppError(503, "NOT_CONFIGURED", "Workspace organization is not linked");
      const results: Array<Record<string, unknown>> = [];
      for (const invitation of invitations) {
        if (invitation.managerId) identity.requireMember(actor.workspaceId, invitation.managerId);
        const email = invitation.email.toLowerCase();
        const existingMember = db
          .select({ id: users.id })
          .from(users)
          .innerJoin(memberships, eq(memberships.userId, users.id))
          .where(and(eq(memberships.workspaceId, actor.workspaceId), eq(users.email, email)))
          .get();
        if (existingMember) {
          results.push({ email, status: "already_member", userId: existingMember.id });
          continue;
        }
        const pending = store
          .listWhere(actor.workspaceId, "invitation", { status: "pending" }, 1000)
          .find((row) => row.data.email === email);
        if (pending) {
          results.push({ email, status: "pending", invitationId: pending.id });
          continue;
        }
        let providerInvitationId: string | null = null;
        if (identity.clerk && organization) {
          const created = await identity.clerk.organizations.createOrganizationInvitation({
            organizationId: organization.organizationId,
            emailAddress: invitation.email,
            inviterUserId: actor.id,
            role: "org:member",
            publicMetadata: { requestedRole: invitation.role },
          });
          providerInvitationId = created.id;
        }
        const row = store.create(
          actor,
          "invitation",
          {
            ...invitation,
            email,
            providerInvitationId,
            expiresAt: new Date(Date.now() + INVITATION_DAYS * 86400000).toISOString(),
          },
          { status: "pending" },
        );
        audit.record({ actor, action: "user.invite", targetType: "invitation", targetId: row.id });
        results.push({
          email,
          status: "pending",
          invitationId: row.id,
          providerInvitationId,
          requestedRole: invitation.role,
          delivery: identity.clerk ? "clerk" : "local",
        });
      }
      return c.json(
        "invitations" in body
          ? { items: results }
          : { id: results[0]?.invitationId ?? null, ...results[0], items: results },
        201,
      );
    })
    .get("/users/invitations", zValidator("query", PageQuerySchema, validationHook), (c) => {
      const actor = c.get("actor");
      requireRole(actor, ...adminRoles);
      const { limit, offset } = c.req.valid("query");
      return c.json({ items: store.listWhere(actor.workspaceId, "invitation", {}, limit, offset) });
    })
    .delete("/users/invitations/:id", async (c) => {
      const actor = c.get("actor");
      requireRole(actor, ...adminRoles);
      const row = store.get(actor, "invitation", c.req.param("id"));
      if (row.status !== "pending")
        throw new AppError(409, "CONFLICT", "Invitation is not pending");
      const organization = db
        .select()
        .from(organizationLinks)
        .where(eq(organizationLinks.workspaceId, actor.workspaceId))
        .get();
      if (identity.clerk && organization && typeof row.data.providerInvitationId === "string")
        await identity.clerk.organizations.revokeOrganizationInvitation({
          organizationId: organization.organizationId,
          invitationId: row.data.providerInvitationId,
          requestingUserId: actor.id,
        });
      store.patch(row, { status: "revoked" });
      audit.record({
        actor,
        action: "user.invite.revoke",
        targetType: "invitation",
        targetId: row.id,
      });
      return c.body(null, 204);
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
      requireRole(actor, "owner", "admin", "manager");
      const input = c.req.valid("json");
      const member = identity.requireMember(actor.workspaceId, input.userId);
      // Managers grant Mentor/Curator within their own reports only (PRD §6.4).
      if (
        actor.role === "manager" &&
        (!["mentor", "path_curator"].includes(input.type) || member.managerId !== actor.id)
      )
        throw new AppError(
          403,
          "FORBIDDEN",
          "Managers can assign Mentor or Curator to their own reports",
        );
      if (input.scopeType === "project") identity.requireProject(actor, input.scopeId);
      if (input.scopeType === "user") identity.requireMember(actor.workspaceId, input.scopeId);
      if (input.scopeType === "workspace" && input.scopeId !== actor.workspaceId)
        throw new BadRequestError("Invalid workspace scope");
      if (input.scopeType === "section") {
        const [projectId, sectionKey, ...rest] = input.scopeId.split(":");
        if (
          !projectId ||
          !sectionKey ||
          rest.length ||
          !HubSectionKeySchema.safeParse(sectionKey).success
        )
          throw new BadRequestError("Section scope ids use <projectId>:<sectionKey>");
        identity.requireProject(actor, projectId);
      }
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
    .get("/audit", zValidator("query", AuditQuerySchema, validationHook), (c) => {
      const actor = c.get("actor");
      requireRole(actor, ...adminRoles);
      const { limit, offset, action, actorId, targetType, from, to, format } = c.req.valid("query");
      const rows = db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.workspaceId, actor.workspaceId),
            action ? eq(auditLog.action, action) : undefined,
            actorId ? eq(auditLog.actorId, actorId) : undefined,
            targetType ? eq(auditLog.targetType, targetType) : undefined,
          ),
        )
        .orderBy(desc(auditLog.createdAt))
        .all()
        .filter(
          (row) =>
            (!from || row.createdAt >= new Date(from)) && (!to || row.createdAt <= new Date(to)),
        )
        .filter((row) => {
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
        });
      const page = rows.slice(offset, offset + limit);
      if (format === "csv") {
        audit.record({
          actor,
          action: "audit.export",
          targetType: "workspace",
          targetId: actor.workspaceId,
          metadata: { rows: page.length },
        });
        const header = [
          "id",
          "createdAt",
          "actorId",
          "actorName",
          "action",
          "targetType",
          "targetId",
          "projectId",
          "metadata",
          "previousHash",
          "entryHash",
        ];
        const lines = page.map((row) =>
          [
            row.id,
            row.createdAt.toISOString(),
            row.actorId,
            row.actorName,
            row.action,
            row.targetType,
            row.targetId,
            row.projectId,
            row.metadata,
            row.previousHash,
            row.entryHash,
          ]
            .map(csvEscape)
            .join(","),
        );
        return c.text([header.join(","), ...lines].join("\n"), 200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="audit-log.csv"',
        });
      }
      return c.json({ total: rows.length, items: page });
    })
    .get("/continuity/checklists", (c) => {
      const actor = c.get("actor");
      const items = ["owner", "admin"].includes(actor.role)
        ? store.listWhere(actor.workspaceId, "continuity_checklist", {}, 200)
        : store.listOwned(actor, "continuity_checklist");
      return c.json({ items });
    })
    .patch(
      "/continuity/checklists/:id",
      zValidator("json", ChecklistUpdateSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const row = store.get(actor, "continuity_checklist", c.req.param("id"));
        if (row.ownerId !== actor.id && !["owner", "admin"].includes(actor.role))
          throw new NotFoundError("Continuity checklist");
        const input = c.req.valid("json");
        const areas = (Array.isArray(row.data.areas) ? row.data.areas : []) as Array<
          Record<string, unknown>
        >;
        const updatedAreas = areas.map((area) => {
          const change = input.areas.find((entry) => entry.key === area.key);
          if (!change) return area;
          if (change.status === "reassigned") {
            if (!change.assigneeId)
              throw new BadRequestError("assigneeId is required to reassign an area");
            identity.requireMember(actor.workspaceId, change.assigneeId);
            const type = AssignmentTypeSchema.safeParse(area.type);
            const scopeType = AssignmentScopeTypeSchema.safeParse(area.scopeType);
            if (["owner", "admin"].includes(actor.role) && type.success && scopeType.success)
              db.insert(assignments)
                .values({
                  id: randomUUID(),
                  workspaceId: actor.workspaceId,
                  userId: change.assigneeId,
                  type: type.data,
                  scopeType: scopeType.data,
                  scopeId: String(area.scopeId),
                })
                .run();
            return {
              ...area,
              status: "reassigned",
              assigneeId: change.assigneeId,
              reassignedAt: new Date().toISOString(),
            };
          }
          return { ...area, status: "unowned", assigneeId: null };
        });
        const complete = updatedAreas.every((area) => area.status === "reassigned");
        const updated = store.update(actor, row, input.version, {
          status: complete ? "completed" : "open",
          data: { ...row.data, areas: updatedAreas },
        });
        audit.record({
          actor,
          action: "continuity.update",
          targetType: "continuity_checklist",
          targetId: row.id,
        });
        return c.json(updated);
      },
    );
}
