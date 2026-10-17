import { randomUUID } from "node:crypto";
import {
  AssignmentInputSchema,
  AssignmentScopeTypeSchema,
  AssignmentTypeSchema,
  ContinuityUpdateInputSchema,
  HubSectionKeySchema,
  InviteInputSchema,
  PageQuerySchema,
  ProfileUpdateSchema,
  SourceAccessInputSchema,
  UserDirectoryQuerySchema,
  UserUpdateSchema,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, count, desc, eq, inArray, like, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import {
  assignments,
  auditLog,
  connectorConnections,
  departments,
  domainEvents,
  identityLinks,
  memberships,
  oauthStates,
  projectMemberships,
  projects,
  sourceAccess,
  sourceObjects,
  teams,
  users,
  workspaces,
} from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { createNotifier, type NotificationInput } from "../platform/notify.js";
import { ledgerSummary } from "../platform/reputation.js";
import { resolveSettings, workspaceSettings } from "../platform/settings.js";
import { createPlatformStore, type PlatformRecord } from "../platform/store.js";
import { auditRowFor } from "../audit/audit.service.js";
import { sendInvitationEmail } from "../auth/invitations.js";
import { organizationFor, personalProfileOf, requireRole } from "./identity.service.js";

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
  const nameOf = (userId: string) =>
    db.select({ name: users.name }).from(users).where(eq(users.id, userId)).get()?.name ?? userId;
  /** What a responsibility covers, in words for the person who holds it (N-12). */
  const describeAssignment = (
    actor: Actor,
    row: { type: string; scopeType: string; scopeId: string },
  ) => {
    const projectId =
      row.scopeType === "project"
        ? row.scopeId
        : row.scopeType === "section"
          ? row.scopeId.split(":")[0]
          : undefined;
    const project = projectId
      ? db
          .select({ name: projects.name })
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.workspaceId, actor.workspaceId)))
          .get()
      : undefined;
    const where = project?.name ?? (row.scopeType === "workspace" ? "the whole workspace" : null);
    const role =
      row.type === "domain_owner"
        ? "a knowledge owner"
        : row.type === "path_curator"
          ? "a tutorial curator"
          : row.type === "department_head"
            ? "a department head"
            : null;
    return role && where
      ? { role, where, link: project ? `/projects/${projectId}` : "/knowledge" }
      : null;
  };
  /** Tells someone about a change an admin made to them or their team, never the admin (N-12). */
  const tell = (actor: Actor, to: string | null | undefined, input: NotificationInput) => {
    if (to && to !== actor.id) notifier.notify(actor.workspaceId, to, input);
  };
  const personRef = (actor: Actor, userId: string) => {
    const member = identity.requireMemberOptional(actor.workspaceId, userId);
    const title = member?.organization.jobTitle;
    return { id: userId, name: nameOf(userId), title: typeof title === "string" ? title : null };
  };
  /** A hand-over checklist: its manager and admins only; 404 for everyone else. */
  const checklistFor = (actor: Actor, id: string) => {
    const row = store.get(actor, "continuity_checklist", id);
    if (row.ownerId !== actor.id && !["owner", "admin"].includes(actor.role))
      throw new NotFoundError("Continuity checklist");
    return row;
  };
  const ASSIGNMENT_LABEL: Record<string, string> = {
    mentor: "Mentor",
    domain_owner: "Domain owner",
    path_curator: "Path curator",
    bounty_sponsor: "Bounty sponsor",
    department_head: "Department head",
    rewards_approver: "Rewards approver",
    review_cycle_admin: "Review cycle admin",
  };
  const projectName = (actor: Actor, projectId: string) =>
    db
      .select({ name: projects.name })
      .from(projects)
      .where(and(eq(projects.workspaceId, actor.workspaceId), eq(projects.id, projectId)))
      .get()?.name ?? "A deleted project";
  const scopeLabel = (actor: Actor, scopeType: unknown, scopeId: string) => {
    if (scopeType === "workspace") return "The whole workspace";
    if (scopeType === "project") return projectName(actor, scopeId);
    if (scopeType === "user") return nameOf(scopeId);
    if (scopeType === "section") {
      const [projectId = "", section = ""] = scopeId.split(":");
      return `${projectName(actor, projectId)} · ${section.replaceAll("_", " ")}`;
    }
    return scopeId;
  };
  const checklistView = (actor: Actor, row: PlatformRecord) => {
    const areas = (Array.isArray(row.data.areas) ? row.data.areas : []) as Array<
      Record<string, unknown>
    >;
    return {
      id: row.id,
      version: row.version,
      status: row.status === "completed" ? "completed" : "open",
      leaver: personRef(actor, String(row.data.leaverId)),
      createdAt: row.createdAt.toISOString(),
      areas: areas.map((area) => ({
        key: String(area.key),
        type: ASSIGNMENT_LABEL[String(area.type)] ?? String(area.type),
        scope: scopeLabel(actor, area.scopeType, String(area.scopeId)),
        status: area.status === "reassigned" ? "reassigned" : "unowned",
        assignee: typeof area.assigneeId === "string" ? personRef(actor, area.assigneeId) : null,
        granted: area.granted === true,
      })),
      canGrant: ["owner", "admin"].includes(actor.role),
    };
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
      const row = db.select().from(users).where(eq(users.id, actor.id)).get();
      if (!row) throw new NotFoundError("User");
      return c.json({
        ...row,
        profile: personalProfileOf(row.preferences, membership.organization),
        role: actor.role,
        workspaceId: actor.workspaceId,
        managerId: membership.managerId,
        organization: membership.organization,
        // When a guest's access ends (null for everyone else).
        guestExpiresAt: membership.guestExpiresAt?.toISOString() ?? null,
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
      const { name, pronouns, location, bio, skills, avatarShape, ...settings } =
        c.req.valid("json");
      const row = db.select().from(users).where(eq(users.id, actor.id)).get();
      if (!row) throw new NotFoundError("User");
      const membership = identity.requireMember(actor.workspaceId, actor.id);
      // Profile fields join what the first-day welcome stored (preferred name, known topics).
      const own = Object.fromEntries(
        Object.entries({
          pronouns,
          location,
          bio,
          skills: skills?.filter(
            (skill, index) =>
              skills.findIndex(
                (other) => other.toLocaleLowerCase() === skill.toLocaleLowerCase(),
              ) === index,
          ),
        }).filter(([, value]) => value !== undefined),
      );
      const { avatarShape: _previousShape, ...withoutShape } = row.preferences;
      const preferences = {
        ...(avatarShape === undefined ? row.preferences : withoutShape),
        ...settings,
        ...(avatarShape ? { avatarShape } : {}),
        ...(Object.keys(own).length
          ? {
              profile: {
                ...(typeof row.preferences.profile === "object" ? row.preferences.profile : {}),
                ...own,
                updatedAt: new Date().toISOString(),
              },
            }
          : {}),
      };
      // The directory shows the workspace's location, so a new one is written there too.
      const { location: _previousLocation, ...organizationRest } = membership.organization;
      const organization =
        location === undefined
          ? membership.organization
          : location
            ? { ...organizationRest, location }
            : organizationRest;
      const updated = db.transaction(() => {
        if (location !== undefined)
          db.update(memberships)
            .set({ organization })
            .where(
              and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.userId, actor.id)),
            )
            .run();
        return db
          .update(users)
          .set({ name: name ?? row.name, preferences })
          .where(eq(users.id, actor.id))
          .returning()
          .get();
      });
      return c.json({ ...updated, profile: personalProfileOf(updated.preferences, organization) });
    })
    .get("/users", zValidator("query", UserDirectoryQuerySchema, validationHook), (c) => {
      const actor = c.get("actor");
      if (actor.role === "guest")
        throw new AppError(403, "FORBIDDEN", "Directory access is not permitted");
      const { limit, offset, q, role, status, departmentId, teamId } = c.req.valid("query");
      // Who is suspended or leaving is for admins; everyone else lists active members.
      if (status && status !== "active" && !["owner", "admin"].includes(actor.role))
        throw new AppError(403, "FORBIDDEN", "Only admins can list members who aren't active");
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
            !`${user.name} ${user.email ?? ""} ${typeof organization.jobTitle === "string" ? organization.jobTitle : ""} ${personalProfileOf(user.preferences).skills.join(" ")}`
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
          organization: organizationFor(actor, {
            userId: user.id,
            managerId: membership.managerId,
            organization: membership.organization,
          }),
          // What they chose to show the directory (Settings › Profile); bio is on their profile.
          profile: (({ pronouns, skills, avatarShape }) => ({ pronouns, skills, avatarShape }))(
            personalProfileOf(user.preferences, membership.organization),
          ),
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
      // Nobody changes their own role (role access spec §1 and §4.8).
      if (userId === actor.id && input.role !== undefined && input.role !== target.role)
        throw new AppError(403, "FORBIDDEN", "You can't change your own role");
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
              title: `Hand over ${nameOf(userId)}'s responsibilities`,
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
      const name = nameOf(userId);
      if (input.managerId !== undefined && input.managerId !== target.managerId) {
        const person = { type: "manager.changed", category: "system" } as const;
        tell(actor, userId, {
          ...person,
          title: input.managerId
            ? `You now report to ${nameOf(input.managerId)}`
            : "You no longer have a manager in ContextOS",
          link: "/",
        });
        tell(actor, input.managerId, {
          ...person,
          title: `${name} now reports to you`,
          link: `/team/${userId}`,
        });
        tell(actor, target.managerId, {
          ...person,
          title: `${name} no longer reports to you`,
          link: `/people/${userId}`,
        });
      }
      // Offboarding already gives the manager a hand-over checklist; a suspended person can't be told.
      if (input.status && input.status !== target.status && input.status !== "offboarded") {
        const back = input.status === "active";
        tell(actor, updated.managerId, {
          type: `user.${input.status}`,
          category: "system",
          title: back ? `${name} has access again` : `${name}'s access was suspended`,
          ...(back ? { link: `/team/${userId}` } : {}),
        });
        if (back)
          tell(actor, userId, {
            type: "user.active",
            category: "security",
            title: "Your access to the workspace is back",
            link: "/",
          });
      }
      if (lastDay && lastDay !== target.organization.lastDay) {
        tell(actor, userId, {
          type: "offboarding.last_day",
          category: "system",
          title: `Your last day is set for ${lastDay}`,
          body: "Hand over what you own before you go.",
          link: "/",
        });
        tell(actor, updated.managerId, {
          type: "offboarding.last_day",
          category: "system",
          title: `${name}'s last day is ${lastDay}`,
          link: `/team/${userId}`,
        });
      }
      if (
        updated.role === "guest" &&
        expires &&
        expires.getTime() !== target.guestExpiresAt?.getTime()
      )
        tell(actor, userId, {
          type: "guest.expiry_changed",
          category: "security",
          title: `Your guest access now ends on ${expires.toISOString().slice(0, 10)}`,
          link: "/settings",
        });
      return c.json(updated);
    })
    .post("/users/invite", zValidator("json", InviteInputSchema, validationHook), async (c) => {
      const actor = c.get("actor");
      // Members and roles are admin work; managers get none (role access spec §3, decision 3).
      requireRole(actor, ...adminRoles);
      const body = c.req.valid("json");
      const invitations = "invitations" in body ? body.invitations : [body];
      // Check every row before sending any, so a bad row in a bulk list leaves nothing half-sent.
      for (const invitation of invitations) {
        if (invitation.managerId) identity.requireMember(actor.workspaceId, invitation.managerId);
        if (invitation.projectIds?.length) {
          // Only guests are added project by project; everyone else sees the workspace's projects.
          if (invitation.role !== "guest")
            throw new BadRequestError("Only guests are invited into specific projects");
          for (const projectId of invitation.projectIds) identity.requireProject(actor, projectId);
        }
        if (invitation.departmentId) {
          const department = db
            .select({ id: departments.id })
            .from(departments)
            .where(
              and(
                eq(departments.workspaceId, actor.workspaceId),
                eq(departments.id, invitation.departmentId),
              ),
            )
            .get();
          if (!department) throw new BadRequestError("That department does not exist");
        }
        if (invitation.teamId) {
          const team = db
            .select({ departmentId: teams.departmentId })
            .from(teams)
            .where(and(eq(teams.workspaceId, actor.workspaceId), eq(teams.id, invitation.teamId)))
            .get();
          if (!team) throw new BadRequestError("That team does not exist");
          if (invitation.departmentId && team.departmentId !== invitation.departmentId)
            throw new BadRequestError("That team is not in the chosen department");
        }
        if (invitation.templateId && !invitation.isNewHire)
          throw new BadRequestError("Only a new hire gets an onboarding template");
        if (invitation.templateId) {
          const template = store.find(
            actor.workspaceId,
            "onboarding_template",
            invitation.templateId,
          );
          const data = template?.data as
            | {
                archivedAt?: string | null;
                publishedVersion: number | null;
                generation?: { state: string };
              }
            | undefined;
          if (
            !data ||
            data.archivedAt ||
            (data.publishedVersion === null && data.generation?.state === "failed")
          )
            throw new BadRequestError("Choose a published template or one waiting for review");
        }
      }
      const results: Array<Record<string, unknown>> = [];
      for (const invitation of invitations) {
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
        const delivery = await sendInvitationEmail(container, actor, email);
        const row = store.create(
          actor,
          "invitation",
          {
            ...invitation,
            email,
            expiresAt: new Date(Date.now() + INVITATION_DAYS * 86400000).toISOString(),
          },
          { status: "pending" },
        );
        audit.record({ actor, action: "user.invite", targetType: "invitation", targetId: row.id });
        results.push({
          email,
          status: "pending",
          invitationId: row.id,
          requestedRole: invitation.role,
          delivery,
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
    .delete("/users/invitations/:id", (c) => {
      const actor = c.get("actor");
      requireRole(actor, ...adminRoles);
      const row = store.get(actor, "invitation", c.req.param("id"));
      if (row.status !== "pending")
        throw new AppError(409, "CONFLICT", "Invitation is not pending");
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
      // Responsibilities are granted by admins; managers get no member or role powers (role access
      // spec §3, decision 3).
      requireRole(actor, ...adminRoles);
      const input = c.req.valid("json");
      const member = identity.requireMember(actor.workspaceId, input.userId);
      // A mentor follows one person's onboarding and check-ins (people data): always one named
      // learner, never yourself (admin rights don't grant people data, Spec §3).
      if (input.type === "mentor") {
        if (input.scopeType !== "user")
          throw new BadRequestError("A mentor is assigned to one person (scopeType user)");
        if (input.userId === actor.id)
          throw new AppError(403, "FORBIDDEN", "You can't make yourself someone's mentor");
        if (input.userId === input.scopeId)
          throw new BadRequestError("Someone can't mentor themselves");
      }
      // Guests see only the projects they were added to; they never own, curate or mentor.
      if (member.role === "guest") throw new BadRequestError("Guests can't hold assignments");
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
      if (row.type === "mentor") {
        tell(actor, row.userId, {
          type: "assignment.mentor",
          category: "onboarding",
          title: `You're now mentoring ${nameOf(row.scopeId)}`,
          link: `/people/${row.scopeId}`,
        });
        tell(actor, row.scopeId, {
          type: "assignment.mentor",
          category: "onboarding",
          title: `${nameOf(row.userId)} is now your mentor`,
          link: `/people/${row.userId}`,
        });
      } else {
        const what = describeAssignment(actor, row);
        if (what)
          tell(actor, row.userId, {
            type: `assignment.${row.type}`,
            category: "maintenance",
            title: `You're now ${what.role} for ${what.where}`,
            link: what.link,
          });
      }
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
      const what =
        removed.type === "mentor"
          ? { role: "mentoring", where: nameOf(removed.scopeId) }
          : describeAssignment(actor, removed);
      if (what)
        tell(actor, removed.userId, {
          type: `assignment.${removed.type}.removed`,
          category: "maintenance",
          title:
            removed.type === "mentor"
              ? `You're no longer mentoring ${what.where}`
              : `You're no longer ${what.role} for ${what.where}`,
        });
      return c.body(null, 204);
    })
    .get("/users/:id/projects", (c) => {
      const actor = c.get("actor");
      requireRole(actor, ...adminRoles);
      const userId = c.req.param("id");
      identity.requireMember(actor.workspaceId, userId);
      // The projects someone was added to one by one: what a guest can see.
      return c.json({
        items: db
          .select({ id: projects.id, name: projects.name })
          .from(projectMemberships)
          .innerJoin(projects, eq(projects.id, projectMemberships.projectId))
          .where(
            and(eq(projectMemberships.userId, userId), eq(projects.workspaceId, actor.workspaceId)),
          )
          .orderBy(projects.name)
          .all(),
      });
    })
    .post(
      "/projects/:projectId/memberships",
      zValidator("json", ProjectMemberSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireRole(actor, ...adminRoles);
        const projectId = c.req.param("projectId");
        const project = identity.requireProject(actor, projectId);
        const { userId } = c.req.valid("json");
        identity.requireMember(actor.workspaceId, userId);
        const added = db
          .insert(projectMemberships)
          .values({ projectId, userId })
          .onConflictDoNothing()
          .returning()
          .get();
        if (added) {
          audit.record({
            actor,
            projectId,
            action: "project.member.add",
            targetType: "user",
            targetId: userId,
          });
          tell(actor, userId, {
            type: "project.member_added",
            category: "system",
            title: `You were added to ${project.name}`,
            link: `/projects/${projectId}`,
            projectId,
          });
        }
        return c.json(added ?? { projectId, userId }, 201);
      },
    )
    .delete("/projects/:projectId/memberships/:userId", (c) => {
      const actor = c.get("actor");
      requireRole(actor, ...adminRoles);
      const { projectId, userId } = c.req.param();
      const project = identity.requireProject(actor, projectId);
      const removed = db
        .delete(projectMemberships)
        .where(
          and(eq(projectMemberships.projectId, projectId), eq(projectMemberships.userId, userId)),
        )
        .returning()
        .get();
      if (!removed) throw new NotFoundError("Project membership");
      audit.record({
        actor,
        projectId,
        action: "project.member.remove",
        targetType: "user",
        targetId: userId,
      });
      tell(actor, userId, {
        type: "project.member_removed",
        category: "system",
        title: `You no longer have access to ${project.name}`,
      });
      return c.body(null, 204);
    })
    .get("/projects/:projectId/sources/:sourceId/access", (c) => {
      const actor = c.get("actor");
      requireRole(actor, ...adminRoles);
      const { projectId, sourceId } = c.req.param();
      identity.requireSource(actor, projectId, sourceId);
      // People it was shared with one by one; connected sources follow their provider instead.
      return c.json({
        items: db
          .select({
            userId: sourceAccess.userId,
            name: users.name,
            expiresAt: sourceAccess.expiresAt,
          })
          .from(sourceAccess)
          .innerJoin(users, eq(users.id, sourceAccess.userId))
          .where(eq(sourceAccess.sourceId, sourceId))
          .all()
          .filter((row) => !row.expiresAt || row.expiresAt > new Date())
          .map((row) => ({ ...row, expiresAt: row.expiresAt?.toISOString() ?? null })),
      });
    })
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
        // Often the answer to their access request (learner.routes.ts); tell them either way.
        tell(actor, input.userId, {
          type: "source.access_granted",
          category: "system",
          title: `You can now open "${source.title}"`,
          link: `/projects/${projectId}/sources`,
          projectId,
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
      requireRole(actor, ...adminRoles, "hr");
      const { limit, offset, action, actorId, targetType, from, to, format } = c.req.valid("query");
      // HR sees the People Ops trail only (role access spec §3): onboarding and probation events,
      // including template publishes and employment decisions. Role, access and connector changes
      // stay with admins. The scope is part of the query, so no filter can widen it.
      const hrScope =
        actor.role === "hr"
          ? or(
              like(auditLog.action, "onboarding.%"),
              like(auditLog.action, "probation.%"),
              // Changes to people's job title, team or manager are People Ops work too.
              eq(auditLog.action, "user.organization.update"),
            )
          : undefined;
      const rows = db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.workspaceId, actor.workspaceId),
            hrScope,
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
      // A CSV export holds the whole range (up to 10,000 rows), not one page.
      const page = (
        format === "csv" ? rows.slice(0, 10_000) : rows.slice(offset, offset + limit)
      ).map((row) => auditRowFor(actor, row));
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
    .get("/continuity/checklists/:id", (c) => {
      const actor = c.get("actor");
      return c.json(checklistView(actor, checklistFor(actor, c.req.param("id"))));
    })
    .patch(
      "/continuity/checklists/:id",
      zValidator("json", ContinuityUpdateInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const row = checklistFor(actor, c.req.param("id"));
        const canGrant = ["owner", "admin"].includes(actor.role);
        const input = c.req.valid("json");
        const areas = (Array.isArray(row.data.areas) ? row.data.areas : []) as Array<
          Record<string, unknown>
        >;
        const granted: Array<{ userId: string; type: string; scopeType: string; scopeId: string }> =
          [];
        const updatedAreas = areas.map((area) => {
          const change = input.areas.find((entry) => entry.key === area.key);
          if (!change) return area;
          if (change.status === "reassigned") {
            if (!change.assigneeId)
              throw new BadRequestError("assigneeId is required to reassign an area");
            identity.requireMember(actor.workspaceId, change.assigneeId);
            const already = area.granted === true && area.assigneeId === change.assigneeId;
            const type = AssignmentTypeSchema.safeParse(area.type);
            const scopeType = AssignmentScopeTypeSchema.safeParse(area.scopeType);
            // Only admins grant responsibilities; a manager's pick waits for one to apply it.
            const grant = canGrant && !already && type.success && scopeType.success;
            if (grant)
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
            if (grant)
              granted.push({
                userId: change.assigneeId,
                type: type.data,
                scopeType: scopeType.data,
                scopeId: String(area.scopeId),
              });
            return {
              ...area,
              status: "reassigned",
              assigneeId: change.assigneeId,
              granted: already || grant,
              reassignedAt: new Date().toISOString(),
            };
          }
          return { ...area, status: "unowned", assigneeId: null, granted: false };
        });
        const complete = updatedAreas.every(
          (area) => area.status === "reassigned" && area.granted === true,
        );
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
        if (updatedAreas.some((area) => area.status === "reassigned" && area.granted !== true))
          notifier.notifyAdmins(actor.workspaceId, {
            type: "offboarding.continuity_pending",
            category: "system",
            title: `${actor.name} picked new owners for ${nameOf(String(row.data.leaverId))}'s responsibilities`,
            body: "Apply them to hand the responsibilities over.",
            link: `/continuity/checklists/${row.id}`,
          });
        // The new owners hear what they took over; the manager hears when an admin applied it.
        const leaver = nameOf(String(row.data.leaverId));
        for (const area of granted) {
          const what = describeAssignment(actor, area);
          tell(actor, area.userId, {
            type: "offboarding.continuity_assigned",
            category: "maintenance",
            title: what
              ? `You're now ${what.role} for ${what.where}, taking over from ${leaver}`
              : `You took over a responsibility from ${leaver}`,
            ...(what ? { link: what.link } : {}),
          });
        }
        if (granted.length)
          tell(actor, row.ownerId, {
            type: "offboarding.continuity_applied",
            category: "system",
            title: `New owners for ${leaver}'s responsibilities are in place`,
            link: `/continuity/checklists/${row.id}`,
          });
        return c.json(checklistView(actor, updated));
      },
    );
}
