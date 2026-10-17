import { AnswerSchema, type AssistantAnswer } from "@contextos/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  assignments,
  departments,
  memberships,
  teams,
  users,
  workspaces,
} from "../../db/schema.js";
import {
  createFakeGemini,
  createProject,
  createTestApp,
  jsonRequest,
  type TestApp,
} from "../../test/helpers.js";
import type { Actor } from "../../types.js";
import { createOnboardingRecords, ONBOARDING } from "../platform/onboarding-records.js";
import type { AnswerOutput } from "./answer.schema.js";
import { createOrgContext } from "./org-context.js";

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** What the model says when it is given a directory fact: the first one, cited. */
const DIRECTORY_ANSWER: AnswerOutput = {
  answer: "Rahul Agarwal is an Engineering Manager on the Platform team [D1].",
  confidence: "high",
  uncertainties: [],
  citations: [],
  directoryRefs: [1],
  relatedItemRefs: [],
};

describe("Context Bot knows the organisation", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const OTHER = "ws-other";

  const member = (
    workspaceId: string,
    id: string,
    name: string,
    role: Actor["role"],
    {
      managerId = null,
      organization = {},
      preferences = {},
      status = "active",
    }: {
      managerId?: string | null;
      organization?: Record<string, unknown>;
      preferences?: Record<string, unknown>;
      status?: "active" | "suspended";
    } = {},
  ) => {
    t.container.db
      .insert(users)
      .values({ id, name, email: `${id}@example.test`, preferences })
      .onConflictDoNothing()
      .run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId, userId: id, role, managerId, organization, status })
      .run();
  };
  const as = (id: string, workspaceId = t.container.workspace.id) =>
    Object.assign(t.container.devActor, { id, workspaceId, name: id });
  const ask = async (question: string) =>
    (await (
      await t.app.request("/api/v1/assistant/ask", jsonRequest({ question, page: "/" }))
    ).json()) as AssistantAnswer;
  const prompts = () =>
    t.gemini.calls.filter((call) => call.purpose === "ask").map((call) => call.prompt);
  const facts = (id: string, question: string, workspaceId = t.container.workspace.id) => {
    const actor = as(id, workspaceId);
    const role = t.container.identity.requireMember(workspaceId, id).role;
    return createOrgContext(t.container).factsFor({ ...actor, role }, question);
  };

  /**
   * Rahul manages Ivy (ten days into onboarding, Sam her buddy) and Sam on the Platform team; Mia is
   * HR. Another company has its own Rahul, and Ivy also consults for it.
   */
  const world = (answer: AnswerOutput = DIRECTORY_ANSWER) => {
    t = createTestApp({ gemini: createFakeGemini({ answer }) });
    const ws = t.container.workspace.id;
    const { db } = t.container;
    db.insert(departments).values({ id: "dep-eng", workspaceId: ws, name: "Engineering" }).run();
    db.insert(teams)
      .values({ id: "team-platform", workspaceId: ws, departmentId: "dep-eng", name: "Platform" })
      .run();
    const platform = (jobTitle: string, extra: Record<string, unknown> = {}) => ({
      teamId: "team-platform",
      jobTitle,
      ...extra,
    });
    member(ws, "rahul", "Rahul Agarwal", "manager", {
      organization: platform("Engineering Manager"),
      preferences: { profile: { skills: ["Go", "Kafka"], pronouns: "he/him" } },
    });
    member(ws, "ivy", "Ivy Chen", "member", {
      managerId: "rahul",
      organization: platform("Product Engineer", { startDate: day(-10), isNewHire: true }),
    });
    member(ws, "sam", "Sam Ortiz", "member", {
      managerId: "rahul",
      organization: platform("Support Engineer"),
    });
    member(ws, "mia", "Mia Patel", "hr", { organization: { jobTitle: "People Partner" } });
    member(ws, "ada", "Ada Lovelace", "admin");
    member(ws, "gus", "Gus Visitor", "guest");
    member(ws, "zoe", "Zoe Quinn", "member", { status: "suspended" });

    db.insert(workspaces).values({ id: OTHER, name: "Other Co" }).run();
    member(OTHER, "rahulb", "Rahul Banerjee", "owner", {
      organization: { jobTitle: "Sales Lead" },
    });
    member(OTHER, "ivy", "Ivy Chen", "member", { organization: { jobTitle: "Consultant" } });

    const records = createOnboardingRecords(t.container);
    records.store.insert({
      workspaceId: ws,
      ownerId: "mia",
      kind: ONBOARDING,
      status: "active",
      data: records.newRecord(ws, {
        personId: "ivy",
        name: "Ivy Chen",
        title: "Product Engineer",
        email: "ivy@example.test",
        team: "Platform",
        managerId: "rahul",
        buddyId: "sam",
        templateId: null,
        peoplePartnerId: "mia",
        startDate: day(-10),
      }) as unknown as Record<string, unknown>,
    });
  };

  it("answers who someone is from the directory, cited, with their profile a click away", async () => {
    world();
    await createProject(t.app, "Billing");

    const body = await ask("who is rahul");
    expect(body).toMatchObject({
      outcome: "answered",
      confidence: { level: "verified", label: "Verified · from the ContextOS directory" },
    });
    expect(body.blocks[0]).toMatchObject({ text: expect.stringContaining("[1]") as unknown });
    expect(body.sources).toEqual([
      {
        title: "Rahul Agarwal",
        system: "ContextOS",
        provider: null,
        detail: "Engineering Manager · Platform team",
        url: null,
        to: "/people/rahul",
        stale: null,
      },
    ]);
    expect(body.people[0]).toMatchObject({ person: { id: "rahul", name: "Rahul Agarwal" } });

    const prompt = prompts().at(-1)!;
    expect(prompt).toContain("[D1] Rahul Agarwal, Engineering Manager.");
    expect(prompt).toContain("Workspace role: Manager.");
    expect(prompt).toContain("Team: Platform team, Engineering department.");
    expect(prompt).toContain("Manages Ivy Chen, Sam Ortiz.");
    expect(prompt).toContain("Skills: Go, Kafka.");
    expect(prompt).toContain("Pronouns: he/him.");
  });

  it("never reads another workspace, even for someone in both", async () => {
    world();
    await createProject(t.app, "Billing");

    await ask("who is rahul");
    await ask("what does ivy do?");
    const [rahul, ivy] = prompts();
    expect(rahul).toContain("Rahul Agarwal");
    expect(rahul).not.toContain("Banerjee");
    expect(ivy).toContain("Ivy Chen, Product Engineer.");
    expect(ivy).not.toContain("Consultant");

    // Asked in the other company: only its Rahul and its Ivy, and no project there to answer in.
    as("rahulb", OTHER);
    const other = await ask("who is rahul?");
    expect(other.outcome).toBe("answered");
    expect(other.sources.map((source) => source.title)).toEqual(["Rahul Banerjee"]);
    expect(JSON.stringify(other)).not.toContain("Agarwal");
    expect(facts("rahulb", "who is ivy", OTHER).map((fact) => fact.text)).toEqual([
      expect.stringContaining("Ivy Chen, Consultant."),
    ]);
  });

  it("gives guests nothing from the directory and leaves suspended people out", async () => {
    world();
    as("gus");
    expect(facts("gus", "who is rahul")).toEqual([]);
    expect((await ask("who is rahul")).outcome).toBe("no_answer");
    expect(prompts()).toEqual([]);

    as("dev-user");
    expect(facts("dev-user", "who is zoe")).toEqual([]);
  });

  it("shows private fields and onboarding only to the person, their manager, HR and the Owner", () => {
    world();
    const about = (viewer: string) => facts(viewer, "who is ivy")[0]!.text;

    // A colleague sees what the People page shows them: a new joiner, no start date or onboarding.
    expect(about("sam")).toContain("A new joiner.");
    expect(about("sam")).not.toContain("Start date");
    expect(about("sam")).not.toContain("Onboarding:");
    // An admin gets no people data beyond the directory.
    expect(about("ada")).not.toContain("Onboarding:");

    for (const viewer of ["rahul", "mia", "dev-user"]) {
      expect(about(viewer), viewer).toContain(`Start date ${day(-10)}.`);
      expect(about(viewer), viewer).toMatch(/Onboarding: started .* \(week 2\);.*buddy Sam Ortiz/);
    }
    // Ivy sees her own onboarding, but not the status line written for the people looking after it.
    const own = facts("ivy", "who is my buddy?")[0]!.text;
    expect(own).toContain("buddy Sam Ortiz");
    expect(own).not.toMatch(/on track|at risk|blocked|not started/);
  });

  it("finds people by the asker, a role, a title, a team, a department and project ownership", async () => {
    world();
    const billing = await createProject(t.app, "Billing");
    t.container.db
      .insert(assignments)
      .values({
        id: "owns-billing",
        workspaceId: t.container.workspace.id,
        userId: "rahul",
        type: "domain_owner",
        scopeType: "project",
        scopeId: billing.id,
      })
      .run();
    const titles = (id: string, question: string) => facts(id, question).map((fact) => fact.title);

    expect(titles("ivy", "Who is my manager?")).toEqual(["Ivy Chen", "Rahul Agarwal"]);
    expect(titles("sam", "Who is Rahul's manager?")).toEqual(["Rahul Agarwal"]);
    expect(titles("sam", "Who is in HR?")).toEqual(["Mia Patel"]);
    expect(titles("sam", "who are the support engineers")).toEqual(["Sam Ortiz"]);
    expect(titles("sam", "Who is on the Platform team?")).toEqual(["Platform team"]);
    expect(facts("sam", "Who is on the Platform team?")[0]!.text).toContain(
      "has 3 people: Ivy Chen (Product Engineer), Rahul Agarwal (Engineering Manager), Sam Ortiz (Support Engineer).",
    );
    expect(titles("sam", "What teams are in engineering?")).toEqual(["Engineering department"]);
    expect(facts("sam", "Who is in engineering?")[0]!.text).toBe(
      "The Engineering department has the teams Platform and 3 people: Ivy Chen (Product Engineer) in Platform, Rahul Agarwal (Engineering Manager) in Platform, Sam Ortiz (Support Engineer) in Platform.",
    );
    // A project named after a team is the project, not the team.
    as("dev-user");
    await createProject(t.app, "Platform architecture");
    expect(titles("sam", "Who owns Platform architecture?")).toEqual(["Platform architecture"]);
    expect(facts("sam", "Who owns Billing?").at(-1)).toMatchObject({
      kind: "project",
      text: "The Billing project's domain owners in ContextOS are Rahul Agarwal (Engineering Manager).",
      to: `/projects/${billing.slug}`,
    });
    expect(facts("sam", "who is rahul")[0]!.text).toContain(
      "Owns the Billing project in ContextOS.",
    );
    // Nothing about people: no facts, so answers stay with the documents.
    expect(facts("sam", "Why is billing moving to the ledger service?")).toEqual([]);
  });

  it("refuses pay questions about a person before reading the directory", async () => {
    world();
    await createProject(t.app, "Billing");
    expect((await ask("What is Rahul's salary?")).outcome).toBe("restricted");
    expect(prompts()).toEqual([]);
  });

  it("cites directory facts in a project answer after the passages", async () => {
    world();
    const billing = await createProject(t.app, "Billing");
    const res = await t.app.request(
      `/api/v1/projects/${billing.id}/ask`,
      jsonRequest({ question: "Who is Rahul?" }),
    );
    expect(res.status).toBe(201);
    const answer = AnswerSchema.parse(await res.json());
    expect(answer.confidence).toBe("high");
    expect(answer.answer).toBe("Rahul Agarwal is an Engineering Manager on the Platform team [1].");
    expect(answer.directory).toEqual([
      {
        ref: 1,
        kind: "person",
        id: "rahul",
        title: "Rahul Agarwal",
        detail: "Engineering Manager · Platform team",
        to: "/people/rahul",
      },
    ]);
  });

  it("calls a question it answers only partly, from the directory, partly supported", async () => {
    world({
      ...DIRECTORY_ANSWER,
      answer: "Nothing covers the deal desk. Rahul Agarwal is an Engineering Manager [D1].",
      rationale: "The directory record (D1) says so [D1, D1]; D9 doesn't exist.",
      confidence: "insufficient",
      directoryRefs: [],
    });
    const billing = await createProject(t.app, "Billing");
    const res = await t.app.request(
      `/api/v1/projects/${billing.id}/ask`,
      jsonRequest({ question: "How does the deal desk work, and who is Rahul?" }),
    );
    const answer = AnswerSchema.parse(await res.json());
    expect(answer.confidence).toBe("medium");
    expect(answer.answer).toContain("Engineering Manager [1].");
    expect(answer.rationale).toBe("The directory record [1] says so [1][1]; D9 doesn't exist.");
    expect(answer.directory?.map((entry) => entry.id)).toEqual(["rahul"]);
  });
});
