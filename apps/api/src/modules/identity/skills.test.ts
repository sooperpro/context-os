import { SkillSuggestionListSchema } from "@contextos/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memberships, users } from "../../db/schema.js";
import { createTestApp, jsonRequest, type TestApp } from "../../test/helpers.js";
import type { Actor } from "../../types.js";
import { createEscoSkills } from "./skills.js";

const logger = { warn: vi.fn() } as unknown as Parameters<typeof createEscoSkills>[0]["logger"];
const escoReply = (titles: string[]) =>
  new Response(
    JSON.stringify({
      _embedded: {
        results: titles.map((title, index) => ({
          uri: `http://data.europa.eu/esco/skill/${index}`,
          title,
        })),
      },
    }),
  );

describe("ESCO skill lookup (N-10)", () => {
  it("asks ESCO once per text, remembers it, and gives nothing when ESCO fails or is off", async () => {
    const fetch = vi.fn(() => Promise.resolve(escoReply(["Python (computer programming)"])));
    const lookup = createEscoSkills({ baseUrl: "https://esco.test/api/", logger, fetch });
    expect(await lookup("Pyth")).toEqual([
      {
        label: "Python (computer programming)",
        id: "http://data.europa.eu/esco/skill/0",
        source: "esco",
      },
    ]);
    await lookup("pyth");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe(
      "https://esco.test/api/suggest2?text=Pyth&type=skill&language=en&limit=8",
    );

    const failing = createEscoSkills({
      baseUrl: "https://esco.test/api",
      logger,
      fetch: () => Promise.resolve(new Response("busy", { status: 503 })),
    });
    expect(await failing("java")).toEqual([]);
    const off = vi.fn();
    expect(await createEscoSkills({ baseUrl: "", logger, fetch: off })("java")).toEqual([]);
    expect(off).not.toHaveBeenCalled();
  });
});

describe("GET /skills/suggest", () => {
  let t: TestApp;
  afterEach(() => t?.close());

  const person = (id: string, skills: string[], role: Actor["role"] = "member") => {
    t.container.db
      .insert(users)
      .values({ id, name: id, preferences: { profile: { skills } } })
      .run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role })
      .run();
  };
  const suggest = async (q: string) => {
    const res = await t.app.request(`/api/v1/skills/suggest?q=${encodeURIComponent(q)}`);
    expect(res.status).toBe(200);
    return SkillSuggestionListSchema.parse(await res.json()).items;
  };

  it("offers what people here already list, most used first, and saves ESCO ids with skills", async () => {
    t = createTestApp();
    person("a", ["Pricing", "Python"]);
    person("b", ["python", "Kafka"]);
    person("c", ["Pricing strategy"]);
    expect(await suggest("pyth")).toEqual([{ label: "Python", id: null, source: "workspace" }]);
    expect((await suggest("pric")).map((item) => item.label)).toEqual([
      "Pricing",
      "Pricing strategy",
    ]);

    // Guests can't read the directory, so they get nobody's skills.
    Object.assign(t.container.devActor, { id: "g", role: "guest" });
    person("g", [], "guest");
    expect(await suggest("pyth")).toEqual([]);

    Object.assign(t.container.devActor, { id: "a", role: "member" });
    const id = "http://data.europa.eu/esco/skill/ccd0a1d9";
    const saved = await t.app.request(
      "/api/v1/users/me",
      jsonRequest(
        {
          skills: ["Python (computer programming)", "Pricing"],
          skillIds: { "Python (computer programming)": id },
        },
        "PATCH",
      ),
    );
    expect(saved.status).toBe(200);
    const profile = () =>
      t.container.db.select().from(users).where(eq(users.id, "a")).get()!.preferences.profile as {
        skills: string[];
        skillIds: Record<string, string>;
      };
    expect(profile()).toMatchObject({
      skills: ["Python (computer programming)", "Pricing"],
      skillIds: { "Python (computer programming)": id },
    });
    // The id stays while the skill does, and goes with it.
    await t.app.request(
      "/api/v1/users/me",
      jsonRequest({ skills: ["Python (computer programming)"] }, "PATCH"),
    );
    expect(profile().skillIds).toEqual({ "Python (computer programming)": id });
    await t.app.request("/api/v1/users/me", jsonRequest({ skills: ["Pricing"] }, "PATCH"));
    expect(profile().skillIds).toEqual({});
  });
});
