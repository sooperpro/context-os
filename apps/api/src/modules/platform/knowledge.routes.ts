import {
  FlagInputSchema,
  FlagUpdateInputSchema,
  HubSectionKeySchema,
  type HubSectionKey,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { organizationFor } from "../identity/identity.service.js";
import { z } from "zod";
import type { Container } from "../../container.js";
import {
  assignments,
  auditLog,
  contextItems,
  memberships,
  projectMemberships,
  questions,
  users,
} from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { isStaleCandidate, renderClaim, sectionForKind } from "../hub/sections.js";
import { createNotifier } from "./notify.js";
import { createOnboardingRecords } from "./onboarding-records.js";
import { awardReputation, BASE_POINTS } from "./reputation.js";
import { workspaceSettings } from "./settings.js";
import { createPlatformStore, type PlatformRecord } from "./store.js";
import { manages } from "./reports.js";

const CorrectionInput = z
  .object({
    type: z.enum(["contextos_note", "supersede", "source_edit"]),
    text: z.string().trim().min(8).max(10000),
    successorId: z.uuid().optional(),
    /** For `source_edit`: link to the edited source document. */
    sourceUrl: z.url().optional(),
  })
  .strict();
const DecisionInput = z
  .object({
    version: z.number().int().positive(),
    accepted: z.boolean(),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
const FLAGS_PER_DAY = 30;
const OPEN_STATUSES = ["open", "triaged", "in_progress", "pending_verification"];

export function createKnowledgeRoutes(container: Container) {
  const { db, identity, services, audit, repos } = container;
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);
  const visibleItems = (actor: Actor, projectId: string) =>
    services.context.listItems(identity.requireProject(actor, projectId), undefined, actor);
  const activeAssignments = (workspaceId: string, type: "domain_owner", scopeIds: string[]) =>
    db
      .select()
      .from(assignments)
      .where(
        and(
          eq(assignments.workspaceId, workspaceId),
          eq(assignments.type, type),
          or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
        ),
      )
      .all()
      .filter(
        (row) =>
          scopeIds.includes(row.scopeId) ||
          (row.scopeType === "workspace" && row.scopeId === workspaceId),
      );
  /** FR-KM-002: most specific Domain Owner (section → project → workspace), else the hub creator. */
  const routeFlag = (actor: Actor, projectId: string, section: HubSectionKey | null) => {
    const sectionScope = section ? [`${projectId}:${section}`] : [];
    const owners = activeAssignments(actor.workspaceId, "domain_owner", [
      ...sectionScope,
      projectId,
    ]);
    const preferred =
      owners.find((row) => row.scopeType === "section") ??
      owners.find((row) => row.scopeType === "project") ??
      owners.find((row) => row.scopeType === "workspace");
    if (preferred)
      return { userId: preferred.userId, basis: `${preferred.scopeType}_domain_owner` };
    const creator = db
      .select({ actorId: auditLog.actorId })
      .from(auditLog)
      .where(and(eq(auditLog.action, "project.create"), eq(auditLog.targetId, projectId)))
      .get();
    return creator ? { userId: creator.actorId, basis: "hub_owner" } : null;
  };
  const targetExists = (actor: Actor, projectId: string, type: string, targetId: string) => {
    identity.requireProject(actor, projectId);
    if (
      type === "context_item" &&
      !visibleItems(actor, projectId).some((item) => item.id === targetId)
    )
      throw new NotFoundError("Context item");
    if (type === "answer") {
      const answer = db
        .select()
        .from(questions)
        .where(
          and(
            eq(questions.id, targetId),
            eq(questions.projectId, projectId),
            eq(questions.actorId, actor.id),
          ),
        )
        .get();
      const allowed = new Set(identity.visibleSourceIds(actor, projectId));
      if (answer?.sourceIds?.every((id) => allowed.has(id)) !== true)
        throw new NotFoundError("Answer");
    }
    if (type === "overview" && targetId !== projectId)
      throw new BadRequestError("Overview targetId must be the project ID");
    if (type === "section" && !HubSectionKeySchema.safeParse(targetId).success)
      throw new BadRequestError("Section targetId must be a hub section key");
    if (type === "path_item") {
      const [pathId, itemId] = targetId.split(":");
      const path = pathId ? store.find(actor.workspaceId, "learning_path", pathId) : undefined;
      const items = Array.isArray(path?.data.items)
        ? (path.data.items as Array<{ id: string }>)
        : [];
      if (path?.projectId !== projectId || !items.some((item) => item.id === itemId))
        throw new NotFoundError("Learning item");
    }
  };
  const dependencySources = (
    actor: Actor,
    input: { projectId: string; targetType: string; targetId: string },
  ) => {
    if (input.targetType === "context_item")
      return visibleItems(actor, input.projectId)
        .find((item) => item.id === input.targetId)!
        .evidence.map((ref) => ref.sourceObjectId);
    if (input.targetType === "path_item") {
      const [pathId, itemId] = input.targetId.split(":");
      const path = store.find(actor.workspaceId, "learning_path", pathId!)!;
      const item = (
        path.data.items as Array<{ id: string; sourceId?: string; sourceIds?: string[] }>
      ).find((entry) => entry.id === itemId);
      return [...new Set([...(item?.sourceIds ?? []), ...(item?.sourceId ? [item.sourceId] : [])])];
    }
    if (input.targetType === "answer") {
      const answer = db.select().from(questions).where(eq(questions.id, input.targetId)).get();
      return answer?.sourceIds ?? [];
    }
    return identity.visibleSourceIds(actor, input.projectId);
  };
  const requireFlagAccess = (actor: Actor, flag: PlatformRecord) => {
    const allowed = new Set(identity.visibleSourceIds(actor, flag.projectId!));
    const dependencies = flag.data.sourceIds;
    if (
      !Array.isArray(dependencies) ||
      !dependencies.every((id) => typeof id === "string" && allowed.has(id))
    )
      throw new NotFoundError("Flag");
    targetExists(actor, flag.projectId!, String(flag.data.targetType), String(flag.data.targetId));
  };
  const flagKindToAction = (kind: unknown) =>
    kind === "stale" ? "fix_stale" : kind === "incorrect" ? "fix_incorrect" : "add_missing_context";
  const rewardFlagger = (actor: Actor, flag: PlatformRecord, selfLoop: boolean) => {
    if (!selfLoop) awardReputation(db, actor, flag.ownerId, "flag_accepted", flag.id);
    const coReporters = Array.isArray(flag.data.coReporters) ? flag.data.coReporters : [];
    for (const reporter of coReporters)
      if (typeof reporter === "string")
        awardReputation(db, actor, reporter, "flag_coreporter", flag.id);
  };
  const notifyFlagger = (actor: Actor, flag: PlatformRecord, status: string, reason: string) =>
    notifier.notify(actor.workspaceId, flag.ownerId, {
      type: `flag.${status}`,
      category: "maintenance",
      title: `Your flag was ${status.replaceAll("_", " ")}`,
      body: reason,
      link: `/queue/flags/${flag.id}`,
      batchKey: `flags:${flag.ownerId}`,
      projectId: flag.projectId ?? undefined,
    });
  const domainOwnerIds = (workspaceId: string, projectId: string) =>
    activeAssignments(workspaceId, "domain_owner", [projectId]).map((row) => row.userId);
  /** AG-5: A and B verifying each other's work > 5 times in 30 days with no other verifiers. */
  const reciprocal = (actor: Actor, authorId: string) => {
    const since = Date.now() - 30 * 86400000;
    const recent = store
      .listWhere(actor.workspaceId, "correction", {}, 1000)
      .filter(
        (row) => row.updatedAt.getTime() >= since && ["accepted", "rejected"].includes(row.status),
      );
    const approvals = (row: PlatformRecord) =>
      (Array.isArray(row.data.approvals) ? row.data.approvals : []).filter(
        (id): id is string => typeof id === "string",
      );
    const pair = recent.filter(
      (row) =>
        (row.ownerId === authorId && approvals(row).includes(actor.id)) ||
        (row.ownerId === actor.id && approvals(row).includes(authorId)),
    );
    const outsiders = pair.some((row) =>
      approvals(row).some((id) => id !== actor.id && id !== authorId),
    );
    return pair.length >= 5 && !outsiders;
  };

  return new Hono<AppEnv>()
    .post("/flags", zValidator("json", FlagInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      identity.requireProject(actor, input.projectId);
      targetExists(actor, input.projectId, input.targetType, input.targetId);
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const today = store
        .listOwned(actor, "flag", actor.id, 200)
        .filter((row) => row.createdAt >= dayStart).length;
      if (today >= FLAGS_PER_DAY)
        throw new AppError(429, "RATE_LIMITED", "Daily flag limit reached (AG-4)");
      // FR-KM-006: merge into an open flag on the same target and credit the co-reporter.
      const duplicate = store
        .listWhere(actor.workspaceId, "flag", { projectId: input.projectId }, 500)
        .find(
          (row) =>
            OPEN_STATUSES.includes(row.status) &&
            row.data.targetType === input.targetType &&
            row.data.targetId === input.targetId &&
            row.data.kind === input.kind &&
            row.ownerId !== actor.id,
        );
      if (duplicate) {
        const coReporters = (
          Array.isArray(duplicate.data.coReporters) ? duplicate.data.coReporters : []
        ) as string[];
        const merged = coReporters.includes(actor.id)
          ? duplicate
          : store.patch(duplicate, {
              data: { ...duplicate.data, coReporters: [...coReporters, actor.id] },
            });
        return c.json({ ...merged, merged: true }, 200);
      }
      const section: HubSectionKey | null =
        input.targetType === "context_item"
          ? sectionForKind(
              visibleItems(actor, input.projectId).find((item) => item.id === input.targetId)!.kind,
            )
          : input.targetType === "section"
            ? (input.targetId as HubSectionKey)
            : input.targetType === "overview"
              ? "overview"
              : null;
      const routedTo = routeFlag(actor, input.projectId, section);
      const row = store.create(
        actor,
        "flag",
        {
          ...input,
          sourceIds: dependencySources(actor, input),
          coReporters: [],
          routedTo,
          section,
        },
        { projectId: input.projectId, status: "open" },
      );
      store.event(actor, "flag.created", {
        flagId: row.id,
        projectId: input.projectId,
        type: input.kind,
        flaggedBy: actor.id,
      });
      audit.record({ actor, action: "flag.create", targetType: "flag", targetId: row.id });
      if (routedTo && routedTo.userId !== actor.id)
        notifier.notify(actor.workspaceId, routedTo.userId, {
          type: "flag.routed",
          category: "maintenance",
          title: `A ${input.kind.replaceAll("_", " ")} flag was routed to you`,
          link: `/queue/flags/${row.id}`,
          batchKey: `flags-routed:${routedTo.userId}`,
          projectId: input.projectId,
        });
      return c.json(row, 201);
    })
    .get("/flags/queue", (c) => {
      const actor = c.get("actor");
      const now = new Date();
      const items = store
        .list(actor, "flag", 200)
        .filter(
          (flag) =>
            flag.ownerId === actor.id ||
            (flag.data.routedTo as { userId?: string } | null)?.userId === actor.id ||
            (flag.projectId &&
              flag.data.targetType !== "answer" &&
              identity.hasAssignment(actor, "domain_owner", flag.projectId)),
        )
        .filter((flag) => {
          try {
            requireFlagAccess(actor, flag);
            return true;
          } catch {
            return false;
          }
        });
      const ownedProjects = services.projects
        .list(actor)
        .filter((project) => identity.hasAssignment(actor, "domain_owner", project.id));
      const staleCandidates = ownedProjects.flatMap((project) =>
        visibleItems(actor, project.id)
          .filter((item) => isStaleCandidate(item, now))
          .map((item) => ({ projectId: project.id, ...renderClaim(item, now) })),
      );
      const conflicts = ownedProjects.flatMap((project) => {
        const row = repos.projects.findById(project.id, actor.workspaceId)!;
        return services.conflicts
          .list(row, visibleItems(actor, project.id))
          .filter((conflict) => ["open", "under_review", "auto_resolved"].includes(conflict.status))
          .map((conflict) => ({
            ...conflict,
            members: conflict.members.map((member) => member.id),
          }));
      });
      const bounties = (() => {
        try {
          return services.bounties.list(actor, { status: "open", limit: 20, offset: 0 });
        } catch {
          return [] as PlatformRecord[];
        }
      })();
      return c.json({ items, staleCandidates, conflicts, bounties });
    })
    .get("/flags/:id", (c) => {
      const actor = c.get("actor");
      const row = store.get(actor, "flag", c.req.param("id"));
      const routed = (row.data.routedTo as { userId?: string } | null)?.userId === actor.id;
      if (
        row.ownerId !== actor.id &&
        !routed &&
        !identity.hasAssignment(actor, "domain_owner", row.projectId!)
      )
        throw new NotFoundError("Flag");
      requireFlagAccess(actor, row);
      return c.json({ ...row, corrections: store.listChildren(actor, "correction", row.id) });
    })
    .patch("/flags/:id", zValidator("json", FlagUpdateInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const row = store.get(actor, "flag", c.req.param("id"));
      identity.requireAssignment(actor, "domain_owner", row.projectId!);
      requireFlagAccess(actor, row);
      const input = c.req.valid("json");
      const transitions: Record<string, string[]> = {
        open: ["triaged", "duplicate", "rejected", "bounty_created"],
        triaged: ["in_progress", "rejected", "bounty_created"],
        in_progress: ["resolved", "rejected"],
        pending_verification: ["rejected"],
      };
      if (!transitions[row.status]?.includes(input.status))
        throw new AppError(409, "CONFLICT", "Invalid flag transition");
      if (input.status === "rejected" && !input.reason)
        throw new BadRequestError("A rejection reason is required");
      if (input.status === "duplicate" && input.duplicateOfId)
        store.get(actor, "flag", input.duplicateOfId);
      const settings = workspaceSettings(db, actor.workspaceId);
      const updated = db.transaction(() => {
        let bountyId: string | null = null;
        if (input.status === "bounty_created") {
          const action =
            row.data.kind === "conflicting" ? "resolve_conflict" : flagKindToAction(row.data.kind);
          const bounty = services.bounties.createAuto({
            workspaceId: actor.workspaceId,
            projectId: row.projectId!,
            origin: "flag",
            title: `Fix: ${String(row.data.kind).replaceAll("_", " ")} ${String(row.data.targetType).replaceAll("_", " ")}`,
            description:
              typeof row.data.comment === "string" && row.data.comment
                ? row.data.comment
                : "Resolve the flagged knowledge gap.",
            rewardRp:
              input.rewardRp ??
              Math.round(BASE_POINTS[action] * settings.gamification.basePointScale),
            targetType: String(row.data.targetType),
            targetId: String(row.data.targetId),
            flagId: row.id,
            settings,
          });
          bountyId = bounty.id;
          rewardFlagger(actor, row, false);
        }
        const next = store.update(actor, row, input.version, {
          status: input.status,
          data: {
            ...row.data,
            resolutionReason: input.reason,
            resolvedBy: actor.id,
            duplicateOfId: input.duplicateOfId ?? null,
            bountyId: bountyId ?? row.data.bountyId ?? null,
          },
        });
        if (input.status === "resolved") {
          rewardFlagger(actor, row, false);
          store.event(actor, "flag.resolved", {
            flagId: row.id,
            resolution: "manual",
            resolverId: actor.id,
          });
        }
        return next;
      });
      if (["resolved", "rejected", "duplicate", "bounty_created"].includes(input.status))
        notifyFlagger(actor, row, input.status, input.reason);
      audit.record({
        actor,
        action: "flag.update",
        targetType: "flag",
        targetId: row.id,
        metadata: { status: updated.status },
      });
      return c.json(updated);
    })
    .post("/flags/:id/corrections", zValidator("json", CorrectionInput, validationHook), (c) => {
      const actor = c.get("actor");
      const flag = store.get(actor, "flag", c.req.param("id"));
      const input = c.req.valid("json");
      identity.requireProject(actor, flag.projectId!);
      requireFlagAccess(actor, flag);
      if (!OPEN_STATUSES.includes(flag.status))
        throw new AppError(409, "CONFLICT", "This flag is closed");
      if (
        input.type === "supersede" &&
        (!input.successorId ||
          !visibleItems(actor, flag.projectId!).some((item) => item.id === input.successorId))
      )
        throw new BadRequestError("Select an accessible successor claim");
      if (input.type === "source_edit" && !input.sourceUrl)
        throw new BadRequestError("Link the edited source document");
      const correction = db.transaction(() => {
        const created = store.create(
          actor,
          "correction",
          { ...input, approvals: [], targetId: flag.data.targetId },
          { projectId: flag.projectId!, parentId: flag.id, status: "pending" },
        );
        if (flag.status !== "pending_verification")
          store.patch(flag, {
            status: "pending_verification",
            data: { ...flag.data, correctionId: created.id },
          });
        return created;
      });
      for (const ownerId of domainOwnerIds(actor.workspaceId, flag.projectId!))
        if (ownerId !== actor.id)
          notifier.notify(actor.workspaceId, ownerId, {
            type: "correction.pending",
            category: "maintenance",
            title: "A correction needs your verification",
            link: `/queue/flags/${flag.id}`,
            batchKey: `corrections:${ownerId}`,
            projectId: flag.projectId ?? undefined,
          });
      return c.json(correction, 201);
    })
    .post("/corrections/:id/verify", zValidator("json", DecisionInput, validationHook), (c) => {
      const actor = c.get("actor");
      const row = store.get(actor, "correction", c.req.param("id"));
      const input = c.req.valid("json");
      identity.requireProject(actor, row.projectId!);
      if (row.ownerId === actor.id)
        throw new AppError(403, "FORBIDDEN", "You cannot verify your own correction");
      if (row.status !== "pending")
        throw new AppError(409, "CONFLICT", "Correction is no longer pending");
      // Guests don't verify knowledge (PRD §6.4).
      if (actor.role === "guest")
        throw new AppError(403, "FORBIDDEN", "Guests can't verify corrections");
      const flag = store.get(actor, "flag", row.parentId!);
      requireFlagAccess(actor, flag);
      const domainOwner = identity.hasAssignment(actor, "domain_owner", row.projectId!);
      const assignedOwner = domainOwnerIds(actor.workspaceId, row.projectId!).length > 0;
      if (
        !domainOwner &&
        (assignedOwner ||
          !db
            .select()
            .from(projectMemberships)
            .where(
              and(
                eq(projectMemberships.projectId, row.projectId!),
                eq(projectMemberships.userId, actor.id),
              ),
            )
            .get())
      )
        throw new AppError(
          403,
          "FORBIDDEN",
          "An assigned domain owner or independent project reviewer is required",
        );
      const approvals = Array.isArray(row.data.approvals)
        ? row.data.approvals.filter((id): id is string => typeof id === "string")
        : [];
      if (approvals.includes(actor.id))
        throw new AppError(409, "CONFLICT", "This reviewer already approved");
      if (!input.accepted && !domainOwner)
        throw new AppError(403, "FORBIDDEN", "Only a domain owner can reject a correction");
      const accepted = input.accepted && (domainOwner || approvals.length >= 1);
      // AG-9: a manager verifying a direct report counts at 0.75 unless they are the Domain Owner.
      const author = db
        .select()
        .from(memberships)
        .where(
          and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.userId, row.ownerId)),
        )
        .get();
      const quality = domainOwner
        ? author?.managerId === actor.id && !assignedOwner
          ? 0.75
          : 1
        : 0.75;
      const hold = reciprocal(actor, row.ownerId)
        ? {
            rule: "AG-5",
            reason: "Reciprocal verification pattern detected; an admin will review this award",
          }
        : undefined;
      const result = db.transaction(() => {
        const updated = store.update(actor, row, input.version, {
          status: !input.accepted ? "rejected" : accepted ? "accepted" : "pending",
          data: { ...row.data, approvals: [...approvals, actor.id], reason: input.reason },
        });
        if (!input.accepted) {
          store.patch(flag, { status: "in_progress", data: { ...flag.data, correctionId: null } });
          notifier.notify(actor.workspaceId, row.ownerId, {
            type: "correction.rejected",
            category: "maintenance",
            title: "Your correction was not accepted",
            body: input.reason,
            link: `/queue/flags/${flag.id}`,
            projectId: flag.projectId ?? undefined,
          });
        }
        if (accepted) {
          if (row.data.type === "supersede") {
            const successor = String(row.data.successorId);
            const target = db
              .select()
              .from(contextItems)
              .where(
                and(
                  eq(contextItems.id, String(row.data.targetId)),
                  eq(contextItems.projectId, row.projectId!),
                ),
              )
              .get();
            db.update(contextItems)
              .set({
                verification: "superseded",
                updatedAt: new Date(),
                data: { ...(target?.data ?? {}), supersededBy: successor },
              })
              .where(
                and(
                  eq(contextItems.id, String(row.data.targetId)),
                  eq(contextItems.projectId, row.projectId!),
                ),
              )
              .run();
          } else if (row.data.type === "contextos_note")
            services.sources.create(actor, identity.requireProject(actor, row.projectId!), {
              kind: "note",
              title: "Verified correction",
              content: String(row.data.text),
              visibility: "restricted",
            });
          store.patch(flag, { status: "resolved", data: { ...flag.data, correctionId: row.id } });
          store.event(actor, "flag.resolved", {
            flagId: flag.id,
            correctionId: row.id,
            resolverId: actor.id,
          });
          const selfLoop = flag.ownerId === row.ownerId;
          rewardFlagger(actor, flag, selfLoop);
          const target = db
            .select()
            .from(contextItems)
            .where(eq(contextItems.id, String(row.data.targetId)))
            .get();
          const ageDays = target ? (Date.now() - target.updatedAt.getTime()) / 86400000 : 0;
          awardReputation(db, actor, row.ownerId, flagKindToAction(flag.data.kind), row.id, {
            quality,
            selfLoop,
            ageDays,
            hold,
          });
          notifyFlagger(actor, flag, "resolved", input.reason);
        }
        return updated;
      });
      audit.record({
        actor,
        action: "correction.verify",
        targetType: "correction",
        targetId: row.id,
        metadata: { accepted },
      });
      return c.json(result);
    })
    .get("/projects/:projectId/decisions", (c) =>
      c.json({
        items: visibleItems(c.get("actor"), c.req.param("projectId")).filter(
          (item) => item.kind === "decision",
        ),
      }),
    )
    .get("/projects/:projectId/decisions/:id", (c) => {
      const row = visibleItems(c.get("actor"), c.req.param("projectId")).find(
        (item) => item.id === c.req.param("id") && item.kind === "decision",
      );
      if (!row) throw new NotFoundError("Decision");
      return c.json(row);
    })
    .get("/projects/:projectId/timeline", (c) =>
      c.json({
        items: visibleItems(c.get("actor"), c.req.param("projectId")).filter(
          (item) => item.kind === "event" || item.kind === "decision",
        ),
      }),
    )
    .get("/projects/:projectId/current-state", (c) =>
      c.json({
        items: visibleItems(c.get("actor"), c.req.param("projectId")).filter(
          (item) =>
            item.kind === "status_claim" && !["stale", "superseded"].includes(item.verification),
        ),
      }),
    )
    .get("/people/:id", (c) => {
      const actor = c.get("actor");
      if (actor.role === "guest")
        throw new AppError(403, "FORBIDDEN", "Directory access is not permitted");
      const member = identity.requireMember(actor.workspaceId, c.req.param("id"));
      const user = db.select().from(users).where(eq(users.id, member.userId)).get();
      if (!user) throw new NotFoundError("Member");
      // The onboarding card is for the person's manager only (role access spec §4.5); People Ops
      // reads it from their own routes, and admins get no people data.
      const managedByActor = manages(db, actor, member.userId);
      let onboarding: { startedOn: string; status: string } | null = null;
      if (managedByActor) {
        const onboardingRecords = createOnboardingRecords(container);
        const record = onboardingRecords.recordFor(actor, member.userId);
        if (record && !onboardingRecords.recordData(record).probation.decision) {
          const view = onboardingRecords.evaluate(record);
          onboarding = { startedOn: view.data.startDate, status: view.status };
        }
      }
      return c.json({
        id: user.id,
        name: user.name,
        role: member.role,
        organization: organizationFor(actor, member),
        onboarding,
        // Every active ownership, at any scope: the People profile lists project and section
        // ownership too, so the directory can infer expertise from it.
        assignments: db
          .select()
          .from(assignments)
          .where(
            and(
              eq(assignments.workspaceId, actor.workspaceId),
              eq(assignments.userId, user.id),
              eq(assignments.type, "domain_owner"),
              or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
            ),
          )
          .all(),
      });
    });
}
