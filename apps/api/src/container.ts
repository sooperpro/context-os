import type { Env } from "./config/env.js";
import type { Db } from "./db/index.js";
import type { GeminiClient } from "./lib/gemini.js";
import type { Logger } from "./lib/logger.js";
import { createAskRepository } from "./modules/ask/ask.repository.js";
import { createAskService } from "./modules/ask/ask.service.js";
import { createAuditService } from "./modules/audit/audit.service.js";
import { createContextRepository } from "./modules/context/context.repository.js";
import { createContextService } from "./modules/context/context.service.js";
import { createFeedbackRepository } from "./modules/feedback/feedback.repository.js";
import { createFeedbackService } from "./modules/feedback/feedback.service.js";
import { createHubRepository } from "./modules/hub/hub.repository.js";
import { createHubService } from "./modules/hub/hub.service.js";
import { createJobHandlers } from "./modules/jobs/jobs.handlers.js";
import { createJobQueue } from "./modules/jobs/jobs.queue.js";
import { createWorker } from "./modules/jobs/jobs.worker.js";
import { createProjectRepository } from "./modules/projects/projects.repository.js";
import { createProjectService } from "./modules/projects/projects.service.js";
import { createSourceRepository } from "./modules/sources/sources.repository.js";
import { createSourceService } from "./modules/sources/sources.service.js";
import { ensureDefaultWorkspace } from "./modules/workspace/workspace.repository.js";
import type { Actor } from "./types.js";

export interface ContainerDeps {
  env: Env;
  db: Db;
  gemini: GeminiClient;
  logger: Logger;
}

/**
 * Composition root: builds repositories, services, the job queue and worker
 * from the given infrastructure. Pure function of its inputs, so tests can
 * build a container on an in-memory database with a fake model.
 */
export function createContainer({ env, db, gemini, logger }: ContainerDeps) {
  const workspace = ensureDefaultWorkspace(db, env.WORKSPACE_NAME);
  const audit = createAuditService(db, logger);
  const queue = createJobQueue(db);

  const repos = {
    projects: createProjectRepository(db),
    sources: createSourceRepository(db),
    context: createContextRepository(db),
    hub: createHubRepository(db),
    ask: createAskRepository(db),
    feedback: createFeedbackRepository(db),
  };

  const projects = createProjectService({ repo: repos.projects, audit });
  const context = createContextService({ repo: repos.context, audit, logger });
  const hub = createHubService({
    repo: repos.hub,
    context,
    projects,
    queue,
    gemini,
    audit,
    logger,
  });
  const sources = createSourceService({ repo: repos.sources, context, queue, audit });
  const ask = createAskService({
    repo: repos.ask,
    sources: repos.sources,
    context,
    gemini,
    audit,
    logger,
  });
  const feedback = createFeedbackService({ repo: repos.feedback, audit });

  const handlers = createJobHandlers({
    sources: repos.sources,
    context,
    contextRepo: repos.context,
    hub,
    projects: repos.projects,
    queue,
    gemini,
    logger,
  });
  const worker = createWorker({
    queue,
    handlers,
    logger,
    pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
  });

  /** V0 has no identity provider: every request acts as this development user. */
  const devActor: Actor = {
    id: env.DEV_ACTOR_ID,
    name: env.DEV_ACTOR_NAME,
    workspaceId: workspace.id,
  };

  return {
    db,
    workspace,
    devActor,
    audit,
    queue,
    worker,
    repos,
    services: { projects, sources, context, hub, ask, feedback },
  };
}

export type Container = ReturnType<typeof createContainer>;
