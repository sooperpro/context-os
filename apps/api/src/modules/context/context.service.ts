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

export interface ContextServiceDeps {
  repo: ContextRepository;
  audit: AuditService;
  logger: Logger;
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

export function createContextService({ repo, audit, logger }: ContextServiceDeps) {
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

  const toItems = (rows: ContextItemRow[]): ContextItem[] => {
    const evidenceByItem = repo.listEvidenceForItems(rows.map((r) => r.id));
    const conflicts = detectConflicts(rows);
    const items: ContextItem[] = [];
    for (const row of rows) {
      const parsed = ContextItemSchema.safeParse({
        id: row.id,
        projectId: row.projectId,
        kind: row.kind,
        title: row.title,
        summary: row.summary,
        data: row.data,
        eventAt: row.eventAt ? row.eventAt.toISOString() : null,
        asOf: row.asOf ? row.asOf.toISOString() : null,
        verification: row.verification,
        confidence: row.confidence,
        conflictsWith: conflicts.get(row.id) ?? [],
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
    listItems(project: ProjectRow, kind?: ContextItemKind): ContextItem[] {
      return toItems(repo.listItems(project.id, kind));
    },

    listItemsLinkedToSources(projectId: string, sourceIds: string[], limit: number): ContextItem[] {
      return toItems(repo.listItemsLinkedToSources(projectId, sourceIds, limit));
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
    removeDerivedFromSource(projectId: string, sourceObjectId: string): void {
      repo.deleteEvidenceForSource(sourceObjectId);
      repo.deleteOrphanedItems(projectId);
    },

    removeOrphanedItems(projectId: string): number {
      return repo.deleteOrphanedItems(projectId);
    },

    /**
     * Store extraction output as context items + evidence. Quotes are verified
     * against the source text; unverifiable quotes are kept but flagged and
     * the item's confidence is capped at "low".
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
        const quoteVerified = containsQuote(source.content, candidate.quote);
        const chunk = quoteVerified
          ? chunks.find((c) => containsQuote(c.content, candidate.quote))
          : undefined;
        const confidence: Confidence = quoteVerified ? candidate.confidence : "low";
        if (!quoteVerified) stats.unverifiedQuotes += 1;

        const normalizedKey = `${candidate.kind}:${normalizeKey(title)}`;
        const existing = repo
          .findByKey(source.projectId, normalizedKey)
          .find((row) => isCompatible(candidate.kind, row.data, candidate.data));

        let itemId: string;
        if (existing) {
          itemId = existing.id;
          stats.merged += 1;
          // Keep the stronger confidence and the longer summary.
          const patch: Partial<Pick<ContextItemRow, "summary" | "confidence">> = {};
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
            data: candidate.data,
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
    if (row.kind !== "status_claim") continue;
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
