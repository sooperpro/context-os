import type { JobType } from "@contextos/shared";
import type { JobRow } from "../../db/schema.js";
import type { Logger } from "../../lib/logger.js";
import { errorMessage } from "../../lib/text.js";
import type { JobQueue } from "./jobs.queue.js";

export type JobHandler = (job: JobRow) => Promise<void>;
export type JobHandlers = Record<JobType, JobHandler>;

export interface WorkerOptions {
  queue: JobQueue;
  handlers: JobHandlers;
  logger: Logger;
  pollIntervalMs?: number;
  /** Jobs locked longer than this are considered abandoned and re-queued at start. */
  staleAfterMs?: number;
}

const backoffMs = (attempt: number) => Math.min(60_000, 2_000 * 2 ** (attempt - 1));

/** Single-process poller that executes queued jobs. `runOnce`/`drain` exist for tests. */
export function createWorker({
  queue,
  handlers,
  logger,
  pollIntervalMs = 1000,
  staleAfterMs = 15 * 60_000,
}: WorkerOptions) {
  let running = false;
  let timer: NodeJS.Timeout | null = null;
  let loopPromise: Promise<void> | null = null;
  let wake: (() => void) | null = null;

  async function execute(job: JobRow): Promise<void> {
    const log = logger.child({
      jobId: job.id,
      type: job.type,
      projectId: job.projectId,
      attempt: job.attempts,
    });
    const startedAt = performance.now();
    try {
      await handlers[job.type](job);
      queue.complete(job.id);
      log.info({ durationMs: Math.round(performance.now() - startedAt) }, "Job done");
    } catch (error) {
      const message = errorMessage(error);
      const willRetry = job.attempts < job.maxAttempts;
      const retryAt = willRetry ? new Date(Date.now() + backoffMs(job.attempts)) : null;
      queue.fail(job.id, message, retryAt);
      log.error(
        { err: error, retryAt },
        willRetry ? "Job failed, will retry" : "Job failed permanently",
      );
    }
  }

  async function runOnce(): Promise<boolean> {
    const job = queue.claimNext();
    if (!job) return false;
    await execute(job);
    return true;
  }

  /** Process jobs until the queue has nothing runnable (bounded). Used in tests. */
  async function drain(maxJobs = 200): Promise<number> {
    let processed = 0;
    while (processed < maxJobs && (await runOnce())) processed += 1;
    return processed;
  }

  async function loop(): Promise<void> {
    while (running) {
      let processed = false;
      try {
        processed = await runOnce();
      } catch (error) {
        logger.error({ err: error }, "Worker loop error");
      }
      if (!running) break;
      if (!processed) {
        await new Promise<void>((resolve) => {
          wake = resolve;
          timer = setTimeout(resolve, pollIntervalMs);
        });
        wake = null;
        timer = null;
      }
    }
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      const requeued = queue.requeueStale(new Date(Date.now() - staleAfterMs));
      if (requeued > 0) logger.warn({ requeued }, "Re-queued stale running jobs");
      loopPromise = loop();
    },
    async stop(): Promise<void> {
      running = false;
      if (timer) clearTimeout(timer);
      wake?.();
      await loopPromise;
      loopPromise = null;
    },
    runOnce,
    drain,
  };
}

export type Worker = ReturnType<typeof createWorker>;
