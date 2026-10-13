import { HubOverviewSchema, type Hub, type HubOverview, type SyncStatus } from "@contextos/shared";
import type { ProjectRow } from "../../db/schema.js";
import type { GeminiClient } from "../../lib/gemini.js";
import type { Logger } from "../../lib/logger.js";
import type { Actor } from "../../types.js";
import type { AuditService } from "../audit/audit.service.js";
import type { ContextService } from "../context/context.service.js";
import type { JobQueue } from "../jobs/jobs.queue.js";
import type { ProjectService } from "../projects/projects.service.js";
import { OVERVIEW_SECTION, type HubRepository } from "./hub.repository.js";
import { generateOverview, OVERVIEW_PROMPT_VERSION, selectOverviewItems } from "./overview.js";
import type { IdentityService } from "../identity/identity.service.js";
import type { SourceRepository } from "../sources/sources.repository.js";

export interface HubServiceDeps {
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

  return {
    getHub(project: ProjectRow, actor: Actor): Hub {
      const sync: SyncStatus = queue.syncStatus(project.id);
      const visible = context.listItems(project, undefined, actor);
      const allowed = new Set(identity.visibleSourceIds(actor, project.id));
      const completeAccess = sources.list(project.id).every((source) => allowed.has(source.id));
      const ready = new Set(
        sources
          .list(project.id)
          .filter((source) => source.status === "ready" && allowed.has(source.id))
          .map((source) => source.id),
      );
      const counts = Object.fromEntries(
        Object.keys(context.countsByKind(project.id)).map((kind) => [
          kind,
          visible.filter((item) => item.kind === kind).length,
        ]),
      ) as Hub["counts"];
      return {
        project: projects.withStats(project, actor),
        overview: completeAccess ? readOverview(project.id, ready) : null,
        sync: completeAccess
          ? sync
          : { state: "idle", queued: 0, running: 0, failed: 0, lastCompletedAt: null },
        counts,
      };
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
}

export type HubService = ReturnType<typeof createHubService>;
