import {
  HUB_SECTION_TITLES,
  type ClaimChip,
  type ContextItem,
  type ContextItemKind,
  type HubOverview,
  type HubSectionKey,
  type Khs,
  type SectionSummary,
  type SourceObject,
  type Verification,
} from "@contextos/shared";
import { businessDaysBetween } from "../platform/health.js";
import type { PlatformRecord } from "../platform/store.js";

export const HUB_SECTION_KEYS = Object.keys(HUB_SECTION_TITLES) as HubSectionKey[];

/** Freshness windows per claim type (PRD §8.6.4); null = never stale. */
export const FRESHNESS_DAYS: Record<ContextItemKind, number | null> = {
  status_claim: 14,
  person: 90,
  component: 180,
  dependency: 180,
  term: 365,
  decision: null,
  event: null,
  company: null,
  product: null,
  initiative: null,
  process: null,
};

export const KHS_WEIGHTS = {
  verified: 0.3,
  fresh: 0.2,
  undisputed: 0.15,
  owned: 0.15,
  coverage: 0.1,
  flagSla: 0.1,
} as const;

export function chipFor(verification: Verification): ClaimChip {
  switch (verification) {
    case "confirmed":
      return "Verified";
    case "stale":
      return "Stale";
    case "disputed":
      return "Disputed";
    case "superseded":
      return "Superseded";
    default:
      return "Inferred";
  }
}

/** The hub section a claim kind belongs to (used for flag routing and section owners). */
export function sectionForKind(kind: ContextItemKind): HubSectionKey {
  switch (kind) {
    case "decision":
      return "decisions";
    case "status_claim":
      return "current_state";
    case "person":
      return "people";
    case "component":
      return "architecture";
    case "dependency":
      return "dependencies";
    case "term":
      return "glossary";
    default:
      return "timeline";
  }
}

export function newestEvidenceAt(item: ContextItem): Date | null {
  const dates = item.evidence
    .map((entry) => (entry.sourceCreatedAt ? Date.parse(entry.sourceCreatedAt) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  return dates.length ? new Date(Math.max(...dates)) : null;
}

/** FR-CTX-012: claims whose evidence is older than the freshness window for their type. */
export function isStaleCandidate(item: ContextItem, now = new Date()): boolean {
  const window = FRESHNESS_DAYS[item.kind];
  if (window === null) return false;
  if (item.verification === "stale" || item.verification === "superseded") return false;
  const reference = newestEvidenceAt(item) ?? new Date(item.updatedAt);
  return now.getTime() - reference.getTime() > window * 86400000;
}

export interface RenderedClaim {
  id: string;
  kind: ContextItemKind;
  title: string;
  summary: string;
  chip: ClaimChip;
  verification: Verification;
  confidence: ContextItem["confidence"];
  eventAt: string | null;
  asOf: string | null;
  staleCandidate: boolean;
  conflictsWith: string[];
  data: ContextItem["data"];
  evidence: Array<{ id: string; sourceObjectId: string; sourceTitle: string; quote: string }>;
}

export function renderClaim(item: ContextItem, now = new Date()): RenderedClaim {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    chip: chipFor(item.verification),
    verification: item.verification,
    confidence: item.confidence,
    eventAt: item.eventAt,
    asOf: item.asOf,
    staleCandidate: isStaleCandidate(item, now),
    conflictsWith: item.conflictsWith,
    data: item.data,
    evidence: item.evidence.map((entry) => ({
      id: entry.id,
      sourceObjectId: entry.sourceObjectId,
      sourceTitle: entry.sourceTitle,
      quote: entry.quote,
    })),
  };
}

export interface SectionDomainOwner {
  userId: string;
  name: string;
  scope: "section" | "project" | "workspace";
}

export interface SectionContext {
  project: { id: string; name: string; slug: string | null; description: string | null };
  /** Items already filtered by the actor's source access. */
  items: ContextItem[];
  overview: HubOverview | null;
  /** Sources the actor can read. */
  sources: SourceObject[];
  domainOwner: (key: HubSectionKey) => SectionDomainOwner | null;
  /** Project flags (platform records of kind `flag`) for the SLA component of KHS. */
  flags: PlatformRecord[];
  now?: Date;
}

export interface SectionRender {
  key: HubSectionKey;
  title: string;
  status: "ready" | "empty";
  generatedAt: string | null;
  lastSourceChangeAt: string | null;
  coverage: { sources: number; tools: string[]; claims: number };
  domainOwner: SectionDomainOwner | null;
  content: Record<string, unknown>;
  emptyState: { message: string; suggestions: string[] } | null;
}

const EMPTY_SUGGESTIONS = [
  "Connect or import a source that covers this area",
  "Flag missing context so a domain owner can add it",
  "Create a bounty for someone to document it",
];

const sortByDate = (a: RenderedClaim, b: RenderedClaim) =>
  Date.parse(b.eventAt ?? b.asOf ?? "") - Date.parse(a.eventAt ?? a.asOf ?? "") || 0;

function claimsForSection(key: HubSectionKey, items: ContextItem[], now: Date): RenderedClaim[] {
  const current = items.filter((item) => item.verification !== "superseded");
  const of = (...kinds: ContextItemKind[]) =>
    current.filter((item) => kinds.includes(item.kind)).map((item) => renderClaim(item, now));
  switch (key) {
    case "decisions":
      return items.filter((item) => item.kind === "decision").map((item) => renderClaim(item, now));
    case "people":
      return of("person");
    case "current_state":
      return of("status_claim");
    case "dependencies":
      return of("dependency");
    case "architecture":
      return of("component", "dependency");
    case "glossary":
      return of("term");
    case "timeline":
      return [...of("event"), ...of("decision")].sort(sortByDate);
    case "business_context":
      return of("decision")
        .filter(
          (claim) => "decisionStatus" in claim.data && claim.data.decisionStatus === "decided",
        )
        .slice(0, 10);
    case "overview":
    case "resources":
      return [];
  }
}

function overviewItemIds(overview: HubOverview | null): Set<string> {
  if (!overview) return new Set();
  return new Set(
    [
      overview.whatItIs,
      overview.problem,
      overview.users,
      overview.howItWorks,
      overview.currentFocus,
    ].flatMap((part) => part.evidenceItemIds),
  );
}

export function renderSection(key: HubSectionKey, ctx: SectionContext): SectionRender {
  const now = ctx.now ?? new Date();
  const claims =
    key === "overview"
      ? ctx.items
          .filter((item) => overviewItemIds(ctx.overview).has(item.id))
          .map((item) => renderClaim(item, now))
      : claimsForSection(key, ctx.items, now);
  const sourceIds = new Set(claims.flatMap((claim) => claim.evidence.map((e) => e.sourceObjectId)));
  const sourcesById = new Map(ctx.sources.map((source) => [source.id, source]));
  const backing = [...sourceIds]
    .map((id) => sourcesById.get(id))
    .filter((s): s is SourceObject => !!s);
  const lastSourceChange = (candidates: SourceObject[]) => {
    const times = candidates
      .map((source) =>
        Date.parse(source.sourceUpdatedAt ?? source.processedAt ?? source.ingestedAt),
      )
      .filter((value) => Number.isFinite(value));
    return times.length ? new Date(Math.max(...times)).toISOString() : null;
  };
  const generatedAt = (() => {
    if (["overview", "business_context", "architecture"].includes(key) && ctx.overview)
      return ctx.overview.generatedAt;
    const times = claims.map((claim) => Date.parse(claim.eventAt ?? "")).filter(Number.isFinite);
    const updated = ctx.items.map((item) => Date.parse(item.updatedAt));
    const all = [...times, ...updated].filter(Number.isFinite);
    return claims.length && all.length ? new Date(Math.max(...all)).toISOString() : null;
  })();

  let content: Record<string, unknown>;
  let ready: boolean;
  switch (key) {
    case "overview":
      content = { overview: ctx.overview, claims };
      ready = !!ctx.overview;
      break;
    case "business_context":
      content = {
        problem: ctx.overview?.problem ?? null,
        users: ctx.overview?.users ?? null,
        keyDecisions: claims,
      };
      ready = !!ctx.overview || claims.length > 0;
      break;
    case "architecture":
      content = {
        howItWorks: ctx.overview?.howItWorks ?? null,
        components: claims.filter((claim) => claim.kind === "component"),
        dependencies: claims.filter((claim) => claim.kind === "dependency"),
      };
      ready = claims.length > 0 || !!ctx.overview?.howItWorks.evidenceItemIds.length;
      break;
    case "timeline":
      content = {
        entries: claims.map((claim) => ({ date: claim.eventAt ?? claim.asOf, ...claim })),
      };
      ready = claims.length > 0;
      break;
    case "decisions":
      content = {
        decisions: claims,
        superseded: claims.filter((claim) => claim.verification === "superseded").length,
      };
      ready = claims.length > 0;
      break;
    case "people":
      content = {
        people: claims.map((claim) => ({
          ...claim,
          ownershipLabel: claim.verification === "confirmed" ? "confirmed" : "inferred",
        })),
      };
      ready = claims.length > 0;
      break;
    case "current_state": {
      const asOfTimes = claims.map((claim) => Date.parse(claim.asOf ?? "")).filter(Number.isFinite);
      const recentCutoff = now.getTime() - 14 * 86400000;
      const byState = (state: string) =>
        claims.filter((claim) => "state" in claim.data && claim.data.state === state);
      content = {
        asOf: asOfTimes.length ? new Date(Math.max(...asOfTimes)).toISOString() : null,
        activeWork: byState("active"),
        planned: byState("planned"),
        blockers: byState("blocked"),
        risks: byState("risk"),
        openQuestions: byState("open_question"),
        done: byState("done"),
        unresolvedConflicts: claims.filter((claim) => claim.conflictsWith.length > 0).length,
        recentChanges: ctx.items
          .filter((item) => Date.parse(item.updatedAt) >= recentCutoff)
          .map((item) => renderClaim(item, now))
          .slice(0, 20),
      };
      ready = claims.length > 0;
      break;
    }
    case "dependencies":
      content = { dependencies: claims };
      ready = claims.length > 0;
      break;
    case "resources":
      content = {
        sources: ctx.sources.map((source) => ({
          id: source.id,
          title: source.title,
          kind: source.kind,
          connector: source.connector,
          url: source.url,
          author: source.author,
          sourceCreatedAt: source.sourceCreatedAt,
          status: source.status,
        })),
      };
      ready = ctx.sources.length > 0;
      break;
    case "glossary":
      content = { terms: claims };
      ready = claims.length > 0;
      break;
  }
  const coverageSources = key === "resources" ? ctx.sources : backing;
  return {
    key,
    title: HUB_SECTION_TITLES[key],
    status: ready ? "ready" : "empty",
    generatedAt,
    lastSourceChangeAt: lastSourceChange(coverageSources.length ? coverageSources : ctx.sources),
    coverage: {
      sources: coverageSources.length,
      tools: [...new Set(coverageSources.map((source) => source.connector))],
      claims: claims.length,
    },
    domainOwner: ctx.domainOwner(key),
    content,
    emptyState: ready
      ? null
      : { message: "Not enough source evidence yet", suggestions: EMPTY_SUGGESTIONS },
  };
}

export function sectionSummaries(ctx: SectionContext): SectionSummary[] {
  return HUB_SECTION_KEYS.map((key) => {
    const rendered = renderSection(key, ctx);
    return {
      key,
      title: rendered.title,
      status: rendered.status,
      claims: rendered.coverage.claims,
      lastGeneratedAt: rendered.generatedAt,
      lastSourceChangeAt: rendered.lastSourceChangeAt,
      domainOwner: rendered.domainOwner,
    };
  });
}

/** Knowledge Health Score per PRD §8.13 with the top three improvement actions. */
export function computeKhs(ctx: SectionContext, projectRef: string): Khs {
  const now = ctx.now ?? new Date();
  const visible = ctx.items.filter((item) => item.verification !== "superseded");
  const total = visible.length;
  const ratio = (count: number) => (total > 0 ? count / total : 0);
  const verified = visible.filter((item) => item.verification === "confirmed").length;
  const staleCandidates = visible.filter((item) => isStaleCandidate(item, now)).length;
  const stale = visible.filter((item) => item.verification === "stale").length + staleCandidates;
  const disputed = visible.filter((item) => item.verification === "disputed").length;
  const summaries = sectionSummaries(ctx);
  const owned = summaries.filter((section) => section.domainOwner).length;
  const covered = summaries.filter((section) => section.status === "ready").length;
  const cutoff = now.getTime() - 90 * 86400000;
  const closed = ctx.flags.filter(
    (flag) =>
      ["resolved", "rejected", "duplicate"].includes(flag.status) &&
      flag.updatedAt.getTime() >= cutoff,
  );
  const withinSla = closed.filter(
    (flag) => businessDaysBetween(flag.createdAt, flag.updatedAt) <= 5,
  );
  const components = {
    verifiedRatio: ratio(verified),
    staleRatio: ratio(stale),
    disputedRatio: ratio(disputed),
    ownedRatio: owned / HUB_SECTION_KEYS.length,
    coverageRatio: covered / HUB_SECTION_KEYS.length,
    flagSlaRatio: closed.length ? withinSla.length / closed.length : 1,
  };
  const score =
    100 *
    (KHS_WEIGHTS.verified * components.verifiedRatio +
      KHS_WEIGHTS.fresh * (1 - components.staleRatio) +
      KHS_WEIGHTS.undisputed * (1 - components.disputedRatio) +
      KHS_WEIGHTS.owned * components.ownedRatio +
      KHS_WEIGHTS.coverage * components.coverageRatio +
      KHS_WEIGHTS.flagSla * components.flagSlaRatio);
  const openFlags = ctx.flags.filter((flag) =>
    ["open", "triaged", "in_progress", "pending_verification"].includes(flag.status),
  ).length;
  const improvements = [
    {
      action: "Re-verify stale candidates",
      count: staleCandidates + (stale - staleCandidates),
      link: `/projects/${projectRef}/queue?filter=stale`,
    },
    {
      action: "Resolve disputed claims",
      count: disputed,
      link: `/projects/${projectRef}/conflicts`,
    },
    {
      action: "Assign domain owners to sections",
      count: HUB_SECTION_KEYS.length - owned,
      link: `/admin/assignments?project=${projectRef}`,
    },
    {
      action: "Add sources for empty sections",
      count: HUB_SECTION_KEYS.length - covered,
      link: `/projects/${projectRef}/sources`,
    },
    { action: "Triage open flags", count: openFlags, link: `/queue?project=${projectRef}` },
  ]
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  return {
    score: Math.round(score * 10) / 10,
    components,
    weights: { ...KHS_WEIGHTS },
    improvements,
    computedAt: now.toISOString(),
  };
}
