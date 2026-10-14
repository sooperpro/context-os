import {
  HubOverviewSchema,
  type Hub,
  type HubOverview,
  type HubSectionKey,
  type Khs,
  type SyncStatus,
} from "@contextos/shared";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  assignments,
  auditLog,
  projectMemberships,
  users,
  type ProjectRow,
} from "../../db/schema.js";
import type { GeminiClient } from "../../lib/gemini.js";
import type { Logger } from "../../lib/logger.js";
import type { Actor } from "../../types.js";
import type { AuditService } from "../audit/audit.service.js";
import type { ContextService } from "../context/context.service.js";
import type { IdentityService } from "../identity/identity.service.js";
import type { JobQueue } from "../jobs/jobs.queue.js";
import { createPlatformStore } from "../platform/store.js";
import type { ProjectService } from "../projects/projects.service.js";
import type { SourceRepository } from "../sources/sources.repository.js";
import { toSourceObject } from "../sources/sources.service.js";
import { OVERVIEW_SECTION, type HubRepository } from "./hub.repository.js";
import { generateOverview, OVERVIEW_PROMPT_VERSION, selectOverviewItems } from "./overview.js";
import {
  computeKhs,
  renderSection,
  sectionSummaries,
  type SectionContext,
  type SectionDomainOwner,
  type SectionRender,
} from "./sections.js";

export interface HubServiceDeps {
  db: Db;
  repo: HubRepository;
  context: ContextService;
  projects: ProjectService;
  queue: JobQueue;
  gemini: GeminiClient;
  audit: AuditService;
  logger: Logger;
  identity: IdentityService;
  sources: SourceRepository;
}

export function createHubService({
  db,
  repo,
  context,
  projects,
  queue,
  gemini,
  audit,
  logger,
  identity,
  sources,
}: HubServiceDeps) {
  const store = createPlatformStore(db);
  const readOverview = (projectId: string, allowedSources: Set<string>): HubOverview | null => {
    const snapshot = repo.getSnapshot(projectId, OVERVIEW_SECTION);
    if (!snapshot) return null;
    const dependencies = snapshot.data.generationSourceIds;
    if (
      !Array.isArray(dependencies) ||
      !dependencies.length ||
      !dependencies.every((id) => typeof id === "string" && allowedSources.has(id))
    )
      return null;
    const parsed = HubOverviewSchema.safeParse({
      ...snapshot.data,
      model: snapshot.model,
      generatedAt: snapshot.generatedAt.toISOString(),
      stale: snapshot.stale,
    });
    if (!parsed.success) {
      logger.warn(
        { projectId, issues: parsed.error.issues },
        "Stored overview is malformed; ignoring",
      );
      return null;
    }
    return parsed.data;
  };

  /** Most specific active Domain Owner for a section: section → project → workspace (§6.5). */
  const domainOwnerFor = (workspaceId: string, projectId: string) => {
    const rows = db
      .select({ assignment: assignments, name: users.name })
      .from(assignments)
      .innerJoin(users, eq(users.id, assignments.userId))
      .where(
        and(
          eq(assignments.workspaceId, workspaceId),
          eq(assignments.type, "domain_owner"),
          or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
        ),
      )
      .all();
    return (key: HubSectionKey): SectionDomainOwner | null => {
      const section = rows.find(
        (row) =>
          row.assignment.scopeType === "section" &&
          row.assignment.scopeId === `${projectId}:${key}`,
      );
      if (section)
        return { userId: section.assignment.userId, name: section.name, scope: "section" };
      const project = rows.find(
        (row) => row.assignment.scopeType === "project" && row.assignment.scopeId === projectId,
      );
      if (project)
        return { userId: project.assignment.userId, name: project.name, scope: "project" };
      const workspace = rows.find(
        (row) => row.assignment.scopeType === "workspace" && row.assignment.scopeId === workspaceId,
      );
      return workspace
        ? { userId: workspace.assignment.userId, name: workspace.name, scope: "workspace" }
        : null;
    };
  };

  const service = {
    /** Everything section rendering needs, already filtered by the actor's source access. */
    sectionContext(
      project: ProjectRow,
      actor: Actor,
    ): SectionContext & { completeAccess: boolean; sync: SyncStatus } {
      const allowed = new Set(identity.visibleSourceIds(actor, project.id));
      const all = sources.list(project.id);
      const completeAccess = all.every((source) => allowed.has(source.id));
      const ready = new Set(
        all
          .filter((source) => source.status === "ready" && allowed.has(source.id))
          .map((source) => source.id),
      );
      const counts = sources.chunkCounts(project.id);
      return {
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
          description: project.description,
        },
        items: context.listItems(project, undefined, actor),
        overview: completeAccess ? readOverview(project.id, ready) : null,
        sources: all
          .filter((source) => allowed.has(source.id))
          .map((row) => toSourceObject(row, counts.get(row.id) ?? 0)),
        domainOwner: domainOwnerFor(project.workspaceId, project.id),
        flags: store.listWhere(project.workspaceId, "flag", { projectId: project.id }, 1000),
        completeAccess,
        sync: completeAccess
          ? queue.syncStatus(project.id)
          : { state: "idle", queued: 0, running: 0, failed: 0, lastCompletedAt: null },
      };
    },

    getHub(project: ProjectRow, actor: Actor): Hub {
      const ctx = service.sectionContext(project, actor);
      const counts = Object.fromEntries(
        Object.keys(context.countsByKind(project.id)).map((kind) => [
          kind,
          ctx.items.filter((item) => item.kind === kind).length,
        ]),
      ) as Hub["counts"];
      return {
        project: projects.withStats(project, actor),
        overview: ctx.overview,
        sync: ctx.sync,
        counts,
        khs: computeKhs(ctx, project.slug ?? project.id),
        sections: sectionSummaries(ctx),
        team: service.team(project, actor),
      };
    },

    getSection(project: ProjectRow, actor: Actor, key: HubSectionKey): SectionRender {
      return renderSection(key, service.sectionContext(project, actor));
    },

    getKhs(project: ProjectRow, actor: Actor): Khs {
      return computeKhs(service.sectionContext(project, actor), project.slug ?? project.id);
    },

    /** Project team directory: explicit members, scoped assignments and the hub creator. */
    team(project: ProjectRow, actor: Actor): Hub["team"] {
      void actor;
      const people = new Map<
        string,
        { userId: string; name: string; role: string; assignments: string[] }
      >();
      const add = (userId: string, assignment?: string) => {
        const existing = people.get(userId);
        if (existing) {
          if (assignment && !existing.assignments.includes(assignment))
            existing.assignments.push(assignment);
          return;
        }
        const member = identity.requireMemberOptional(project.workspaceId, userId);
        if (!member) return;
        const user = db.select({ name: users.name }).from(users).where(eq(users.id, userId)).get();
        people.set(userId, {
          userId,
          name: user?.name ?? userId,
          role: member.role,
          assignments: assignment ? [assignment] : [],
        });
      };
      const creator = db
        .select({ actorId: auditLog.actorId })
        .from(auditLog)
        .where(and(eq(auditLog.action, "project.create"), eq(auditLog.targetId, project.id)))
        .get();
      if (creator) add(creator.actorId, "hub_owner");
      for (const row of db
        .select()
        .from(projectMemberships)
        .where(eq(projectMemberships.projectId, project.id))
        .all())
        add(row.userId);
      for (const row of db
        .select()
        .from(assignments)
        .where(
          and(
            eq(assignments.workspaceId, project.workspaceId),
            or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
          ),
        )
        .all())
        if (row.scopeId === project.id || row.scopeId.startsWith(`${project.id}:`))
          add(row.userId, row.type);
      return [...people.values()];
    },

    requestRefresh(actor: Actor, project: ProjectRow): SyncStatus {
      const job = queue.enqueue({
        projectId: project.id,
        type: "refresh_hub",
        payload: {},
        subject: project.name,
        dedupe: true,
      });
      audit.record({
        actor,
        projectId: project.id,
        action: "hub.refresh",
        targetType: "project",
        targetId: project.id,
        metadata: { jobId: job.id },
      });
      return queue.syncStatus(project.id);
    },

    /** Mark the stored overview as stale (sources changed since it was generated). */
    markStale(projectId: string): void {
      repo.markStale(projectId);
    },

    /** Job handler: regenerate the cited overview from the current context items. */
    async regenerateOverview(project: ProjectRow): Promise<void> {
      const items = selectOverviewItems(context.listItems(project));
      if (items.length === 0) {
        repo.deleteSnapshot(project.id, OVERVIEW_SECTION);
        return;
      }
      const output = await generateOverview(gemini, project, items);
      const toIds = (refs: number[]) =>
        [...new Set(refs)]
          .map((n) => items[n - 1]?.id)
          .filter((id): id is string => typeof id === "string");
      const data = {
        generationSourceIds: [
          ...new Set(items.flatMap((item) => item.evidence.map((ref) => ref.sourceObjectId))),
        ],
        whatItIs: { text: output.whatItIs.text, evidenceItemIds: toIds(output.whatItIs.refs) },
        problem: { text: output.problem.text, evidenceItemIds: toIds(output.problem.refs) },
        users: { text: output.users.text, evidenceItemIds: toIds(output.users.refs) },
        howItWorks: {
          text: output.howItWorks.text,
          evidenceItemIds: toIds(output.howItWorks.refs),
        },
        currentFocus: {
          text: output.currentFocus.text,
          evidenceItemIds: toIds(output.currentFocus.refs),
        },
        keyUnknowns: output.keyUnknowns,
      };
      repo.upsertSnapshot({
        projectId: project.id,
        section: OVERVIEW_SECTION,
        data,
        model: gemini.model,
        promptVersion: OVERVIEW_PROMPT_VERSION,
      });
    },
  };
  return service;
}

export type HubService = ReturnType<typeof createHubService>;
