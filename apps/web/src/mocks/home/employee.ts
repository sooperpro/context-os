import { HOME_ENDPOINTS as E } from "@/features/home/api/home.api";
import { mockGet } from "@/mocks/define";
import { people } from "@/mocks/fixtures/people";
import { atFromToday, dateFromToday, hoursAgo } from "@/mocks/fixtures/time";

/** Maya, nine days into a 90-day plan, as in the prototype's employee Home. */
export const employeeMocks = [
  mockGet(E.myTasks)(() => ({
    from: dateFromToday(-2),
    to: dateFromToday(2),
    items: [
      {
        id: "t1",
        kind: "check",
        title: "Knowledge check: How Tessellate makes money",
        details: ["5 questions", "~5 min"],
        dueAt: atFromToday(1, 17),
        state: "open",
        inProgress: false,
        completedAt: null,
        target: { kind: "check", id: "m4-check" },
      },
      {
        id: "t2",
        kind: "practical",
        title: "Trace a shipment event through the ingest gateway",
        details: ["Practical task", "Pair with Sana Iqbal", "~45 min"],
        dueAt: atFromToday(2, 17),
        state: "open",
        inProgress: true,
        completedAt: null,
        target: { kind: "module", id: "s5" },
      },
      {
        id: "t3",
        kind: "reading",
        title: "Read ADR-042: Billing events on Kafka",
        details: ["Decision record", "6 min read"],
        dueAt: atFromToday(2, 17),
        state: "open",
        inProgress: false,
        completedAt: null,
        target: { kind: "lesson", id: "m4-l3" },
      },
      {
        id: "t4",
        kind: "meeting",
        title: "Week 2 check-in with Daniel",
        details: ["30 min"],
        dueAt: atFromToday(2, 14),
        state: "open",
        inProgress: false,
        completedAt: null,
        target: null,
      },
      {
        id: "t5",
        kind: "practical",
        title: "Set up your local development environment",
        details: ["Practical task"],
        dueAt: atFromToday(-2, 17),
        state: "done",
        inProgress: false,
        completedAt: atFromToday(-2, 15),
        target: { kind: "module", id: "m3" },
      },
      {
        id: "t6",
        kind: "check",
        title: "Knowledge check: Our customers",
        details: ["Passed 9 of 10"],
        dueAt: atFromToday(-5, 17),
        state: "done",
        inProgress: false,
        completedAt: atFromToday(-5, 11),
        target: { kind: "check", id: "m2-check" },
      },
    ],
  })),
  mockGet(E.milestones)(() => ({
    items: [
      {
        id: "ms1",
        kind: "checkin",
        title: "Week 2 check-in",
        detail: "With Daniel Reyes",
        dueOn: dateFromToday(2),
        state: "soon",
      },
      {
        id: "ms2",
        kind: "stage",
        title: "Finish Foundations",
        detail: "3 of 6 modules done",
        dueOn: dateFromToday(2),
        state: "soon",
      },
      {
        id: "ms3",
        kind: "review",
        title: "30-day review",
        detail: "You and your manager",
        dueOn: dateFromToday(21),
        state: "later",
      },
      {
        id: "ms4",
        kind: "readiness",
        title: "60-day readiness review",
        detail: "Manager assessment",
        dueOn: dateFromToday(51),
        state: "later",
      },
      {
        id: "ms5",
        kind: "probation",
        title: "Probation review",
        detail: "Manager and People Ops",
        dueOn: dateFromToday(82),
        state: "later",
      },
    ],
  })),
];

/**
 * The API serves knowledge updates, team news and the people to know first
 * (apps/api/src/modules/platform/employee.routes.ts), so these are not in the development mock layer.
 * They stay as fixtures for screen tests: src/test/employee-mocks.ts.
 */
export const employeeHomeFixtures = [
  mockGet(E.knowledgeUpdates)(() => ({
    items: [
      {
        id: "u1",
        title: "Kestrel rollout plan v3",
        origin: "google_drive",
        author: "Priya Nair",
        updatedAt: hoursAgo(2),
        tag: "Project Kestrel",
        reason: "Related to your current module",
        restrictedTo: null,
        projectId: null,
        itemId: null,
      },
      {
        id: "u2",
        title: "ADR-047: Deprecate the v1 ingest API",
        origin: "github",
        author: "Sana Iqbal",
        updatedAt: hoursAgo(26),
        tag: "Decision",
        reason: "Affects your practical task",
        restrictedTo: null,
        projectId: null,
        itemId: null,
      },
      {
        id: "u3",
        title: "On-call handbook: Platform",
        origin: "knowledge_hub",
        author: "Daniel Reyes",
        updatedAt: atFromToday(-5, 10),
        tag: "Process",
        reason: null,
        restrictedTo: "Platform team only",
        projectId: null,
        itemId: null,
      },
      {
        id: "u4",
        title: "Glossary: Dwell time",
        origin: "knowledge_hub",
        author: "Leah Park",
        updatedAt: atFromToday(-6, 15),
        tag: "Glossary",
        reason: null,
        restrictedTo: null,
        projectId: null,
        itemId: null,
      },
    ],
  })),
  mockGet(E.teamActivity)(() => ({
    team: { id: "team-platform", name: "Platform" },
    items: [
      {
        id: "ta1",
        kind: "release",
        text: "Ingest gateway v2.3 is live, with p95 latency down 30%.",
        actor: people.sana,
        where: "#platform-releases",
        at: hoursAgo(3),
      },
      {
        id: "ta2",
        kind: "schedule",
        text: "Kestrel milestone 2 (dual-write) moves to Nov 12. Rollout plan updated.",
        actor: people.daniel,
        where: "Project Kestrel",
        at: hoursAgo(27),
      },
      {
        id: "ta3",
        kind: "joiner",
        text: "Jonah Kim joins Platform as an SRE next Monday.",
        actor: people.jonah,
        where: "New teammate",
        at: hoursAgo(50),
      },
      {
        id: "ta4",
        kind: "event",
        text: "Platform demo day: Thursday at 4:00 PM.",
        actor: null,
        where: "Team event",
        at: hoursAgo(72),
      },
    ],
  })),
  mockGet(E.myPeople)(() => ({
    items: [
      { person: people.daniel, relation: "manager", note: null },
      { person: people.sana, relation: "buddy", note: null },
      { person: people.priya, relation: "expert", note: "Billing & Kestrel" },
      { person: people.elena, relation: "people_partner", note: null },
    ],
  })),
  mockGet(E.myCheckins)(() => ({
    upcoming: [
      { id: "r1:weekly", title: "Weekly 1:1", at: atFromToday(3, 10) },
      { id: "r1:day_30", title: "30-day review", at: atFromToday(9, 14) },
    ],
    shared: [
      {
        id: "c1",
        version: 1,
        title: "Weekly 1:1",
        on: dateFromToday(-4),
        by: people.daniel,
        notes: "Strong first week. The Kestrel walkthrough landed well.",
        nextSteps: "Pair with Sana on the billing service.",
        response: null,
      },
    ],
  })),
];
