import type {
  OnboardingFilter,
  OnboardingRecord,
  OnboardingRecordSummary,
  OnboardingStatus,
  OnboardingTemplate,
  PersonDetails,
  PersonRef,
  ProbationDetail,
  ProbationReview,
  SetupStepId,
  TemplateDetail,
  TemplateModule,
} from "@contextos/shared";
import { HOME_ENDPOINTS as H } from "@/features/home/api/home.api";
import { PEOPLE_OPS_ENDPOINTS as E } from "@/features/people-ops/api/people-ops.api";
import { formatDayDate, formatShortDate } from "@/lib/format";
import { MockNotFoundError, mockGet, mockPatch, mockPost } from "@/mocks/define";
import { people } from "@/mocks/fixtures/people";
import { atFromToday, dateFromToday } from "@/mocks/fixtures/time";

/*
 * People Ops (HR), as in the prototype's Onboarding, Probation reviews and Templates screens. One
 * store feeds those pages and HR Home, so a decision or a setup step shows everywhere. A manager's
 * probation recommendation (mocks/team.ts) lands here too. Changes last for the session.
 */

const HR = people.elena;
const DAY = 86_400_000;

/* ---- Templates ------------------------------------------------------------------------------ */

const mod = (
  id: string,
  title: string,
  kind: TemplateModule["kind"],
  minutes: number | null,
  owner: PersonRef | null,
): TemplateModule => ({
  id,
  title,
  kind,
  minutes,
  owner: owner?.name ?? null,
});

/** Modules templates are built from. Shared modules keep one id across templates. */
const M = {
  welcome: mod("mod-welcome", "Welcome to Tessellate", "company", 25, HR),
  customers: mod("mod-customers", "Our customers and what they need", "business", 35, people.priya),
  devEnv: mod(
    "mod-dev-env",
    "Set up your local development environment",
    "practical",
    90,
    people.sana,
  ),
  money: mod("mod-money", "How Tessellate makes money", "business", 30, people.priya),
  tour: mod("mod-tour", "Product tour: Tessellate Track", "product", 40, people.hana),
  engineering: mod(
    "mod-engineering",
    "How engineering works at Tessellate",
    "process",
    30,
    people.daniel,
  ),
  architecture: mod("mod-architecture", "Architecture overview", "systems", 45, people.sana),
  ingest: mod("mod-ingest", "The ingest gateway", "systems", 40, people.sana),
  eventBus: mod("mod-event-bus", "Event bus and schemas", "systems", 35, people.sana),
  billing: mod(
    "mod-billing",
    "Billing architecture and Project Kestrel",
    "project",
    50,
    people.priya,
  ),
  trace: mod("mod-trace", "Trace a shipment event end to end", "practical", 45, people.sana),
  decisions: mod("mod-decisions", "Decisions you should know", "decisions", 25, people.daniel),
  codeReview: mod("mod-code-review", "Code review norms", "process", 20, people.daniel),
  firstPr: mod("mod-first-pr", "Ship your first pull request", "practical", 240, people.sana),
  onCall: mod("mod-on-call", "Shadow two on-call rotations", "practical", null, people.arjun),
  incidents: mod("mod-incidents", "Incident reviews", "process", 30, people.arjun),
  release: mod("mod-release", "Release process", "process", 25, people.arjun),
  ownArea: mod("mod-own-area", "Own a service area", "practical", null, people.daniel),
  runbook: mod("mod-runbook", "Write or update a runbook", "contribution", 120, people.sana),
  demoDay: mod("mod-demo-day", "Present at Platform demo day", "practical", null, people.daniel),
  security: mod("mod-security", "Security basics", "company", 20, people.tom),
  companyCheck: mod(
    "mod-company-check",
    "Knowledge check: Company & business model",
    "check",
    8,
    people.priya,
  ),
  pricing: mod("mod-pricing", "Pricing and packaging 2026", "sales", 40, people.priya),
  crm: mod("mod-crm", "CRM setup and hygiene", "practical", 60, people.marcus),
  discovery: mod("mod-discovery", "Discovery calls that work", "sales", 45, people.marcus),
  demo: mod("mod-demo", "Give the standard demo", "practical", 90, people.marcus),
  shadowCalls: mod(
    "mod-shadow-calls",
    "Shadow five customer calls",
    "practical",
    null,
    people.marcus,
  ),
  securityReviews: mod(
    "mod-security-reviews",
    "Handling security reviews",
    "sales",
    30,
    people.tom,
  ),
  territory: mod("mod-territory", "Build your territory plan", "practical", 120, people.marcus),
  dealReview: mod("mod-deal-review", "Run a deal review", "practical", 60, people.marcus),
  zendesk: mod("mod-zendesk", "Zendesk basics", "practical", 45, people.aisha),
  carrierFormats: mod(
    "mod-carrier-formats",
    "Shipment events and carrier formats",
    "systems",
    35,
    people.sana,
  ),
  carrierPlaybook: mod(
    "mod-carrier-playbook",
    "Carrier issues playbook",
    "support",
    40,
    people.aisha,
  ),
  mentorTickets: mod(
    "mod-mentor-tickets",
    "Resolve 20 tickets with a mentor",
    "practical",
    null,
    people.aisha,
  ),
  helpArticle: mod(
    "mod-help-article",
    "Write a help center article",
    "contribution",
    90,
    people.aisha,
  ),
  designSystem: mod("mod-design-system", "The design system", "design", 45, people.owen),
  interviews: mod(
    "mod-interviews",
    "Run three customer interviews",
    "practical",
    null,
    people.owen,
  ),
  shipDesign: mod("mod-ship-design", "Ship a design end to end", "practical", null, people.owen),
  warehouse: mod("mod-warehouse", "The data warehouse", "data", 45, people.nina),
  carrierReporting: mod(
    "mod-carrier-reporting",
    "Carrier performance reporting",
    "data",
    40,
    people.nina,
  ),
  dashboard: mod("mod-dashboard", "Build your first dashboard", "practical", null, people.nina),
  recurringReport: mod(
    "mod-recurring-report",
    "Own a recurring report",
    "practical",
    null,
    people.nina,
  ),
  oneOnOnes: mod("mod-one-on-ones", "How we run 1:1s and check-ins", "people", 30, HR),
  probation: mod("mod-probation", "Probation and readiness reviews", "people", 30, HR),
  readinessReview: mod(
    "mod-readiness-review",
    "Run a readiness review with HR",
    "practical",
    null,
    HR,
  ),
  charter: mod("mod-charter", "Write your team charter", "contribution", 90, HR),
  monthEnd: mod("mod-month-end", "Month-end close walkthrough", "practical", 60, people.ruth),
  forecasting: mod("mod-forecasting", "Revenue forecasting basics", "business", 40, people.ruth),
} satisfies Record<string, TemplateModule>;

/** What "Add module" offers (prototype `LIBRARY`). */
const LIBRARY = [
  M.security,
  M.incidents,
  M.codeReview,
  M.eventBus,
  M.billing,
  M.decisions,
  M.runbook,
  M.companyCheck,
];
const CATALOG = new Map(Object.values(M).map((entry) => [entry.id, entry]));

interface MockTemplate extends Omit<
  TemplateDetail,
  | "stages"
  | "version"
  | "publishedVersion"
  | "history"
  | "deletable"
  // Set the same way for every fixture (see templateDetail).
  | "probationDays"
  | "checkins"
  | "generation"
  | "generated"
  | "review"
  | "createdBy"
  | "editable"
  | "department"
> {
  /** A manager's draft waiting for People Ops, or sent back (none in the seed). */
  review?: TemplateDetail["review"];
  /** "Engineering · IC": how onboarding records name it. */
  short: string;
  version: number;
  publishedVersion: number | null;
  stages: Array<{
    id: string;
    name: string;
    weekStart: number;
    weekEnd: number;
    moduleIds: string[];
  }>;
  /** `snapshot` is the copy kept when the version was published (older, seeded versions have none). */
  history: Array<{
    version: number;
    on: string;
    note: string;
    snapshot?: Pick<MockTemplate, "name" | "roles" | "teams" | "weeks" | "passMark" | "stages">;
  }>;
}

const stage = (
  id: string,
  name: string,
  weekStart: number,
  weekEnd: number,
  modules: TemplateModule[],
) => ({
  id,
  name,
  weekStart,
  weekEnd,
  moduleIds: modules.map((entry) => entry.id),
});

function template(
  seed: Omit<
    MockTemplate,
    "status" | "publishedVersion" | "passMark" | "updatedAt" | "updatedBy" | "history" | "archived"
  > & {
    updated: number;
    by: PersonRef;
    history: Array<[number, string]>;
  },
): MockTemplate {
  const { updated, by, history, ...rest } = seed;
  return {
    ...rest,
    status: "published",
    archived: false,
    publishedVersion: seed.version,
    passMark: 4,
    updatedAt: atFromToday(updated, 15),
    updatedBy: by.name,
    // The current version has a kept copy, as a version published through the API would;
    // the older ones don't (they came before copies were kept).
    history: history.map(([days, note], index) => ({
      version: seed.version - index,
      on: dateFromToday(days),
      note,
      ...(index === 0
        ? {
            snapshot: {
              name: seed.name,
              roles: [...seed.roles],
              teams: [...seed.teams],
              weeks: seed.weeks,
              passMark: 4,
              stages: seed.stages.map((item) => ({ ...item, moduleIds: [...item.moduleIds] })),
            },
          }
        : {}),
    })),
  };
}

const seedTemplates = (): MockTemplate[] => [
  template({
    id: "tpl-eng-ic",
    name: "Engineering · Individual contributor",
    short: "Engineering · IC",
    family: "engineering",
    version: 4,
    activeCount: 12,
    roles: ["Software engineers", "SREs", "Data engineers"],
    teams: ["Platform", "Product", "Data"],
    weeks: 12,
    updated: -13,
    by: HR,
    stages: [
      stage("foundations", "Foundations", 1, 2, [
        M.welcome,
        M.customers,
        M.devEnv,
        M.money,
        M.tour,
        M.engineering,
      ]),
      stage("systems", "Product & systems", 3, 4, [
        M.architecture,
        M.ingest,
        M.eventBus,
        M.billing,
        M.trace,
        M.decisions,
      ]),
      stage("practice", "Team practice", 5, 8, [
        M.codeReview,
        M.firstPr,
        M.onCall,
        M.incidents,
        M.release,
      ]),
      stage("ownership", "Ownership", 9, 12, [M.ownArea, M.runbook, M.demoDay]),
    ],
    history: [
      [
        -13,
        "Added “Trace an event end to end”, moved on-call shadowing to week 5, merged two readings into one check",
      ],
      [-133, "Added Project Kestrel module"],
      [-244, "Split Foundations into two weeks"],
      [-374, "First version"],
    ],
  }),
  template({
    id: "tpl-sales-ae",
    name: "Sales · Account executive",
    short: "Sales · Account executive",
    family: "sales",
    version: 2,
    activeCount: 5,
    roles: ["Account executives"],
    teams: ["Sales"],
    weeks: 12,
    updated: -60,
    by: HR,
    stages: [
      stage("foundations", "Foundations", 1, 2, [M.welcome, M.customers, M.pricing, M.crm]),
      stage("pitch", "Product & pitch", 3, 5, [M.tour, M.discovery, M.demo]),
      stage("practice", "Shadow and practice", 6, 8, [M.shadowCalls, M.securityReviews]),
      stage("territory", "Own a territory", 9, 12, [M.territory, M.dealReview]),
    ],
    history: [
      [-60, "Added the 2026 pricing module"],
      [-277, "First version"],
    ],
  }),
  template({
    id: "tpl-support",
    name: "Support · Specialist",
    short: "Support · Specialist",
    family: "support",
    version: 3,
    activeCount: 4,
    roles: ["Support specialists"],
    teams: ["Support"],
    weeks: 8,
    updated: -41,
    by: people.aisha,
    stages: [
      stage("foundations", "Foundations", 1, 1, [M.welcome, M.customers, M.zendesk]),
      stage("product", "Product depth", 2, 3, [M.tour, M.carrierFormats]),
      stage("tickets", "Handle tickets", 4, 6, [M.carrierPlaybook, M.mentorTickets]),
      stage("ownership", "Ownership", 7, 8, [M.helpArticle]),
    ],
    history: [
      [-41, "Added carrier issues playbook"],
      [-146, "Shorter Foundations"],
      [-344, "First version"],
    ],
  }),
  template({
    id: "tpl-design-ic",
    name: "Design · Individual contributor",
    short: "Design · IC",
    family: "design",
    version: 2,
    activeCount: 2,
    roles: ["Product designers"],
    teams: ["Design"],
    weeks: 12,
    updated: -98,
    by: people.owen,
    stages: [
      stage("foundations", "Foundations", 1, 2, [M.welcome, M.customers, M.designSystem]),
      stage("research", "Product & research", 3, 6, [M.tour, M.interviews]),
      stage("ownership", "Ownership", 7, 12, [M.shipDesign]),
    ],
    history: [
      [-98, "Added research practice"],
      [-253, "First version"],
    ],
  }),
  template({
    id: "tpl-data-analyst",
    name: "Data · Analyst",
    short: "Data · Analyst",
    family: "data",
    version: 1,
    activeCount: 1,
    roles: ["Data analysts"],
    teams: ["Data"],
    weeks: 12,
    updated: -105,
    by: people.nina,
    stages: [
      stage("foundations", "Foundations", 1, 2, [M.welcome, M.warehouse]),
      stage("analysis", "Analysis practice", 3, 8, [M.carrierReporting, M.dashboard]),
      stage("ownership", "Ownership", 9, 12, [M.recurringReport]),
    ],
    history: [[-105, "First version"]],
  }),
  template({
    id: "tpl-finance",
    name: "Finance · Analyst",
    short: "Finance · Analyst",
    family: "other",
    version: 1,
    activeCount: 1,
    roles: ["Finance analysts"],
    teams: ["Finance"],
    weeks: 8,
    updated: -120,
    by: people.ruth,
    stages: [
      stage("foundations", "Foundations", 1, 2, [M.welcome, M.money]),
      stage("practice", "Finance practice", 3, 8, [M.monthEnd, M.forecasting]),
    ],
    history: [[-120, "First version"]],
  }),
  template({
    id: "tpl-manager",
    name: "People manager onboarding",
    short: "People manager",
    family: "manager",
    version: 1,
    activeCount: 2,
    roles: ["New managers"],
    teams: ["All teams"],
    weeks: 8,
    updated: -84,
    by: HR,
    stages: [
      stage("foundations", "Foundations", 1, 2, [M.oneOnOnes, M.probation]),
      stage("practice", "Practice", 3, 8, [M.readinessReview, M.charter]),
    ],
    history: [[-84, "First version"]],
  }),
];

/* ---- Onboarding records ---------------------------------------------------------------------- */

const SETUP: Array<{ id: SetupStepId; label: string }> = [
  { id: "account", label: "Account active (they have signed in)" },
  { id: "laptop", label: "Laptop delivered" },
  { id: "roadmap", label: "Learning roadmap assigned" },
  { id: "buddy", label: "Onboarding buddy assigned" },
  { id: "welcome", label: "Welcome message sent" },
  { id: "calendar", label: "First-week calendar booked" },
];

interface MockRecord {
  person: PersonRef;
  team: string;
  manager: PersonRef | null;
  buddy: PersonRef | null;
  startsIn: number;
  templateId: string | null;
  stage: string | null;
  progress: number;
  expected: number;
  status: OnboardingStatus;
  note: string;
  setup: Set<SetupStepId>;
  lastCheckin: string | null;
  /** Elena unless reassigned. */
  peoplePartner?: PersonRef;
}

const ALL_SETUP = SETUP.map((step) => step.id);
const lastCheckin = (days: number, how?: string) =>
  `Last check-in ${formatShortDate(dateFromToday(days))}${how ? ` · ${how}` : ""}`;

const seedRecords = (): MockRecord[] => [
  {
    person: people.leah,
    team: "Platform",
    manager: people.daniel,
    buddy: people.arjun,
    startsIn: -38,
    templateId: "tpl-eng-ic",
    stage: "Product & systems",
    progress: 0.34,
    expected: 0.45,
    status: "at_risk",
    note: "2 modules overdue · failed billing check twice",
    setup: new Set(ALL_SETUP),
    lastCheckin: lastCheckin(-12, "some concerns"),
  },
  {
    person: people.chloe,
    team: "Platform",
    manager: people.daniel,
    buddy: people.leah,
    startsIn: -21,
    templateId: "tpl-eng-ic",
    stage: "Product & systems",
    progress: 0.21,
    expected: 0.27,
    status: "blocked",
    note: "No data warehouse access for 4 days (IT-2291)",
    setup: new Set(ALL_SETUP),
    lastCheckin: lastCheckin(-5, "some concerns"),
  },
  {
    person: people.ben,
    team: "Support",
    manager: people.aisha,
    buddy: people.priyaShah,
    startsIn: -65,
    templateId: "tpl-support",
    stage: "Ownership",
    progress: 0.61,
    expected: 0.8,
    status: "at_risk",
    note: "60-day check-in 5 days overdue",
    setup: new Set(ALL_SETUP),
    lastCheckin: lastCheckin(-19, "on track"),
  },
  {
    person: people.ravi,
    team: "Data",
    manager: people.nina,
    buddy: people.lena,
    startsIn: -60,
    templateId: "tpl-data-analyst",
    stage: "Team practice",
    progress: 0.58,
    expected: 0.66,
    status: "at_risk",
    note: "2 check-ins not recorded",
    setup: new Set(ALL_SETUP),
    lastCheckin: lastCheckin(-21),
  },
  {
    person: people.jonah,
    team: "Platform",
    manager: people.daniel,
    buddy: null,
    startsIn: 5,
    templateId: null,
    stage: null,
    progress: 0,
    expected: 0,
    status: "needs_setup",
    note: "No roadmap or buddy yet",
    setup: new Set(["account", "laptop", "welcome"]),
    lastCheckin: null,
  },
  {
    person: people.tomas,
    team: "Support",
    manager: people.aisha,
    buddy: null,
    startsIn: 12,
    templateId: "tpl-support",
    stage: null,
    progress: 0,
    expected: 0,
    status: "needs_setup",
    note: "No buddy yet",
    setup: new Set(["account", "laptop", "roadmap"]),
    lastCheckin: null,
  },
  {
    person: people.maya,
    team: "Platform",
    manager: people.daniel,
    buddy: people.sana,
    startsIn: -8,
    templateId: "tpl-eng-ic",
    stage: "Foundations",
    progress: 0.15,
    expected: 0.12,
    status: "on_track",
    note: "Next: week 2 check-in on Fri",
    setup: new Set(ALL_SETUP),
    lastCheckin: `First check-in on ${formatDayDate(dateFromToday(3))}`,
  },
  {
    person: people.arjun,
    team: "Platform",
    manager: people.daniel,
    buddy: people.sana,
    startsIn: -75,
    templateId: "tpl-eng-ic",
    stage: "Ownership",
    progress: 0.86,
    expected: 0.82,
    status: "on_track",
    note: `Probation review ${formatShortDate(dateFromToday(15))}`,
    setup: new Set(ALL_SETUP),
    lastCheckin: lastCheckin(-6, "on track"),
  },
  {
    person: people.sofia,
    team: "Sales",
    manager: people.marcus,
    buddy: people.omar,
    startsIn: -80,
    templateId: "tpl-sales-ae",
    stage: "Ownership",
    progress: 0.96,
    expected: 0.85,
    status: "on_track",
    note: `Probation review ${formatShortDate(dateFromToday(13))}`,
    setup: new Set(ALL_SETUP),
    lastCheckin: lastCheckin(-7, "on track"),
  },
  {
    person: people.hana,
    team: "Design",
    manager: people.owen,
    buddy: people.ivy,
    startsIn: -62,
    templateId: "tpl-design-ic",
    stage: "Ownership",
    progress: 0.79,
    expected: 0.71,
    status: "on_track",
    note: `Probation review ${formatShortDate(dateFromToday(24))}`,
    setup: new Set(ALL_SETUP),
    lastCheckin: lastCheckin(-4, "on track"),
  },
  {
    person: people.grace,
    team: "Sales",
    manager: people.marcus,
    buddy: people.sofia,
    startsIn: 5,
    templateId: "tpl-sales-ae",
    stage: null,
    progress: 0,
    expected: 0,
    status: "ready",
    note: "Everything set up",
    setup: new Set(ALL_SETUP),
    lastCheckin: null,
  },
  {
    person: people.amara,
    team: "Finance",
    manager: people.ruth,
    buddy: people.priya,
    startsIn: 12,
    templateId: "tpl-finance",
    stage: null,
    progress: 0,
    expected: 0,
    status: "needs_setup",
    note: "Welcome message and calendar not done",
    setup: new Set(["account", "laptop", "roadmap", "buddy"]),
    lastCheckin: null,
  },
];

/** Everyone onboarding or starting soon; the rest are on track with nothing due this week. */
const TOTAL_RECORDS = 29;
const STARTING_NEXT_14_DAYS = 6;
const MANAGERS = [
  people.daniel,
  people.marcus,
  people.aisha,
  people.nina,
  people.owen,
  people.ruth,
  people.ivy,
];
const BUDDIES = [
  people.sana,
  people.arjun,
  people.leah,
  people.sofia,
  people.ivy,
  people.lena,
  people.priya,
  people.omar,
];

/* ---- Probation reviews ------------------------------------------------------------------------ */

/** The readiness areas a manager rates (same order as the check-in). */
const AREAS = [
  { id: "products", label: "Knows our products and customers" },
  { id: "systems", label: "Understands the systems they work on" },
  { id: "practices", label: "Works with team practices" },
  { id: "delivery", label: "Delivers independently" },
];

type Activity = ProbationDetail["activity"][number];

interface MockReview extends Omit<
  ProbationDetail,
  "startDate" | "reviewOn" | "team" | "manager" | "person"
> {
  personId: string;
  missingCheckins: number;
  reviewIn: number;
}

const on = (days: number) => dateFromToday(days);
const act = (id: string, days: number, text: string, kind: Activity["kind"]): Activity => ({
  id,
  on: on(days),
  text,
  kind,
});
const done = (title: string, detail: string) => ({ title, detail, state: "done" as const });

const seedReviews = (): MockReview[] => [
  {
    id: "pr-sofia",
    personId: people.sofia.id,
    reviewIn: 13,
    state: "ready_for_approval",
    recommendation: "confirm",
    recommendedOn: on(-4),
    recommendationDueOn: null,
    readiness: 0.96,
    ratings: [2, 3, 2, 2].map((level, index) => ({ area: AREAS[index]!.label, level })),
    managerNote:
      "Closed three new retail accounts in her first quarter and already runs demos on her own. Strong product knowledge. I recommend confirming.",
    milestones: [
      done("30-day review", formatShortDate(on(-50))),
      done("60-day readiness review", formatShortDate(on(-20))),
      done("Learning roadmap", "16 of 16 modules"),
      done("Knowledge checks", "6 of 6 passed"),
    ],
    checkinSummary: `8 check-ins · last on ${formatShortDate(on(-7))}`,
    activity: [
      act("a4", -4, "Marcus Lee recommended confirming", "recommended_confirm"),
      act("a3", -20, "60-day readiness review recorded", "review"),
      act("a2", -50, "30-day review recorded", "review"),
      act("a1", -80, "Started as Account Executive", "started"),
    ],
    decision: null,
    missingCheckins: 0,
  },
  {
    id: "pr-arjun",
    personId: people.arjun.id,
    reviewIn: 15,
    state: "awaiting_manager",
    recommendation: "awaiting_manager",
    recommendedOn: null,
    recommendationDueOn: on(10),
    readiness: 0.86,
    ratings: null,
    managerNote: null,
    milestones: [
      done("30-day review", formatShortDate(on(-45))),
      done("60-day readiness review", formatShortDate(on(-6))),
      { title: "Learning roadmap", detail: "17 of 20 modules", state: "active" },
      done("Knowledge checks", "6 of 6 passed"),
    ],
    checkinSummary: `10 check-ins · last on ${formatShortDate(on(-6))}`,
    activity: [
      act(
        "a3",
        -6,
        "60-day readiness review recorded: meets expectations in all four areas",
        "review",
      ),
      act("a2", -45, "30-day review recorded", "review"),
      act("a1", -75, "Started as Site Reliability Engineer", "started"),
    ],
    decision: null,
    missingCheckins: 0,
  },
  {
    id: "pr-ben",
    personId: people.ben.id,
    reviewIn: 17,
    state: "needs_hr_review",
    recommendation: "extend",
    recommendedOn: on(-3),
    recommendationDueOn: null,
    readiness: 0.61,
    ratings: [2, 1, 2, 1].map((level, index) => ({ area: AREAS[index]!.label, level })),
    managerNote:
      "Great with customers and well liked by the team. He still escalates most carrier issues instead of resolving them. Another 30 days with a carrier-issues mentor should get him there.",
    milestones: [
      done("30-day review", formatShortDate(on(-35))),
      { title: "60-day check-in", detail: "5 days overdue", state: "overdue" },
      { title: "Learning roadmap", detail: "11 of 14 modules", state: "active" },
      { title: "Knowledge checks", detail: "4 of 5 passed", state: "active" },
    ],
    checkinSummary: `6 check-ins · last on ${formatShortDate(on(-19))}`,
    activity: [
      act("a4", -3, "Aisha Khan recommended a 30-day extension", "recommended_extend"),
      act("a3", -5, "60-day check-in became overdue", "missed"),
      act("a2", -35, "30-day review recorded", "review"),
      act("a1", -65, "Started as Support Specialist", "started"),
    ],
    decision: null,
    missingCheckins: 0,
  },
  {
    id: "pr-hana",
    personId: people.hana.id,
    reviewIn: 24,
    state: "awaiting_manager",
    recommendation: "awaiting_manager",
    recommendedOn: null,
    recommendationDueOn: on(19),
    readiness: 0.79,
    ratings: null,
    managerNote: null,
    milestones: [
      done("30-day review", formatShortDate(on(-32))),
      done("60-day readiness review", formatShortDate(on(-4))),
      { title: "Learning roadmap", detail: "12 of 15 modules", state: "active" },
      { title: "Knowledge checks", detail: "5 of 6 passed", state: "active" },
    ],
    checkinSummary: `7 check-ins · last on ${formatShortDate(on(-4))}`,
    activity: [
      act("a3", -4, "60-day readiness review recorded", "review"),
      act("a2", -32, "30-day review recorded", "review"),
      act("a1", -62, "Started as Product Designer", "started"),
    ],
    decision: null,
    missingCheckins: 0,
  },
  {
    id: "pr-ravi",
    personId: people.ravi.id,
    reviewIn: 30,
    state: "checkins_missing",
    recommendation: "not_started",
    recommendedOn: null,
    recommendationDueOn: on(25),
    readiness: 0.58,
    ratings: null,
    managerNote: null,
    milestones: [
      done("30-day review", formatShortDate(on(-30))),
      { title: "Weekly check-ins", detail: "2 not recorded", state: "overdue" },
      {
        title: "60-day readiness review",
        detail: `Due ${formatShortDate(on(0))}`,
        state: "active",
      },
      { title: "Knowledge checks", detail: "3 of 6 passed", state: "active" },
    ],
    checkinSummary: `4 check-ins · last on ${formatShortDate(on(-21))}`,
    activity: [
      act("a4", -9, "Second weekly check-in missed", "missed"),
      act("a3", -14, "Weekly check-in missed", "missed"),
      act("a2", -30, "30-day review recorded", "review"),
      act("a1", -60, "Started as Data Analyst", "started"),
    ],
    decision: null,
    missingCheckins: 2,
  },
  {
    id: "pr-lena",
    personId: people.lena.id,
    reviewIn: -11,
    state: "completed",
    recommendation: "confirm",
    recommendedOn: on(-20),
    recommendationDueOn: null,
    readiness: 0.94,
    ratings: [2, 2, 3, 2].map((level, index) => ({ area: AREAS[index]!.label, level })),
    managerNote: "Owns the ledger migration and mentors newer engineers. Confirm.",
    milestones: [
      done("Learning roadmap", "20 of 20 modules"),
      done("Knowledge checks", "6 of 6 passed"),
    ],
    checkinSummary: `9 check-ins · last on ${formatShortDate(on(-14))}`,
    activity: [
      act("a3", -11, "Elena Brooks recorded: confirmed", "decided"),
      act("a2", -20, "Daniel Reyes recommended confirming", "recommended_confirm"),
      act("a1", -101, "Started as Backend Engineer", "started"),
    ],
    decision: {
      outcome: "confirmed",
      extension: null,
      decidedOn: on(-11),
      effectiveOn: on(-11),
      decidedBy: HR,
      note: "",
      notified: true,
    },
    missingCheckins: 0,
  },
  {
    id: "pr-omar",
    personId: people.omar.id,
    reviewIn: -15,
    state: "completed",
    recommendation: "extend",
    recommendedOn: on(-22),
    recommendationDueOn: null,
    readiness: 0.64,
    ratings: [2, 1, 2, 1].map((level, index) => ({ area: AREAS[index]!.label, level })),
    managerNote: "Strong pipeline, but still needs support on security reviews. Another 30 days.",
    milestones: [
      done("Learning roadmap", "14 of 16 modules"),
      { title: "Knowledge checks", detail: "5 of 6 passed", state: "active" },
    ],
    checkinSummary: `7 check-ins · last on ${formatShortDate(on(-16))}`,
    activity: [
      act("a3", -15, "Elena Brooks recorded: extended 30 days", "decided"),
      act("a2", -22, "Marcus Lee recommended a 30-day extension", "recommended_extend"),
      act("a1", -105, "Started as Account Executive", "started"),
    ],
    decision: {
      outcome: "extended",
      extension: "30 days",
      decidedOn: on(-15),
      effectiveOn: on(-15),
      decidedBy: HR,
      note: "Pair with a security-review mentor.",
      notified: true,
    },
    missingCheckins: 0,
  },
];

/** People who are not onboarding any more but have a recent probation review. */
const ALUMNI: Record<
  string,
  { person: PersonRef; team: string; manager: PersonRef; startsIn: number }
> = {
  [people.lena.id]: {
    person: people.lena,
    team: "Platform",
    manager: people.daniel,
    startsIn: -101,
  },
  [people.omar.id]: { person: people.omar, team: "Sales", manager: people.marcus, startsIn: -105 },
};

/* ---- State ------------------------------------------------------------------------------------- */

let templates = seedTemplates();
let records = seedRecords();
let reviews = seedReviews();
let createdRecords = 0;
let createdTemplates = 0;

export function resetPeopleOpsMocks(): void {
  templates = seedTemplates();
  records = seedRecords();
  reviews = seedReviews();
  createdRecords = 0;
  createdTemplates = 0;
}

/** Tests: a manager submitted this template for review. */
export function markTemplateInReview(id: string, note: string | null = null): void {
  findTemplate(id).review = {
    state: "in_review",
    note,
    by: people.daniel,
    at: new Date().toISOString(),
  };
}

const findTemplate = (id: string) => {
  const found = templates.find((entry) => entry.id === id);
  if (!found) throw new MockNotFoundError("Template");
  return found;
};

const findRecord = (id: string) => {
  const found = records.find((entry) => entry.person.id === id);
  if (!found) throw new MockNotFoundError("Onboarding record");
  return found;
};

const findReview = (id: string) => {
  const found = reviews.find((entry) => entry.id === id);
  if (!found) throw new MockNotFoundError("Probation review");
  return found;
};

const v = (version: number) => `v${version}`;
const isStarting = (record: MockRecord) => record.startsIn > 0;
const needsAttention = (record: MockRecord) =>
  record.status === "blocked" || record.status === "at_risk";

const FILTERS: Record<OnboardingFilter, (record: MockRecord) => boolean> = {
  all: () => true,
  attention: needsAttention,
  starting: isStarting,
  progress: (record) => !isStarting(record),
};

function templateRef(id: string | null) {
  const found = id ? templates.find((entry) => entry.id === id) : undefined;
  if (!found) return null;
  return { id: found.id, name: `${found.short} ${v(found.publishedVersion ?? found.version)}` };
}

function summary(record: MockRecord): OnboardingRecordSummary {
  return {
    id: record.person.id,
    person: record.person,
    team: record.team,
    manager: record.manager,
    buddy: record.buddy,
    startDate: dateFromToday(record.startsIn),
    template: templateRef(record.templateId),
    stage: record.stage,
    progress: record.progress,
    expected: record.expected,
    status: record.status,
    note: record.note,
    setup: { done: record.setup.size, total: SETUP.length },
  };
}

function recordDetail(record: MockRecord): OnboardingRecord {
  const milestones = (
    [
      ["30-day review", 30],
      ["60-day readiness review", 60],
      ["Probation review", 90],
    ] as const
  ).map(([title, day]) => {
    const inDays = record.startsIn + day;
    return {
      title,
      on: dateFromToday(inDays),
      state: inDays < 0 ? ("done" as const) : inDays <= 14 ? ("soon" as const) : ("later" as const),
    };
  });
  return {
    ...summary(record),
    templateDraft: null,
    peoplePartner: record.peoplePartner ?? HR,
    setupSteps: SETUP.map((step) => ({
      ...step,
      done: record.setup.has(step.id),
      doneBy: step.id === "account" && record.setup.has("account") ? "Created by SCIM" : null,
    })),
    milestones,
    lastCheckin: record.lastCheckin,
    probationReviewId: reviews.find((review) => review.personId === record.person.id)?.id ?? null,
  };
}

/** Before day one, the status follows the setup checklist (prototype `refreshStatus`). */
function refreshStatus(record: MockRecord): void {
  if (!isStarting(record)) return;
  const missing = SETUP.length - record.setup.size;
  if (!missing) {
    record.status = "ready";
    record.note = "Everything set up";
  } else {
    record.note = `${missing} setup ${missing === 1 ? "step" : "steps"} left`;
  }
}

function reviewContext(review: MockReview) {
  const record = records.find((entry) => entry.person.id === review.personId);
  if (record)
    return {
      person: record.person,
      team: record.team,
      manager: record.manager ?? people.daniel,
      startsIn: record.startsIn,
    };
  const alumnus = ALUMNI[review.personId];
  if (!alumnus) throw new MockNotFoundError("Probation review");
  return alumnus;
}

function reviewSummary(review: MockReview): ProbationReview {
  const context = reviewContext(review);
  return {
    id: review.id,
    person: context.person,
    team: context.team,
    manager: context.manager,
    reviewOn: dateFromToday(review.reviewIn),
    recommendation: review.recommendation,
    readiness: review.readiness,
    state: review.state,
    decision: review.decision
      ? {
          outcome: review.decision.outcome,
          extension: review.decision.extension,
          decidedOn: review.decision.decidedOn,
        }
      : null,
    recommendationDueOn: review.recommendationDueOn,
    missingCheckins: review.missingCheckins,
  };
}

function reviewDetail(review: MockReview): ProbationDetail {
  const context = reviewContext(review);
  const { personId: _personId, reviewIn, ...rest } = review;
  return {
    ...rest,
    person: context.person,
    team: context.team,
    manager: context.manager,
    startDate: dateFromToday(context.startsIn),
    reviewOn: dateFromToday(reviewIn),
  };
}

function templateDetail(entry: MockTemplate): TemplateDetail {
  return {
    ...entry,
    // As the API: used templates are archived, never deleted, and the last one stays.
    deletable: entry.activeCount === 0 && templates.length > 1,
    // As the API for templates that never set their own: the workspace defaults.
    probationDays: 90,
    checkins: [
      { title: "30-day check-in", day: 30 },
      { title: "60-day readiness review", day: 60 },
    ],
    generation: null,
    generated: null,
    review: entry.review ?? null,
    createdBy: HR,
    // The fixtures are People Ops' view: they can change every template.
    editable: true,
    department: null,
    version: v(entry.version),
    publishedVersion: entry.publishedVersion === null ? null : v(entry.publishedVersion),
    stages: entry.stages.map(({ moduleIds, ...rest }) => ({
      ...rest,
      modules: moduleIds.flatMap((id) => CATALOG.get(id) ?? []),
    })),
    history: entry.history.map(({ snapshot, ...item }) => ({
      ...item,
      version: v(item.version),
      saved: Boolean(snapshot),
    })),
  };
}

/** One published version from its kept copy, or null when none was kept. */
function templateVersion(entry: MockTemplate, version: number) {
  const item = entry.history.find((candidate) => candidate.version === version);
  if (!item?.snapshot) return null;
  const { snapshot } = item;
  return {
    id: entry.id,
    version: v(version),
    publishedOn: item.on,
    note: item.note,
    name: snapshot.name,
    roles: snapshot.roles,
    teams: snapshot.teams,
    weeks: snapshot.weeks,
    passMark: snapshot.passMark,
    stages: snapshot.stages.map(({ moduleIds, ...rest }) => ({
      ...rest,
      modules: moduleIds.flatMap((id) => CATALOG.get(id) ?? []),
    })),
  };
}

function templateSummary(entry: MockTemplate): OnboardingTemplate {
  return {
    id: entry.id,
    name: entry.name,
    family: entry.family,
    version: v(entry.version),
    status: entry.status,
    activeCount: entry.activeCount,
    archived: entry.archived,
    updatedAt: entry.updatedAt,
    updatedBy: entry.updatedBy,
    roles: entry.roles,
    weeks: entry.weeks,
    stageCount: entry.stages.length,
    moduleCount: entry.stages.reduce((sum, item) => sum + item.moduleIds.length, 0),
    review: entry.review ?? null,
  };
}

/** Saves a new module order; unknown modules and stages are ignored, as the API would reject them. */
function applyStages(
  entry: MockTemplate,
  stages: Array<{ id: string; moduleIds: string[] }>,
  audience: { roles?: string[]; teams?: string[] } = {},
): void {
  if (audience.roles) entry.roles = audience.roles;
  if (audience.teams) entry.teams = audience.teams;
  entry.stages = entry.stages.map((item) => {
    const next = stages.find((change) => change.id === item.id);
    return next ? { ...item, moduleIds: next.moduleIds.filter((id) => CATALOG.has(id)) } : item;
  });
  entry.updatedAt = new Date().toISOString();
  entry.updatedBy = HR.name;
}

/* ---- For HR Home and the manager's check-in ---------------------------------------------------- */

export function needsHrCount(): number {
  return reviews.filter(
    (review) => review.state === "ready_for_approval" || review.state === "needs_hr_review",
  ).length;
}

export function probationReviewList(within: number) {
  const upcoming = reviews
    .filter((review) => review.reviewIn >= 0 && review.reviewIn <= within)
    .sort((a, b) => a.reviewIn - b.reviewIn);
  const recent = reviews
    .filter(
      (review) =>
        review.reviewIn < 0 &&
        review.decision &&
        Date.now() - Date.parse(review.decision.decidedOn) <= within * DAY,
    )
    .sort((a, b) => b.reviewIn - a.reviewIn);
  return { items: upcoming.map(reviewSummary), recentlyCompleted: recent.map(reviewSummary) };
}

export function starterList(within: number) {
  return records
    .filter((record) => isStarting(record) && record.startsIn <= within)
    .sort((a, b) => a.startsIn - b.startsIn)
    .map((record) => ({
      // The onboarding record's id, so Home can open it.
      id: record.person.id,
      person: record.person,
      team: record.team,
      startDate: dateFromToday(record.startsIn),
      accountsReady: record.setup.has("account"),
      buddyAssigned: record.buddy !== null,
      roadmapAssigned: record.templateId !== null,
    }));
}

/** Job details People Ops has saved in this session; anyone else starts from their fixture. */
const savedDetails = new Map<string, PersonDetails>();
const personById = (id: string): PersonRef => {
  const known = [...Object.values(people), ...records.map((record) => record.person)].find(
    (entry) => entry.id === id,
  );
  if (!known) throw new MockNotFoundError("Person");
  return known;
};
const detailsFor = (id: string): PersonDetails => {
  const saved = savedDetails.get(id);
  if (saved) return saved;
  const person = personById(id);
  return {
    id,
    name: person.name,
    jobTitle: person.title,
    departmentId: null,
    teamId: null,
    manager: null,
  };
};

/** HR Home's templates: live ones only, unless archived ones are asked for. */
export function templateList(includeArchived = false) {
  return templates.filter((entry) => includeArchived || !entry.archived).map(templateSummary);
}

/** A manager sent their probation recommendation from a check-in (prototype `submitRecommendation`). */
export function submitProbationRecommendation(
  personId: string,
  recommendation: "confirm" | "extend" | "discuss",
  ratings: Record<string, number>,
  note: string,
): void {
  const review = reviews.find((entry) => entry.personId === personId);
  if (!review || review.state === "completed") return;
  const manager = reviewContext(review).manager;
  review.recommendation = recommendation;
  review.recommendedOn = dateFromToday(0);
  review.recommendationDueOn = null;
  review.state = recommendation === "confirm" ? "ready_for_approval" : "needs_hr_review";
  review.ratings = AREAS.map((area) => ({ area: area.label, level: ratings[area.id] ?? 2 }));
  review.managerNote = note.trim() || "No notes added.";
  const text = {
    confirm: "recommended confirming",
    extend: "recommended a 30-day extension",
    discuss: "asked to discuss with HR",
  }[recommendation];
  review.activity = [
    act(
      `a-${Date.now()}`,
      0,
      `${manager.name} ${text}`,
      recommendation === "confirm" ? "recommended_confirm" : "recommended_extend",
    ),
    ...review.activity,
  ];
}

/* ---- Endpoints --------------------------------------------------------------------------------- */

const param = (value: string | readonly string[] | undefined) =>
  typeof value === "string" ? value : "";
const unique = (list: PersonRef[]) => [...new Map(list.map((entry) => [entry.id, entry])).values()];

/** Overdue milestones on HR Home, and whose manager a follow-up goes to. */
const OVERDUE = [
  { id: "od1", personId: people.ravi.id, milestone: "2 check-ins not recorded", dueIn: -9 },
  { id: "od2", personId: people.ben.id, milestone: "60-day check-in", dueIn: -5 },
  { id: "od3", personId: people.leah.id, milestone: "2 learning modules", dueIn: -5 },
];

/** A probation review by the person's first name, for Context Bot's evidence summaries. */
export function probationByFirstName(first: string): ProbationDetail | null {
  const review = reviews.find(
    (entry) =>
      reviewContext(entry).person.name.split(" ")[0]?.toLowerCase() === first.toLowerCase(),
  );
  return review ? reviewDetail(review) : null;
}

export function overdueList() {
  return OVERDUE.map((item) => {
    const record = findRecord(item.personId);
    return {
      id: item.id,
      person: record.person,
      team: record.team,
      milestone: item.milestone,
      dueOn: dateFromToday(item.dueIn),
    };
  });
}

export const peopleOpsPageMocks = [
  mockGet(H.probationReviews)(({ request }) =>
    probationReviewList(Number(new URL(request.url).searchParams.get("within") ?? 30)),
  ),
  mockGet(H.starters)(({ request }) => ({
    items: starterList(Number(new URL(request.url).searchParams.get("within") ?? 14)),
  })),
  mockGet(H.overdueMilestones)(() => ({ items: overdueList() })),
  mockGet(H.templates)(({ request }) => ({
    items: templateList(new URL(request.url).searchParams.get("archived") === "include"),
  })),

  mockGet(E.onboardings)(({ request }) => {
    const params = new URL(request.url).searchParams;
    const q = (params.get("q") ?? "").trim().toLowerCase();
    const team = params.get("team") ?? "";
    const filter = (params.get("filter") ?? "all") as OnboardingFilter;
    const matches = FILTERS[filter] ?? FILTERS.all;
    const items = records.filter(
      (record) =>
        matches(record) &&
        (!team || record.team === team) &&
        (!q ||
          `${record.person.name} ${record.person.title} ${record.team} ${record.manager?.name ?? ""}`
            .toLowerCase()
            .includes(q)),
    );
    return {
      total: TOTAL_RECORDS + createdRecords,
      startingNext14Days: STARTING_NEXT_14_DAYS,
      teams: [...new Set(records.map((record) => record.team))],
      counts: {
        all: records.length,
        attention: records.filter(needsAttention).length,
        starting: records.filter(isStarting).length,
        progress: records.filter((record) => !isStarting(record)).length,
      },
      items: items.map(summary),
    };
  }),
  mockGet(E.onboarding)(({ params }) => recordDetail(findRecord(param(params.id)))),
  mockPatch(E.assign)((input, { params }) => {
    const record = findRecord(param(params.id));
    if (input.managerId)
      record.manager = MANAGERS.find((entry) => entry.id === input.managerId) ?? record.manager;
    if (input.buddyId) {
      record.buddy = BUDDIES.find((entry) => entry.id === input.buddyId) ?? record.buddy;
      record.setup.add("buddy");
    }
    if (input.peoplePartnerId === HR.id) record.peoplePartner = HR;
    if (input.templateId && templates.some((entry) => entry.id === input.templateId)) {
      record.templateId = input.templateId;
      record.setup.add("roadmap");
    }
    refreshStatus(record);
    return recordDetail(record);
  }),
  mockPost(E.setupStep)((_input, { params }) => {
    const record = findRecord(param(params.id));
    const step = SETUP.find((entry) => entry.id === param(params.step));
    if (!step) throw new MockNotFoundError("Setup step");
    record.setup.add(step.id);
    refreshStatus(record);
    return recordDetail(record);
  }),
  mockPost(E.message)((input, { params }) => {
    const record = findRecord(param(params.id));
    const people = { person: record.person, manager: record.manager, buddy: record.buddy };
    return {
      delivered: unique(input.to.flatMap((key) => people[key] ?? [])),
      skipped: input.to
        .filter((key) => !people[key])
        .map((key) => ({ name: `The ${key}`, reason: `No ${key} is assigned` })),
    };
  }),
  mockGet(E.options)(() => ({
    teams: ["Platform", "Billing", "Product", "Data", "Design", "Support", "Sales", "Finance"],
    managers: MANAGERS,
    buddies: BUDDIES,
    peoplePartners: [HR],
    templates: templates
      .filter((entry) => entry.publishedVersion !== null)
      .flatMap((entry) => templateRef(entry.id) ?? []),
    departments: [],
    teamDepartments: {},
  })),
  // The organisation's job titles and teams, from the fixtures' templates and records.
  mockGet(E.templateAudience)(() => ({
    roles: [
      ...new Set([
        ...templates.flatMap((entry) => entry.roles),
        ...records.map((record) => record.person.title ?? "").filter(Boolean),
      ]),
    ].sort((a, b) => a.localeCompare(b)),
    teams: [...new Set(templates.flatMap((entry) => entry.teams))]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, departmentId: null })),
    departments: [],
  })),
  // As the API, simplified: a template fits when one of its roles is in the job title, or its teams
  // include the team; published templates come first.
  mockGet(E.templateSuggestion)(({ request }) => {
    const url = new URL(request.url);
    const title = (url.searchParams.get("title") ?? "").toLowerCase();
    const team = (url.searchParams.get("team") ?? "").toLowerCase();
    const live = templates.filter((entry) => !entry.archived);
    const fits = (entry: MockTemplate) =>
      (title.length > 1 && entry.roles.some((role) => title.includes(role.toLowerCase()))) ||
      (team !== "" && entry.teams.some((name) => name.toLowerCase() === team));
    const choice = (entry: MockTemplate) => ({
      id: entry.id,
      name: entry.name,
      status: entry.publishedVersion === null ? ("draft" as const) : ("published" as const),
      generating: false,
      fits: fits(entry),
      fitsBy: fits(entry)
        ? title.length > 1 && entry.roles.some((role) => title.includes(role.toLowerCase()))
          ? ("role" as const)
          : ("team" as const)
        : null,
    });
    const ordered = [...live.filter(fits), ...live.filter((entry) => !fits(entry))].map(choice);
    return {
      department: null,
      suggested: ordered.find((entry) => entry.fits) ?? null,
      options: ordered,
    };
  }),
  mockPost(E.createOnboarding)((input) => {
    createdRecords += 1;
    const startsIn = Math.round(
      (Date.parse(`${input.startDate}T12:00:00`) - new Date().setHours(12, 0, 0, 0)) / DAY,
    );
    const record: MockRecord = {
      person: { id: `p-new-${createdRecords}`, name: input.name.trim(), title: input.title.trim() },
      team: input.team,
      manager: MANAGERS.find((entry) => entry.id === input.managerId) ?? null,
      buddy: BUDDIES.find((entry) => entry.id === input.buddyId) ?? null,
      startsIn,
      templateId: input.templateId,
      stage: null,
      progress: 0,
      expected: 0,
      status: "needs_setup",
      note: "",
      setup: new Set([
        ...(input.templateId ? ["roadmap" as const] : []),
        ...(input.buddyId ? ["buddy" as const] : []),
      ]),
      lastCheckin: null,
    };
    refreshStatus(record);
    records = [record, ...records];
    return recordDetail(record);
  }, 201),

  mockGet(E.probation)(({ params }) => reviewDetail(findReview(param(params.id)))),
  mockPost(E.decide)((input, { params }) => {
    const review = findReview(param(params.id));
    if (review.state !== "ready_for_approval" && review.state !== "needs_hr_review")
      return reviewDetail(review);
    const extension = input.outcome === "extend" ? `${input.extensionDays ?? 30} days` : null;
    review.state = "completed";
    review.decision = {
      outcome: input.outcome === "confirm" ? "confirmed" : "extended",
      extension,
      decidedOn: dateFromToday(0),
      effectiveOn: input.effectiveOn,
      decidedBy: HR,
      note: input.note.trim(),
      notified: input.notify,
    };
    review.activity = [
      act(
        `a-${Date.now()}`,
        0,
        `${HR.name} recorded: ${extension ? `extended ${extension}` : "confirmed"}`,
        "decided",
      ),
      ...review.activity,
    ];
    return reviewDetail(review);
  }),
  mockPost(E.discuss)((_input, { params }) => {
    const review = findReview(param(params.id));
    const manager = reviewContext(review).manager;
    review.activity = [
      act(
        `a-${Date.now()}`,
        0,
        `${HR.name} asked ${manager.name} to discuss before deciding`,
        "review",
      ),
      ...review.activity,
    ];
    return reviewDetail(review);
  }),
  mockGet(E.personOnboarding)(({ params }) => summary(findRecord(param(params.id)))),
  mockGet(E.personDetails)(({ params }) => detailsFor(param(params.id))),
  mockPatch(E.personDetails)((input, { params }) => {
    const current = detailsFor(param(params.id));
    const next: PersonDetails = {
      ...current,
      ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle || null } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
      ...(input.managerId !== undefined
        ? { manager: input.managerId ? personById(input.managerId) : null }
        : {}),
    };
    savedDetails.set(next.id, next);
    return next;
  }),
  mockPost(E.remind)((input) => {
    if (input.about === "milestone") {
      const managers = OVERDUE.filter((item) => input.ids.includes(item.id)).flatMap(
        (item) => findRecord(item.personId).manager ?? [],
      );
      return { reminded: unique(managers) };
    }
    return { reminded: unique(input.ids.map((id) => reviewContext(findReview(id)).manager)) };
  }),

  mockGet(E.template)(({ params }) => templateDetail(findTemplate(param(params.id)))),
  mockPost(E.saveDraft)((input, { params }) => {
    const entry = findTemplate(param(params.id));
    if (entry.status === "published") {
      entry.version += 1;
      entry.status = "draft";
    }
    applyStages(entry, input.stages, input);
    return templateDetail(entry);
  }),
  mockPost(E.publish)((input, { params }) => {
    const entry = findTemplate(param(params.id));
    if (entry.status === "published") entry.version += 1;
    applyStages(entry, input.stages, input);
    entry.status = "published";
    entry.review = null;
    entry.publishedVersion = entry.version;
    entry.history = [
      {
        version: entry.version,
        on: dateFromToday(0),
        note: input.note.trim() || "Updated modules",
        snapshot: {
          name: entry.name,
          roles: [...entry.roles],
          teams: [...entry.teams],
          weeks: entry.weeks,
          passMark: entry.passMark,
          stages: entry.stages.map((item) => ({ ...item, moduleIds: [...item.moduleIds] })),
        },
      },
      ...entry.history,
    ];
    return templateDetail(entry);
  }),
  // As the API for a manager: the stages are saved as the draft People Ops review.
  mockPost(E.submitTemplate)((input, { params }) => {
    const entry = findTemplate(param(params.id));
    if (entry.status === "published") {
      entry.version += 1;
      entry.status = "draft";
    }
    applyStages(entry, input.stages, input);
    entry.review = {
      state: "in_review",
      note: input.note.trim() || null,
      by: people.daniel,
      at: new Date().toISOString(),
    };
    return templateDetail(entry);
  }),
  mockPost(E.sendBackTemplate)((input, { params }) => {
    const entry = findTemplate(param(params.id));
    entry.review = {
      state: "changes_requested",
      note: input.note,
      by: HR,
      at: new Date().toISOString(),
    };
    return templateDetail(entry);
  }),
  mockGet(E.templateVersion)(({ params }) => {
    const found = templateVersion(findTemplate(param(params.id)), Number(param(params.version)));
    if (!found) throw new MockNotFoundError("A saved copy of that version");
    return found;
  }),
  mockPost(E.archiveTemplate)((_input, { params }) => {
    const entry = findTemplate(param(params.id));
    entry.archived = true;
    return templateDetail(entry);
  }),
  mockPost(E.restoreTemplate)((_input, { params }) => {
    const entry = findTemplate(param(params.id));
    entry.archived = false;
    return templateDetail(entry);
  }),
  mockPost(E.createTemplate)((input) => {
    const base = findTemplate(input.baseId);
    createdTemplates += 1;
    const entry: MockTemplate = {
      ...base,
      id: `tpl-new-${createdTemplates}`,
      name: input.name.trim() || `${base.name} (copy)`,
      short: input.name.trim() || `${base.short} (copy)`,
      version: 1,
      status: "draft",
      archived: false,
      publishedVersion: null,
      activeCount: 0,
      updatedAt: new Date().toISOString(),
      updatedBy: HR.name,
      stages: base.stages.map((item) => ({ ...item, moduleIds: [...item.moduleIds] })),
      history: [{ version: 1, on: dateFromToday(0), note: `Draft based on ${base.name}` }],
    };
    templates = [...templates, entry];
    return templateDetail(entry);
  }, 201),
  mockGet(E.library)(() => ({ items: LIBRARY })),
];
