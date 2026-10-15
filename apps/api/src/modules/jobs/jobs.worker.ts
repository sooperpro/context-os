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
  /** Periodic maintenance (bounty expiry, nudges, purges) run between job polls. */
  sweeps?: { run: () => unknown };
  sweepIntervalMs?: number;
  /**
   * Jobs run at the same time. Jobs mostly wait on Gemini and Google, so a few in parallel keep a
   * large import moving; jobs that share a concurrency key still run one at a time.
   */
  concurrency?: number;
}

const backoffMs = (attempt: number) => Math.min(60_000, 2_000 * 2 ** (attempt - 1));

/** In-process poller that executes queued jobs. `runOnce`/`drain` exist for tests. */
export function createWorker({
  queue,
  handlers,
  logger,
  pollIntervalMs = 1000,
  staleAfterMs = 15 * 60_000,
  sweeps,
  sweepIntervalMs = 60_000,
  concurrency = 1,
}: WorkerOptions) {
  let running = false;
  let loopPromises: Array<Promise<void>> = [];
  const sleepers = new Set<{ timer: NodeJS.Timeout; wake: () => void }>();
  let lastSweepAt = 0;

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

  function runSweeps(): unknown {
    lastSweepAt = Date.now();
    try {
      return sweeps?.run();
    } catch (error) {
      logger.error({ err: error }, "Maintenance sweep failed");
      return undefined;
    }
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
        if (sweeps && Date.now() - lastSweepAt >= sweepIntervalMs) runSweeps();
        await new Promise<void>((resolve) => {
          const sleeper = {
            timer: setTimeout(() => {
              sleepers.delete(sleeper);
              resolve();
            }, pollIntervalMs),
            wake: resolve,
          };
          sleepers.add(sleeper);
        });
      }
    }
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      const requeued = queue.requeueStale(new Date(Date.now() - staleAfterMs));
      if (requeued > 0) logger.warn({ requeued }, "Re-queued stale running jobs");
      loopPromises = Array.from({ length: Math.max(1, concurrency) }, () => loop());
    },
    async stop(): Promise<void> {
      running = false;
      for (const sleeper of sleepers) {
        clearTimeout(sleeper.timer);
        sleeper.wake();
      }
      sleepers.clear();
      await Promise.all(loopPromises);
      loopPromises = [];
    },
    runOnce,
    drain,
    runSweeps,
  };
}

export type Worker = ReturnType<typeof createWorker>;
