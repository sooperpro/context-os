import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { assignments, memberships, users } from "../../db/schema.js";
import { createProject, createTestApp, type TestApp } from "../../test/helpers.js";

describe("GET /people/:id", () => {
  let t: TestApp;
  afterEach(() => t?.close());

  it("lists every active domain-owner assignment of the member, at any scope", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    const workspaceId = t.container.workspace.id;
    t.container.db.insert(users).values({ id: "maya", name: "Maya" }).run();
    t.container.db
      .insert(memberships)
      .values({
        workspaceId,
        userId: "maya",
        role: "member",
        organization: { jobTitle: "Staff Engineer" },
      })
      .run();
    const own = (
      scopeType: "workspace" | "project" | "section",
      scopeId: string,
      expiresAt?: Date,
    ) =>
      t.container.db
        .insert(assignments)
        .values({
          id: randomUUID(),
          workspaceId,
          userId: "maya",
          type: "domain_owner",
          scopeType,
          scopeId,
          expiresAt,
        })
        .run();
    own("section", `${project.id}:architecture`);
    own("project", project.id);
    // Expired ownership is not expertise.
    own("workspace", workspaceId, new Date(Date.now() - 1_000));

    const res = await t.app.request("/api/v1/people/maya");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      organization: unknown;
      assignments: Array<{ scopeType: string; scopeId: string }>;
    };
    expect(body.organization).toEqual({ jobTitle: "Staff Engineer" });
    expect(body.assignments.map((row) => [row.scopeType, row.scopeId]).sort()).toEqual([
      ["project", project.id],
      ["section", `${project.id}:architecture`],
    ]);
  });
});
