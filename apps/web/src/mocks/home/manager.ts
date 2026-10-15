import { HOME_ENDPOINTS as E } from "@/features/home/api/home.api";
import { mockGet } from "@/mocks/define";
import { people } from "@/mocks/fixtures/people";
import { atFromToday } from "@/mocks/fixtures/time";

/** Daniel's Platform team, as in the prototype's manager Home. */
export const managerMocks = [
  mockGet(E.attention)(() => ({
    items: [
      {
        id: "at1",
        person: people.chloe,
        severity: "error",
        label: "Blocked · 4 days",
        title: "Waiting on data warehouse access",
        detail: "Access request IT-2291 is still open. 3 of her next modules depend on it.",
        actions: [
          { kind: "escalate", label: "Escalate request" },
          { kind: "message", label: "Message Chloe", href: "mailto:chloe@example.com" },
        ],
      },
      {
        id: "at2",
        person: people.leah,
        severity: "warning",
        label: "At risk",
        title: "Struggling with billing architecture",
        detail: "Failed the “Billing architecture” check twice. 2 modules are 5 days overdue.",
        actions: [
          { kind: "assign_learning", label: "Assign learning task" },
          { kind: "review_progress", label: "Review progress" },
        ],
      },
      {
        id: "at3",
        person: people.jonah,
        severity: "info",
        label: "Starts Monday",
        title: "No learning roadmap yet",
        detail: "Jonah starts as an SRE next week. Pick a template so day one has a plan.",
        actions: [{ kind: "assign_roadmap", label: "Assign roadmap" }],
      },
      {
        id: "at4",
        person: people.arjun,
        severity: "neutral",
        label: "Due in 9 days",
        title: "Probation recommendation",
        detail: "Readiness 86%. All Ownership milestones are on track.",
        actions: [{ kind: "start_recommendation", label: "Start recommendation" }],
      },
    ],
  })),
  mockGet(E.checkins)(() => ({
    items: [
      {
        id: "ci1",
        person: people.leah,
        title: "1:1 · Learning plan",
        at: atFromToday(1, 11),
        note: "Suggested agenda ready",
      },
      {
        id: "ci2",
        person: people.maya,
        title: "Week 2 check-in",
        at: atFromToday(2, 14),
        note: "3 topics added by Maya",
      },
      {
        id: "ci3",
        person: people.arjun,
        title: "Readiness review",
        at: atFromToday(7, 10),
        note: "Feeds the probation recommendation",
      },
      {
        id: "ci4",
        person: people.chloe,
        title: "30-day review",
        at: atFromToday(8, 15, 30),
        note: null,
      },
    ],
  })),
  mockGet(E.knowledgeGaps)(() => ({
    items: [
      {
        id: "g1",
        question: "How do I roll back a Kestrel deploy?",
        askedCount: 7,
        reason: "no_answer",
        detail: "No answer found",
        section: "process",
        related: ["Project Kestrel"],
        suggestedKind: "article",
      },
      {
        id: "g2",
        question: "Which service owns carrier webhooks?",
        askedCount: 4,
        reason: "conflict",
        detail: "Sources disagree",
        section: "system",
        related: ["Ingest gateway"],
        suggestedKind: "edit",
      },
      {
        id: "g3",
        question: "How do I get staging database access?",
        askedCount: 3,
        reason: "stale",
        detail: "Source is 14 months old",
        section: "process",
        related: ["Release process"],
        suggestedKind: "edit",
      },
    ],
  })),
  mockGet(E.teamKnowledge)(() => ({
    owned: 64,
    needsReview: 5,
    awaitingYou: 3,
    queue: [
      {
        id: "q1",
        title: "Shipment event",
        kind: "glossary_term",
        author: people.maya,
        submittedAt: atFromToday(-1, 10),
      },
      {
        id: "q2",
        title: "Ledger service runbook",
        kind: "edit",
        author: people.leah,
        submittedAt: atFromToday(-2, 16),
      },
      {
        id: "q3",
        title: "On-call escalation paths",
        kind: "article",
        author: people.arjun,
        submittedAt: atFromToday(-4, 9),
      },
    ],
  })),
];
