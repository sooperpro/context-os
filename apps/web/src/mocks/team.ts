import type {
  CheckCell,
  CheckinRecord,
  CheckinType,
  MemberModuleState,
  OnboardingStatus,
  PersonRef,
  TeamMemberDetail,
} from "@contextos/shared";
import { HOME_ENDPOINTS as H } from "@/features/home/api/home.api";
import { TEAM_ENDPOINTS as E } from "@/features/team/api/team.api";
import { mockGet, mockPatch, mockPost, MockNotFoundError } from "@/mocks/define";
import { people } from "@/mocks/fixtures/people";
import { dateFromToday } from "@/mocks/fixtures/time";
import { learnerSnapshot } from "@/mocks/learning";

/*
 * Daniel's Platform team, as in the prototype's manager pages: Leah (at risk), Chloe (blocked),
 * Jonah (starts soon, no roadmap), Maya (on track; her modules come from the learning mock) and Arjun
 * (probation recommendation due). Roadmap edits, check-ins and assignments last for the session.
 */

type MemberModule = TeamMemberDetail["modules"][number];
type MemberCheck = TeamMemberDetail["checks"][number];

interface MockMember {
  key: "leah" | "chloe" | "jonah" | "maya" | "arjun";
  person: PersonRef;
  startsIn: number;
  stage: string | null;
  status: OnboardingStatus;
  progress: number;
  expected: number;
  buddy: PersonRef | null;
  readinessIn: number;
  probationIn: number;
  issues: string[];
  insight: TeamMemberDetail["insight"];
  modules: MemberModule[];
  checks: MemberCheck[];
  upcoming: Array<{ id: string; title: string; in: number }>;
  checkins: CheckinRecord[];
}

const module = (
  id: string,
  title: string,
  state: MemberModuleState,
  options: { due?: number; done?: number; note?: string } = {},
): MemberModule => ({
  id,
  title,
  state,
  dueOn: options.due === undefined ? null : dateFromToday(options.due),
  completedOn: options.done === undefined ? null : dateFromToday(options.done),
  note: options.note ?? null,
  postponed: false,
});

const check = (id: string, title: string, state: CheckCell, result: string, note: string | null = null): MemberCheck => ({
  id,
  title,
  state,
  result,
  note,
});

const checkin = (id: string, type: CheckinType, daysAgo: number, pulse: CheckinRecord["pulse"], note: string): CheckinRecord => ({
  id,
  type,
  on: dateFromToday(-daysAgo),
  pulse,
  note,
});

const seed = (): MockMember[] => [
  {
    key: "leah",
    person: people.leah,
    startsIn: -38,
    stage: "Product & systems",
    status: "at_risk",
    progress: 0.34,
    expected: 0.45,
    buddy: people.arjun,
    readinessIn: 22,
    probationIn: 52,
    issues: ["2 modules are 5 days overdue", "Failed “Billing architecture” twice"],
    insight: {
      text: "Both failed attempts missed the idempotency questions, and her last check-in says she’s “unsure who to ask about the ledger”. A session with Priya Nair would cover both.",
      action: { kind: "assign_learning", label: "Book a session with Priya" },
    },
    modules: [
      module("l-arch", "Architecture overview", "done", { done: -19 }),
      module("l-ingest", "The ingest gateway", "done", { done: -14 }),
      module("l-bus", "Event bus and schemas", "done", { done: -11 }),
      module("l-billing", "Billing architecture and Project Kestrel", "overdue", { due: -5, note: "Check failed twice" }),
      module("l-ledger", "Ledger service", "overdue", { due: -5 }),
      module("l-decisions", "Decisions you should know", "todo", { due: 3 }),
    ],
    checks: [
      check("c1", "Company & business model", "pass", "9 of 10"),
      check("c2", "Architecture overview", "pass", "8 of 10"),
      check("c3", "Billing architecture", "fail", "3 of 5 · 2 attempts", "Missed both idempotency questions"),
    ],
    upcoming: [
      { id: "u1", title: "1:1 · Learning plan", in: 1 },
      { id: "u2", title: "60-day readiness review", in: 22 },
      { id: "u3", title: "Probation review", in: 52 },
    ],
    checkins: [
      checkin("k1", "weekly", 12, "concerns", "Unsure who to ask about the ledger. Would like more pairing time."),
      checkin("k2", "weekly", 19, "on_track", "Finished the architecture overview early. Enjoying the ingest work."),
      checkin("k3", "weekly", 26, "on_track", "Dev environment set up and first PR merged."),
    ],
  },
  {
    key: "chloe",
    person: people.chloe,
    startsIn: -21,
    stage: "Product & systems",
    status: "blocked",
    progress: 0.21,
    expected: 0.27,
    buddy: people.leah,
    readinessIn: 38,
    probationIn: 69,
    issues: ["No data warehouse access for 4 days (IT-2291)", "3 upcoming modules need that access"],
    insight: {
      text: "Everything else is on schedule. Escalating IT-2291 to Tom Becker usually resolves access within a day.",
      action: { kind: "escalate", label: "Escalate IT-2291" },
    },
    modules: [
      module("c-found", "Foundations (6 modules)", "done", { done: -11 }),
      module("c-arch", "Architecture overview", "done", { done: -4 }),
      module("c-usage", "Usage pipelines", "blocked", { note: "Needs warehouse access" }),
      module("c-bus", "Event bus and schemas", "active", { due: 3 }),
    ],
    checks: [check("c1", "Company & business model", "pass", "10 of 10"), check("c2", "Architecture overview", "todo", "Due in 3 days")],
    upcoming: [
      { id: "u1", title: "30-day review", in: 9 },
      { id: "u2", title: "60-day readiness review", in: 38 },
    ],
    checkins: [checkin("k1", "weekly", 5, "concerns", "Blocked on warehouse access. Using the time to read pipeline docs.")],
  },
  {
    key: "jonah",
    person: people.jonah,
    startsIn: 5,
    stage: null,
    status: "needs_setup",
    progress: 0,
    expected: 0,
    buddy: null,
    readinessIn: 66,
    probationIn: 96,
    issues: ["No learning roadmap assigned", "No onboarding buddy yet"],
    insight: {
      text: "Jonah starts next week with no plan. The Engineering IC template matches his role; Arjun is free to be his buddy.",
      action: { kind: "assign_roadmap", label: "Assign roadmap" },
    },
    modules: [],
    checks: [],
    upcoming: [{ id: "u1", title: "First day", in: 5 }],
    checkins: [],
  },
  {
    key: "maya",
    person: people.maya,
    startsIn: -8,
    stage: "Foundations",
    status: "on_track",
    progress: 0.18,
    expected: 0.12,
    buddy: people.sana,
    readinessIn: 51,
    probationIn: 82,
    issues: [],
    insight: null,
    modules: [],
    checks: [],
    upcoming: [
      { id: "u1", title: "Week 2 check-in", in: 2 },
      { id: "u2", title: "30-day review", in: 21 },
      { id: "u3", title: "Probation review", in: 82 },
    ],
    checkins: [],
  },
  {
    key: "arjun",
    person: people.arjun,
    startsIn: -75,
    stage: "Ownership",
    status: "on_track",
    progress: 0.86,
    expected: 0.82,
    buddy: people.sana,
    readinessIn: 8,
    probationIn: 15,
    issues: ["Probation recommendation due in 10 days"],
    insight: {
      text: "All Ownership milestones are on track, he leads incident reviews, and two of his articles are published. The evidence supports confirming.",
      action: { kind: "start_recommendation", label: "Start recommendation" },
    },
    modules: [
      module("a-own", "Own a service area: release tooling", "active", { due: 10 }),
      module("a-runbook", "Write or update a runbook", "done", { done: -7 }),
      module("a-demo", "Present at Platform demo day", "todo", { due: 2 }),
    ],
    checks: [check("c1", "All 6 knowledge checks", "pass", "Average 92%")],
    upcoming: [
      { id: "u1", title: "Readiness review", in: 8 },
      { id: "u2", title: "Recommendation due", in: 10 },
      { id: "u3", title: "Probation review", in: 15 },
    ],
    checkins: [checkin("k1", "readiness_60", 6, "on_track", "Meets expectations across all four areas. Ready for on-call primary.")],
  },
];

let members = seed();

export function resetTeamMocks(): void {
  members = seed();
}

function find(personId: string): MockMember {
  const member = members.find((entry) => entry.person.id === personId);
  if (!member) throw new MockNotFoundError("Team member");
  return member;
}

/** Maya's modules and checks follow her real learning progress. */
function withLearning(member: MockMember): MockMember {
  if (member.key !== "maya") return member;
  const learner = learnerSnapshot();
  return {
    ...member,
    stage: learner.stageName,
    progress: learner.progress,
    modules: learner.modules.map((entry) =>
      module(entry.id, entry.title, entry.status === "locked" ? "todo" : entry.status, {
        due: entry.dueOn ? dayOffset(entry.dueOn) : undefined,
        done: entry.completedOn ? dayOffset(entry.completedOn) : undefined,
      }),
    ),
    checks: [
      check("c1", "Our customers", "pass", "9 of 10"),
      learner.m4.done
        ? check("c2", "How Tessellate makes money", "pass", learner.m4.result?.replace(/^Passed /, "") ?? "Passed")
        : check("c2", "How Tessellate makes money", "todo", "Due in 2 days"),
    ],
  };
}

function dayOffset(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}

function detail(personId: string): TeamMemberDetail {
  const member = withLearning(find(personId));
  return {
    person: member.person,
    startDate: dateFromToday(member.startsIn),
    stage: member.stage,
    status: member.status,
    progress: member.progress,
    expected: member.expected,
    buddy: member.buddy,
    peoplePartner: people.elena,
    readinessReviewOn: dateFromToday(member.readinessIn),
    probationReviewOn: dateFromToday(member.probationIn),
    issues: member.issues,
    insight: member.insight,
    modules: member.modules,
    checks: member.checks,
    upcoming: member.upcoming.map((entry) => ({ id: entry.id, title: entry.title, on: dateFromToday(entry.in) })),
    checkins: member.checkins,
  };
}

const weekday = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toLocaleDateString(undefined, { weekday: "short" });

function roster() {
  return {
    team: { id: "team-platform", name: "Platform" },
    people: ["maya", "chloe", "leah", "arjun", "jonah"].map((key) => {
      const member = withLearning(members.find((entry) => entry.key === key)!);
      const next = member.upcoming[0];
      return {
        person: member.person,
        startDate: dateFromToday(member.startsIn),
        stage: member.stage,
        progress: member.progress,
        expected: member.expected,
        status: member.status,
        next: member.status === "needs_setup" ? "Assign a roadmap" : next ? `${next.title} · ${weekday(next.in)}` : null,
        issue: member.issues[0] ?? null,
      };
    }),
  };
}

const TOPICS = ["Company", "Customers", "Business model", "Architecture", "Ingest", "Billing"];

function matrix() {
  const learner = learnerSnapshot();
  return {
    topics: TOPICS,
    rows: [
      { person: people.maya, cells: ["pass", "pass", learner.m4.done ? "pass" : "todo", "todo", "todo", "todo"] as CheckCell[] },
      { person: people.chloe, cells: ["pass", "pass", "pass", "todo", "todo", "na"] as CheckCell[] },
      { person: people.leah, cells: ["pass", "pass", "pass", "pass", "pass", "fail"] as CheckCell[] },
      { person: people.arjun, cells: ["pass", "pass", "pass", "pass", "pass", "pass"] as CheckCell[] },
    ],
  };
}

const AREAS = [
  { id: "products", label: "Knows our products and customers", evidence: "Passed company and customer checks" },
  { id: "systems", label: "Understands the systems they work on", evidence: "Architecture check passed" },
  { id: "practices", label: "Works with team practices", evidence: "PRs reviewed on time; joined incident review" },
  { id: "delivery", label: "Delivers independently", evidence: "First change shipped" },
];

const EVIDENCE: Partial<Record<MockMember["key"], string[]>> = {
  leah: [
    "Passed company and customer checks",
    "Architecture check passed; billing check failed twice",
    "PRs reviewed on time; joined incident review",
    "First ledger change shipped",
  ],
  arjun: ["All checks passed, average 92%", "Owns release tooling", "Leads incident reviews", "Runbook published"],
};

const AGENDA: Partial<Record<MockMember["key"], string[]>> = {
  leah: [
    "Celebrate: architecture and ingest modules done early",
    "Billing architecture: what made the idempotency questions hard?",
    "Plan a session with Priya Nair and a retake date",
    "Who to ask about the ledger: introduce Sana and the #ledger channel",
  ],
  arjun: [
    "Review the four readiness areas together",
    "Release tooling ownership: what’s left before the deadline",
    "Confirm on-call primary from November",
    "Share the recommendation you’ll send to People Ops",
  ],
  chloe: [
    "Warehouse access: status of IT-2291",
    "Swap in modules that don’t need access this week",
    "How the first three weeks have felt",
  ],
};

function prep(personId: string) {
  const member = find(personId);
  const evidence = EVIDENCE[member.key];
  return {
    agenda: AGENDA[member.key] ?? ["Wins this week", "What’s unclear so far", "Plan for next week"],
    areas: AREAS.map((area, index) => ({ ...area, evidence: evidence?.[index] ?? area.evidence })),
  };
}

function assignOptions(personId: string) {
  const member = find(personId);
  const isLeah = member.key === "leah";
  return {
    learning: {
      reason: isLeah
        ? "Leah failed two questions about idempotent consumers in “Billing architecture”. These items target that gap."
        : null,
      items: [
        { id: "billing-deep-dive", title: "Billing architecture: deep dive", kind: "module" as const, detail: "Module · 25 min · Owner Priya Nair", suggested: isLeah },
        { id: "pair-priya", title: "Pairing session with Priya Nair", kind: "practical" as const, detail: "Practical task · 45 min", suggested: false },
        { id: "retake-billing", title: "Retake: Billing architecture check", kind: "check" as const, detail: "Knowledge check · 10 min", suggested: false },
      ],
    },
    roadmap: {
      templates: [
        { id: "tpl-eng-ic", name: "Engineering · Individual contributor", version: "v4", moduleCount: 20, weeks: 12, matchesRole: true },
        { id: "tpl-support", name: "Support · Specialist", version: "v3", moduleCount: 14, weeks: 8, matchesRole: false },
      ],
      addOns: [
        { id: "oncall", label: "On-call readiness", suggested: true },
        { id: "kestrel", label: "Project Kestrel", suggested: false },
        { id: "warehouse", label: "Data warehouse basics", suggested: false },
      ],
      buddies: [people.arjun, people.sana],
    },
  };
}

const ASSIGNABLE: Record<string, string> = {
  "billing-deep-dive": "Billing architecture: deep dive",
  "pair-priya": "Pairing session with Priya Nair",
  "retake-billing": "Retake: Billing architecture check",
};

const param = (value: string | readonly string[] | undefined) => (typeof value === "string" ? value : "");

export const teamMocks = [
  mockGet(H.teamOnboarding)(() => roster()),
  mockGet(E.matrix)(() => matrix()),
  mockGet(E.member)(({ params }) => detail(param(params.id))),
  mockPatch(E.editRoadmap)((input, { params }) => {
    const member = find(param(params.id));
    for (const change of input.changes) {
      if (change.action === "remove") {
        member.modules = member.modules.filter((entry) => entry.id !== change.moduleId);
        continue;
      }
      member.modules = member.modules.map((entry) => {
        if (entry.id !== change.moduleId || !entry.dueOn) return entry;
        const moved = dayOffset(entry.dueOn) + 7;
        return {
          ...entry,
          dueOn: dateFromToday(moved),
          postponed: true,
          state: entry.state === "overdue" && moved >= 0 ? "todo" : entry.state,
        };
      });
    }
    return detail(param(params.id));
  }),
  mockGet(E.checkinPrep)(({ params }) => prep(param(params.id))),
  mockPost(E.saveCheckin)((input, { params }) => {
    const member = find(param(params.id));
    const record: CheckinRecord = {
      id: `k-${Date.now()}`,
      type: input.type,
      on: dateFromToday(0),
      pulse: input.pulse,
      note: input.notes.trim() || "No notes added.",
    };
    member.checkins = [record, ...member.checkins];
    if (input.type === "probation") member.issues = member.issues.filter((issue) => !issue.startsWith("Probation recommendation"));
    return record;
  }, 201),
  mockGet(E.assignOptions)(({ params }) => assignOptions(param(params.id))),
  mockPost(E.assignLearning)((input, { params }) => {
    const member = find(param(params.id));
    const id = `assigned-${input.itemId}-${Date.now()}`;
    member.modules = [
      ...member.modules,
      { ...module(id, ASSIGNABLE[input.itemId] ?? "Learning task", "todo"), dueOn: input.dueOn },
    ];
    return { id };
  }, 201),
  mockPost(E.assignRoadmap)((input, { params }) => {
    const member = find(param(params.id));
    const buddy = [people.arjun, people.sana].find((entry) => entry.id === input.buddyId) ?? null;
    member.stage = "Foundations";
    member.status = "not_started";
    member.buddy = buddy;
    member.issues = [];
    member.insight = null;
    member.modules = [
      module("j-welcome", "Welcome to Tessellate", "todo", { due: 7 }),
      module("j-customers", "Our customers and what they need", "todo", { due: 9 }),
      module("j-setup", "Set up your local development environment", "todo", { due: 10 }),
      ...(input.addOnIds.includes("oncall") ? [module("j-oncall", "On-call readiness", "todo", { due: 30 })] : []),
    ];
    return { id: `roadmap-${member.key}` };
  }, 201),
];
