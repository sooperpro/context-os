import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { platformRecords, questions } from "../../db/schema.js";
import {
  addSource,
  createProject,
  createTestApp,
  jsonRequest,
  type TestApp,
} from "../../test/helpers.js";

interface AssistantAnswer {
  id: string;
  outcome: string;
  confidence: { level: string; label: string } | null;
  blocks: Array<{ type: string; text?: string }>;
  sources: Array<{ title: string; system: string; detail: string; to: string }>;
  searched: string[];
  related: Array<{ to: string }>;
}

describe("Context Bot outside a project", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const ask = (question: string) =>
    t.app.request("/api/v1/assistant/ask", jsonRequest({ question, page: "/" }));

  it("answers from the project whose sources match, cites them and takes a rating", async () => {
    t = createTestApp();
    await createProject(t.app, "Empty");
    const billing = await createProject(t.app, "Billing");
    await addSource(t.app, billing.id);
    await t.drain();

    const res = await ask("Why is billing moving to the ledger service?");
    expect(res.status).toBe(200);
    const body = (await res.json()) as AssistantAnswer;
    expect(body).toMatchObject({ outcome: "answered", confidence: { level: "verified" } });
    expect(body.blocks[0]?.text).toContain("[1]");
    expect(body.sources).toEqual([
      expect.objectContaining({
        title: "ADR-0007: Move billing to the ledger service",
        system: "ContextOS",
        detail: "Billing · created 2026-03-04",
        to: `/projects/${billing.slug}/sources`,
      }),
    ]);
    expect(
      body.related.every((item) => item.to.startsWith(`/projects/${billing.slug}/items/`)),
    ).toBe(true);

    const rated = await t.app.request(
      `/api/v1/assistant/answers/${body.id}/feedback`,
      jsonRequest({ helpful: false, reason: "out_of_date" }),
    );
    expect(rated.status).toBe(200);
    expect(
      t.container.db.select().from(questions).where(eq(questions.id, body.id)).get()?.feedback,
    ).toMatchObject({ rating: "down", reason: "outdated" });
  });

  it("says what it searched when no project has readable sources, and records a gap", async () => {
    t = createTestApp();
    await createProject(t.app, "Empty");

    const body = (await (await ask("What is blocked right now?")).json()) as AssistantAnswer;
    expect(body).toMatchObject({ outcome: "no_answer", searched: ["Empty"], sources: [] });

    const gap = await t.app.request(
      "/api/v1/assistant/gaps",
      jsonRequest({ question: "What is blocked right now?" }),
    );
    expect(gap.status).toBe(201);
    const { id } = (await gap.json()) as { id: string; notified: string };
    expect(
      t.container.db.select().from(platformRecords).where(eq(platformRecords.id, id)).get(),
    ).toMatchObject({ kind: "knowledge_gap", status: "open" });
  });

  it("refuses pay and performance questions without searching", async () => {
    t = createTestApp();
    const body = (await (await ask("What is my salary band?")).json()) as AssistantAnswer;
    expect(body).toMatchObject({ outcome: "restricted", sources: [], searched: [] });
  });
});
