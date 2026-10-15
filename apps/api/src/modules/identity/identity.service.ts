import { randomUUID } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import type { AssignmentType, ProjectStats } from "@contextos/shared";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/index.js";
import {
  assignments,
  contextItems,
  departments,
  evidence,
  memberships,
  organizationLinks,
  platformRecords,
  projectMemberships,
  projects,
  questions,
  sourceAccess,
  sourceObjects,
  teams,
  users,
  workspaces,
} from "../../db/schema.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import type { Actor } from "../../types.js";

/** A workspace access policy (role access spec §4.8): who may open a project or a synced folder. */
export interface AccessPolicyRecord {
  id: string;
  name: string;
  /** restrict: only `groups` can open it. exclude: never used in answers, and only `groups` can open it. */
  effect: "restrict" | "exclude";
  groups: string[];
  sources: Array<{ kind: "project" | "folder"; id: string }>;
  updatedAt: Date;
}

/** Policy records as stored in `platform_records` (kind `access_policy`). */
export function readAccessPolicies(db: Db, workspaceId: string): AccessPolicyRecord[] {
  return db
    .select()
    .from(platformRecords)
    .where(
      and(
        eq(platformRecords.workspaceId, workspaceId),
        eq(platformRecords.kind, "access_policy"),
        eq(platformRecords.status, "active"),
      ),
    )
    .all()
    .map((row) => ({
      id: row.id,
      name: typeof row.data.name === "string" ? row.data.name : "Policy",
      effect: row.data.effect === "exclude" ? ("exclude" as const) : ("restrict" as const),
      groups: Array.isArray(row.data.groups) ? row.data.groups.map(String) : [],
      sources: Array.isArray(row.data.sources)
        ? (row.data.sources as Array<{ kind: string; id: string }>)
            .filter((entry) => entry && (entry.kind === "project" || entry.kind === "folder"))
            .map((entry) => ({ kind: entry.kind as "project" | "folder", id: String(entry.id) }))
        : [],
      updatedAt: row.updatedAt,
    }));
}

/** Groups a member belongs to: their team and department names (from the org structure). */
export function memberGroups(db: Db, workspaceId: string, userId: string): string[] {
  const membership = db
    .select({ organization: memberships.organization })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
    .get();
  const organization = membership?.organization ?? {};
  const names: string[] = [];
  if (typeof organization.teamId === "string") {
    const team = db
      .select({ name: teams.name })
      .from(teams)
      .where(and(eq(teams.workspaceId, workspaceId), eq(teams.id, organization.teamId)))
      .get();
    if (team) names.push(team.name);
  }
  if (typeof organization.departmentId === "string") {
    const department = db
      .select({ name: departments.name })
      .from(departments)
      .where(
        and(
          eq(departments.workspaceId, workspaceId),
          eq(departments.id, organization.departmentId),
        ),
      )
      .get();
    if (department) names.push(department.name);
  }
  return names;
}

/**
 * The policies that cover a source, given its project and the synced folder it came from. Several
 * policies may cover one source: until an admin resolves that conflict, the more open rule wins
 * (anyone in any covering policy's groups may open it).
 */
export function policiesCovering(
  policies: AccessPolicyRecord[],
  projectId: string,
  scopeId: unknown,
): AccessPolicyRecord[] {
  return policies.filter((policy) =>
    policy.sources.some((entry) =>
      entry.kind === "project" ? entry.id === projectId : entry.id === scopeId,
    ),
  );
}

export function requireRole(actor: Actor, ...roles: Array<Actor["role"]>): void {
  if (!roles.includes(actor.role))
    throw new AppError(403, "FORBIDDEN", "This operation is not permitted");
}

export function createIdentityService(db: Db, env: Env, devActor: Actor) {
  let refreshSourceAccess: ((actor: Actor) => Promise<void>) | undefined;
  const clerk =
    env.AUTH_MODE === "clerk"
      ? createClerkClient({
          secretKey: env.CLERK_SECRET_KEY,
          publishableKey: env.CLERK_PUBLISHABLE_KEY,
        })
      : null;
  const member = (actor: Actor) =>
    db
      .select()
      .from(memberships)
      .where(and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.userId, actor.id)))
      .get();
  /** Apply a pending invitation (role, department, team, manager, start date) on first sign-in. */
  const acceptInvitation = (workspaceId: string, userId: string) => {
    const email = db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .get()?.email;
    if (!email) return;
    const invitation = db
      .select()
      .from(platformRecords)
      .where(
        and(
          eq(platformRecords.workspaceId, workspaceId),
          eq(platformRecords.kind, "invitation"),
          eq(platformRecords.status, "pending"),
        ),
      )
      .all()
      .find((row) => row.data.email === email.toLowerCase());
    if (!invitation) return;
    const data = invitation.data as {
      role?: "admin" | "manager" | "hr" | "member" | "guest";
      departmentId?: string;
      teamId?: string;
      managerId?: string;
      startDate?: string;
      isNewHire?: boolean;
    };
    db.update(memberships)
      .set({
        role: data.role ?? "member",
        managerId: data.managerId ?? null,
        organization: {
          ...(data.departmentId ? { departmentId: data.departmentId } : {}),
          ...(data.teamId ? { teamId: data.teamId } : {}),
          ...(data.startDate ? { startDate: data.startDate } : {}),
          isNewHire: data.isNewHire ?? false,
        },
      })
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
      .run();
    db.update(platformRecords)
      .set({
        status: "accepted",
        data: { ...invitation.data, acceptedBy: userId, acceptedAt: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .where(eq(platformRecords.id, invitation.id))
      .run();
  };
  const service = {
    setSourceVerifier(verify: (actor: Actor) => Promise<void>) {
      refreshSourceAccess = verify;
    },
    async refreshSourceAccess(actor: Actor) {
      await refreshSourceAccess?.(actor);
    },
    async authenticate(request: Request, allowWorkspaceCreation = false): Promise<Actor> {
      if (!clerk) {
        const membership = member(devActor);
        if (
          membership?.status !== "active" ||
          (membership.guestExpiresAt && membership.guestExpiresAt <= new Date())
        )
          throw new AppError(403, "FORBIDDEN", "Membership is inactive or expired");
        return { ...devActor, role: membership.role };
      }
      const state = await clerk.authenticateRequest(request, {
        authorizedParties: env.CORS_ORIGINS,
        acceptsToken: "session_token",
      });
      const auth = state.toAuth();
      if (!auth?.userId) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue");
      const profile = await clerk.users.getUser(auth.userId);
      db.insert(users)
        .values({
          id: auth.userId,
          name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Member",
          email: profile.emailAddresses.find((entry) => entry.id === profile.primaryEmailAddressId)
            ?.emailAddress,
        })
        .onConflictDoNothing()
        .run();
      if (allowWorkspaceCreation)
        return {
          id: auth.userId,
          name: db.select().from(users).where(eq(users.id, auth.userId)).get()!.name,
          workspaceId: "",
          role: "member",
          sessionId: auth.sessionId,
        };
      if (!auth.orgId) throw new AppError(403, "FORBIDDEN", "Select a workspace organization");
      // Verify current membership instead of trusting an old session role after removal.
      const providerMemberships = await clerk.users.getOrganizationMembershipList({
        userId: auth.userId,
        limit: 100,
      });
      const providerMember = providerMemberships.data.find(
        (entry) => entry.organization.id === auth.orgId,
      );
      if (!providerMember) throw new AppError(403, "FORBIDDEN", "Workspace membership is required");
      let link = db
        .select()
        .from(organizationLinks)
        .where(eq(organizationLinks.organizationId, auth.orgId))
        .get();
      if (!link) {
        if (providerMember.role !== "org:admin")
          throw new AppError(
            403,
            "FORBIDDEN",
            "An organization admin must initialize the workspace",
          );
        const workspaceId = randomUUID();
        db.transaction((tx) => {
          tx.insert(workspaces)
            .values({ id: workspaceId, name: providerMember.organization.name })
            .run();
          tx.insert(organizationLinks).values({ organizationId: auth.orgId!, workspaceId }).run();
          tx.insert(memberships).values({ workspaceId, userId: auth.userId, role: "owner" }).run();
        });
        link = { organizationId: auth.orgId, workspaceId };
      }
      const inserted = db
        .insert(memberships)
        .values({
          workspaceId: link.workspaceId,
          userId: auth.userId,
          role: providerMember.role === "org:admin" ? "admin" : "member",
        })
        .onConflictDoNothing()
        .returning()
        .get();
      // First sign-in after accepting an invitation applies the requested role and org data.
      if (inserted) acceptInvitation(link.workspaceId, auth.userId);
      const actor: Actor = {
        id: auth.userId,
        name: db.select().from(users).where(eq(users.id, auth.userId)).get()!.name,
        workspaceId: link.workspaceId,
        role: "member",
        sessionId: auth.sessionId,
      };
      const membership = member(actor);
      if (
        membership?.status !== "active" ||
        (membership.guestExpiresAt && membership.guestExpiresAt <= new Date())
      )
        throw new AppError(403, "FORBIDDEN", "Membership is inactive or expired");
      return { ...actor, role: membership.role };
    },
    requireProject(actor: Actor, projectId: string) {
      const project = db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.workspaceId, actor.workspaceId)))
        .get();
      if (!project) throw new NotFoundError("Project");
      if (
        actor.role === "guest" &&
        !db
          .select()
          .from(projectMemberships)
          .where(
            and(
              eq(projectMemberships.projectId, projectId),
              eq(projectMemberships.userId, actor.id),
            ),
          )
          .get()
      )
        throw new NotFoundError("Project");
      return project;
    },
    hasAssignment(actor: Actor, type: AssignmentType, scopeId: string): boolean {
      return !!db
        .select()
        .from(assignments)
        .where(
          and(
            eq(assignments.workspaceId, actor.workspaceId),
            eq(assignments.userId, actor.id),
            eq(assignments.type, type),
            or(
              eq(assignments.scopeId, scopeId),
              and(
                eq(assignments.scopeType, "workspace"),
                eq(assignments.scopeId, actor.workspaceId),
              ),
            ),
            or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
          ),
        )
        .get();
    },
    requireAssignment(actor: Actor, type: AssignmentType, scopeId: string): void {
      if (!service.hasAssignment(actor, type, scopeId))
        throw new AppError(
          403,
          "FORBIDDEN",
          `A ${type.replaceAll("_", " ")} assignment is required`,
        );
    },
    /**
     * The identity provider's member list for a workspace (its Clerk organization) and seat limit;
     * null when sign-in has no directory (development mode).
     */
    async directory(workspaceId: string): Promise<{
      seatLimit: number | null;
      members: Array<{ userId: string; name: string; email: string | null; admin: boolean }>;
    } | null> {
      if (!clerk) return null;
      const link = db
        .select()
        .from(organizationLinks)
        .where(eq(organizationLinks.workspaceId, workspaceId))
        .get();
      if (!link) return { seatLimit: null, members: [] };
      const organization = await clerk.organizations.getOrganization({
        organizationId: link.organizationId,
      });
      const members: Array<{ userId: string; name: string; email: string | null; admin: boolean }> =
        [];
      for (let offset = 0; ; offset += 100) {
        const page = await clerk.organizations.getOrganizationMembershipList({
          organizationId: link.organizationId,
          limit: 100,
          offset,
        });
        for (const entry of page.data) {
          const profile = entry.publicUserData;
          if (!profile?.userId) continue;
          members.push({
            userId: profile.userId,
            name:
              [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
              profile.identifier ||
              "Member",
            email: profile.identifier.includes("@") ? profile.identifier : null,
            admin: entry.role === "org:admin",
          });
        }
        if (page.data.length < 100) break;
      }
      return {
        seatLimit:
          organization.maxAllowedMemberships > 0 ? organization.maxAllowedMemberships : null,
        members,
      };
    },
    /**
     * Sources the actor may open in a project: the source's own permissions (mirrored, or shared
     * with the workspace), narrowed by the workspace's access policies. Admins get no bypass.
     */
    visibleSourceIds(actor: Actor, projectId: string): string[] {
      return service.policyFilteredSources(actor, projectId).visible;
    },
    /** Sources answers may draw on: the visible ones minus anything an exclude policy covers. */
    answerableSourceIds(actor: Actor, projectId: string): string[] {
      return service.policyFilteredSources(actor, projectId).answerable;
    },
    policyFilteredSources(actor: Actor, projectId: string) {
      service.requireProject(actor, projectId);
      const grants = db
        .select({ id: sourceAccess.sourceId })
        .from(sourceAccess)
        .where(
          and(
            eq(sourceAccess.userId, actor.id),
            or(isNull(sourceAccess.expiresAt), gt(sourceAccess.expiresAt, new Date())),
          ),
        );
      const rows = db
        .select({ id: sourceObjects.id, metadata: sourceObjects.metadata })
        .from(sourceObjects)
        .where(
          and(
            eq(sourceObjects.projectId, projectId),
            or(eq(sourceObjects.visibility, "workspace"), inArray(sourceObjects.id, grants)),
          ),
        )
        .all();
      const policies = readAccessPolicies(db, actor.workspaceId);
      if (!policies.length) {
        const ids = rows.map((row) => row.id);
        return { visible: ids, answerable: ids };
      }
      const groups = new Set(memberGroups(db, actor.workspaceId, actor.id));
      const visible: string[] = [];
      const answerable: string[] = [];
      for (const row of rows) {
        const covering = policiesCovering(policies, projectId, row.metadata?.scopeId);
        if (
          covering.length &&
          !covering.some((policy) => policy.groups.some((group) => groups.has(group)))
        )
          continue;
        visible.push(row.id);
        if (!covering.some((policy) => policy.effect === "exclude")) answerable.push(row.id);
      }
      return { visible, answerable };
    },
    requireSource(actor: Actor, projectId: string, sourceId: string): void {
      if (!service.visibleSourceIds(actor, projectId).includes(sourceId))
        throw new NotFoundError("Source");
    },
    statsFor(actor: Actor, projectId: string): ProjectStats {
      const allowed = new Set(service.visibleSourceIds(actor, projectId));
      const sources = allowed.size
        ? db
            .select()
            .from(sourceObjects)
            .where(inArray(sourceObjects.id, [...allowed]))
            .all()
        : [];
      const ready = new Set(
        sources.filter((source) => source.status === "ready").map((source) => source.id),
      );
      const items = db
        .select({ id: contextItems.id, data: contextItems.data })
        .from(contextItems)
        .where(eq(contextItems.projectId, projectId))
        .all();
      const supported = items.filter((item) => {
        const refs = db.select().from(evidence).where(eq(evidence.contextItemId, item.id)).all();
        const dependencies = item.data._generationSources ?? refs.map((ref) => ref.sourceObjectId);
        return (
          refs.length > 0 &&
          Array.isArray(dependencies) &&
          dependencies.length > 0 &&
          dependencies.every((id) => typeof id === "string" && ready.has(id)) &&
          refs.every((ref) => ref.quoteVerified && ready.has(ref.sourceObjectId))
        );
      });
      const ownQuestions = db
        .select()
        .from(questions)
        .where(and(eq(questions.projectId, projectId), eq(questions.actorId, actor.id)))
        .all()
        .filter((row) => row.sourceIds?.every((id) => allowed.has(id)) === true);
      const dates = sources
        .map((source) => source.processedAt)
        .filter((date): date is Date => !!date)
        .sort((a, b) => b.getTime() - a.getTime());
      return {
        sources: sources.length,
        readySources: sources.filter((source) => source.status === "ready").length,
        contextItems: supported.length,
        questions: ownQuestions.length,
        lastProcessedAt: dates[0]?.toISOString() ?? null,
      };
    },
    requireMemberOptional(workspaceId: string, userId: string) {
      const row = db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.userId, userId),
            eq(memberships.status, "active"),
          ),
        )
        .get();
      return row && (!row.guestExpiresAt || row.guestExpiresAt > new Date()) ? row : undefined;
    },
    requireMember(workspaceId: string, userId: string) {
      const row = db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.userId, userId),
            eq(memberships.status, "active"),
          ),
        )
        .get();
      if (!row || (row.guestExpiresAt && row.guestExpiresAt <= new Date()))
        throw new NotFoundError("Active workspace member");
      return row;
    },
    clerk,
  };
  return service;
}
export type IdentityService = ReturnType<typeof createIdentityService>;
