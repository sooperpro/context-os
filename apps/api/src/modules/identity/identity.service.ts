import { randomUUID } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import type { AssignmentType, ProjectStats } from "@contextos/shared";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/index.js";
import {
  assignments,
  contextItems,
  evidence,
  memberships,
  organizationLinks,
  platformRecords,
  projectMemberships,
  projects,
  questions,
  sourceAccess,
  sourceObjects,
  users,
  workspaces,
} from "../../db/schema.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import type { Actor } from "../../types.js";

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
      role?: "admin" | "manager" | "member" | "guest";
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
    visibleSourceIds(actor: Actor, projectId: string): string[] {
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
      return db
        .select({ id: sourceObjects.id })
        .from(sourceObjects)
        .where(
          and(
            eq(sourceObjects.projectId, projectId),
            or(eq(sourceObjects.visibility, "workspace"), inArray(sourceObjects.id, grants)),
          ),
        )
        .all()
        .map((source) => source.id);
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
