import { ContextItemListSchema, ContextItemSchema } from "@contextos/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  addSource,
  createFakeGemini,
  createProject,
  createTestApp,
  EMPTY_EXTRACTION,
  jsonRequest,
  SAMPLE_SOURCE,
  type TestApp,
} from "../../test/helpers.js";

describe("context items", () => {
  let t: TestApp;
  afterEach(() => {
    t.close();
  });

  it("lets a human confirm, dispute or mark items stale", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    const items = ContextItemListSchema.parse(
      await (
        await t.app.request(`/api/v1/projects/${project.id}/context-items?kind=decision`)
      ).json(),
    );
    const decision = items.items[0];
    expect(decision?.verification).toBe("inferred");

    const res = await t.app.request(
      `/api/v1/projects/${project.id}/context-items/${decision?.id}/verification`,
      jsonRequest({ verification: "confirmed" }, "PATCH"),
    );
    expect(res.status).toBe(200);
    expect(ContextItemSchema.parse(await res.json()).verification).toBe("confirmed");

    const bad = await t.app.request(
      `/api/v1/projects/${project.id}/context-items/${decision?.id}/verification`,
      jsonRequest({ verification: "maybe" }, "PATCH"),
    );
    expect(bad.status).toBe(400);
  });

  it("merges the same subject across sources and flags conflicting status claims", async () => {
    const gemini = createFakeGemini({
      extraction: (request) => {
        const isNewer = request.prompt.includes("Standup notes");
        return {
          ...EMPTY_EXTRACTION,
          people: [
            {
              name: "Priya Shah",
              role: "Billing owner",
              owns: ["billing"],
              evidenceQuote: isNewer
                ? "Priya confirmed she still owns billing."
                : "Priya Shah owns the billing area.",
              confidence: "high",
            },
          ],
          statusClaims: [
            {
              title: "Historical invoice migration",
              summary: isNewer
                ? "Migration is now in progress."
                : "Migration is blocked on the retention review.",
              state: isNewer ? "active" : "blocked",
              asOf: isNewer ? "2026-04-10" : "2026-03-04",
              evidenceQuote: isNewer
                ? "migration is now in progress"
                : "is currently blocked on the data retention review",
              confidence: "high",
            },
          ],
        };
      },
    });
    t = createTestApp({ gemini });
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await addSource(t.app, project.id, {
      kind: "conversation",
      title: "Standup notes 2026-04-10",
      content:
        "Priya confirmed she still owns billing. The historical invoice migration is now in progress.",
      sourceCreatedAt: "2026-04-10T09:00:00.000Z",
    });
    await t.drain();

    const people = ContextItemListSchema.parse(
      await (
        await t.app.request(`/api/v1/projects/${project.id}/context-items?kind=person`)
      ).json(),
    );
    expect(people.items).toHaveLength(1);
    expect(people.items[0]?.evidence).toHaveLength(2);

    const claims = ContextItemListSchema.parse(
      await (
        await t.app.request(`/api/v1/projects/${project.id}/context-items?kind=status_claim`)
      ).json(),
    );
    expect(claims.items).toHaveLength(2);
    const [newer, older] = claims.items;
    expect(newer?.asOf).toBe("2026-04-10T00:00:00.000Z");
    expect(newer?.conflictsWith).toEqual([older?.id]);
    expect(older?.conflictsWith).toEqual([newer?.id]);
    void SAMPLE_SOURCE;
  });
});
