import { TutorialDetailSchema } from "@contextos/shared";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { platformRecords, sourceObjects } from "../../db/schema.js";
import {
  addSource,
  createFakeGemini,
  createProject,
  createTestApp,
  jsonRequest,
  SAMPLE_SOURCE,
  type TestApp,
} from "../../test/helpers.js";

/**
 * N-18 Phase 7: when the Hub changes after a sync, a published module built on it gets an update
 * draft on its own. Learners keep the published version until someone publishes the update.
 */
describe("Module updates after the Hub changes", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const detail = async (id: string) =>
    TutorialDetailSchema.parse(await (await t.app.request(`/api/v1/tutorials/${id}`)).json());
  const runs = () =>
    t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.kind, "generation_run"))
      .all();

  it("drafts an update when a source changes, and publishes it on one click", async () => {
    const gemini = createFakeGemini();
    t = createTestApp({ gemini });
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    const created = await t.app.request(
      "/api/v1/tutorials",
      jsonRequest({ projectId: project.id, audience: "New engineers", focus: "billing" }),
    );
    const { id } = (await created.json()) as { id: string };
    await t.drain();
    expect(
      (
        await t.app.request(
          `/api/v1/tutorials/${id}/publish`,
          jsonRequest({ updateLearners: false }),
        )
      ).status,
    ).toBe(200);
    const published = await detail(id);

    // The source is edited in Drive, and the next sync refreshes the Hub.
    t.container.db.update(sourceObjects).set({ contentHash: "edited-in-drive" }).run();
    await addSource(t.app, project.id, {
      ...SAMPLE_SOURCE,
      title: "Pricing page",
      url: "https://wiki.example.com/pricing",
    });
    await t.drain();

    const updated = await detail(id);
    expect(updated.update?.changes).toContain(`${published.sources[0]!.title} was edited`);
    expect(updated).toMatchObject({
      status: "published",
      publishedVersion: 1,
      unpublishedChanges: true,
      generating: false,
    });
    const prompt = gemini.calls.filter((call) => call.purpose === "tutorial").at(-1)?.prompt ?? "";
    expect(prompt).toContain("<published_version>");
    expect(prompt).toContain("was edited");
    expect(runs().find((run) => run.data.purpose === "tutorial_update")).toMatchObject({
      status: "done",
      data: { automatic: true, targetId: id },
    });
    // People Ops are told it's waiting; nothing changed for learners yet.
    expect(
      t.container.db
        .select()
        .from(platformRecords)
        .where(and(eq(platformRecords.kind, "notification")))
        .all()
        .some((row) => String(row.data.title).includes("has an update from new company knowledge")),
    ).toBe(true);

    // One click publishes it as version 2.
    const republished = await t.app.request(
      `/api/v1/tutorials/${id}/publish`,
      jsonRequest({ updateLearners: true }),
    );
    expect(await republished.json()).toMatchObject({ publishedVersion: 2, update: null });

    // At most one automatic update a day.
    t.container.db.update(sourceObjects).set({ contentHash: "edited-again" }).run();
    await addSource(t.app, project.id, {
      ...SAMPLE_SOURCE,
      title: "Release process",
      url: "https://wiki.example.com/release",
    });
    await t.drain();
    expect(runs().filter((run) => run.data.purpose === "tutorial_update")).toHaveLength(1);
  });

  it("stops at the daily share for automatic updates", async () => {
    t = createTestApp({ gemini: createFakeGemini(), env: { AI_DAILY_AUTOMATIC_LIMIT: "0" } });
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    const created = await t.app.request(
      "/api/v1/tutorials",
      jsonRequest({ projectId: project.id, audience: "New engineers", focus: "billing" }),
    );
    const { id } = (await created.json()) as { id: string };
    await t.drain();
    await t.app.request(`/api/v1/tutorials/${id}/publish`, jsonRequest({ updateLearners: false }));
    t.container.db.update(sourceObjects).set({ contentHash: "edited-in-drive" }).run();
    await addSource(t.app, project.id, {
      ...SAMPLE_SOURCE,
      title: "Pricing page",
      url: "https://wiki.example.com/pricing",
    });
    await t.drain();
    expect(await detail(id)).toMatchObject({ update: null, unpublishedChanges: false });
    expect(runs().filter((run) => run.data.purpose === "tutorial_update")).toHaveLength(0);
  });
});
