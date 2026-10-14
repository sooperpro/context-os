import type { Contribution, KnowledgeGap, KnowledgeSection, SourcePick } from "@contextos/shared";
import { CONTRIBUTION_ENDPOINTS as E } from "@/features/contributions/api/contributions.api";
import { mockGet, mockPost } from "@/mocks/define";
import { people } from "@/mocks/fixtures/people";
import { atFromToday, hoursAgo } from "@/mocks/fixtures/time";

/*
 * Contributions as in the prototype (Maya's). The lists live in memory for the session, so saving or
 * submitting in the editor shows up in the list and on Home, as it would against the API. A reload
 * starts over.
 */

const seedContributions = (): Contribution[] => [
  {
    id: "c1",
    kind: "glossary_term",
    title: "Shipment event",
    section: "glossary",
    status: "changes_requested",
    visibility: "workspace",
    reviewer: people.sana,
    reviewNote: null,
    submittedAt: atFromToday(-2, 10),
    publishedAt: null,
    updatedAt: hoursAgo(20),
    impact: null,
    comments: [
      {
        id: "cm1",
        author: people.sana,
        at: hoursAgo(20),
        text: "Looks good. Can you add the list of event types from the schema? Then I’ll publish it.",
      },
    ],
    gapId: null,
    sourceCount: 1,
  },
  {
    id: "c2",
    kind: "edit",
    title: "Local dev setup: Apple silicon notes",
    section: "system",
    status: "published",
    visibility: "workspace",
    reviewer: people.sana,
    reviewNote: null,
    submittedAt: atFromToday(-7, 11),
    publishedAt: atFromToday(-6, 15),
    updatedAt: atFromToday(-6, 15),
    impact: "Viewed by 6 people · 2 marked it helpful",
    comments: [],
    gapId: null,
    sourceCount: 2,
  },
  {
    id: "c3",
    kind: "flag",
    title: "Staging access request",
    section: "process",
    status: "resolved",
    visibility: "workspace",
    reviewer: people.tom,
    reviewNote: null,
    submittedAt: atFromToday(-8, 9),
    publishedAt: atFromToday(-7, 12),
    updatedAt: atFromToday(-7, 12),
    impact: "Fixed by Tom Becker",
    comments: [],
    gapId: null,
    sourceCount: 0,
  },
];

const seedGaps = (): KnowledgeGap[] => [
  {
    id: "gap-kestrel-rollback",
    question: "How do I roll back a Kestrel deploy?",
    reason: "no_answer",
    detail: "Asked 7 times in Context Bot. No page answers it.",
    askedCount: 7,
    section: "process",
    related: ["Project Kestrel", "Release process"],
    suggestedKind: "article",
  },
  {
    id: "gap-staging-db",
    question: "Staging database access",
    reason: "stale",
    detail: "The page is 14 months old and 3 people flagged it.",
    askedCount: 3,
    section: "process",
    related: ["Release process"],
    suggestedKind: "edit",
  },
  {
    id: "gap-carrier-webhooks",
    question: "Which service owns carrier webhooks?",
    reason: "conflict",
    detail: "Two pages disagree. Asked 4 times.",
    askedCount: 4,
    section: "system",
    related: ["Ingest gateway", "Public API and webhooks"],
    suggestedKind: "edit",
  },
];

const SOURCES: SourcePick[] = [
  {
    id: "s1",
    projectId: "p-kestrel",
    title: "Kestrel rollout plan v3",
    label: "Doc",
    origin: "google_drive",
    owner: "Priya Nair",
    stale: false,
  },
  {
    id: "s2",
    projectId: "p-kestrel",
    title: "#kestrel · “rollback dry run” thread",
    label: "Slack thread · 14 replies",
    origin: "slack",
    owner: "Sana Iqbal",
    stale: false,
  },
  {
    id: "s3",
    projectId: "p-kestrel",
    title: "KES-131 · Rollback procedure for cutover",
    label: "Jira issue",
    origin: "jira",
    owner: "Sana Iqbal",
    stale: true,
  },
  {
    id: "s4",
    projectId: "p-platform",
    title: "Release process",
    label: "Page",
    origin: "confluence",
    owner: "Arjun Mehta",
    stale: false,
  },
  {
    id: "s5",
    projectId: "p-billing",
    title: "ADR-042: Billing events on Kafka",
    label: "Decision record",
    origin: "github",
    owner: "Sana Iqbal",
    stale: false,
  },
  {
    id: "s6",
    projectId: "p-ledger",
    title: "tessellate/ledger-service · scripts/replay.sh",
    label: "Code",
    origin: "github",
    owner: "Leah Park",
    stale: false,
  },
];

const AI_DRAFT = `## When to roll back
Roll back if billing totals from the event stream and the nightly export differ by more than 0.5% for two runs in a row, or if a consumer reports duplicate invoices.

## Steps
1. Announce the rollback in #kestrel and page Platform on-call.
2. Pause the billing-events consumers: \`kubectl scale deploy/billing-consumer --replicas=0\`.
3. Switch invoicing back to the nightly export feature flag (\`billing.source=export\`).
4. Replay any events from the cutover window with \`scripts/replay.sh --from <timestamp>\`. Consumers are idempotent, so replays are safe.
5. Ask Finance to rerun reconciliation for the affected day.

## Verify
Totals match in the reconciliation sheet and no duplicate invoices appear in the next export.`;

let contributions = seedContributions();
let gaps = seedGaps();

/** Who reviews what, as the prototype decides it: Kestrel and billing topics and the glossary go to Sana. */
function reviewerFor(section: KnowledgeSection, title: string) {
  return section === "glossary" || /kestrel|ledger|billing/i.test(title)
    ? { reviewer: people.sana, reason: "Owns Kestrel technical docs" }
    : { reviewer: people.daniel, reason: "Platform manager" };
}

/** Restores the fixtures; tests call it so one test's writes never leak into the next. */
export function resetContributionMocks(): void {
  contributions = seedContributions();
  gaps = seedGaps();
}

export const contributionMocks = [
  mockGet(E.mine)(() => ({ items: contributions })),
  mockGet(E.gaps)(() => ({ items: gaps })),
  mockGet(E.sources)(({ request }) => {
    const words = (new URL(request.url).searchParams.get("q") ?? "")
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3);
    const score = (source: SourcePick) =>
      words.filter((word) => source.title.toLowerCase().includes(word)).length;
    return { items: [...SOURCES].sort((a, b) => score(b) - score(a)) };
  }),
  mockGet(E.reviewer)(({ request }) => {
    const params = new URL(request.url).searchParams;
    const section = (params.get("section") ?? "process") as KnowledgeSection;
    return reviewerFor(section, params.get("title") ?? "");
  }),
  mockPost(E.draft)((input) => ({
    body: AI_DRAFT,
    sources: input.sourceIds.length
      ? SOURCES.filter((source) => input.sourceIds.includes(source.id))
      : SOURCES.filter((source) => ["s1", "s2", "s3"].includes(source.id)),
  })),
  mockPost(E.create)((input) => {
    const now = new Date().toISOString();
    const created: Contribution = {
      id: `c-${Date.now()}`,
      kind: input.kind,
      title: input.title || "Untitled draft",
      section: input.section,
      status: input.submit ? "submitted" : "draft",
      visibility: input.visibility,
      reviewer: reviewerFor(input.section, input.title).reviewer,
      reviewNote: input.submit ? "usually 2 working days" : null,
      submittedAt: input.submit ? now : null,
      publishedAt: null,
      updatedAt: now,
      impact: null,
      comments: [],
      gapId: input.gapId,
      sourceCount: input.sourceIds.length,
    };
    contributions = [created, ...contributions];
    if (input.submit && input.gapId) gaps = gaps.filter((gap) => gap.id !== input.gapId);
    return created;
  }, 201),
  mockPost(E.resubmit)((_input, { params }) => {
    const existing = contributions.find((item) => item.id === params.id);
    if (!existing) throw new Error(`No contribution ${String(params.id)}`);
    const updated: Contribution = {
      ...existing,
      status: "in_review",
      comments: [],
      reviewNote: "resubmitted today",
      updatedAt: new Date().toISOString(),
    };
    contributions = contributions.map((item) => (item.id === updated.id ? updated : item));
    return updated;
  }),
];
