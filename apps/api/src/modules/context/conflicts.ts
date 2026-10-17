import { randomUUID } from "node:crypto";
import type {
  ConflictStatus,
  ContextItem,
  TopicType,
  WorkspaceSettingsState,
} from "@contextos/shared";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { assignments, conflicts, type ConflictRow, type ProjectRow } from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import type { Actor } from "../../types.js";
import type { IdentityService } from "../identity/identity.service.js";
import type { BountyService } from "../platform/bounties.js";
import type { Notifier } from "../platform/notify.js";
import { awardReputation, BASE_POINTS } from "../platform/reputation.js";
import { workspaceSettings } from "../platform/settings.js";
import type { PlatformStore } from "../platform/store.js";
import type { ContextRepository } from "./context.repository.js";
import { detectConflicts } from "./context.service.js";

export interface ConflictDeps {
  db: Db;
  contextRepo: ContextRepository;
  identity: IdentityService;
  store: PlatformStore;
  notifier: Notifier;
  bounties: BountyService;
}

export interface ConflictView {
  id: string;
  projectId: string;
  subjectKey: string;
  subject: string;
  topicType: TopicType;
  status: ConflictStatus;
  members: ContextItem[];
  /** Member ids the viewer cannot see are omitted; count is reported for transparency. */
  memberCount: number;
  canonicalItemId: string | null;
  rationale: string | null;
  autoRule: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  bountyId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Conflict objects (PRD §8.1.4) with authority-based auto-resolution (§8.6.3). */
export function createConflictService({
  db,
  contextRepo,
  identity,
  store,
  notifier,
  bounties,
}: ConflictDeps) {
  const canonicalSourceIds = (workspaceId: string, projectId: string, topic: TopicType) =>
    new Set(
      store
        .listWhere(workspaceId, "canonical_source", { projectId }, 500)
        .filter((row) => row.data.topicType === topic)
        .map((row) => String(row.data.sourceId)),
    );

  const domainOwners = (workspaceId: string, projectId: string) =>
    db
      .select({ userId: assignments.userId })
      .from(assignments)
      .where(
        and(
          eq(assignments.workspaceId, workspaceId),
          eq(assignments.type, "domain_owner"),
          or(
            eq(assignments.scopeId, projectId),
            eq(assignments.scopeId, `${projectId}:current_state`),
            and(eq(assignments.scopeType, "workspace"), eq(assignments.scopeId, workspaceId)),
          ),
          or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
        ),
      )
      .all()
      .map((row) => row.userId);

  const supersede = (projectId: string, loserIds: string[], canonicalId: string) => {
    for (const id of loserIds) {
      const row = contextRepo.findItem(id, projectId);
      if (!row) continue;
      contextRepo.updateItem(id, {
        verification: "superseded",
        data: { ...row.data, supersededBy: canonicalId },
      });
    }
  };

  /**
   * Authority rule: one member outranks the others for the topic (canonical source first,
   * then the workspace ordering) AND its newest evidence is not older. Never recency alone.
   */
  const autoResolve = (
    project: ProjectRow,
    row: ConflictRow,
    settings: WorkspaceSettingsState,
  ): { canonicalId: string; rule: string } | null => {
    const topic = row.topicType;
    const order = settings.authority[topic] ?? [];
    const canonical = canonicalSourceIds(project.workspaceId, project.id, topic);
    const evidence = contextRepo.listEvidenceForItems(row.memberIds);
    const ranked = row.memberIds.map((id) => {
      const refs = evidence.get(id) ?? [];
      let best = 99;
      let bestKind = "unknown";
      let newest: number | null = null;
      for (const ref of refs) {
        const rank = canonical.has(ref.source.id) ? -1 : order.indexOf(ref.source.kind);
        const effective = rank === -1 && !canonical.has(ref.source.id) ? 99 : rank;
        if (effective < best) {
          best = effective;
          bestKind = canonical.has(ref.source.id) ? "canonical source" : ref.source.kind;
        }
        const at = ref.source.sourceCreatedAt?.getTime();
        if (at !== undefined && (newest === null || at > newest)) newest = at;
      }
      return { id, best, bestKind, newest };
    });
    ranked.sort((a, b) => a.best - b.best);
    const [top, second] = ranked;
    if (!top || !second || top.best >= second.best || top.best === 99) return null;
    if (top.newest === null) return null;
    if (ranked.slice(1).some((other) => other.newest !== null && other.newest > top.newest!))
      return null;
    return {
      canonicalId: top.id,
      rule: `${top.bestKind} is authoritative for ${topic.replaceAll("_", " ")}`,
    };
  };

  const openBountyAndNotify = (
    project: ProjectRow,
    row: ConflictRow,
    subject: string,
    settings: WorkspaceSettingsState,
  ) => {
    if (!row.bountyId) {
      const bounty = bounties.createAuto({
        workspaceId: project.workspaceId,
        projectId: project.id,
        origin: "conflict",
        title: `Resolve conflicting claims about "${subject}"`,
        description:
          "Two or more sources disagree. Review the evidence side by side and choose the canonical claim with a rationale.",
        rewardRp: Math.round(BASE_POINTS.resolve_conflict * settings.gamification.basePointScale),
        targetType: "conflict",
        targetId: row.id,
        conflictId: row.id,
        settings,
      });
      db.update(conflicts).set({ bountyId: bounty.id }).where(eq(conflicts.id, row.id)).run();
    }
    for (const userId of domainOwners(project.workspaceId, project.id))
      notifier.notify(project.workspaceId, userId, {
        type: "conflict.detected",
        category: "maintenance",
        title: `Sources disagree about "${subject}" in ${project.name}`,
        link: `/projects/${project.id}`,
        batchKey: `conflicts:${project.id}`,
        projectId: project.id,
      });
  };

  const service = {
    /** Upsert conflict rows from the current claims; called after ingestion and on read. */
    sync(project: ProjectRow): ConflictRow[] {
      const rows = contextRepo.listItems(project.id);
      const detected = detectConflicts(rows);
      const groups = new Map<string, Set<string>>();
      for (const row of rows) {
        const others = detected.get(row.id);
        if (!others?.length) continue;
        const group = groups.get(row.normalizedKey) ?? new Set<string>();
        group.add(row.id);
        for (const other of others) group.add(other);
        groups.set(row.normalizedKey, group);
      }
      const settings = workspaceSettings(db, project.workspaceId);
      const titles = new Map(rows.map((row) => [row.id, row.title]));
      const result: ConflictRow[] = [];
      for (const [subjectKey, members] of groups) {
        const memberIds = [...members].sort();
        const existing = db
          .select()
          .from(conflicts)
          .where(and(eq(conflicts.projectId, project.id), eq(conflicts.subjectKey, subjectKey)))
          .get();
        const subject = titles.get(memberIds[0]!) ?? subjectKey;
        if (!existing) {
          const inserted = db
            .insert(conflicts)
            .values({
              id: randomUUID(),
              projectId: project.id,
              subjectKey,
              memberIds,
              status: "open",
            })
            .returning()
            .get();
          store.emit(project.workspaceId, "conflict.detected", {
            projectId: project.id,
            conflictId: inserted.id,
            claimIds: memberIds,
          });
          const auto = autoResolve(project, inserted, settings);
          if (auto) {
            supersede(
              project.id,
              memberIds.filter((id) => id !== auto.canonicalId),
              auto.canonicalId,
            );
            result.push(
              db
                .update(conflicts)
                .set({
                  status: "auto_resolved",
                  canonicalItemId: auto.canonicalId,
                  autoRule: auto.rule,
                  rationale: `Resolved by rule: ${auto.rule}`,
                  resolvedAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(conflicts.id, inserted.id))
                .returning()
                .get(),
            );
          } else {
            openBountyAndNotify(project, inserted, subject, settings);
            result.push(db.select().from(conflicts).where(eq(conflicts.id, inserted.id)).get()!);
          }
          continue;
        }
        const sameMembers = JSON.stringify(existing.memberIds) === JSON.stringify(memberIds);
        if (sameMembers) {
          result.push(existing);
          continue;
        }
        // New incompatible evidence appeared: reopen a closed conflict with the wider member set.
        const reopened = ["resolved", "accepted_ambiguity", "auto_resolved"].includes(
          existing.status,
        );
        const updated = db
          .update(conflicts)
          .set({
            memberIds,
            status: reopened ? "open" : existing.status,
            autoRule: reopened ? null : existing.autoRule,
            updatedAt: new Date(),
            version: existing.version + 1,
          })
          .where(eq(conflicts.id, existing.id))
          .returning()
          .get();
        if (reopened) openBountyAndNotify(project, updated, subject, settings);
        result.push(updated);
      }
      return result;
    },

    toView(row: ConflictRow, visible: ContextItem[]): ConflictView | null {
      const byId = new Map(visible.map((item) => [item.id, item]));
      // Superseded members are still shown as history inside a conflict view.
      const members = row.memberIds
        .map((id) => byId.get(id))
        .filter((item): item is ContextItem => !!item);
      // Never reveal that restricted evidence exists (PP-2): need at least two visible members.
      if (members.length < 2) return null;
      return {
        id: row.id,
        projectId: row.projectId,
        subjectKey: row.subjectKey,
        subject: members[0]!.title,
        topicType: row.topicType,
        status: row.status,
        members,
        memberCount: row.memberIds.length,
        canonicalItemId: row.canonicalItemId,
        rationale: row.rationale,
        autoRule: row.autoRule,
        resolvedBy: row.resolvedBy,
        resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
        bountyId: row.bountyId,
        version: row.version,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    },

    list(project: ProjectRow, visible: ContextItem[], includeHistory = false): ConflictView[] {
      service.sync(project);
      const order: Record<ConflictStatus, number> = {
        open: 0,
        under_review: 1,
        auto_resolved: 2,
        accepted_ambiguity: 3,
        resolved: 4,
      };
      return db
        .select()
        .from(conflicts)
        .where(eq(conflicts.projectId, project.id))
        .all()
        .map((row) => service.toView(row, visible))
        .filter((view): view is ConflictView => !!view)
        .filter((view) => includeHistory || view.status !== "resolved")
        .sort(
          (a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt),
        );
    },

    get(
      project: ProjectRow,
      id: string,
      visible: ContextItem[],
    ): { row: ConflictRow; view: ConflictView } {
      service.sync(project);
      const row = db
        .select()
        .from(conflicts)
        .where(and(eq(conflicts.id, id), eq(conflicts.projectId, project.id)))
        .get();
      const view = row ? service.toView(row, visible) : null;
      if (!row || !view) throw new NotFoundError("Conflict");
      return { row, view };
    },

    requireResolver(actor: Actor, project: ProjectRow): void {
      if (
        !identity.hasAssignment(actor, "domain_owner", project.id) &&
        !identity.hasAssignment(actor, "domain_owner", `${project.id}:current_state`)
      )
        throw new AppError(403, "FORBIDDEN", "A domain owner assignment is required");
    },

    review(
      actor: Actor,
      project: ProjectRow,
      id: string,
      version: number,
      visible: ContextItem[],
    ): ConflictView {
      service.requireResolver(actor, project);
      const { row } = service.get(project, id, visible);
      if (row.status !== "open")
        throw new AppError(409, "CONFLICT", "Only open conflicts enter review");
      const updated = db
        .update(conflicts)
        .set({ status: "under_review", version: version + 1, updatedAt: new Date() })
        .where(and(eq(conflicts.id, row.id), eq(conflicts.version, version)))
        .returning()
        .get();
      if (!updated) throw new AppError(409, "CONFLICT", "The conflict changed; reload and retry");
      return service.toView(updated, visible)!;
    },

    resolve(
      actor: Actor,
      project: ProjectRow,
      id: string,
      input: {
        version: number;
        outcome: "resolved" | "accepted_ambiguity";
        canonicalItemId?: string;
        rationale: string;
      },
      visible: ContextItem[],
    ): ConflictView {
      service.requireResolver(actor, project);
      const { row, view } = service.get(project, id, visible);
      if (["resolved", "accepted_ambiguity"].includes(row.status))
        throw new AppError(409, "CONFLICT", "This conflict is already closed");
      // PP-9: the resolver must be able to read every member's evidence.
      if (view.members.length !== row.memberIds.length)
        throw new AppError(
          403,
          "FORBIDDEN",
          "You cannot resolve a conflict whose evidence you cannot fully access",
        );
      if (input.outcome === "resolved") {
        if (!input.canonicalItemId || !row.memberIds.includes(input.canonicalItemId))
          throw new BadRequestError("canonicalItemId must be one of the conflicting claims");
      }
      const oldest = Math.min(
        ...view.members.flatMap((member) =>
          member.evidence
            .map((entry) =>
              entry.sourceCreatedAt ? Date.parse(entry.sourceCreatedAt) : Number.NaN,
            )
            .filter(Number.isFinite),
        ),
        Date.now(),
      );
      const ageDays = Math.max(0, (Date.now() - oldest) / 86400000);
      const updated = db.transaction(() => {
        const now = new Date();
        const next = db
          .update(conflicts)
          .set({
            status: input.outcome,
            canonicalItemId: input.outcome === "resolved" ? input.canonicalItemId! : null,
            rationale: input.rationale,
            autoRule: null,
            resolvedBy: actor.id,
            resolvedAt: now,
            updatedAt: now,
            version: input.version + 1,
          })
          .where(and(eq(conflicts.id, row.id), eq(conflicts.version, input.version)))
          .returning()
          .get();
        if (!next) throw new AppError(409, "CONFLICT", "The conflict changed; reload and retry");
        if (input.outcome === "resolved") {
          supersede(
            project.id,
            row.memberIds.filter((memberId) => memberId !== input.canonicalItemId),
            input.canonicalItemId!,
          );
          contextRepo.updateItem(input.canonicalItemId!, { verification: "confirmed" });
        } else {
          for (const memberId of row.memberIds) {
            const item = contextRepo.findItem(memberId, project.id);
            if (item && item.verification !== "superseded")
              contextRepo.updateItem(memberId, {
                verification: "confirmed",
                data: { ...item.data, validInContext: true },
              });
          }
        }
        if (row.bountyId) bounties.cancelAuto(project.workspaceId, row.bountyId);
        awardReputation(db, actor, actor.id, "resolve_conflict", row.id, { ageDays });
        store.event(actor, "conflict.resolved", {
          conflictId: row.id,
          canonicalClaimId: input.canonicalItemId ?? null,
          outcome: input.outcome,
          userId: actor.id,
        });
        return next;
      });
      return service.toView(updated, visible)!;
    },

    dispute(
      actor: Actor,
      project: ProjectRow,
      id: string,
      input: { version: number; reason: string },
      visible: ContextItem[],
    ): ConflictView {
      const { row } = service.get(project, id, visible);
      if (row.status !== "auto_resolved")
        throw new AppError(409, "CONFLICT", "Only rule-resolved conflicts can be disputed");
      const updated = db.transaction(() => {
        const next = db
          .update(conflicts)
          .set({
            status: "open",
            rationale: `Disputed by ${actor.name}: ${input.reason}`,
            autoRule: null,
            updatedAt: new Date(),
            version: input.version + 1,
          })
          .where(and(eq(conflicts.id, row.id), eq(conflicts.version, input.version)))
          .returning()
          .get();
        if (!next) throw new AppError(409, "CONFLICT", "The conflict changed; reload and retry");
        for (const memberId of row.memberIds) {
          const item = contextRepo.findItem(memberId, project.id);
          if (item?.verification === "superseded" && item.data.supersededBy === row.canonicalItemId)
            contextRepo.updateItem(memberId, { verification: "disputed" });
        }
        store.event(actor, "conflict.disputed", { conflictId: row.id, userId: actor.id });
        return next;
      });
      openBountyAndNotify(
        project,
        updated,
        service.toView(updated, visible)?.subject ?? row.subjectKey,
        workspaceSettings(db, project.workspaceId),
      );
      return service.toView(updated, visible)!;
    },
  };
  return service;
}
export type ConflictService = ReturnType<typeof createConflictService>;
