import {
  ContextItemListSchema,
  HubSchema,
  SourceListSchema,
  SourceObjectDetailSchema,
} from "@contextos/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  addSource,
  createFakeGemini,
  createProject,
  createTestApp,
  SAMPLE_SOURCE,
  type TestApp,
} from "../../test/helpers.js";

describe("source ingestion pipeline", () => {
  let t: TestApp;
  afterEach(() => {
    t.close();
  });

  it("chunks, embeds, extracts verified evidence and refreshes the hub", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    const source = await addSource(t.app, project.id);
    expect(source.status).toBe("pending");

    // Queued, not processed yet.
    const before = HubSchema.parse(
      await (await t.app.request(`/api/v1/projects/${project.id}/hub`)).json(),
    );
    expect(before.sync).toMatchObject({ state: "processing", queued: 1 });
    expect(before.overview).toBeNull();

    const processed = await t.drain();
    expect(processed).toBe(2); // process_source + refresh_hub

    const sources = SourceListSchema.parse(
      await (await t.app.request(`/api/v1/projects/${project.id}/sources`)).json(),
    );
    expect(sources.items[0]).toMatchObject({ status: "ready", error: null });
    expect(sources.items[0]?.chunkCount).toBeGreaterThan(0);
    expect(sources.items[0]?.processedAt).not.toBeNull();

    const items = ContextItemListSchema.parse(
      await (await t.app.request(`/api/v1/projects/${project.id}/context-items`)).json(),
    );
    expect(items.items.map((i) => i.kind).sort()).toEqual(
      ["component", "decision", "dependency", "event", "person", "status_claim", "term"].sort(),
    );
    for (const item of items.items) {
      expect(item.evidence).toHaveLength(1);
      expect(item.evidence[0]).toMatchObject({
        quoteVerified: true,
        sourceTitle: SAMPLE_SOURCE.title,
      });
      expect(item.evidence[0]?.chunkId).not.toBeNull();
    }
    const decision = items.items.find((i) => i.kind === "decision");
    expect(decision).toMatchObject({ eventAt: "2026-03-04T00:00:00.000Z", confidence: "high" });
    const claim = items.items.find((i) => i.kind === "status_claim");
    expect(claim).toMatchObject({ asOf: "2026-03-04T00:00:00.000Z", data: { state: "blocked" } });

    const hub = HubSchema.parse(
      await (await t.app.request(`/api/v1/projects/${project.id}/hub`)).json(),
    );
    expect(hub.sync).toMatchObject({ state: "idle", queued: 0, failed: 0 });
    expect(hub.counts).toMatchObject({ decision: 1, status_claim: 1 });
    expect(hub.overview?.stale).toBe(false);
    expect(hub.overview?.whatItIs.evidenceItemIds).toHaveLength(1);
    expect(hub.overview?.users.evidenceItemIds).toEqual([]);
    expect(hub.project.stats).toMatchObject({ sources: 1, readySources: 1, contextItems: 7 });

    const detail = SourceObjectDetailSchema.parse(
      await (await t.app.request(`/api/v1/projects/${project.id}/sources/${source.id}`)).json(),
    );
    expect(detail.content).toBe(SAMPLE_SOURCE.content);
  });

  it("flags unverifiable quotes and caps their confidence", async () => {
    const gemini = createFakeGemini({
      extraction: {
        decisions: [],
        events: [],
        statusClaims: [],
        people: [],
        components: [
          {
            name: "Imaginary service",
            summary: "Not in the source",
            componentType: "service",
            evidenceQuote: "this sentence does not appear anywhere in the document",
            confidence: "high",
          },
        ],
        dependencies: [],
        terms: [],
      },
    });
    t = createTestApp({ gemini });
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    const items = ContextItemListSchema.parse(
      await (await t.app.request(`/api/v1/projects/${project.id}/context-items`)).json(),
    );
    expect(items.items).toHaveLength(1);
    expect(items.items[0]).toMatchObject({ confidence: "low" });
    expect(items.items[0]?.evidence[0]).toMatchObject({ quoteVerified: false, chunkId: null });
  });

  it("keeps working when embeddings fail", async () => {
    t = createTestApp({
      gemini: createFakeGemini({ embedFailWith: new Error("embeddings down") }),
    });
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    const sources = SourceListSchema.parse(
      await (await t.app.request(`/api/v1/projects/${project.id}/sources`)).json(),
    );
    expect(sources.items[0]?.status).toBe("ready");
  });

  it("marks the source failed when extraction fails, retries, and can be retried manually", async () => {
    t = createTestApp({ gemini: createFakeGemini({ failWith: new Error("model unavailable") }) });
    const project = await createProject(t.app);
    const source = await addSource(t.app, project.id);

    // First attempt fails and is re-queued with backoff (runAfter in the future), so drain stops.
    expect(await t.drain()).toBe(1);
    let jobs = t.container.queue.list(project.id, undefined, 10);
    expect(jobs[0]).toMatchObject({
      status: "queued",
      attempts: 1,
      lastError: "model unavailable",
    });

    // Exhaust attempts by forcing runAfter into the past.
    for (let i = 0; i < 2; i++) {
      t.container.db.run(
        (await import("drizzle-orm")).sql`UPDATE jobs SET run_after = 0 WHERE status = 'queued'`,
      );
      await t.drain();
    }
    jobs = t.container.queue.list(project.id, undefined, 10);
    expect(jobs[0]).toMatchObject({ status: "failed", attempts: 3 });

    const hub = HubSchema.parse(
      await (await t.app.request(`/api/v1/projects/${project.id}/hub`)).json(),
    );
    expect(hub.sync).toMatchObject({ state: "attention", failed: 1 });
    const sources = SourceListSchema.parse(
      await (await t.app.request(`/api/v1/projects/${project.id}/sources`)).json(),
    );
    expect(sources.items[0]).toMatchObject({ status: "failed", error: "model unavailable" });

    const retry = await t.app.request(`/api/v1/projects/${project.id}/jobs/${jobs[0]?.id}/retry`, {
      method: "POST",
    });
    expect(retry.status).toBe(202);
    expect(t.container.queue.list(project.id, "queued", 10)).toHaveLength(1);
    void source;
  });

  it("reprocesses and deletes sources without leaving orphaned context", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    const source = await addSource(t.app, project.id);
    await t.drain();

    const reprocess = await t.app.request(
      `/api/v1/projects/${project.id}/sources/${source.id}/reprocess`,
      { method: "POST" },
    );
    expect(reprocess.status).toBe(202);
    await t.drain();
    const items = ContextItemListSchema.parse(
      await (await t.app.request(`/api/v1/projects/${project.id}/context-items`)).json(),
    );
    expect(items.items).toHaveLength(7); // no duplicates after re-processing
    expect(items.items.every((i) => i.evidence.length === 1)).toBe(true);

    const del = await t.app.request(`/api/v1/projects/${project.id}/sources/${source.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);
    await t.drain();
    const after = ContextItemListSchema.parse(
      await (await t.app.request(`/api/v1/projects/${project.id}/context-items`)).json(),
    );
    expect(after.items).toHaveLength(0);
    const hub = HubSchema.parse(
      await (await t.app.request(`/api/v1/projects/${project.id}/hub`)).json(),
    );
    expect(hub.overview).toBeNull();
  });
});
