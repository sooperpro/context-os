import type { BountyStatus, WorkspaceSettingsState } from "@contextos/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { platformRecords } from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import type { Actor } from "../../types.js";
import type { IdentityService } from "../identity/identity.service.js";
import type { Notifier } from "./notify.js";
import { awardReputation, ledgerSummary } from "./reputation.js";
import { workspaceSettings } from "./settings.js";
import type { PlatformRecord, PlatformStore } from "./store.js";

export const SYSTEM_USER_ID = "system";
const CLAIM_DAYS = 7;

export interface BountyDeps {
  db: Db;
  identity: IdentityService;
  store: PlatformStore;
  notifier: Notifier;
}

export interface AutoBountyInput {
  workspaceId: string;
  projectId: string;
  origin: "conflict" | "stale" | "gap" | "ownership" | "flag";
  title: string;
  description: string;
  rewardRp: number;
  targetType: string;
  targetId: string;
  flagId?: string;
  conflictId?: string;
  settings?: WorkspaceSettingsState;
}

/** Bounty lifecycle per PRD §8.1.3 with the anti-gaming rules of §8.3. */
export function createBountyService({ db, identity, store, notifier }: BountyDeps) {
  const reserved = (workspaceId: string, exceptId?: string) =>
    db
      .select()
      .from(platformRecords)
      .where(and(eq(platformRecords.workspaceId, workspaceId), eq(platformRecords.kind, "bounty")))
      .all()
      .filter((row) => ["open", "claimed", "submitted"].includes(row.status) && row.id !== exceptId)
      .reduce((sum, row) => sum + Number(row.data.rewardRp ?? 0), 0);
  const checkBudget = (workspaceId: string, rewardRp: number, settings: WorkspaceSettingsState) => {
    const budget = settings.gamification.bountyBudgetRp;
    if (budget > 0 && reserved(workspaceId) + rewardRp > budget)
      throw new AppError(409, "CONFLICT", "The workspace bounty budget is exhausted");
  };
  /** Lazy expiry: deadlines and claim windows are evaluated on read. */
  const refresh = (row: PlatformRecord, now = new Date()): PlatformRecord => {
    if (
      row.status === "open" &&
      typeof row.data.deadline === "string" &&
      Date.parse(row.data.deadline) < now.getTime()
    )
      return store.patch(row, { status: "expired" });
    if (
      row.status === "claimed" &&
      typeof row.data.claimExpiresAt === "string" &&
      Date.parse(row.data.claimExpiresAt) < now.getTime()
    )
      return store.patch(row, {
        status: "open",
        data: {
          ...row.data,
          claimantId: null,
          claimedAt: null,
          claimExpiresAt: null,
          extended: false,
        },
      });
    return row;
  };
  const canEarn = (actor: Actor, settings: WorkspaceSettingsState) =>
    actor.role !== "guest" || settings.gamification.guestsCanEarn;
  const isVerifier = (actor: Actor, row: PlatformRecord) =>
    actor.id === row.data.verifierId ||
    (row.data.sponsorId !== SYSTEM_USER_ID && actor.id === row.data.sponsorId) ||
    actor.role === "owner" ||
    actor.role === "admin" ||
    identity.hasAssignment(actor, "domain_owner", String(row.data.projectId));

  const service = {
    canSponsor(actor: Actor, rewardRp: number, projectId: string): boolean {
      if (actor.role === "guest") return false;
      if (["owner", "admin", "manager"].includes(actor.role)) return true;
      if (identity.hasAssignment(actor, "bounty_sponsor", projectId)) return true;
      // Keepers may sponsor small bounties (≤ 50 RP) from the org pool (§8.4.1).
      const summary = ledgerSummary(db, actor.workspaceId, actor.id);
      return ["keeper", "steward", "sage"].includes(summary.tier) && rewardRp <= 50;
    },
    create(
      actor: Actor,
      input: {
        projectId: string;
        title: string;
        description: string;
        acceptanceCriteria: string;
        rewardRp: number;
        rewardKc: number;
        deadline?: string;
        verifierId?: string;
        targetType?: string;
        targetId?: string;
        publish: boolean;
      },
    ): PlatformRecord {
      identity.requireProject(actor, input.projectId);
      if (!service.canSponsor(actor, input.rewardRp, input.projectId))
        throw new AppError(403, "FORBIDDEN", "Bounty sponsor rights are required for this reward");
      if (input.verifierId) identity.requireMember(actor.workspaceId, input.verifierId);
      if (input.deadline && Date.parse(input.deadline) <= Date.now())
        throw new BadRequestError("Deadline must be in the future");
      const settings = workspaceSettings(db, actor.workspaceId);
      if (input.rewardKc > 0 && !settings.rewards.enabled)
        throw new BadRequestError("Kudos Credits are disabled for this workspace");
      if (input.publish) checkBudget(actor.workspaceId, input.rewardRp, settings);
      const row = store.create(
        actor,
        "bounty",
        {
          projectId: input.projectId,
          title: input.title,
          description: input.description,
          acceptanceCriteria: input.acceptanceCriteria,
          origin: "manual",
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          rewardRp: input.rewardRp,
          rewardKc: input.rewardKc,
          sponsorId: actor.id,
          verifierId: input.verifierId ?? null,
          deadline: input.deadline ?? null,
          claimantId: null,
          claimedAt: null,
          claimExpiresAt: null,
          extended: false,
          submission: null,
          decisions: [],
          paidAt: null,
        },
        { projectId: input.projectId, status: input.publish ? "open" : "draft" },
      );
      if (input.publish)
        store.event(actor, "bounty.published", { bountyId: row.id, projectId: input.projectId });
      return row;
    },
    /** System-created bounties (conflicts, stale candidates, leaver ownership gaps). */
    createAuto(input: AutoBountyInput): PlatformRecord {
      const settings = input.settings ?? workspaceSettings(db, input.workspaceId);
      const publish = settings.gamification.autoPublishBounties;
      const row = store.insert({
        workspaceId: input.workspaceId,
        ownerId: SYSTEM_USER_ID,
        kind: "bounty",
        projectId: input.projectId,
        status: publish ? "open" : "draft",
        data: {
          projectId: input.projectId,
          title: input.title,
          description: input.description,
          acceptanceCriteria: "Verified by a domain owner for the project",
          origin: input.origin,
          targetType: input.targetType,
          targetId: input.targetId,
          rewardRp: input.rewardRp,
          rewardKc: 0,
          sponsorId: SYSTEM_USER_ID,
          verifierId: null,
          deadline: null,
          claimantId: null,
          claimedAt: null,
          claimExpiresAt: null,
          extended: false,
          submission: null,
          decisions: [],
          paidAt: null,
          flagId: input.flagId ?? null,
          conflictId: input.conflictId ?? null,
        },
      });
      store.emit(input.workspaceId, "bounty.auto_created", {
        bountyId: row.id,
        origin: input.origin,
        projectId: input.projectId,
      });
      return row;
    },
    cancelAuto(workspaceId: string, bountyId: string): void {
      const row = store.find(workspaceId, "bounty", bountyId);
      if (row && ["draft", "open"].includes(row.status)) store.patch(row, { status: "cancelled" });
    },
    list(
      actor: Actor,
      query: {
        status?: BountyStatus;
        projectId?: string;
        origin?: string;
        mine?: boolean;
        limit: number;
        offset: number;
      },
    ): PlatformRecord[] {
      const settings = workspaceSettings(db, actor.workspaceId);
      if (!canEarn(actor, settings))
        throw new AppError(403, "FORBIDDEN", "Guests cannot browse bounties");
      const accessible = new Set<string>();
      return store
        .listWhere(actor.workspaceId, "bounty", { projectId: query.projectId }, 500)
        .map((row) => refresh(row))
        .filter((row) => {
          const projectId = String(row.data.projectId);
          if (!accessible.has(projectId)) {
            try {
              identity.requireProject(actor, projectId);
              accessible.add(projectId);
            } catch {
              return false;
            }
          }
          if (query.status && row.status !== query.status) return false;
          if (query.origin && row.data.origin !== query.origin) return false;
          if (query.mine && row.data.sponsorId !== actor.id && row.data.claimantId !== actor.id)
            return false;
          // Drafts are visible to sponsors/admins only.
          if (
            row.status === "draft" &&
            row.ownerId !== actor.id &&
            !["owner", "admin"].includes(actor.role)
          )
            return false;
          return true;
        })
        .slice(query.offset, query.offset + query.limit);
    },
    get(actor: Actor, id: string): PlatformRecord {
      const row = refresh(store.get(actor, "bounty", id));
      identity.requireProject(actor, String(row.data.projectId));
      if (
        row.status === "draft" &&
        row.ownerId !== actor.id &&
        !["owner", "admin"].includes(actor.role)
      )
        throw new NotFoundError("Bounty");
      return row;
    },
    publish(actor: Actor, id: string, version: number): PlatformRecord {
      const row = service.get(actor, id);
      if (row.status !== "draft")
        throw new AppError(409, "CONFLICT", "Only drafts can be published");
      const projectId = String(row.data.projectId);
      if (
        !["owner", "admin"].includes(actor.role) &&
        !identity.hasAssignment(actor, "bounty_sponsor", projectId) &&
        !(
          row.data.sponsorId === actor.id &&
          service.canSponsor(actor, Number(row.data.rewardRp), projectId)
        )
      )
        throw new AppError(403, "FORBIDDEN", "An admin or bounty sponsor must publish this bounty");
      const settings = workspaceSettings(db, actor.workspaceId);
      checkBudget(actor.workspaceId, Number(row.data.rewardRp), settings);
      const updated = store.update(actor, row, version, { status: "open" });
      store.event(actor, "bounty.published", { bountyId: row.id, projectId });
      return updated;
    },
    claim(actor: Actor, id: string, version: number): PlatformRecord {
      const row = service.get(actor, id);
      const settings = workspaceSettings(db, actor.workspaceId);
      if (!canEarn(actor, settings))
        throw new AppError(403, "FORBIDDEN", "Guests cannot claim bounties");
      if (row.status !== "open") throw new AppError(409, "CONFLICT", "This bounty is not open");
      if (row.data.sponsorId === actor.id)
        throw new AppError(403, "FORBIDDEN", "Sponsors cannot claim their own bounty (AG-10)");
      const now = new Date();
      const updated = store.update(actor, row, version, {
        status: "claimed",
        data: {
          ...row.data,
          claimantId: actor.id,
          claimedAt: now.toISOString(),
          claimExpiresAt: new Date(now.getTime() + CLAIM_DAYS * 86400000).toISOString(),
          extended: false,
        },
      });
      if (row.data.sponsorId !== SYSTEM_USER_ID)
        notifier.notify(actor.workspaceId, String(row.data.sponsorId), {
          type: "bounty.claimed",
          category: "bounties",
          title: `${actor.name} claimed "${String(row.data.title)}"`,
          link: `/bounties/${row.id}`,
          projectId: String(row.data.projectId),
        });
      return updated;
    },
    release(actor: Actor, id: string, version: number): PlatformRecord {
      const row = service.get(actor, id);
      if (row.status !== "claimed")
        throw new AppError(409, "CONFLICT", "This bounty is not claimed");
      if (
        row.data.claimantId !== actor.id &&
        row.data.sponsorId !== actor.id &&
        !["owner", "admin"].includes(actor.role)
      )
        throw new AppError(403, "FORBIDDEN", "Only the claimant or sponsor can release a claim");
      return store.update(actor, row, version, {
        status: "open",
        data: {
          ...row.data,
          claimantId: null,
          claimedAt: null,
          claimExpiresAt: null,
          extended: false,
        },
      });
    },
    extend(actor: Actor, id: string, version: number): PlatformRecord {
      const row = service.get(actor, id);
      if (row.status !== "claimed" || row.data.claimantId !== actor.id)
        throw new AppError(409, "CONFLICT", "Only the current claimant can extend a claim");
      if (row.data.extended === true)
        throw new AppError(409, "CONFLICT", "A claim can be extended once");
      return store.update(actor, row, version, {
        data: {
          ...row.data,
          extended: true,
          claimExpiresAt: new Date(
            Date.parse(String(row.data.claimExpiresAt)) + CLAIM_DAYS * 86400000,
          ).toISOString(),
        },
      });
    },
    submit(
      actor: Actor,
      id: string,
      input: { version: number; note: string; evidenceUrl?: string; correctionId?: string },
    ): PlatformRecord {
      const row = service.get(actor, id);
      if (row.status !== "claimed" || row.data.claimantId !== actor.id)
        throw new AppError(409, "CONFLICT", "Only the current claimant can submit work");
      const updated = store.update(actor, row, input.version, {
        status: "submitted",
        data: {
          ...row.data,
          submission: {
            note: input.note,
            evidenceUrl: input.evidenceUrl ?? null,
            correctionId: input.correctionId ?? null,
            submittedAt: new Date().toISOString(),
          },
        },
      });
      const recipient = String(row.data.verifierId ?? row.data.sponsorId);
      if (recipient !== SYSTEM_USER_ID)
        notifier.notify(actor.workspaceId, recipient, {
          type: "bounty.submitted",
          category: "bounties",
          title: `Bounty "${String(row.data.title)}" was submitted for approval`,
          link: `/bounties/${row.id}`,
          projectId: String(row.data.projectId),
        });
      return updated;
    },
    decide(
      actor: Actor,
      id: string,
      input: { version: number; approved: boolean; note: string },
    ): PlatformRecord {
      const row = service.get(actor, id);
      if (row.status !== "submitted")
        throw new AppError(409, "CONFLICT", "No submission is pending");
      if (row.data.claimantId === actor.id)
        throw new AppError(
          403,
          "FORBIDDEN",
          "Contributors cannot approve their own submission (AG-1)",
        );
      if (!isVerifier(actor, row))
        throw new AppError(403, "FORBIDDEN", "The verifier, sponsor or a domain owner must decide");
      const decisions: unknown[] = Array.isArray(row.data.decisions)
        ? (row.data.decisions as unknown[])
        : [];
      const decision = {
        by: actor.id,
        approved: input.approved,
        note: input.note,
        at: new Date().toISOString(),
      };
      const claimantId = String(row.data.claimantId);
      if (!input.approved) {
        const back = store.update(actor, row, input.version, {
          status: "claimed",
          data: { ...row.data, decisions: [...decisions, decision], submission: null },
        });
        notifier.notify(actor.workspaceId, claimantId, {
          type: "bounty.changes_requested",
          category: "bounties",
          title: `Changes requested on "${String(row.data.title)}"`,
          body: input.note,
          link: `/bounties/${row.id}`,
          projectId: String(row.data.projectId),
        });
        return back;
      }
      const paid = db.transaction(() => {
        const updated = store.update(actor, row, input.version, {
          status: "paid",
          data: {
            ...row.data,
            decisions: [...decisions, decision],
            paidAt: new Date().toISOString(),
          },
        });
        const rewardKc = Number(row.data.rewardKc ?? 0);
        awardReputation(db, actor, claimantId, "bounty_completed", row.id, {
          amount: Number(row.data.rewardRp),
          kcAmount: rewardKc,
          skipKc: rewardKc <= 0,
          reason: { origin: String(row.data.origin), bountyId: row.id },
        });
        if (typeof row.data.flagId === "string") {
          const flag = store.find(actor.workspaceId, "flag", row.data.flagId);
          if (flag?.status === "bounty_created")
            store.patch(flag, {
              status: "resolved",
              data: { ...flag.data, resolvedBy: actor.id, resolutionReason: "Bounty completed" },
            });
        }
        store.event(actor, "bounty.completed", {
          bountyId: row.id,
          claimantId,
          rewardRp: Number(row.data.rewardRp),
          rewardKc,
        });
        return updated;
      });
      notifier.notify(actor.workspaceId, claimantId, {
        type: "bounty.approved",
        category: "bounties",
        title: `Bounty "${String(row.data.title)}" approved and paid`,
        link: `/bounties/${row.id}`,
        projectId: String(row.data.projectId),
      });
      return paid;
    },
    cancel(actor: Actor, id: string, version: number): PlatformRecord {
      const row = service.get(actor, id);
      if (!["draft", "open"].includes(row.status))
        throw new AppError(409, "CONFLICT", "Only draft or open bounties can be cancelled");
      if (row.data.sponsorId !== actor.id && !["owner", "admin"].includes(actor.role))
        throw new AppError(403, "FORBIDDEN", "Only the sponsor or an admin can cancel");
      return store.update(actor, row, version, { status: "cancelled" });
    },
    /** Background sweep: expire deadlines and lapsed claims. */
    expireDue(workspaceId: string, now = new Date()): number {
      let changed = 0;
      for (const row of store.listWhere(workspaceId, "bounty", {}, 1000)) {
        if (["open", "claimed"].includes(row.status) && refresh(row, now).status !== row.status)
          changed += 1;
      }
      return changed;
    },
  };
  return service;
}
export type BountyService = ReturnType<typeof createBountyService>;
