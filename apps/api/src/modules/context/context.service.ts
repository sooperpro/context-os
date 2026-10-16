import { randomUUID } from "node:crypto";
import {
  ContextItemSchema,
  type Confidence,
  type ContextItem,
  type ContextItemKind,
  type Evidence,
  type Verification,
} from "@contextos/shared";
import type {
  ContextItemRow,
  ProjectRow,
  SourceChunkRow,
  SourceObjectRow,
} from "../../db/schema.js";
import { NotFoundError } from "../../lib/errors.js";
import type { Logger } from "../../lib/logger.js";
import { containsQuote, normalizeKey, parseLooseDate } from "../../lib/text.js";
import type { Actor } from "../../types.js";
import type { AuditService } from "../audit/audit.service.js";
import type { ContextRepository, EvidenceWithSource } from "./context.repository.js";
import type { ExtractionOutput } from "./extraction.schema.js";
import type { IdentityService } from "../identity/identity.service.js";

export interface ContextServiceDeps {
  repo: ContextRepository;
  audit: AuditService;
  logger: Logger;
  identity: IdentityService;
}

interface Candidate {
  kind: ContextItemKind;
  title: string;
  summary: string;
  data: Record<string, unknown>;
  eventAt: Date | null;
  asOf: Date | null;
  confidence: Confidence;
  quote: string;
}

export interface PersistStats {
  created: number;
  merged: number;
  unverifiedQuotes: number;
}

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

function toCandidates(output: ExtractionOutput): Candidate[] {
  const candidates: Candidate[] = [];
  for (const d of output.decisions) {
    candidates.push({
      kind: "decision",
      title: d.title,
      summary: d.summary,
      data: {
        rationale: d.rationale ?? null,
        alternatives: d.alternatives,
        participants: d.participants,
        consequences: d.consequences ?? null,
        decisionStatus: d.decisionStatus,
      },
      eventAt: parseLooseDate(d.decidedAt),
      asOf: null,
      confidence: d.confidence,
      quote: d.evidenceQuote,
    });
  }
  for (const e of output.events) {
    candidates.push({
      kind: "event",
      title: e.title,
      summary: e.summary,
      data: { category: e.category },
      eventAt: parseLooseDate(e.occurredAt),
      asOf: null,
      confidence: e.confidence,
      quote: e.evidenceQuote,
    });
  }
  for (const s of output.statusClaims) {
    candidates.push({
      kind: "status_claim",
      title: s.title,
      summary: s.summary,
      data: { state: s.state },
      eventAt: null,
      asOf: parseLooseDate(s.asOf),
      confidence: s.confidence,
      quote: s.evidenceQuote,
    });
  }
  for (const p of output.people) {
    candidates.push({
      kind: "person",
      title: p.name,
      summary: p.role ? `${p.name} — ${p.role}` : p.name,
      data: { role: p.role ?? null, owns: p.owns },
      eventAt: null,
      asOf: null,
      confidence: p.confidence,
      quote: p.evidenceQuote,
    });
  }
  for (const c of output.components) {
    candidates.push({
      kind: "component",
      title: c.name,
      summary: c.summary,
      data: { componentType: c.componentType },
      eventAt: null,
      asOf: null,
      confidence: c.confidence,
      quote: c.evidenceQuote,
    });
  }
  for (const d of output.dependencies) {
    candidates.push({
      kind: "dependency",
      title: `${d.from} → ${d.to}`,
      summary: d.summary,
      data: { from: d.from, to: d.to, relation: d.relation },
      eventAt: null,
      asOf: null,
      confidence: d.confidence,
      quote: d.evidenceQuote,
    });
  }
  for (const t of output.terms) {
    candidates.push({
      kind: "term",
      title: t.term,
      summary: t.definition,
      data: { definition: t.definition },
      eventAt: null,
      asOf: null,
      confidence: t.confidence,
      quote: t.evidenceQuote,
    });
  }
  const entries: Array<[ContextItemKind, ExtractionOutput["products"]]> = [
    ["company", output.companyFacts],
    ["product", output.products],
    ["initiative", output.initiatives],
    ["process", output.processes],
  ];
  for (const [kind, list] of entries)
    for (const e of list)
      candidates.push({
        kind,
        title: e.name,
        summary: e.summary,
        data: {},
        eventAt: null,
        asOf: null,
        confidence: e.confidence,
        quote: e.evidenceQuote,
      });
  return candidates;
}

/** Same subject + compatible claim → merge evidence instead of creating a duplicate. */
function isCompatible(
  kind: ContextItemKind,
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
) {
  if (kind === "status_claim") return existing.state === incoming.state;
  if (kind === "decision") return existing.decisionStatus === incoming.decisionStatus;
  if (kind === "dependency") return existing.relation === incoming.relation;
  return true;
}

export function createContextService({ repo, audit, logger, identity }: ContextServiceDeps) {
  const toEvidence = (row: EvidenceWithSource): Evidence => ({
    id: row.evidence.id,
    sourceObjectId: row.source.id,
    chunkId: row.evidence.chunkId,
    sourceTitle: row.source.title,
    sourceKind: row.source.kind,
    sourceUrl: row.source.url,
    sourceCreatedAt: row.source.sourceCreatedAt ? row.source.sourceCreatedAt.toISOString() : null,
    quote: row.evidence.quote,
    quoteVerified: row.evidence.quoteVerified,
  });

  const toItems = (rows: ContextItemRow[], allowedSources?: Set<string>): ContextItem[] => {
    const evidenceByItem = repo.listEvidenceForItems(rows.map((r) => r.id));
    const ready = new Set(
      [...new Set(rows.map((row) => row.projectId))].flatMap((projectId) =>
        repo.listReadySourceIds(projectId),
      ),
    );
    const eligible = rows.filter((row) => {
      const supporting = evidenceByItem.get(row.id) ?? [];
      const dependencies =
        row.data._generationSources ?? supporting.map((entry) => entry.source.id);
      return (
        supporting.length > 0 &&
        Array.isArray(dependencies) &&
        dependencies.length > 0 &&
        dependencies.every(
          (id) =>
            typeof id === "string" && ready.has(id) && (!allowedSources || allowedSources.has(id)),
        ) &&
        supporting.every(
          (entry) =>
            entry.evidence.quoteVerified &&
            entry.source.status === "ready" &&
            (!allowedSources || allowedSources.has(entry.source.id)),
        )
      );
    });
    const conflicts = detectConflicts(eligible);
    const items: ContextItem[] = [];
    for (const row of eligible) {
      const { _generationSources: _ignored, supersededBy, ...publicData } = row.data;
      const parsed = ContextItemSchema.safeParse({
        id: row.id,
        projectId: row.projectId,
        kind: row.kind,
        title: row.title,
        summary: row.summary,
        data: publicData,
        eventAt: row.eventAt ? row.eventAt.toISOString() : null,
        asOf: row.asOf ? row.asOf.toISOString() : null,
        verification: row.verification,
        confidence: row.confidence,
        conflictsWith: conflicts.get(row.id) ?? [],
        supersededBy: typeof supersededBy === "string" ? supersededBy : null,
        evidence: (evidenceByItem.get(row.id) ?? []).map(toEvidence),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
      if (parsed.success) items.push(parsed.data);
      else
        logger.warn(
          { itemId: row.id, issues: parsed.error.issues },
          "Skipping malformed context item",
        );
    }
    return items;
  };

  return {
    listItems(project: ProjectRow, kind?: ContextItemKind, actor?: Actor): ContextItem[] {
      return toItems(
        repo.listItems(project.id, kind),
        actor ? new Set(identity.visibleSourceIds(actor, project.id)) : undefined,
      );
    },

    listItemsLinkedToSources(
      projectId: string,
      sourceIds: string[],
      limit: number,
      actor?: Actor,
    ): ContextItem[] {
      return toItems(
        repo.listItemsLinkedToSources(projectId, sourceIds, limit),
        actor ? new Set(identity.visibleSourceIds(actor, projectId)) : undefined,
      );
    },

    countsByKind(projectId: string): Record<ContextItemKind, number> {
      const counts = repo.countsByKind(projectId);
      return {
        decision: counts.get("decision") ?? 0,
        event: counts.get("event") ?? 0,
        status_claim: counts.get("status_claim") ?? 0,
        person: counts.get("person") ?? 0,
        component: counts.get("component") ?? 0,
        dependency: counts.get("dependency") ?? 0,
        term: counts.get("term") ?? 0,
        company: counts.get("company") ?? 0,
        product: counts.get("product") ?? 0,
        initiative: counts.get("initiative") ?? 0,
        process: counts.get("process") ?? 0,
      };
    },

    hasAnyItems(projectId: string): boolean {
      return repo.hasAnyItems(projectId);
    },

    setVerification(
      actor: Actor,
      project: ProjectRow,
      itemId: string,
      verification: Verification,
    ): ContextItem {
      const row = repo.findItem(itemId, project.id);
      if (!row) throw new NotFoundError("Context item", itemId);
      identity.requireAssignment(actor, "domain_owner", project.id);
      if (!toItems([row], new Set(identity.visibleSourceIds(actor, project.id))).length)
        throw new NotFoundError("Context item");
      const updated = repo.updateItem(row.id, { verification }) ?? row;
      audit.record({
        actor,
        projectId: project.id,
        action: "context_item.verify",
        targetType: "context_item",
        targetId: row.id,
        metadata: { from: row.verification, to: verification },
      });
      const [item] = toItems([updated]);
      if (!item) throw new NotFoundError("Context item", itemId);
      return item;
    },

    /** Remove everything derived from a source (before re-processing it). */
    removeDerivedFromSource(projectId: string, sourceObjectId: string): number {
      repo.preserveGenerationSources(sourceObjectId);
      repo.deleteEvidenceForSource(sourceObjectId);
      return repo.deleteOrphanedItems(projectId);
    },

    removeOrphanedItems(projectId: string): number {
      return repo.deleteOrphanedItems(projectId);
    },

    /**
     * Store extraction output as context items + evidence. Quotes are verified
     * against the source text; unverifiable/unlocatable quotes are discarded.
     */
    persistExtraction(params: {
      source: SourceObjectRow;
      chunks: SourceChunkRow[];
      output: ExtractionOutput;
      runId: string;
    }): PersistStats {
      const { source, chunks, output, runId } = params;
      const stats: PersistStats = { created: 0, merged: 0, unverifiedQuotes: 0 };

      for (const candidate of toCandidates(output)) {
        const title = candidate.title.trim();
        if (!title) continue;
        const quoteVerified =
          candidate.quote.length >= 8 && source.content.includes(candidate.quote);
        const chunk = quoteVerified
          ? chunks.find((c) => containsQuote(c.content, candidate.quote))
          : undefined;
        const confidence: Confidence = quoteVerified ? candidate.confidence : "low";
        if (!quoteVerified || !chunk) {
          stats.unverifiedQuotes += 1;
          continue;
        }

        const normalizedKey = `${candidate.kind}:${normalizeKey(title)}`;
        const existing = repo
          .findByKey(source.projectId, normalizedKey)
          .find((row) => isCompatible(candidate.kind, row.data, candidate.data));

        let itemId: string;
        if (existing) {
          itemId = existing.id;
          stats.merged += 1;
          // Keep the stronger confidence and the longer summary.
          const supporting = repo.listEvidenceForItems([existing.id]).get(existing.id) ?? [];
          const previous = Array.isArray(existing.data._generationSources)
            ? existing.data._generationSources.filter((id): id is string => typeof id === "string")
            : [];
          const patch: Partial<Pick<ContextItemRow, "summary" | "confidence" | "data">> = {
            data: {
              ...existing.data,
              _generationSources: [
                ...new Set([...previous, ...supporting.map((ref) => ref.source.id), source.id]),
              ],
            },
          };
          if (CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK[existing.confidence])
            patch.confidence = confidence;
          if (candidate.summary.length > existing.summary.length + 40)
            patch.summary = candidate.summary;
          if (Object.keys(patch).length > 0) repo.updateItem(existing.id, patch);
        } else {
          const row = repo.insertItem({
            id: randomUUID(),
            projectId: source.projectId,
            kind: candidate.kind,
            normalizedKey,
            title,
            summary: candidate.summary,
            data: { ...candidate.data, _generationSources: [source.id] },
            eventAt: candidate.eventAt,
            asOf:
              candidate.asOf ?? (candidate.kind === "status_claim" ? source.sourceCreatedAt : null),
            verification: "inferred",
            confidence,
          });
          itemId = row.id;
          stats.created += 1;
        }

        repo.insertEvidence({
          id: randomUUID(),
          contextItemId: itemId,
          sourceObjectId: source.id,
          chunkId: chunk?.id ?? null,
          extractionRunId: runId,
          quote: candidate.quote,
          quoteVerified,
        });
      }
      return stats;
    },
  };
}

export type ContextService = ReturnType<typeof createContextService>;

/**
 * Status claims about the same subject with different states are conflicting
 * sources: flag them rather than silently picking the newest.
 */
export function detectConflicts(rows: ContextItemRow[]): Map<string, string[]> {
  const conflicts = new Map<string, string[]>();
  const groups = new Map<string, ContextItemRow[]>();
  for (const row of rows) {
    // Superseded claims are history (PRD §8.1.1) and no longer participate in conflicts.
    if (row.kind !== "status_claim" || row.verification === "superseded") continue;
    const list = groups.get(row.normalizedKey) ?? [];
    list.push(row);
    groups.set(row.normalizedKey, list);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const states = new Set(group.map((r) => String(r.data.state)));
    if (states.size < 2) continue;
    for (const row of group) {
      conflicts.set(
        row.id,
        group.filter((o) => o.id !== row.id && o.data.state !== row.data.state).map((o) => o.id),
      );
    }
  }
  return conflicts;
}
