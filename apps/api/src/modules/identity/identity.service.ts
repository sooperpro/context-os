import type { AssignmentType, ProjectStats } from "@contextos/shared";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  assignments,
  authSessions,
  contextItems,
  departments,
  evidence,
  memberships,
  platformRecords,
  projectMemberships,
  projects,
  questions,
  sourceAccess,
  sourceObjects,
  ssoProviders,
  teams,
  users,
  workspaces,
} from "../../db/schema.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import type { Actor } from "../../types.js";
import type { Auth } from "../auth/auth.js";

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

/** Organization fields anyone in the workspace may see (the rest, like a last day, is HR/admin data). */
const PUBLIC_ORGANIZATION_KEYS = [
  "departmentId",
  "teamId",
  "jobTitle",
  "roleFamily",
  "location",
  "timezone",
] as const;
/** How long after (or before) their start date someone counts as a new joiner in the directory. */
const NEW_JOINER_DAYS = 90;

const isNewJoiner = (organization: Record<string, unknown>) => {
  if (organization.isNewHire === true) return true;
  if (typeof organization.startDate !== "string") return false;
  const age = Date.now() - Date.parse(`${organization.startDate}T00:00:00Z`);
  return Number.isFinite(age) && Math.abs(age) <= NEW_JOINER_DAYS * 86_400_000;
};

/**
 * A member's organization as a viewer may see it: everything for admins, People Ops, the person
 * and their manager; only the public profile fields for everyone else. A start date is onboarding
 * record data (role access spec §3), so others learn only whether someone is a new joiner, which
 * the directory's "New joiners" filter needs.
 */
export function organizationFor(
  viewer: Pick<Actor, "id" | "role">,
  member: { userId: string; managerId: string | null; organization: Record<string, unknown> },
): Record<string, unknown> {
  if (
    viewer.role === "owner" ||
    viewer.role === "admin" ||
    viewer.role === "hr" ||
    viewer.id === member.userId ||
    viewer.id === member.managerId
  )
    return member.organization;
  const visible: Record<string, unknown> = Object.fromEntries(
    PUBLIC_ORGANIZATION_KEYS.flatMap((key) =>
      key in member.organization ? [[key, member.organization[key]]] : [],
    ),
  );
  if (isNewJoiner(member.organization)) visible.isNewHire = true;
  return visible;
}

export function requireRole(actor: Actor, ...roles: Array<Actor["role"]>): void {
  if (!roles.includes(actor.role))
    throw new AppError(403, "FORBIDDEN", "This operation is not permitted");
}

export function createIdentityService(db: Db, devActor: Actor, auth: Auth | null) {
  const member = (actor: Pick<Actor, "id" | "workspaceId">) =>
    db
      .select()
      .from(memberships)
      .where(and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.userId, actor.id)))
      .get();
  const isActive = (membership: ReturnType<typeof member>) =>
    membership?.status === "active" &&
    (!membership.guestExpiresAt || membership.guestExpiresAt > new Date());
  const profileName = (userId: string, fallback: string) =>
    db.select({ name: users.name }).from(users).where(eq(users.id, userId)).get()?.name ?? fallback;

  /**
   * Apply pending invitations for a verified email, in every workspace that sent one: membership with
   * the requested role, department, team, manager and start date.
   */
  const acceptInvitations = (userId: string, email: string): number => {
    const address = email.toLowerCase();
    const pending = db
      .select()
      .from(platformRecords)
      .where(and(eq(platformRecords.kind, "invitation"), eq(platformRecords.status, "pending")))
      .all()
      .filter(
        (row) =>
          row.data.email === address &&
          (typeof row.data.expiresAt !== "string" || new Date(row.data.expiresAt) > new Date()),
      );
    for (const invitation of pending) {
      const data = invitation.data as {
        role?: "admin" | "manager" | "hr" | "member" | "guest";
        jobTitle?: string;
        departmentId?: string;
        teamId?: string;
        managerId?: string;
        startDate?: string;
        isNewHire?: boolean;
        projectIds?: string[];
      };
      const role = data.role ?? ("member" as const);
      // Projects deleted since the invitation was sent are skipped.
      const projectIds = data.projectIds?.length
        ? db
            .select({ id: projects.id })
            .from(projects)
            .where(
              and(
                eq(projects.workspaceId, invitation.workspaceId),
                inArray(projects.id, data.projectIds),
              ),
            )
            .all()
            .map((row) => row.id)
        : [];
      // Guests always expire (PRD §6.5, at most 180 days): the invitation's date, or 90 days.
      const requested =
        typeof invitation.data.guestExpiresAt === "string"
          ? new Date(invitation.data.guestExpiresAt)
          : null;
      const values = {
        role,
        guestExpiresAt:
          role === "guest"
            ? requested &&
              requested > new Date() &&
              requested.getTime() <= Date.now() + 180 * 86_400_000
              ? requested
              : new Date(Date.now() + 90 * 86_400_000)
            : null,
        managerId: data.managerId ?? null,
        organization: {
          ...(data.jobTitle ? { jobTitle: data.jobTitle } : {}),
          ...(data.departmentId ? { departmentId: data.departmentId } : {}),
          ...(data.teamId ? { teamId: data.teamId } : {}),
          ...(data.startDate ? { startDate: data.startDate } : {}),
          isNewHire: data.isNewHire ?? false,
        },
      };
      db.transaction((tx) => {
        tx.insert(memberships)
          .values({ workspaceId: invitation.workspaceId, userId, ...values })
          .onConflictDoUpdate({
            target: [memberships.workspaceId, memberships.userId],
            set: values,
          })
          .run();
        for (const projectId of projectIds)
          tx.insert(projectMemberships).values({ projectId, userId }).onConflictDoNothing().run();
        tx.update(platformRecords)
          .set({
            status: "accepted",
            data: { ...invitation.data, acceptedBy: userId, acceptedAt: new Date().toISOString() },
            updatedAt: new Date(),
          })
          .where(eq(platformRecords.id, invitation.id))
          .run();
      });
    }
    return pending.length;
  };

  /** Whether a session may act in a workspace that requires company SSO. Owners keep a fallback. */
  const ssoSatisfied = (
    workspaceId: string,
    role: Actor["role"],
    authMethod: string | null | undefined,
  ): boolean => {
    const workspace = db
      .select({ ssoEnforced: workspaces.ssoEnforced })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .get();
    if (!workspace?.ssoEnforced || role === "owner") return true;
    if (!authMethod?.startsWith("sso:")) return false;
    return !!db
      .select({ id: ssoProviders.id })
      .from(ssoProviders)
      .where(
        and(
          eq(ssoProviders.providerId, authMethod.slice("sso:".length)),
          eq(ssoProviders.organizationId, workspaceId),
          eq(ssoProviders.domainVerified, true),
        ),
      )
      .get();
  };

  const service = {
    auth,
    /** The signed-in session and its user, or null (always null in development mode). */
    async readSession(request: Request) {
      if (!auth) return null;
      return auth.api.getSession({ headers: request.headers });
    },
    /**
     * Resolve the acting user for a request: the verified session, its active workspace and a current,
     * active membership there. Routes that work before a workspace is chosen (session, workspace
     * creation) pass `allowWithoutWorkspace` and receive an actor with an empty workspace id.
     */
    async authenticate(request: Request, allowWithoutWorkspace = false): Promise<Actor> {
      if (!auth) {
        const membership = member(devActor);
        if (!isActive(membership))
          throw new AppError(403, "FORBIDDEN", "Membership is inactive or expired");
        return { ...devActor, role: membership!.role };
      }
      const result = await auth.api.getSession({ headers: request.headers });
      if (!result) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue");
      const { session, user } = result;
      const base = {
        id: user.id,
        name: profileName(user.id, user.name),
        sessionId: session.id,
      };
      const workspaceId = session.activeWorkspaceId;
      const membership = workspaceId ? member({ id: user.id, workspaceId }) : undefined;
      if (!workspaceId || !isActive(membership)) {
        if (allowWithoutWorkspace) return { ...base, workspaceId: "", role: "member" };
        throw new AppError(403, "WORKSPACE_REQUIRED", "Choose a workspace to continue");
      }
      if (!ssoSatisfied(workspaceId, membership!.role, session.authMethod)) {
        if (allowWithoutWorkspace) return { ...base, workspaceId: "", role: "member" };
        throw new AppError(
          403,
          "SSO_REQUIRED",
          "This workspace requires signing in with your company's single sign-on",
        );
      }
      return { ...base, workspaceId, role: membership!.role };
    },
    acceptInvitations,
    ssoSatisfied,
    /** Workspaces a user may act in, with their role in each. */
    workspacesFor(userId: string) {
      return db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
          role: memberships.role,
          status: memberships.status,
          guestExpiresAt: memberships.guestExpiresAt,
        })
        .from(memberships)
        .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
        .where(eq(memberships.userId, userId))
        .all()
        .filter(
          (row) =>
            row.status === "active" && (!row.guestExpiresAt || row.guestExpiresAt > new Date()),
        )
        .map(({ id, name, slug, role }) => ({ id, name, slug, role }));
    },
    /** Point a session at a workspace; the caller has checked membership. */
    setActiveWorkspace(sessionId: string, workspaceId: string | null) {
      db.update(authSessions)
        .set({ activeWorkspaceId: workspaceId, updatedAt: new Date() })
        .where(eq(authSessions.id, sessionId))
        .run();
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
      // Guests are limited to the projects they were added to and never verify, curate or mentor.
      if (actor.role === "guest") return false;
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
              // A workspace-wide assignment covers every project, but a mentor is always for one
              // named person.
              type === "mentor"
                ? undefined
                : and(
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
     * The external directory's member list for a workspace and its seat limit. Sign-in is our own and
     * there is no directory feed yet (SCIM), so this is null: members come from invitations and SSO.
     */
    directory(_workspaceId: string): Promise<{
      seatLimit: number | null;
      members: Array<{ userId: string; name: string; email: string | null; admin: boolean }>;
    } | null> {
      return Promise.resolve(null);
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
  };
  return service;
}
export type IdentityService = ReturnType<typeof createIdentityService>;
