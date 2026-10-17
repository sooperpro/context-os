import { randomUUID } from "node:crypto";
import { MeSchema } from "@contextos/shared";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { assignments, memberships, users } from "../../db/schema.js";
import { createProject, createTestApp, jsonRequest, type TestApp } from "../../test/helpers.js";

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

describe("Settings › Profile fields", () => {
  let t: TestApp;
  afterEach(() => t?.close());

  it("saves pronouns, location, bio, skills and avatar shape, and shows them to colleagues", async () => {
    t = createTestApp();
    const me = t.container.devActor.id;
    const workspaceId = t.container.workspace.id;
    const saved = await t.app.request(
      "/api/v1/users/me",
      jsonRequest(
        {
          pronouns: "she/her",
          location: "Lisbon",
          bio: "I look after billing.",
          skills: ["Kafka", "kafka", "Go"],
          avatarShape: "flower",
        },
        "PATCH",
      ),
    );
    expect(saved.status).toBe(200);
    const expected = {
      pronouns: "she/her",
      location: "Lisbon",
      bio: "I look after billing.",
      skills: ["Kafka", "Go"],
      avatarShape: "flower",
      // No booking page set (ALL-3).
      bookingUrl: "",
    };
    expect(((await saved.json()) as { profile: unknown }).profile).toEqual(expected);
    const read = MeSchema.parse(await (await t.app.request("/api/v1/users/me")).json());
    expect(read.profile).toEqual(expected);

    // The first-day welcome keeps what Settings saved.
    const welcome = await t.app.request(
      "/api/v1/me/welcome",
      jsonRequest({
        preferredName: "May",
        pronouns: "she/they",
        location: "Porto",
        known: [],
        reminders: "email",
      }),
    );
    expect(welcome.status).toBe(200);

    t.container.db.insert(users).values({ id: "maya", name: "Maya" }).run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId, userId: "maya", role: "member" })
      .run();
    Object.assign(t.container.devActor, { id: "maya", name: "Maya", role: "member" });
    const profile = (await (await t.app.request(`/api/v1/people/${me}`)).json()) as {
      profile: unknown;
    };
    expect(profile.profile).toEqual({ ...expected, pronouns: "she/they", location: "Porto" });
    const directory = (await (await t.app.request("/api/v1/users?q=kafka")).json()) as {
      items: Array<{ id: string; profile: { skills: string[] } & Record<string, unknown> }>;
    };
    expect(directory.items.map((item) => item.id)).toEqual([me]);
    expect(directory.items[0]?.profile).toEqual({
      pronouns: "she/they",
      skills: ["Kafka", "Go"],
      avatarShape: "flower",
    });
  });

  it("clears fields with empty values and rejects what doesn't fit", async () => {
    t = createTestApp();
    await t.app.request(
      "/api/v1/users/me",
      jsonRequest({ location: "Lisbon", avatarShape: "sunny" }, "PATCH"),
    );
    const cleared = await t.app.request(
      "/api/v1/users/me",
      jsonRequest({ location: "", avatarShape: null }, "PATCH"),
    );
    expect(cleared.status).toBe(200);
    const me = MeSchema.extend({ organization: z.record(z.string(), z.unknown()) }).parse(
      await (await t.app.request("/api/v1/users/me")).json(),
    );
    expect(me.profile).toMatchObject({ location: "", avatarShape: null });
    expect(me.organization).not.toHaveProperty("location");

    for (const body of [
      { skills: Array.from({ length: 21 }, (_, index) => `Skill ${index}`) },
      { avatarShape: "star" },
      { bio: "x".repeat(601) },
    ]) {
      const res = await t.app.request("/api/v1/users/me", jsonRequest(body, "PATCH"));
      expect(res.status).toBe(400);
    }
  });
});
