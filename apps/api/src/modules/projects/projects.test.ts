import { ProjectListSchema, ProjectWithStatsSchema } from "@contextos/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog } from "../../db/schema.js";
import { createProject, createTestApp, jsonRequest, type TestApp } from "../../test/helpers.js";

describe("projects", () => {
  let t: TestApp;
  beforeEach(() => {
    t = createTestApp();
  });
  afterEach(() => {
    t.close();
  });

  it("creates, lists, reads, updates and deletes a project", async () => {
    const created = await createProject(t.app, "Atlas");
    expect(created.name).toBe("Atlas");
    expect(created.stats).toEqual({
      sources: 0,
      readySources: 0,
      contextItems: 0,
      questions: 0,
      lastProcessedAt: null,
    });

    const list = ProjectListSchema.parse(await (await t.app.request("/api/v1/projects")).json());
    expect(list.items.map((p) => p.id)).toEqual([created.id]);

    const read = await t.app.request(`/api/v1/projects/${created.id}`);
    expect(read.status).toBe(200);
    expect(ProjectWithStatsSchema.parse(await read.json()).id).toBe(created.id);

    const updated = await t.app.request(
      `/api/v1/projects/${created.id}`,
      jsonRequest({ name: "Atlas v2", description: "" }, "PATCH"),
    );
    expect(updated.status).toBe(200);
    expect(ProjectWithStatsSchema.parse(await updated.json())).toMatchObject({
      name: "Atlas v2",
      description: null,
    });

    const deleted = await t.app.request(`/api/v1/projects/${created.id}`, { method: "DELETE" });
    expect(deleted.status).toBe(204);
    expect((await t.app.request(`/api/v1/projects/${created.id}`)).status).toBe(404);
  });

  it("validates input and scopes lookups", async () => {
    const bad = await t.app.request("/api/v1/projects", jsonRequest({ name: " " }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    const unknown = await t.app.request(
      "/api/v1/projects/4fd5c1b6-3f9a-4a2b-9c6e-2e0b1f1a9c11/hub",
    );
    expect(unknown.status).toBe(404);

    // A well-formed but unknown slug is a 404; an invalid reference is a 400.
    const unknownSlug = await t.app.request("/api/v1/projects/not-a-uuid/hub");
    expect(unknownSlug.status).toBe(404);
    const malformed = await t.app.request("/api/v1/projects/BAD_SLUG!/hub");
    expect(malformed.status).toBe(400);
  });

  it("records audit entries for mutations", async () => {
    const project = await createProject(t.app);
    const entries = t.container.db.select().from(auditLog).all();
    expect(entries.map((e) => e.action)).toEqual(["project.create"]);
    expect(entries[0]?.projectId).toBe(project.id);
  });
});
