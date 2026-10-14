import { z } from "zod";
import type { JobRow } from "../../db/schema.js";
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

/** Late-bound connector sync, registered by the app once provider services exist. */
export interface ConnectorSyncRegistry {
  sync?: (job: JobRow) => Promise<void>;
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
}

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

        // 3. Embeddings are best-effort: retrieval degrades to keyword search without them.
        try {
          const vectors = await gemini.embed(
            chunks.map((c) => c.content),
            "RETRIEVAL_DOCUMENT",
          );
          vectors.forEach((vector, i) => {
            const chunk = chunks[i];
            if (chunk && vector.length > 0)
              sources.setChunkEmbedding(chunk.id, float32ToBuffer(vector));
          });
        } catch (error) {
          log.warn({ err: error }, "Embedding failed; continuing without vectors");
        }

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
          const output = await extractContext({ gemini }, source);
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
        queue.enqueue({
          projectId: source.projectId,
          type: "refresh_hub",
          payload: {},
          subject: null,
          dedupe: true,
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
    },

    async sync_connector(job: JobRow): Promise<void> {
      if (!connectors.sync) throw new Error("Connector sync is not available in this process");
      await connectors.sync(job);
    },
  };
}
