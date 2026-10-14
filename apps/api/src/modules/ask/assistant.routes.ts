import { randomUUID } from "node:crypto";
import {
  AssistantAskInputSchema,
  AssistantFeedbackInputSchema,
  IdSchema,
  KnowledgeGapInputSchema,
  type Answer,
  type AnswerFeedback,
  type AssistantAnswer,
  type AssistantFeedbackInput,
  type ProjectWithStats,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { assignments, memberships, questions, sourceObjects, users } from "../../db/schema.js";
import { NotFoundError } from "../../lib/errors.js";
import { buildFtsQuery } from "../../lib/retrieval.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { createNotifier } from "../platform/notify.js";
import { createPlatformStore } from "../platform/store.js";

const IdParam = z.object({ id: IdSchema });

/** Ratings share the Ask message reasons, so the AI settings page counts them together. */
const REASON: Record<
  NonNullable<AssistantFeedbackInput["reason"]>,
  NonNullable<AnswerFeedback["reason"]>
> = {
  incorrect: "wrong",
  out_of_date: "outdated",
  missing_source: "missing_source",
  not_relevant: "not_helpful",
};

/** Topics Context Bot never answers from: pay, performance and disciplinary records (PRD §6). */
const RESTRICTED =
  /\b(salar(?:y|ies)|compensation|payroll|pay (?:rise|raise|band|grade)|bonus(?:es)?|performance (?:review|rating)|disciplinary|termination)\b/i;

const paragraph = (text: string): AssistantAnswer["blocks"][number] => ({
  type: "paragraph",
  text,
});

/**
 * Context Bot outside a project (`POST /assistant/ask`). The question is answered from the readable
 * project most likely to hold the evidence, through the same cited Ask pipeline a project uses, and
 * presented in the panel's shape: `[n]` in the text cites `sources[n - 1]`.
 */
export function createAssistantRoutes(container: Container) {
  const { db, identity, services, repos, audit } = container;
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);

  /** Readable projects, best lexical match first, then the ones with the most readable sources. */
  const candidates = (actor: Actor, projects: ProjectWithStats[], question: string) => {
    const match = buildFtsQuery(question);
    return projects
      .map((project) => {
        const allowed = identity.visibleSourceIds(actor, project.id);
        const hits =
          match && allowed.length > 0
            ? repos.sources.searchChunks(project.id, match, 5, allowed).length
            : 0;
        return { project, hits, sources: allowed.length };
      })
      .filter((entry) => entry.sources > 0)
      .sort((a, b) => b.hits - a.hits || b.sources - a.sources);
  };

  /** Domain owners of the project or the workspace, other than the asker: someone to talk to. */
  const owners = (actor: Actor, project: ProjectWithStats): AssistantAnswer["people"] => {
    const seen = new Set<string>([actor.id]);
    return db
      .select({ id: users.id, name: users.name, organization: memberships.organization })
      .from(assignments)
      .innerJoin(users, eq(users.id, assignments.userId))
      .innerJoin(
        memberships,
        and(eq(memberships.userId, users.id), eq(memberships.workspaceId, assignments.workspaceId)),
      )
      .where(
        and(
          eq(assignments.workspaceId, actor.workspaceId),
          eq(assignments.type, "domain_owner"),
          inArray(assignments.scopeId, [project.id, actor.workspaceId]),
          or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
        ),
      )
      .all()
      .filter((row) => !seen.has(row.id) && seen.add(row.id))
      .slice(0, 2)
      .map((row) => ({
        person: {
          id: row.id,
          name: row.name,
          title: typeof row.organization.jobTitle === "string" ? row.organization.jobTitle : null,
        },
        why: `Owns ${project.name}`,
      }));
  };

  const empty = (question: string) => ({
    id: randomUUID(),
    question,
    createdAt: new Date().toISOString(),
    confidence: null,
    note: null,
    people: [],
    sources: [],
    searched: [],
    followups: [],
    related: [],
  });

  const toAssistantAnswer = (
    actor: Actor,
    project: ProjectWithStats,
    answer: Answer,
    searched: string[],
  ): AssistantAnswer => {
    const ref = project.slug ?? project.id;
    const sourceIds = [...new Set(answer.citations.map((citation) => citation.sourceObjectId))];
    const connectorById = new Map(
      sourceIds.length > 0
        ? db
            .select({ id: sourceObjects.id, connector: sourceObjects.connector })
            .from(sourceObjects)
            .where(inArray(sourceObjects.id, sourceIds))
            .all()
            .map((row) => [row.id, row.connector] as const)
        : [],
    );
    // One entry per source, in citation order; several citations of a source share a number.
    const sources: AssistantAnswer["sources"] = [];
    const positionBySource = new Map<string, number>();
    const positionByRef = new Map<number, number>();
    for (const citation of [...answer.citations].sort((a, b) => a.ref - b.ref)) {
      let position = positionBySource.get(citation.sourceObjectId);
      if (position === undefined) {
        const drive = connectorById.get(citation.sourceObjectId) === "google_drive";
        sources.push({
          title: citation.sourceTitle,
          system: drive ? "Google Drive" : "ContextOS",
          provider: drive ? "google-drive" : null,
          detail: [
            project.name,
            citation.sourceCreatedAt ? `created ${citation.sourceCreatedAt.slice(0, 10)}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          url: citation.sourceUrl,
          to: `/projects/${ref}/sources`,
          stale: null,
        });
        position = sources.length;
        positionBySource.set(citation.sourceObjectId, position);
      }
      positionByRef.set(citation.ref, position);
    }
    const text = answer.answer
      .replace(/\[(\d+)\]/g, (_marker, n: string) => {
        const position = positionByRef.get(Number(n));
        return position ? `[${position}]` : "";
      })
      .replace(/ +([.,;:])/g, "$1")
      .trim();
    const blocks: AssistantAnswer["blocks"] = [paragraph(text)];
    if (answer.currentState)
      blocks.push(
        paragraph(
          `**Current state:** ${answer.currentState.statement}${
            answer.currentState.asOf ? ` (as of ${answer.currentState.asOf})` : ""
          }`,
        ),
      );
    if (answer.uncertainties.length > 0)
      blocks.push({ type: "list", ordered: false, items: answer.uncertainties });
    const insufficient = answer.confidence === "insufficient";
    const count = sources.length === 1 ? "1 source" : `${sources.length} sources`;
    return {
      ...empty(answer.question),
      id: answer.id,
      createdAt: answer.createdAt,
      outcome: insufficient ? "no_answer" : "answered",
      confidence: insufficient
        ? null
        : answer.confidence === "high"
          ? {
              level: "verified",
              label: `Verified · ${sources.length > 1 ? `${sources.length} sources agree` : count}`,
            }
          : {
              level: "partial",
              label: `${answer.confidence === "medium" ? "Partly supported" : "Low confidence"} · ${count}`,
            },
      blocks,
      note: answer.rationale,
      people: owners(actor, project),
      sources,
      searched: insufficient ? searched : [],
      related: answer.relatedItems.map((item) => ({
        kind: item.kind,
        title: item.title,
        to: `/projects/${ref}/items/${item.id}`,
      })),
    };
  };

  return new Hono<AppEnv>()
    .post(
      "/assistant/ask",
      zValidator("json", AssistantAskInputSchema, validationHook),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        if (RESTRICTED.test(input.question))
          return c.json({
            ...empty(input.question),
            outcome: "restricted",
            blocks: [
              paragraph(
                "Pay, performance and disciplinary records are not available in ContextOS, so I can't answer from them.",
              ),
              paragraph(
                "For questions about your own pay or benefits, contact your People partner.",
              ),
            ],
          } satisfies AssistantAnswer);
        const projects = services.projects.list(actor);
        const ranked = candidates(actor, projects, input.question);
        if (ranked.length === 0)
          return c.json({
            ...empty(input.question),
            outcome: "no_answer",
            blocks: [
              paragraph(
                projects.length > 0
                  ? "None of your projects has readable sources yet, so there is nothing to answer from. Sync a Drive folder or add a source to a project, then ask again."
                  : "There are no projects yet, so there is nothing to answer from. Create a project and connect its sources first.",
              ),
            ],
            searched: projects.map((project) => project.name),
          } satisfies AssistantAnswer);
        const best = ranked[0]!;
        const project = identity.requireProject(actor, best.project.id);
        const answer = await services.ask.ask(actor, project, { question: input.question });
        return c.json(
          toAssistantAnswer(
            actor,
            best.project,
            answer,
            ranked.map((entry) => entry.project.name),
          ),
        );
      },
    )
    .post(
      "/assistant/answers/:id/feedback",
      zValidator("param", IdParam, validationHook),
      zValidator("json", AssistantFeedbackInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        // Only the asker can rate an answer (decision D1: Ask history is private).
        const row = db
          .select()
          .from(questions)
          .where(and(eq(questions.id, c.req.valid("param").id), eq(questions.actorId, actor.id)))
          .get();
        if (!row) throw new NotFoundError("Answer");
        const feedback: AnswerFeedback = {
          rating: input.helpful ? "up" : "down",
          ...(input.reason ? { reason: REASON[input.reason] } : {}),
          at: new Date().toISOString(),
        };
        db.update(questions).set({ feedback }).where(eq(questions.id, row.id)).run();
        audit.record({
          actor,
          projectId: row.projectId,
          action: "answer.feedback",
          targetType: "question",
          targetId: row.id,
          metadata: { rating: feedback.rating, reason: feedback.reason ?? null },
        });
        return c.json({ ok: true as const });
      },
    )
    .post("/assistant/gaps", zValidator("json", KnowledgeGapInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      const gap = store.create(
        actor,
        "knowledge_gap",
        { question: input.question, page: null },
        { status: "open" },
      );
      notifier.notifyAdmins(actor.workspaceId, {
        type: "knowledge.gap_reported",
        category: "maintenance",
        title: `Context Bot could not answer: ${input.question.slice(0, 120)}`,
        body: `${actor.name} asked this and got no answer.`,
        link: "/knowledge",
        data: { gapId: gap.id },
      });
      audit.record({
        actor,
        action: "assistant.gap",
        targetType: "knowledge_gap",
        targetId: gap.id,
      });
      return c.json({ id: gap.id, notified: "Workspace admins" }, 201);
    });
}
