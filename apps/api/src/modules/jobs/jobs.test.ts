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
});
