import {
  OnboardingRecordSchema,
  SetupGenerateResultSchema,
  TemplateAudienceSchema,
  SetupRolesSchema,
  TemplateDetailSchema,
  TemplateSuggestionSchema,
} from "@contextos/shared";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  departments,
  memberships,
  platformRecords,
  sourceObjects,
  teams,
  users,
} from "../../db/schema.js";
import {
  addSource,
  createFakeGemini,
  createProject,
  createTestApp,
  jsonRequest,
  type TestApp,
} from "../../test/helpers.js";
import type { Actor } from "../../types.js";
import { roleKey } from "./onboarding-records.js";

/**
 * N-18: one template per role. The same role is the same job title (seniority aside) in the same
 * department; new hires in it share one template, published or still a draft.
 */
describe("Templates for roles: suggested, shared and drafted once", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const SALES = "11111111-1111-4111-8111-111111111111";
  const PARTNERS = "22222222-2222-4222-8222-222222222222";
  const INBOUND = "33333333-3333-4333-8333-333333333333";

  const member = (id: string, role: Actor["role"], organization: Record<string, unknown> = {}) => {
    t.container.db
      .insert(users)
      .values({ id, name: `${id} Doe`, email: `${id}@example.test` })
      .onConflictDoNothing()
      .run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role, organization })
      .onConflictDoNothing()
      .run();
  };
  const as = (id: string, role: Actor["role"]) =>
    Object.assign(t.container.devActor, { id, name: `${id} Doe`, role });
  const templateRuns = () =>
    t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.kind, "generation_run"))
      .all()
      .filter((row) => row.data.kind === "template");
  /** A workspace with knowledge, a Sales department (Inbound team) and a Partnerships one. */
  const setUp = async (env: Record<string, string> = {}) => {
    const gemini = createFakeGemini();
    t = createTestApp({ gemini, starterTemplates: false, env });
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    t.container.db.update(sourceObjects).set({ visibility: "workspace" }).run();
    const ws = t.container.workspace.id;
    t.container.db
      .insert(departments)
      .values([
        { id: SALES, workspaceId: ws, name: "Sales" },
        { id: PARTNERS, workspaceId: ws, name: "Partnerships" },
      ])
      .run();
    t.container.db
      .insert(teams)
      .values({ id: INBOUND, workspaceId: ws, departmentId: SALES, name: "Inbound" })
      .run();
    member("dana", "manager");
    member("hr1", "hr");
    return gemini;
  };
  const onboard = (id: string, title: string, team: string, extra: Record<string, unknown>) =>
    t.app.request(
      "/api/v1/people-ops/onboardings",
      jsonRequest({
        name: `${id} Doe`,
        title,
        email: `${id}@example.test`,
        team,
        startDate: new Date().toISOString().slice(0, 10),
        managerId: "dana",
        buddyId: null,
        templateId: null,
        ...extra,
      }),
    );
  const suggest = async (query: string) =>
    TemplateSuggestionSchema.parse(
      await (await t.app.request(`/api/v1/people-ops/template-suggestion?${query}`)).json(),
    );

  it("reduces a job title to its role", () => {
    expect(roleKey("Senior Sales Executive")).toBe("sales executive");
    expect(roleKey("Sr. Software Engineer II")).toBe("software engineer");
    expect(roleKey("Lead  Designer")).toBe("designer");
    expect(roleKey("Team lead")).toBe("team lead");
    expect(roleKey("Head of Sales")).toBe("head of sales");
  });

  it("suggests one role's template whatever the seniority or team, but not another department's", async () => {
    await setUp();
    as("hr1", "hr");
    // HR generated "Sales executive" for the Sales department, with no team.
    const generated = await t.app.request(
      "/api/v1/roadmaps/generate",
      jsonRequest({ jobTitle: "Sales executive", departmentId: SALES }),
    );
    const { id } = (await generated.json()) as { id: string };

    // A Senior Sales executive in Inbound (a Sales team) is the same role: its draft is suggested.
    expect(
      (await suggest("title=Senior%20Sales%20Executive&team=Inbound")).suggested,
    ).toMatchObject({ id, status: "draft", fits: true });
    const senior = await onboard("sam", "Senior Sales Executive", "Inbound", { templateId: id });
    expect(OnboardingRecordSchema.parse(await senior.json()).templateDraft?.id).toBe(id);

    // A Sales executive in Partnerships is another role: nothing is suggested.
    const partners = await suggest(`title=Sales%20executive&departmentId=${PARTNERS}`);
    expect(partners.suggested).toBeNull();
    expect(partners.options.find((option) => option.id === id)).toMatchObject({ fits: false });
    expect(templateRuns()).toHaveLength(1);
  });

  it("counts a copied draft as the role's template too", async () => {
    await setUp();
    as("hr1", "hr");
    const generated = await t.app.request(
      "/api/v1/roadmaps/generate",
      jsonRequest({ jobTitle: "Support specialist" }),
    );
    const { id: baseId } = (await generated.json()) as { id: string };
    await t.drain();
    const copy = TemplateDetailSchema.parse(
      await (
        await t.app.request(
          "/api/v1/people-ops/templates",
          jsonRequest({ name: "Support specialist (EU)", baseId }),
        )
      ).json(),
    );
    expect(copy.roles).toEqual(["Support specialist"]);
    // Both fit the role; the generated one was first and fits as well as its copy.
    const support = await suggest("title=Support%20Specialist&team=Support");
    expect(support.suggested?.status).toBe("draft");
    expect(
      support.options
        .filter((option) => option.fits)
        .map((option) => option.id)
        .sort(),
    ).toEqual([baseId, copy.id].sort());
    expect(templateRuns()).toHaveLength(1);
  });

  it("suggests the published template first, and nothing when no template fits", async () => {
    await setUp();
    as("hr1", "hr");
    expect(await suggest("title=Data%20analyst&team=Inbound")).toMatchObject({
      suggested: null,
      department: { id: SALES, name: "Sales" },
    });
    const generated = await t.app.request(
      "/api/v1/roadmaps/generate",
      jsonRequest({ jobTitle: "Account executive", departmentId: SALES }),
    );
    const { id } = (await generated.json()) as { id: string };
    await t.drain();
    const template = TemplateDetailSchema.parse(
      await (await t.app.request(`/api/v1/people-ops/templates/${id}`)).json(),
    );
    for (const module of template.stages.flatMap((stage) => stage.modules))
      await t.app.request(
        `/api/v1/tutorials/${module.tutorialId}/publish`,
        jsonRequest({ updateLearners: false }),
      );
    await t.app.request(
      `/api/v1/people-ops/templates/${id}/publish`,
      jsonRequest({
        stages: template.stages.map((stage) => ({
          id: stage.id,
          moduleIds: stage.modules.map((module) => module.id),
        })),
        note: "",
      }),
    );
    expect(
      (await suggest(`title=Senior%20Account%20Executive&departmentId=${SALES}`)).suggested,
    ).toMatchObject({ id, status: "published", fits: true });
    // Choosing it attaches it at once.
    const response = await onboard("ana", "Account executive", "Inbound", { templateId: id });
    expect(OnboardingRecordSchema.parse(await response.json())).toMatchObject({
      template: { id },
      templateDraft: null,
    });
    // Employees can't look templates up.
    member("emp", "member");
    as("emp", "member");
    expect((await t.app.request("/api/v1/people-ops/template-suggestion?title=x")).status).toBe(
      403,
    );
  });

  it("suggests the organisation's roles, teams and departments, and saves a template's department", async () => {
    await setUp();
    member("rep1", "member", { jobTitle: "Sales executive", departmentId: SALES, teamId: INBOUND });
    member("rep2", "member", { jobTitle: "sales executive" });
    member("eng1", "member", { jobTitle: "Backend engineer" });
    as("hr1", "hr");
    const generated = await t.app.request(
      "/api/v1/roadmaps/generate",
      jsonRequest({ jobTitle: "Partner manager", departmentId: PARTNERS }),
    );
    const { id } = (await generated.json()) as { id: string };
    await t.drain();
    const audience = TemplateAudienceSchema.parse(
      await (await t.app.request("/api/v1/people-ops/template-audience")).json(),
    );
    // Each title once, whatever its case; teams with their department.
    expect(audience.roles).toEqual(["Backend engineer", "Partner manager", "Sales executive"]);
    expect(audience.teams).toEqual([{ name: "Inbound", departmentId: SALES }]);
    expect(audience.departments.map((department) => department.name)).toEqual([
      "Partnerships",
      "Sales",
    ]);

    // The editor saves a department; the template then fits that department's hires.
    const read = async () =>
      TemplateDetailSchema.parse(
        await (await t.app.request(`/api/v1/people-ops/templates/${id}`)).json(),
      );
    const before = await read();
    expect(before.department).toEqual({ id: PARTNERS, name: "Partnerships" });
    const stages = before.stages.map((stage) => ({
      id: stage.id,
      moduleIds: stage.modules.map((module) => module.id),
    }));
    const saved = await t.app.request(
      `/api/v1/people-ops/templates/${id}/draft`,
      jsonRequest({ stages, departmentId: SALES }),
    );
    expect(await saved.json()).toMatchObject({ department: { id: SALES, name: "Sales" } });
    expect((await suggest(`title=Partner%20manager&departmentId=${SALES}`)).suggested?.id).toBe(id);
    expect(
      (await suggest(`title=Partner%20manager&departmentId=${PARTNERS}`)).suggested,
    ).toBeNull();
    // Clearing it: any department.
    await t.app.request(
      `/api/v1/people-ops/templates/${id}/draft`,
      jsonRequest({ stages, departmentId: null }),
    );
    expect((await read()).department).toBeNull();
    expect(
      (
        await t.app.request(
          `/api/v1/people-ops/templates/${id}/draft`,
          jsonRequest({ stages, departmentId: "55555555-5555-4555-8555-555555555555" }),
        )
      ).status,
    ).toBe(400);
  });

  it("never drafts a template on its own when HR or an admin chooses later", async () => {
    await setUp();
    member("admin1", "admin");
    as("hr1", "hr");
    const later = await onboard("lee", "Data analyst", "Inbound", { templateId: null });
    expect(OnboardingRecordSchema.parse(await later.json())).toMatchObject({
      template: null,
      templateDraft: null,
    });
    as("admin1", "admin");
    await t.app.request(
      "/api/v1/users/invite",
      jsonRequest({
        email: "kim@example.test",
        jobTitle: "Data analyst",
        departmentId: SALES,
        startDate: new Date().toISOString().slice(0, 10),
        isNewHire: true,
      }),
    );
    t.container.db
      .insert(users)
      .values({ id: "kim", name: "Kim", email: "kim@example.test" })
      .run();
    t.container.identity.acceptInvitations("kim", "kim@example.test");
    as("hr1", "hr");
    await t.app.request("/api/v1/people-ops/onboardings");
    await t.drain();
    expect(templateRuns()).toHaveLength(0);
    expect(
      t.container.db
        .select()
        .from(platformRecords)
        .where(eq(platformRecords.kind, "onboarding_template"))
        .all(),
    ).toHaveLength(0);
  });

  it("lets admins invite a new hire with the template for their role", async () => {
    await setUp();
    member("admin1", "admin");
    as("admin1", "admin");
    const generated = await t.app.request(
      "/api/v1/roadmaps/generate",
      jsonRequest({ jobTitle: "Sales executive", departmentId: SALES }),
    );
    const { id: draftId } = (await generated.json()) as { id: string };
    expect((await suggest(`title=Sales%20executive&teamId=${INBOUND}`)).suggested?.id).toBe(
      draftId,
    );
    const invited = await t.app.request(
      "/api/v1/users/invite",
      jsonRequest({
        email: "nina@example.test",
        jobTitle: "Sales executive",
        departmentId: SALES,
        teamId: INBOUND,
        startDate: new Date().toISOString().slice(0, 10),
        isNewHire: true,
        templateId: draftId,
      }),
    );
    expect(invited.status).toBe(201);
    const invitation = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.kind, "invitation"))
      .get();
    const templateId = String(invitation?.data.templateId);
    expect(templateId).toBe(draftId);
    // A template only goes with a new hire.
    expect(
      (
        await t.app.request(
          "/api/v1/users/invite",
          jsonRequest({ email: "x@example.test", templateId, isNewHire: false }),
        )
      ).status,
    ).toBe(400);

    // She accepts; People Ops' list makes her record, waiting for that draft.
    t.container.db
      .insert(users)
      .values({ id: "nina", name: "Nina", email: "nina@example.test" })
      .run();
    expect(t.container.identity.acceptInvitations("nina", "nina@example.test")).toBe(1);
    as("hr1", "hr");
    await t.app.request("/api/v1/people-ops/onboardings");
    const record = t.container.db
      .select()
      .from(platformRecords)
      .where(and(eq(platformRecords.kind, "hr_onboarding"), eq(platformRecords.ownerId, "nina")))
      .get();
    expect(record?.data).toMatchObject({ templateId: null, pendingTemplateId: templateId });
  });

  it("drafts every role's template in setup from a one-time allowance, one plan at a time", async () => {
    const gemini = await setUp({ AI_DAILY_TEMPLATE_LIMIT: "1", AI_SETUP_TEMPLATE_ALLOWANCE: "3" });
    member("rep1", "member", { jobTitle: "Sales executive", departmentId: SALES, teamId: INBOUND });
    member("rep2", "member", { jobTitle: "Senior Sales Executive", departmentId: SALES });
    const roles = async () =>
      SetupRolesSchema.parse(
        await (await t.app.request("/api/v1/workspaces/current/setup/roles")).json(),
      );
    // Roles from people's titles (two people, one role) plus ones added before hiring.
    const saved = await t.app.request(
      "/api/v1/workspaces/current/setup/roles",
      jsonRequest(
        {
          roles: [
            { title: "Partner manager", departmentId: PARTNERS, teamId: null },
            { title: "Sales engineer", departmentId: SALES, teamId: null },
            { title: "Solutions architect", departmentId: SALES, teamId: null },
          ],
        },
        "PUT",
      ),
    );
    expect(saved.status).toBe(200);
    const listed = await roles();
    expect(listed.roles.map((role) => [role.title, role.departmentName, role.people])).toEqual([
      ["Partner manager", "Partnerships", 0],
      ["Sales engineer", "Sales", 0],
      ["Sales executive", "Sales", 2],
      ["Solutions architect", "Sales", 0],
    ]);
    expect(listed.allowance.templates).toEqual({ used: 0, total: 3 });

    // Three come out of the allowance (more than today's limit of 1); the fourth uses that limit.
    const generate = await t.app.request(
      "/api/v1/workspaces/current/setup/roles/generate",
      jsonRequest({
        roles: listed.roles.map(({ title, departmentId, teamId }) => ({
          title,
          departmentId,
          teamId,
        })),
      }),
    );
    expect(generate.status).toBe(202);
    const result = SetupGenerateResultSchema.parse(await generate.json());
    expect(result).toMatchObject({ started: 4, stopped: null });
    expect(result.allowance.templates).toEqual({ used: 3, total: 3 });
    expect(templateRuns().filter((run) => run.data.setup === true)).toHaveLength(3);
    await t.drain();
    expect((await roles()).roles.every((role) => role.template?.status === "draft")).toBe(true);
    // Later plans are offered the company modules earlier ones drafted, to share them.
    const plans = gemini.calls.filter((call) => call.purpose === "roadmap_plan");
    expect(plans).toHaveLength(4);
    expect(plans.at(-1)?.prompt).toContain("How billing works at Atlas");

    // Asking again starts nothing: every role has its template; the step's evidence is met.
    const again = SetupGenerateResultSchema.parse(
      await (
        await t.app.request(
          "/api/v1/workspaces/current/setup/roles/generate",
          jsonRequest({ roles: [{ title: "Sales executive", departmentId: SALES, teamId: null }] }),
        )
      ).json(),
    );
    expect(again.started).toBe(0);
    const setup = (await (await t.app.request("/api/v1/workspaces/current/setup")).json()) as {
      evidence: { completed: Record<string, boolean> };
    };
    expect(setup.evidence.completed.onboarding_templates).toBe(true);
    // Setup is for owners and admins.
    as("hr1", "hr");
    expect((await t.app.request("/api/v1/workspaces/current/setup/roles")).status).toBe(403);
  });
});
