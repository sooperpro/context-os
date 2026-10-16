import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../lib/logger.js";
import { createProject, createTestApp, type TestApp } from "../../test/helpers.js";
import { createWorker } from "./jobs.worker.js";

describe("job queue + worker", () => {
  let t: TestApp;
  beforeEach(() => {
    t = createTestApp();
  });
  afterEach(() => {
    t.close();
    vi.useRealTimers();
  });

  it("dedupes queued jobs and retries with backoff until maxAttempts", async () => {
    const project = await createProject(t.app);
    const { queue } = t.container;

    const a = queue.enqueue({
      projectId: project.id,
      type: "refresh_hub",
      payload: {},
      dedupe: true,
    });
    const b = queue.enqueue({
      projectId: project.id,
      type: "refresh_hub",
      payload: {},
      dedupe: true,
    });
    expect(b.id).toBe(a.id);

    let attempts = 0;
    const worker = createWorker({
      queue,
      logger,
      handlers: {
        process_source: () => Promise.resolve(),
        sync_connector: () => Promise.resolve(),
        import_drive_file: () => Promise.resolve(),
        refresh_access: () => Promise.resolve(),
        generate_tutorial: () => Promise.resolve(),
        generate_template: () => Promise.resolve(),
        refresh_hub: () => {
          attempts += 1;
          return attempts < 3 ? Promise.reject(new Error("flaky")) : Promise.resolve();
        },
      },
    });

    expect(await worker.runOnce()).toBe(true);
    expect(queue.list(project.id, undefined, 5)[0]).toMatchObject({
      status: "queued",
      attempts: 1,
    });
    // Backoff: nothing runnable right now.
    expect(await worker.runOnce()).toBe(false);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 5_000);
    expect(await worker.runOnce()).toBe(true);
    vi.setSystemTime(Date.now() + 10_000);
    expect(await worker.runOnce()).toBe(true);
    expect(queue.list(project.id, undefined, 5)[0]).toMatchObject({ status: "done", attempts: 3 });
    expect(queue.syncStatus(project.id)).toMatchObject({ state: "idle", failed: 0 });
  });

  it("re-queues stale running jobs on start", async () => {
    const project = await createProject(t.app);
    const { queue } = t.container;
    queue.enqueue({ projectId: project.id, type: "refresh_hub", payload: {} });
    const claimed = queue.claimNext();
    expect(claimed?.status).toBe("running");

    expect(queue.requeueStale(new Date(Date.now() + 1))).toBe(1);
    expect(queue.list(project.id, "queued", 5)).toHaveLength(1);
  });

  it("runs higher priority first and never two jobs with the same key at once", async () => {
    const project = await createProject(t.app);
    const { queue } = t.container;
    const job = (subject: string, priority: number, concurrencyKey?: string) =>
      queue.enqueue({
        projectId: project.id,
        type: "process_source",
        payload: { sourceObjectId: subject },
        subject,
        priority,
        concurrencyKey,
      });
    job("bulk-a", -10, "source:a");
    job("bulk-a-again", -10, "source:a");
    job("upload", 0, "source:u");
    job("listing", 10, "scope:s");
    // Dedupe by key is an indexed lookup and returns the queued job.
    const again = queue.enqueue({
      projectId: project.id,
      type: "process_source",
      payload: { sourceObjectId: "different" },
      dedupe: true,
      concurrencyKey: "source:u",
    });
    expect(again.subject).toBe("upload");

    expect(queue.claimNext()?.subject).toBe("listing");
    expect(queue.claimNext()?.subject).toBe("upload");
    expect(queue.claimNext()?.subject).toBe("bulk-a");
    // The second job for source a waits while the first runs.
    expect(queue.claimNext()).toBeUndefined();
  });

  it("runs several jobs in parallel with a concurrent worker", async () => {
    const project = await createProject(t.app);
    const { queue } = t.container;
    let running = 0;
    let peak = 0;
    const slow = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 30));
      running -= 1;
    };
    for (let i = 0; i < 6; i += 1)
      queue.enqueue({
        projectId: project.id,
        type: "process_source",
        payload: { sourceObjectId: `s${i}` },
        concurrencyKey: `source:${i % 2}`,
      });
    const worker = createWorker({
      queue,
      logger,
      pollIntervalMs: 5,
      concurrency: 4,
      handlers: {
        process_source: slow,
        sync_connector: slow,
        import_drive_file: slow,
        refresh_access: slow,
        generate_tutorial: slow,
        generate_template: slow,
        refresh_hub: slow,
      },
    });
    worker.start();
    await vi.waitFor(() => expect(queue.list(project.id, "done", 10)).toHaveLength(6), {
      timeout: 2000,
    });
    await worker.stop();
    // Two keys, so at most two at once even with four workers.
    expect(peak).toBe(2);
  });
});
