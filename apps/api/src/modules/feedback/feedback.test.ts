import { FeedbackListSchema, FeedbackSchema } from "@contextos/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject, createTestApp, jsonRequest, type TestApp } from "../../test/helpers.js";

describe("feedback", () => {
  let t: TestApp;
  beforeEach(() => {
    t = createTestApp();
  });
  afterEach(() => {
    t.close();
  });

  it("records and lists feedback", async () => {
    const project = await createProject(t.app);
    const res = await t.app.request(
      `/api/v1/projects/${project.id}/feedback`,
      jsonRequest({ targetType: "overview", targetId: "overview", kind: "outdated", note: "Old" }),
    );
    expect(res.status).toBe(201);
    const created = FeedbackSchema.parse(await res.json());
    expect(created).toMatchObject({ kind: "outdated", note: "Old", actorName: "Developer" });

    const list = FeedbackListSchema.parse(
      await (await t.app.request(`/api/v1/projects/${project.id}/feedback`)).json(),
    );
    expect(list.items).toHaveLength(1);
  });
});
