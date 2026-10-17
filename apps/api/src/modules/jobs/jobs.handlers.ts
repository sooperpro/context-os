import { z } from "zod";
import type { JobRow } from "../../db/schema.js";
import type { Actor } from "../../types.js";
import type { PlatformRecord } from "../platform/store.js";
import { chunkText } from "../../lib/chunking.js";
import type { GeminiClient } from "../../lib/gemini.js";
import type { Logger } from "../../lib/logger.js";
import { float32ToBuffer } from "../../lib/retrieval.js";
import { errorMessage } from "../../lib/text.js";
import type { ConflictService } from "../context/conflicts.js";
import type { ContextRepository } from "../context/context.repository.js";
import type { ContextService } from "../context/context.service.js";
import { extractContext } from "../context/extraction.js";
import { EXTRACTION_PROMPT_VERSION } from "../context/extraction.schema.js";
import type { HubService } from "../hub/hub.service.js";
import type { ProjectRepository } from "../projects/projects.repository.js";
import type { SourceRepository } from "../sources/sources.repository.js";
import type { JobQueue } from "./jobs.queue.js";
import type { JobHandlers } from "./jobs.worker.js";

/** Late-bound connector jobs, registered by the app once provider services exist. */
export interface ConnectorSyncRegistry {
  sync?: (job: JobRow) => Promise<void>;
  importFile?: (job: JobRow) => Promise<void>;
  refreshAccess?: (job: JobRow) => Promise<void>;
  generateTutorial?: (job: JobRow) => Promise<void>;
  generateTemplate?: (job: JobRow) => Promise<void>;
  /**
   * The template for a role (N-18): the one that fits, published or a draft waiting for review, or
   * a new draft started now as `actor` (workspace setup drafts every role's).
   */
  templateForRole?: (
    actor: Actor,
    person: {
      title: string;
      team?: string | null;
      teamId?: string | null;
      departmentId?: string | null;
    },
    options?: { setup?: boolean },
  ) => { template: PlatformRecord; started: boolean };
  /** Publish a template's draft modules (tutorial ids) together; returns how many (N-18). */
  publishModules?: (actor: Actor, tutorialIds: string[]) => number;
  /** A project's Hub was refreshed after a sync: draft updates of modules built on it (N-18). */
  hubChanged?: (projectId: string) => void;
}

export interface JobHandlerDeps {
  sources: SourceRepository;
  context: ContextService;
  contextRepo: ContextRepository;
  conflicts: ConflictService;
  hub: HubService;
  projects: ProjectRepository;
  queue: JobQueue;
  gemini: GeminiClient;
  logger: Logger;
  connectors: ConnectorSyncRegistry;
  /** Sections of a long source the AI reads for the Knowledge Hub (EXTRACTION_MAX_WINDOWS). */
  extractionSections?: number;
}

/** Chunks embedded per group; a failed group loses only its own vectors. */
const EMBED_GROUP = 256;
/** Groups embedded at the same time within one source. */
const EMBED_PARALLEL = 2;
/** After bulk processing, the project overview refreshes at most this often. */
const BULK_HUB_DELAY_MS = 2 * 60_000;

const ProcessSourcePayload = z.object({ sourceObjectId: z.string() });

export function createJobHandlers(deps: JobHandlerDeps): JobHandlers {
  const {
    sources,
    context,
    contextRepo,
    conflicts,
    hub,
    projects,
    queue,
    gemini,
    logger,
    connectors,
    extractionSections = 1,
  } = deps;

  return {
    /** chunk → index → embed → extract → verify evidence → conflicts → mark ready → refresh hub */
    async process_source(job: JobRow): Promise<void> {
      const { sourceObjectId } = ProcessSourcePayload.parse(job.payload);
      const source = sources.findById(sourceObjectId);
      if (!source) {
        logger.info({ sourceObjectId }, "Source no longer exists; skipping");
        return;
      }
      const log = logger.child({ sourceObjectId, title: source.title });
      sources.setStatus(source.id, { status: "processing", error: null });

      try {
        // 1. Reset anything derived from a previous run.
        context.removeDerivedFromSource(source.projectId, source.id);
        sources.deleteChunks(source.id);

        // 2. Chunk + index (FTS rows are maintained by triggers).
        const chunks = sources.insertChunks(
          chunkText(source.content).map((chunk) => ({
            id: crypto.randomUUID(),
            sourceObjectId: source.id,
            projectId: source.projectId,
            ordinal: chunk.ordinal,
            content: chunk.content,
          })),
        );

        // 3. Embeddings are best-effort: retrieval degrades to keyword search without them. Large
        //    sources embed in groups, two at a time; a failed group only loses its own vectors.
        const groups: Array<typeof chunks> = [];
        for (let start = 0; start < chunks.length; start += EMBED_GROUP)
          groups.push(chunks.slice(start, start + EMBED_GROUP));
        let failedGroups = 0;
        for (let start = 0; start < groups.length; start += EMBED_PARALLEL)
          await Promise.all(
            groups.slice(start, start + EMBED_PARALLEL).map(async (group) => {
              try {
                const vectors = await gemini.embed(
                  group.map((c) => c.content),
                  "RETRIEVAL_DOCUMENT",
                );
                vectors.forEach((vector, i) => {
                  const chunk = group[i];
                  if (chunk && vector.length > 0)
                    sources.setChunkEmbedding(chunk.id, float32ToBuffer(vector));
                });
              } catch (error) {
                failedGroups += 1;
                log.warn({ err: error }, "Embedding failed; continuing without these vectors");
              }
            }),
          );
        if (failedGroups) log.warn({ failedGroups, groups: groups.length }, "Some vectors missing");

        // 4. Structured extraction with verified evidence.
        const run = contextRepo.startRun({
          id: crypto.randomUUID(),
          projectId: source.projectId,
          sourceObjectId: source.id,
          model: gemini.model,
          promptVersion: EXTRACTION_PROMPT_VERSION,
          status: "running",
        });
        try {
          const output = await extractContext({ gemini }, source, {
            maxSections: extractionSections,
          });
          const stats = context.persistExtraction({ source, chunks, output, runId: run.id });
          contextRepo.finishRun(run.id, {
            status: "done",
            stats: { chunks: chunks.length, ...stats },
          });
          log.info({ chunks: chunks.length, ...stats }, "Source processed");
        } catch (error) {
          contextRepo.finishRun(run.id, { status: "failed", error: errorMessage(error) });
          throw error;
        }

        sources.setStatus(source.id, { status: "ready", error: null, processedAt: new Date() });
        // 5. Temporal reconciliation: materialise conflicts between incompatible claims (§8.6).
        const project = projects.findByIdUnscoped(source.projectId);
        if (project) {
          try {
            conflicts.sync(project);
          } catch (error) {
            log.warn({ err: error }, "Conflict detection failed; claims remain flagged in views");
          }
        }
        projects.touch(source.projectId);
        hub.markStale(source.projectId);
        // One overview refresh per project at a time; during a bulk import, at most every 2 minutes.
        queue.enqueue({
          projectId: source.projectId,
          type: "refresh_hub",
          payload: {},
          subject: null,
          dedupe: true,
          concurrencyKey: `hub:${source.projectId}`,
          runAfter: job.priority < 0 ? new Date(Date.now() + BULK_HUB_DELAY_MS) : undefined,
        });
      } catch (error) {
        sources.setStatus(source.id, { status: "failed", error: errorMessage(error) });
        throw error;
      }
    },

    async refresh_hub(job: JobRow): Promise<void> {
      const project = projects.findByIdUnscoped(job.projectId);
      if (!project) {
        logger.info({ projectId: job.projectId }, "Project no longer exists; skipping hub refresh");
        return;
      }
      await hub.regenerateOverview(project);
      try {
        connectors.hubChanged?.(project.id);
      } catch (error) {
        logger.warn({ err: error }, "Module update drafts could not be queued after the sync");
      }
    },

    async sync_connector(job: JobRow): Promise<void> {
      if (!connectors.sync) throw new Error("Connector sync is not available in this process");
      await connectors.sync(job);
    },

    async import_drive_file(job: JobRow): Promise<void> {
      if (!connectors.importFile)
        throw new Error("Connector import is not available in this process");
      await connectors.importFile(job);
    },

    async generate_tutorial(job: JobRow): Promise<void> {
      if (!connectors.generateTutorial)
        throw new Error("Tutorial drafting is not available in this process");
      await connectors.generateTutorial(job);
    },

    async generate_template(job: JobRow): Promise<void> {
      if (!connectors.generateTemplate)
        throw new Error("Roadmap drafting is not available in this process");
      await connectors.generateTemplate(job);
    },

    async refresh_access(job: JobRow): Promise<void> {
      if (!connectors.refreshAccess)
        throw new Error("Connector access refresh is not available in this process");
      await connectors.refreshAccess(job);
    },
  };
}
