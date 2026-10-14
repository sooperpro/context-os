import type {
  KnowledgeCheck,
  LearningHistoryEntry,
  LearningRatingValue,
  LearningSource,
  LearningTarget,
  Lesson,
  LessonBlock,
  LessonType,
  ModuleDetail,
  ModuleKind,
  ModuleLesson,
  ModuleStatus,
  MyRoadmap,
  NextUp,
  PersonRef,
  RoadmapModule,
  RoadmapStage,
} from "@contextos/shared";
import { HOME_ENDPOINTS as H } from "@/features/home/api/home.api";
import { LEARNING_ENDPOINTS as E } from "@/features/learning/api/learning.api";
import { mockGet, mockPost, MockNotFoundError } from "@/mocks/define";
import { people } from "@/mocks/fixtures/people";
import { atFromToday, dateFromToday } from "@/mocks/fixtures/time";

/*
 * Maya's roadmap, as in the prototype: "Engineering · Individual contributor v4", day 9 of 90, in the
 * Foundations stage with "How Tessellate makes money" half done. The state lives in memory for the
 * session: completing a lesson or passing a check moves the roadmap, the module and Home's
 * "Up next" and "Your onboarding" forward, as it would against the API. A reload starts over.
 */

/* ---- Fixture ----------------------------------------------------------------------------------- */

interface MockLesson {
  title: string;
  type: LessonType;
  minutes: number;
  done: boolean;
}

interface MockModule {
  id: string;
  stageId: string;
  title: string;
  kind: ModuleKind;
  status: ModuleStatus;
  summary: string | null;
  minutes: number | null;
  duration: string | null;
  dueOn: string | null;
  completedOn: string | null;
  result: string | null;
  note: string | null;
  owner: PersonRef;
  updatedDaysAgo: number | null;
  /** Detailed lessons; locked modules only know how many they have. */
  lessons: MockLesson[] | null;
  lessonCount: number;
}

interface MockStage {
  id: string;
  name: string;
  weekStart: number;
  weekEnd: number;
  startsIn: number;
  endsIn: number;
  goal: string;
}

const STAGES: MockStage[] = [
  {
    id: "foundations",
    name: "Foundations",
    weekStart: 1,
    weekEnd: 2,
    startsIn: -8,
    endsIn: 3,
    goal: "Understand the company, our customers, how we make money and how we work.",
  },
  {
    id: "systems",
    name: "Product & systems",
    weekStart: 3,
    weekEnd: 4,
    startsIn: 6,
    endsIn: 17,
    goal: "Learn the architecture you’ll work in and the decisions behind it.",
  },
  {
    id: "practice",
    name: "Team practice",
    weekStart: 5,
    weekEnd: 8,
    startsIn: 20,
    endsIn: 45,
    goal: "Work the way the team works: reviews, on-call and releases.",
  },
  {
    id: "ownership",
    name: "Ownership",
    weekStart: 9,
    weekEnd: 12,
    startsIn: 48,
    endsIn: 80,
    goal: "Take ownership of a service area and share what you’ve learned.",
  },
];

const lesson = (title: string, type: LessonType, minutes: number, done = false): MockLesson => ({
  title,
  type,
  minutes,
  done,
});

type ModuleSeed = Omit<
  MockModule,
  | "lessonCount"
  | "summary"
  | "minutes"
  | "duration"
  | "dueOn"
  | "completedOn"
  | "result"
  | "note"
  | "updatedDaysAgo"
  | "lessons"
> &
  Partial<
    Pick<
      MockModule,
      | "summary"
      | "minutes"
      | "duration"
      | "dueOn"
      | "completedOn"
      | "result"
      | "note"
      | "updatedDaysAgo"
      | "lessons"
    >
  > & { count?: number };

const mod = (seed: ModuleSeed): MockModule => ({
  summary: null,
  minutes: null,
  duration: null,
  dueOn: null,
  completedOn: null,
  result: null,
  note: null,
  updatedDaysAgo: null,
  lessons: null,
  ...seed,
  lessonCount: seed.lessons?.length ?? seed.count ?? 1,
});

const seedModules = (): MockModule[] => [
  mod({
    id: "m1",
    stageId: "foundations",
    title: "Welcome to Tessellate",
    kind: "company",
    status: "done",
    minutes: 25,
    completedOn: dateFromToday(-7),
    owner: people.elena,
    updatedDaysAgo: 42,
    summary: "Our story, how the company is organized, and our values in practice.",
    lessons: [
      lesson("Our story and mission", "video", 8, true),
      lesson("How the company is organized", "article", 9, true),
      lesson("Values in practice", "article", 8, true),
    ],
  }),
  mod({
    id: "m2",
    stageId: "foundations",
    title: "Our customers and what they need",
    kind: "business",
    status: "done",
    minutes: 35,
    completedOn: dateFromToday(-5),
    result: "Passed 9 of 10",
    owner: people.priya,
    updatedDaysAgo: 25,
    summary:
      "Who buys Tessellate, what their operations teams do all day, and the problems we solve.",
    lessons: [
      lesson("Who buys Tessellate", "article", 8, true),
      lesson("A day in a logistics operations team", "video", 12, true),
      lesson("Top customer problems", "slides", 10, true),
      lesson("Knowledge check", "check", 5, true),
    ],
  }),
  mod({
    id: "m3",
    stageId: "foundations",
    title: "Set up your local development environment",
    kind: "practical",
    status: "done",
    minutes: 90,
    completedOn: dateFromToday(-1),
    result: "Approved by Sana Iqbal",
    owner: people.sana,
    updatedDaysAgo: 5,
    summary: "Run the full stack on your machine and ship a no-op change through CI.",
    lessons: [lesson("Set up your machine and run the stack", "practical", 90, true)],
  }),
  mod({
    id: "m4",
    stageId: "foundations",
    title: "How Tessellate makes money",
    kind: "business",
    status: "active",
    minutes: 30,
    dueOn: dateFromToday(2),
    owner: people.priya,
    updatedDaysAgo: 11,
    summary: "Pricing tiers, usage-based billing, and why billing is moving to events.",
    lessons: [
      lesson("Pricing tiers", "article", 6, true),
      lesson("Usage-based billing", "video", 8, true),
      lesson("Why billing is moving to events", "article", 10),
      lesson("Knowledge check", "check", 5),
    ],
  }),
  mod({
    id: "m5",
    stageId: "foundations",
    title: "Product tour: Tessellate Track",
    kind: "product",
    status: "todo",
    minutes: 40,
    dueOn: dateFromToday(3),
    owner: people.hana,
    updatedDaysAgo: 18,
    summary: "See the product customers use every day: live tracking, ETAs and exception alerts.",
    lessons: [
      lesson("Meet Tessellate Track", "video", 12),
      lesson("Live tracking and ETAs", "slides", 15),
      lesson("Alerts and exceptions", "article", 13),
    ],
  }),
  mod({
    id: "m6",
    stageId: "foundations",
    title: "How engineering works at Tessellate",
    kind: "process",
    status: "todo",
    minutes: 30,
    dueOn: dateFromToday(3),
    owner: people.daniel,
    updatedDaysAgo: 13,
    summary: "Planning rituals, how we write decision records, and quality basics.",
    lessons: [
      lesson("Planning and rituals", "article", 10),
      lesson("How we write decision records", "article", 10),
      lesson("Quality and on-call basics", "article", 10),
    ],
  }),
  mod({
    id: "s1",
    stageId: "systems",
    title: "Architecture overview",
    kind: "systems",
    status: "locked",
    minutes: 45,
    count: 4,
    owner: people.sana,
    summary: "The services, data flows and boundaries of the Tessellate platform.",
  }),
  mod({
    id: "s2",
    stageId: "systems",
    title: "The ingest gateway",
    kind: "systems",
    status: "locked",
    minutes: 40,
    count: 4,
    owner: people.sana,
    summary: "How carrier events arrive, get normalized and reach the event bus.",
  }),
  mod({
    id: "s3",
    stageId: "systems",
    title: "Event bus and schemas",
    kind: "systems",
    status: "locked",
    minutes: 35,
    count: 3,
    owner: people.sana,
    summary: "Topics, schemas and how teams subscribe safely.",
  }),
  mod({
    id: "s4",
    stageId: "systems",
    title: "Billing architecture and Project Kestrel",
    kind: "project",
    status: "locked",
    minutes: 50,
    count: 5,
    owner: people.priya,
    summary: "The ledger, billing events and the migration plan.",
  }),
  mod({
    id: "s5",
    stageId: "systems",
    title: "Trace a shipment event end to end",
    kind: "practical",
    status: "active",
    minutes: 45,
    dueOn: dateFromToday(3),
    note: "Assigned early by Daniel",
    owner: people.sana,
    summary: "Pair with Sana to follow one event from a carrier webhook to the customer’s screen.",
    lessons: [lesson("Trace a shipment event end to end", "practical", 45)],
  }),
  mod({
    id: "s6",
    stageId: "systems",
    title: "Decisions you should know",
    kind: "decisions",
    status: "locked",
    minutes: 25,
    count: 3,
    owner: people.daniel,
    summary: "Five decision records that shaped the platform.",
  }),
  mod({
    id: "p1",
    stageId: "practice",
    title: "Code review norms",
    kind: "process",
    status: "locked",
    minutes: 20,
    count: 2,
    owner: people.daniel,
  }),
  mod({
    id: "p2",
    stageId: "practice",
    title: "Ship your first pull request",
    kind: "practical",
    status: "locked",
    minutes: 240,
    count: 1,
    owner: people.sana,
  }),
  mod({
    id: "p3",
    stageId: "practice",
    title: "Shadow two on-call rotations",
    kind: "practical",
    status: "locked",
    duration: "2 weeks",
    count: 1,
    owner: people.arjun,
  }),
  mod({
    id: "p4",
    stageId: "practice",
    title: "Incident reviews",
    kind: "process",
    status: "locked",
    minutes: 30,
    count: 3,
    owner: people.arjun,
  }),
  mod({
    id: "p5",
    stageId: "practice",
    title: "Release process",
    kind: "process",
    status: "locked",
    minutes: 25,
    count: 2,
    owner: people.arjun,
  }),
  mod({
    id: "o1",
    stageId: "ownership",
    title: "Own a service area",
    kind: "practical",
    status: "locked",
    duration: "4 weeks",
    count: 1,
    owner: people.daniel,
  }),
  mod({
    id: "o2",
    stageId: "ownership",
    title: "Write or update a runbook",
    kind: "contribution",
    status: "locked",
    minutes: 120,
    count: 1,
    owner: people.sana,
  }),
  mod({
    id: "o3",
    stageId: "ownership",
    title: "Present at Platform demo day",
    kind: "practical",
    status: "locked",
    duration: "1 session",
    count: 1,
    owner: people.daniel,
  }),
];

const seedHistory = (): LearningHistoryEntry[] => [
  {
    id: "h1",
    kind: "practical",
    title: "Set up your local development environment",
    completedOn: dateFromToday(-1),
    result: "Approved by Sana Iqbal",
  },
  {
    id: "h2",
    kind: "check",
    title: "Knowledge check: Our customers",
    completedOn: dateFromToday(-4),
    result: "Passed, 9 of 10",
  },
  {
    id: "h3",
    kind: "module",
    title: "Our customers and what they need",
    completedOn: dateFromToday(-5),
    result: "Completed",
  },
  {
    id: "h4",
    kind: "module",
    title: "Welcome to Tessellate",
    completedOn: dateFromToday(-7),
    result: "Completed",
  },
];

const CHECKS_TOTAL = 6;
const START_DAYS_AGO = 8;

let modules = seedModules();
let history = seedHistory();
let checksPassed = 1;
const ratings = new Map<string, LearningRatingValue>();

/** Restores the fixtures; tests call it so one test's progress never leaks into the next. */
export function resetLearningMocks(): void {
  modules = seedModules();
  history = seedHistory();
  checksPassed = 1;
  ratings.clear();
}

/* ---- Derived views ----------------------------------------------------------------------------- */

const lessonId = (module: MockModule, index: number) =>
  module.lessons?.[index]?.type === "check" ? `${module.id}-check` : `${module.id}-l${index + 1}`;

function findLesson(id: string): { module: MockModule; index: number } {
  for (const module of modules) {
    const index = (module.lessons ?? []).findIndex((_, i) => lessonId(module, i) === id);
    if (index >= 0) return { module, index };
  }
  throw new MockNotFoundError("Lesson");
}

function findModule(id: string): MockModule {
  const module = modules.find((entry) => entry.id === id);
  if (!module) throw new MockNotFoundError("Module");
  return module;
}

const stageOf = (module: MockModule) =>
  STAGES.find((stage) => stage.id === module.stageId) ?? STAGES[0]!;
const stageModules = (stageId: string) => modules.filter((module) => module.stageId === stageId);
const numberIn = (module: MockModule) => stageModules(module.stageId).indexOf(module) + 1;

function moduleProgress(module: MockModule): number {
  if (module.status === "done") return 1;
  const lessons = module.lessons ?? [];
  return lessons.length ? lessons.filter((entry) => entry.done).length / lessons.length : 0;
}

function overallProgress(): number {
  const total = modules.length;
  const done = modules.filter((module) => module.status === "done").length;
  const partial = modules
    .filter((module) => module.status === "active" && module.kind !== "practical")
    .reduce((sum, module) => sum + moduleProgress(module), 0);
  return Math.min(1, (done + partial) / total);
}

function stageState(stage: MockStage): RoadmapStage["state"] {
  const list = stageModules(stage.id);
  if (list.every((module) => module.status === "done")) return "done";
  if (stage.startsIn <= 0) return "current";
  const next = STAGES.find((entry) => entry.startsIn > 0);
  return next?.id === stage.id ? "next" : "later";
}

function toModuleLessons(module: MockModule): ModuleLesson[] {
  return (module.lessons ?? []).map((entry, index) => ({
    id: lessonId(module, index),
    number: index + 1,
    title: entry.title,
    type: entry.type,
    minutes: entry.minutes,
    questionCount:
      entry.type === "check" ? (QUIZZES[`${module.id}-check`]?.questions.length ?? 5) : null,
    done: module.status === "done" || entry.done,
  }));
}

function toRoadmapModule(module: MockModule): RoadmapModule {
  return {
    id: module.id,
    number: numberIn(module),
    title: module.title,
    kind: module.kind,
    status: module.status,
    summary: module.summary,
    lessonCount: module.lessonCount,
    minutes: module.minutes,
    duration: module.duration,
    progress: moduleProgress(module),
    dueOn: module.dueOn,
    completedOn: module.completedOn,
    result: module.result,
    note: module.note,
    owner: module.owner,
  };
}

function roadmap(): MyRoadmap {
  return {
    template: { name: "Engineering · Individual contributor", version: "v4" },
    adjustedBy: people.daniel,
    team: "Platform",
    startDate: dateFromToday(-START_DAYS_AGO),
    totalDays: 90,
    status: "on_track",
    progress: overallProgress(),
    expected: 0.12,
    checks: { done: checksPassed, total: CHECKS_TOTAL },
    stages: STAGES.map((stage) => ({
      id: stage.id,
      name: stage.name,
      weekStart: stage.weekStart,
      weekEnd: stage.weekEnd,
      startsOn: dateFromToday(stage.startsIn),
      endsOn: dateFromToday(stage.endsIn),
      state: stageState(stage),
      goal: stage.goal,
      modules: stageModules(stage.id).map(toRoadmapModule),
    })),
    probationReviewOn: dateFromToday(90 - START_DAYS_AGO - 1),
    buddy: people.sana,
    history,
  };
}

/** The module to work on next: an unfinished, non-practical module in the current stage. */
function nextModule(): MockModule | undefined {
  const current = STAGES.find((stage) => stageState(stage) === "current");
  const list = current ? stageModules(current.id) : [];
  return (
    list.find((module) => module.status === "active" && module.kind !== "practical") ??
    list.find((module) => module.status === "todo")
  );
}

function resumeTarget(module: MockModule): LearningTarget {
  const index = (module.lessons ?? []).findIndex((entry) => !entry.done);
  if (index < 0) return { kind: "module", id: module.id };
  return {
    kind: module.lessons?.[index]?.type === "check" ? "check" : "lesson",
    id: lessonId(module, index),
  };
}

const SUGGESTED_QUESTION: Record<string, string> = {
  m4: "Why are we moving billing to Kafka?",
  m5: "What does Tessellate Track do?",
};

function nextUp(): NextUp | null {
  const module = nextModule();
  if (!module) return null;
  const lessons = module.lessons ?? [];
  const firstOpen = lessons.findIndex((entry) => !entry.done);
  return {
    assignmentId: "a-foundations",
    moduleId: module.id,
    stageName: stageOf(module).name,
    moduleIndex: numberIn(module),
    moduleCount: stageModules(module.stageId).length,
    title: module.title,
    summary: module.summary ?? "",
    lessons: lessons.map((entry, index) => ({
      id: lessonId(module, index),
      title: entry.title,
      type: entry.type,
      state: entry.done ? "done" : index === firstOpen && firstOpen > 0 ? "current" : "todo",
    })),
    resume: resumeTarget(module),
    progress: moduleProgress(module),
    minutesLeft: lessons
      .filter((entry) => !entry.done)
      .reduce((sum, entry) => sum + entry.minutes, 0),
    owner: module.owner,
    updatedAt: atFromToday(-(module.updatedDaysAgo ?? 0)),
    sourceCount: module.id === "m4" ? 4 : 2,
    suggestedQuestion: SUGGESTED_QUESTION[module.id] ?? null,
  };
}

function myOnboarding() {
  const done = modules.filter((module) => module.status === "done").length;
  return {
    startDate: dateFromToday(-START_DAYS_AGO),
    totalDays: 90,
    status: "on_track" as const,
    progress: overallProgress(),
    expected: 0.12,
    modules: { done, total: modules.length },
    checks: { done: checksPassed, total: CHECKS_TOTAL },
    tasks: { done: 5, total: 14 },
    stages: STAGES.map((stage) => {
      const list = stageModules(stage.id);
      const finished = list.filter((module) => module.status === "done").length;
      const state = stageState(stage);
      return {
        id: stage.id,
        name: stage.name,
        weekStart: stage.weekStart,
        weekEnd: stage.weekEnd,
        state,
        startsOn: dateFromToday(stage.startsIn),
        modules: { done: finished, total: list.length },
        progress: list.length ? finished / list.length : 0,
      };
    }),
  };
}

/* ---- Module detail ------------------------------------------------------------------------------ */

const source = (
  id: string,
  title: string,
  label: string,
  origin: LearningSource["origin"],
  owner: string,
  updatedDaysAgo: number,
  restrictedTo: string | null = null,
): LearningSource => ({
  id,
  title,
  label,
  origin,
  owner,
  updatedAt: atFromToday(-updatedDaysAgo),
  restrictedTo,
  url: null,
});

const MODULE_EXTRA: Record<string, Partial<ModuleDetail>> = {
  m4: {
    objective:
      "Explain how Tessellate charges customers, why usage-based billing matters, and why billing is moving to events.",
    objectives: [
      "Describe the three pricing tiers and who they’re for",
      "Explain how usage is metered and invoiced",
      "Explain the decision to move billing to events (ADR-042)",
    ],
    reviewedBy: "Finance Enablement",
    sources: [
      source("r1", "Pricing & packaging 2026", "Slides", "google_drive", "Priya Nair", 32),
      source("r2", "Billing pipeline walkthrough", "Video · 8 min", "loom", "Sana Iqbal", 47),
      source(
        "r3",
        "ADR-042: Billing events on Kafka",
        "Decision record",
        "github",
        "Sana Iqbal",
        209,
      ),
      source("r4", "Kestrel rollout plan v3", "Doc", "google_drive", "Priya Nair", 0),
      source("r5", "Revenue by tier, FY26", "Sheet", "google_drive", "Finance", 13, "Finance only"),
    ],
    people: [
      { person: people.priya, role: "Module owner" },
      { person: people.sana, role: "Expert · Billing pipeline" },
    ],
    suggestedQuestion: "Summarize this module in 3 points",
  },
};

function moduleDetail(id: string): ModuleDetail {
  const module = findModule(id);
  const stage = stageOf(module);
  const extra = MODULE_EXTRA[module.id] ?? {};
  return {
    id: module.id,
    number: numberIn(module),
    title: module.title,
    kind: module.kind,
    status: module.status,
    stage: {
      id: stage.id,
      name: stage.name,
      moduleCount: stageModules(stage.id).length,
      opensOn: stage.startsIn > 0 ? dateFromToday(stage.startsIn) : null,
    },
    objective: module.summary ?? module.title,
    objectives: [],
    minutes: module.minutes,
    duration: module.duration,
    owner: module.owner,
    updatedAt: module.updatedDaysAgo === null ? null : atFromToday(-module.updatedDaysAgo),
    reviewedBy: null,
    progress: moduleProgress(module),
    completedOn: module.completedOn,
    result: module.result,
    lessons: module.status === "locked" ? [] : toModuleLessons(module),
    sources: [],
    people: [{ person: module.owner, role: "Module owner" }],
    suggestedQuestion: SUGGESTED_QUESTION[module.id] ?? "What should I focus on this week?",
    ...extra,
    rating: ratings.get(`module:${module.id}`) ?? null,
  };
}

/* ---- Lessons ------------------------------------------------------------------------------------- */

/** "Why billing is moving to events", the prototype's fully written lesson. */
const BILLING_EVENTS: LessonBlock[] = [
  {
    type: "lede",
    text: "Every time a customer tracks a shipment, Tessellate records a unit of usage. How that usage reaches an invoice is changing, and the change explains a lot about how the Platform team works.",
  },
  { type: "heading", text: "How billing works today" },
  {
    type: "paragraph",
    text: "The ingest gateway receives shipment events and the **ledger service** writes each billable action to its Postgres database. Once a night, a batch job exports the day’s usage to the invoicing system.",
  },
  {
    type: "flow",
    caption: "Usage moves from a nightly export to a stream of events that several consumers read.",
    rows: [
      {
        label: "Today",
        steps: [
          [{ title: "Ingest gateway", note: null, tone: "default" }],
          [{ title: "Ledger service", note: "Postgres", tone: "default" }],
          [{ title: "Nightly export job", note: "runs at 02:00", tone: "warning" }],
          [{ title: "Invoicing", note: null, tone: "default" }],
        ],
      },
      {
        label: "After Kestrel",
        steps: [
          [{ title: "Ingest gateway", note: null, tone: "default" }],
          [{ title: "Ledger service", note: null, tone: "default" }],
          [{ title: "billing-events", note: "Kafka topic", tone: "accent" }],
          [
            { title: "Invoicing", note: null, tone: "default" },
            { title: "Usage dashboard", note: null, tone: "default" },
          ],
        ],
      },
    ],
  },
  { type: "heading", text: "What went wrong" },
  {
    type: "list",
    ordered: false,
    items: [
      "**Invoices lagged usage by up to 24 hours.** Customers on usage-based plans couldn’t see what they were spending.",
      "**The batch job failed silently about twice a month.** Finance found out days later, during reconciliation.",
      "**New tiers needed live usage.** The 2026 pricing introduces spend alerts that a nightly export can’t power.",
    ],
  },
  {
    type: "decision",
    reference: "ADR-042",
    status: "accepted",
    decidedOn: "2026-03-18",
    statement:
      "We will publish a billing event for every metered action to the `billing-events` topic. Every consumer must be idempotent.",
    decidedBy: ["Sana Iqbal", "Priya Nair", "Daniel Reyes"],
    location: "tessellate/architecture",
    origin: "github",
    url: null,
  },
  { type: "heading", text: "Trade-offs we accepted" },
  {
    type: "paragraph",
    text: "Events make usage visible within seconds, but they add load to the event bus, which Platform now runs at higher capacity. Kafka can also deliver the same event more than once, so every consumer has to recognize and ignore duplicates. For a few weeks the ledger writes to both the old export and the new topic, so the two can be compared before the switch. The team calls this **dual-write**.",
  },
  { type: "heading", text: "Where Kestrel is now" },
  {
    type: "milestones",
    label: "Project Kestrel milestones",
    items: [
      { title: "M1 · Design", detail: "Done in April", state: "done" },
      { title: "M2 · Dual-write", detail: "In progress", state: "current" },
      { title: "M3 · Cutover", detail: "Planned Nov 12", state: "todo" },
      { title: "M4 · Retire the export", detail: "December", state: "todo" },
    ],
  },
  {
    type: "check",
    id: "inline-idempotent",
    question: "Why must every consumer of billing events be idempotent?",
    options: [
      { id: "a", text: "So invoices are generated faster" },
      { id: "b", text: "Because the same event can be delivered more than once" },
      { id: "c", text: "So consumers can skip events they don’t need" },
    ],
    correctOptionId: "b",
    explanation:
      "Kafka can deliver an event more than once, so a consumer that isn’t idempotent could bill a customer twice.",
  },
];

/** Short stand-in content for the lessons the prototype does not write out. */
function placeholderBlocks(module: MockModule, entry: MockLesson): LessonBlock[] {
  const intro: LessonBlock = { type: "lede", text: module.summary ?? `Part of ${module.title}.` };
  if (entry.type === "video" || entry.type === "slides") {
    return [
      intro,
      {
        type: "media",
        kind: entry.type,
        title: entry.title,
        minutes: entry.minutes,
        origin: entry.type === "video" ? "loom" : "google_drive",
        url: null,
      },
      {
        type: "paragraph",
        text: `Watch it through, then use **Ask Context Bot** for anything that is unclear. ${module.owner.name} keeps it up to date.`,
      },
    ];
  }
  if (entry.type === "practical") {
    return [
      intro,
      { type: "heading", text: "What to do" },
      {
        type: "list",
        ordered: true,
        items: [
          "Read the task brief and the linked runbook.",
          `Pair with ${people.sana.name} for the first hour.`,
          "Ask for a review when you are done.",
        ],
      },
    ];
  }
  return [
    intro,
    { type: "heading", text: entry.title },
    {
      type: "paragraph",
      text: `This lesson is drafted from the module’s sources and reviewed by ${module.owner.name}. Select any sentence to ask Context Bot about it.`,
    },
  ];
}

function lessonView(id: string): Lesson {
  const { module, index } = findLesson(id);
  const entry = module.lessons?.[index];
  if (!entry || entry.type === "check" || module.status === "locked")
    throw new MockNotFoundError("Lesson");
  const stage = stageOf(module);
  const authored = id === "m4-l3";
  return {
    id,
    number: index + 1,
    title: entry.title,
    type: entry.type,
    minutes: entry.minutes,
    done: module.status === "done" || entry.done,
    module: {
      id: module.id,
      number: numberIn(module),
      title: module.title,
      kind: module.kind,
      progress: moduleProgress(module),
    },
    stage: { id: stage.id, name: stage.name },
    outline: toModuleLessons(module),
    basedOn: authored ? ["ADR-042", "the Kestrel rollout plan"] : [],
    reviewedBy: authored ? people.priya : module.owner,
    reviewedOn: authored ? dateFromToday(-11) : null,
    blocks: authored ? BILLING_EVENTS : placeholderBlocks(module, entry),
    rating: ratings.get(`lesson:${id}`) ?? null,
  };
}

/** Marks a lesson done; a module whose lessons are all done (and has no check left) is done too. */
function complete(id: string) {
  const { module, index } = findLesson(id);
  const entry = module.lessons?.[index];
  if (!entry) throw new MockNotFoundError("Lesson");
  entry.done = true;
  if (module.status === "todo") module.status = "active";
  const open = (module.lessons ?? []).findIndex((item) => !item.done);
  if (open < 0) finishModule(module, "Completed");
  return { moduleProgress: moduleProgress(module), next: open < 0 ? null : resumeTarget(module) };
}

function finishModule(module: MockModule, result: string) {
  module.status = "done";
  module.completedOn = dateFromToday(0);
  module.result = result === "Completed" ? null : result;
  for (const entry of module.lessons ?? []) entry.done = true;
  history = [
    {
      id: `h-${module.id}`,
      kind: "module",
      title: module.title,
      completedOn: dateFromToday(0),
      result: "Completed",
    },
    ...history,
  ];
  const following = stageModules(module.stageId).find((item) => item.status === "todo");
  if (following) following.status = "active";
}

/* ---- Knowledge checks ---------------------------------------------------------------------------- */

interface Quiz {
  moduleId: string;
  passMark: number;
  questions: Array<{
    id: string;
    prompt: string;
    options: string[];
    answer: number;
    why: string;
    source: string;
  }>;
}

const QUIZZES: Record<string, Quiz> = {
  "m4-check": {
    moduleId: "m4",
    passMark: 4,
    questions: [
      {
        id: "q1",
        prompt: "How do most customers pay for Tessellate?",
        options: [
          "Per user seat",
          "A platform fee plus usage per tracked shipment",
          "A one-time license",
          "Per API call only",
        ],
        answer: 1,
        why: "Every tier combines a platform fee with metered usage, priced per tracked shipment.",
        source: "Pricing & packaging 2026, slide 4",
      },
      {
        id: "q2",
        prompt: "What was the main problem with the nightly billing export?",
        options: [
          "It was too expensive to run",
          "Invoices lagged usage by up to 24 hours and failures went unnoticed",
          "It couldn’t handle international currencies",
          "It exposed customer data",
        ],
        answer: 1,
        why: "Lag and silent failures are the two reasons ADR-042 gives for leaving the batch export.",
        source: "ADR-042, “Context”",
      },
      {
        id: "q3",
        prompt: "What does ADR-042 decide?",
        options: [
          "Move the ledger from Postgres to a data warehouse",
          "Publish a billing event for every metered action to Kafka",
          "Replace the invoicing vendor",
          "Bill customers weekly instead of monthly",
        ],
        answer: 1,
        why: "The decision is to publish one event per metered action to the billing-events topic.",
        source: "ADR-042, “Decision”",
      },
      {
        id: "q4",
        prompt: "Why must every billing event consumer be idempotent?",
        options: [
          "Kafka can deliver the same event more than once",
          "It makes consumers faster",
          "Finance requires it for audits",
          "Events arrive out of order only at night",
        ],
        answer: 0,
        why: "Kafka guarantees at-least-once delivery, so duplicates must be ignored to avoid double billing.",
        source: "Lesson 3, “Trade-offs we accepted”",
      },
      {
        id: "q5",
        prompt: "Which Kestrel milestone is in progress now?",
        options: ["M1 · Design", "M2 · Dual-write", "M3 · Cutover", "M4 · Retire the export"],
        answer: 1,
        why: "The ledger is writing to both the export and the topic so results can be compared before cutover on Nov 12.",
        source: "Kestrel rollout plan v3",
      },
    ],
  },
  "m2-check": {
    moduleId: "m2",
    passMark: 2,
    questions: [
      {
        id: "q1",
        prompt: "Who buys Tessellate?",
        options: ["Logistics and operations teams", "Individual consumers", "Advertising agencies"],
        answer: 0,
        why: "Operations teams at shippers and carriers are the buyers.",
        source: "Who buys Tessellate",
      },
      {
        id: "q2",
        prompt: "What do customers most want from tracking?",
        options: ["Lower prices", "Accurate ETAs and early warning of exceptions", "More reports"],
        answer: 1,
        why: "ETAs and exception alerts top every customer interview.",
        source: "Top customer problems, slide 3",
      },
      {
        id: "q3",
        prompt: "What does an operations team do first each morning?",
        options: ["Reviews exceptions from overnight", "Plans next quarter", "Approves invoices"],
        answer: 0,
        why: "Overnight exceptions decide the day’s priorities.",
        source: "A day in a logistics operations team",
      },
    ],
  },
};

const optionId = (index: number) => String.fromCharCode(97 + index);

function checkView(id: string): KnowledgeCheck {
  const quiz = QUIZZES[id];
  if (!quiz) throw new MockNotFoundError("Knowledge check");
  const module = findModule(quiz.moduleId);
  const stage = stageOf(module);
  return {
    id,
    module: { id: module.id, number: numberIn(module), title: module.title },
    stage: { id: stage.id, name: stage.name },
    passMark: quiz.passMark,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options.map((text, index) => ({ id: optionId(index), text })),
    })),
  };
}

function grade(id: string, answers: Array<{ questionId: string; optionId: string }>) {
  const quiz = QUIZZES[id];
  if (!quiz) throw new MockNotFoundError("Knowledge check");
  const module = findModule(quiz.moduleId);
  const chosen = new Map(answers.map((answer) => [answer.questionId, answer.optionId]));
  const review = quiz.questions.map((question) => ({
    questionId: question.id,
    chosenOptionId: chosen.get(question.id) ?? "",
    correctOptionId: optionId(question.answer),
    explanation: question.why,
    source: question.source,
  }));
  const score = review.filter((entry) => entry.chosenOptionId === entry.correctOptionId).length;
  const passed = score >= quiz.passMark;
  let progress = null;
  let following = null;
  if (passed && module.status !== "done") {
    const before = overallProgress();
    checksPassed = Math.min(CHECKS_TOTAL, checksPassed + 1);
    history = [
      {
        id: `h-${id}`,
        kind: "check",
        title: `Knowledge check: ${module.title}`,
        completedOn: dateFromToday(0),
        result: `Passed, ${score} of ${quiz.questions.length}`,
      },
      ...history,
    ];
    finishModule(module, `Passed ${score} of ${quiz.questions.length}`);
    const stage = stageOf(module);
    const list = stageModules(stage.id);
    progress = {
      stageName: stage.name,
      modulesDone: list.filter((item) => item.status === "done").length,
      moduleCount: list.length,
      overallBefore: before,
      overallAfter: overallProgress(),
      checksPassed,
      checksTotal: CHECKS_TOTAL,
    };
    const next = nextModule();
    following = next ? { id: next.id, title: next.title } : null;
  }
  return {
    score,
    total: quiz.questions.length,
    passMark: quiz.passMark,
    passed,
    review,
    progress,
    nextModule: following,
  };
}

/* ---- Endpoints ------------------------------------------------------------------------------------ */

const param = (value: string | readonly string[] | undefined) =>
  typeof value === "string" ? value : "";

export const learningMocks = [
  mockGet(E.roadmap)(() => roadmap()),
  mockGet(E.module)(({ params }) => moduleDetail(param(params.id))),
  mockGet(E.lesson)(({ params }) => lessonView(param(params.id))),
  mockPost(E.completeLesson)((_input, { params }) => complete(param(params.id))),
  mockGet(E.check)(({ params }) => checkView(param(params.id))),
  mockPost(E.attempt)((input, { params }) => grade(param(params.id), input.answers)),
  mockPost(E.rating)((input) => {
    const key = `${input.targetType}:${input.targetId}`;
    if (input.value) ratings.set(key, input.value);
    else ratings.delete(key);
    return { value: input.value };
  }),
  mockPost(E.request)((input) => {
    const owner = input.moduleId
      ? modules.find((module) => module.id === input.moduleId)?.owner
      : undefined;
    return {
      id: `req-${Date.now()}`,
      recipient: input.type === "roadmap_change" ? people.daniel : (owner ?? people.priya),
    };
  }, 201),
  // Home reads the same progress, so "Up next" and "Your onboarding" follow the roadmap.
  mockGet(H.nextUp)(() => ({ item: nextUp() })),
  mockGet(H.myOnboarding)(() => myOnboarding()),
];
