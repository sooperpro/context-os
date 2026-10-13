import { AnswerListSchema, AnswerSchema } from "@contextos/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  addSource,
  createFakeGemini,
  createProject,
  createTestApp,
  jsonRequest,
  type TestApp,
} from "../../test/helpers.js";

describe("ask", () => {
  let t: TestApp;
  afterEach(() => {
    t.close();
  });

  it("answers with citations that map to real passages and drops invalid refs", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();

    const res = await t.app.request(
      `/api/v1/projects/${project.id}/ask`,
      jsonRequest({ question: "Why is billing moving to the ledger service?" }),
    );
    expect(res.status).toBe(201);
    const answer = AnswerSchema.parse(await res.json());
    expect(answer.confidence).toBe("high");
    expect(answer.citations).toHaveLength(1);
    expect(answer.citations[0]).toMatchObject({
      ref: 1,
      sourceTitle: "ADR-0007: Move billing to the ledger service",
    });
    expect(answer.citations[0]?.excerpt.length).toBeGreaterThan(0);
    expect(answer.relatedItems.length).toBeGreaterThanOrEqual(1);
    expect(answer.relatedItems.length).toBeLessThanOrEqual(2);
    expect(answer.currentState).toEqual({
      statement: "Invoice migration is blocked.",
      asOf: "2026-03-04",
    });

    const askCall = t.gemini.calls.find((c) => c.purpose === "ask");
    expect(askCall?.prompt).toContain("[1] document");
    expect(askCall?.prompt).toContain("Context items:");

    const history = AnswerListSchema.parse(
      await (await t.app.request(`/api/v1/projects/${project.id}/questions`)).json(),
    );
    expect(history.items.map((a) => a.id)).toEqual([answer.id]);
  });

  it("ignores chunks from sources that did not finish processing", async () => {
    t = createTestApp({ gemini: createFakeGemini({ failWith: new Error("model unavailable") }) });
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain(); // chunks were written, extraction failed
    const res = await t.app.request(
      `/api/v1/projects/${project.id}/ask`,
      jsonRequest({ question: "Why is billing moving to the ledger service?" }),
    );
    expect(res.status).toBe(201);
    expect(AnswerSchema.parse(await res.json()).confidence).toBe("insufficient");
  });

  it("is honest when there is no evidence", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    const res = await t.app.request(
      `/api/v1/projects/${project.id}/ask`,
      jsonRequest({ question: "Who owns checkout?" }),
    );
    expect(res.status).toBe(201);
    const answer = AnswerSchema.parse(await res.json());
    expect(answer.confidence).toBe("insufficient");
    expect(answer.citations).toEqual([]);
    expect(t.gemini.calls.filter((c) => c.purpose === "ask")).toHaveLength(0);
  });
});
