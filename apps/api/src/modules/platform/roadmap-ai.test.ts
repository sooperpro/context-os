import { describe, expect, it } from "vitest";
import { draftPrompt } from "../learning/tutorial-ai.js";
import {
  checkPlan,
  newModulesFor,
  planKnowledgeCheck,
  planPrompt,
  type RoadmapPlan,
} from "./roadmap-ai.js";

/** The checks a planned roadmap goes through before anything is saved (N-18, no AI). */
describe("Roadmap plan checks", () => {
  const module = (title: string, tutorialId: string | null = null) => ({
    tutorialId,
    title,
    kind: "process" as const,
    focus: title,
    why: `Why ${title}`,
  });
  const plan = (overrides: Partial<RoadmapPlan> = {}): RoadmapPlan => ({
    stages: [
      {
        name: "Induction",
        weekStart: 1,
        weekEnd: 1,
        modules: [module("Security basics"), module("Our pricing", "t-pricing")],
      },
      { name: "Role training", weekStart: 2, weekEnd: 4, modules: [module("Sales process")] },
    ],
    probationDays: 180,
    checkins: [
      { title: "2-week check-in", day: 14 },
      { title: "4-week review", day: 28 },
    ],
    policyNote: "From the HR policy [S1].",
    gaps: ["Competitor battlecards"],
    ...overrides,
  });

  it("keeps known tutorials, turns unknown ids into new modules and drops repeats", () => {
    const checked = checkPlan(
      plan({
        stages: [
          {
            name: "Induction",
            weekStart: 1,
            weekEnd: 1,
            modules: [
              module("Our pricing", "t-pricing"),
              module("Made-up tutorial", "t-missing"),
              module("Our pricing", "t-pricing"),
              module("  "),
            ],
          },
        ],
      }),
      new Set(["t-pricing"]),
    );
    expect(checked.stages[0]!.modules.map((entry) => [entry.title, entry.tutorialId])).toEqual([
      ["Our pricing", "t-pricing"],
      ["Made-up tutorial", null],
    ]);
  });

  it("keeps weeks, probation and check-ins in range, at most 20 modules", () => {
    const many = Array.from({ length: 30 }, (_, index) => module(`Module ${index + 1}`));
    const checked = checkPlan(
      plan({
        stages: [{ name: "Everything", weekStart: -3, weekEnd: 400, modules: many }],
        probationDays: 2000,
        checkins: [
          { title: "Day zero", day: 0 },
          { title: "Late", day: 900 },
          { title: "Month one", day: 30 },
        ],
      }),
      new Set(),
    );
    expect(checked.stages[0]).toMatchObject({ weekStart: 1, weekEnd: 104 });
    expect(checked.stages[0]!.modules).toHaveLength(20);
    expect(checked.probationDays).toBe(730);
    expect(checked.checkins).toEqual([{ title: "Month one", day: 30 }]);
  });

  it("leaves out check-ins that repeat the probation review every record already has", () => {
    const checked = checkPlan(
      plan({
        checkins: [
          { title: "Probation review", day: 180 },
          { title: "Manager recommendation to People Ops", day: 166 },
          { title: "End of probation chat", day: 200 },
          { title: "2-week check-in", day: 14 },
        ],
      }),
      new Set(),
    );
    expect(checked.checkins).toEqual([
      { title: "2-week check-in", day: 14 },
      { title: "Manager recommendation to People Ops", day: 166 },
    ]);
  });

  it("drops stages left without modules and sorts them by week", () => {
    const checked = checkPlan(
      plan({
        stages: [
          { name: "Later", weekStart: 3, weekEnd: 4, modules: [module("Practice")] },
          { name: "Empty", weekStart: 2, weekEnd: 2, modules: [] },
          { name: "First", weekStart: 1, weekEnd: 2, modules: [module("Basics")] },
        ],
      }),
      new Set(),
    );
    expect(checked.stages.map((stage) => stage.name)).toEqual(["First", "Later"]);
  });

  it("drafts only as many new modules as the knowledge supports; the rest become gaps", () => {
    expect(newModulesFor(5)).toBe(2);
    expect(newModulesFor(33)).toBe(9);
    const checked = checkPlan(
      plan({
        stages: [
          {
            name: "Induction",
            weekStart: 1,
            weekEnd: 2,
            modules: [
              module("Our pricing", "t-pricing"),
              module("Our founding"),
              module("Our product"),
              module("Our customers"),
            ],
          },
        ],
        gaps: [],
      }),
      new Set(["t-pricing"]),
      { maxNew: newModulesFor(5) },
    );
    // Existing tutorials don't count against the cap.
    expect(checked.stages[0]!.modules.map((entry) => entry.title)).toEqual([
      "Our pricing",
      "Our founding",
      "Our product",
    ]);
    expect(checked.gaps).toEqual(["Our customers (not enough company knowledge yet)"]);
  });

  it("says so in the policy note when planned stages are left out", () => {
    const checked = checkPlan(
      plan({
        policyNote: "Defaults used: 12 weeks in 3 stages.",
        stages: [
          { name: "Induction", weekStart: 1, weekEnd: 2, modules: [module("Basics")] },
          { name: "Core", weekStart: 3, weekEnd: 6, modules: [] },
          { name: "Ownership", weekStart: 7, weekEnd: 12, modules: [] },
        ],
      }),
      new Set(),
    );
    expect(checked.policyNote).toBe(
      "Defaults used: 12 weeks in 3 stages. 2 planned stages had no modules the knowledge supports and were left out, so the roadmap runs 2 weeks.",
    );
  });

  it("needs a few usable Hub items before planning", () => {
    expect(planKnowledgeCheck({ items: [], jobTitle: "Sales executive" })).toContain(
      "Not enough company knowledge to plan a roadmap for Sales executive",
    );
  });

  it("tells the AI how the company describes itself, and nothing when it hasn't (N-7)", () => {
    const company = {
      description: "Fleet telematics for logistics companies.",
      products: "Tracker, Route planner",
      workingHours: "",
    };
    const base = {
      jobTitle: "Sales executive",
      team: null,
      seniority: null,
      defaultProbationDays: 90,
      projects: [],
      items: [],
      topics: [],
      tutorials: [],
    };
    const { prompt } = planPrompt({ ...base, company });
    expect(prompt).toContain(
      "<company_profile>\nWhat the company does: Fleet telematics for logistics companies.\nProducts and services: Tracker, Route planner\n</company_profile>",
    );
    expect(prompt).not.toContain("Working hours");
    expect(planPrompt(base).prompt).not.toContain("<company_profile>");
    expect(
      draftPrompt({
        projectName: null,
        audience: "New hires",
        focus: null,
        covers: null,
        items: [],
        passages: [],
        company,
      }).prompt,
    ).toContain("What the company does: Fleet telematics for logistics companies.");
  });
});
