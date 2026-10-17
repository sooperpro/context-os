import {
  GapStatusInputSchema,
  KnowledgeGapQuerySchema,
  type GapStatus,
  type KnowledgeGapEntry,
  type KnowledgeGapEntryList,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gt, gte, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import type { Container } from "../../container.js";
import { assignments, memberships, projects, questions, users } from "../../db/schema.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { SYSTEM_USER_ID } from "../platform/bounties.js";
import { createNotifier } from "../platform/notify.js";
import { workspaceSettings } from "../platform/settings.js";
import { createPlatformStore, type PlatformRecord } from "../platform/store.js";

/*
 * Knowledge gaps (N-13): questions Context Bot couldn't answer, grouped when they mean the same
 * thing. Signals are unanswered questions (private until enough different people asked), gaps
 * reported from the workspace bot (`knowledge_gap` records) and from inside a project (a
 * "missing context" flag on an answer). Admins, owners and domain owners work through the list;
 * a status record per group says it was answered or dismissed.
 */

/** Words that don't change what a question is about. Question words stay: "who" isn't "when". */
const FILLER = new Set(
  (
    "a an the is are was were be been am do does did doing i we you our my your me us to of for " +
    "in on at by with about and or can could would should will shall may might please tell " +
    "explain it its this that these those there any some get got know need want find give " +
    "show let s im ive dont"
  ).split(" "),
);
const QUESTION_WORDS = new Set(["what", "how", "why", "when", "where", "who", "which", "whom"]);

/** Light singular form, so "policies" and "policy", "prices" and "price" meet. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export interface GapWords {
  /** What the question is about, sorted. */
  content: string[];
  /** Its question words ("who", "when"), sorted. */
  asks: string[];
}

/** The meaningful words of a question, ignoring case, punctuation, filler and plurals. */
export function gapWords(question: string): GapWords {
  const words = question
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const content = new Set<string>();
  const asks = new Set<string>();
  for (const word of words) {
    if (QUESTION_WORDS.has(word)) asks.add(word);
    else if (!FILLER.has(word)) content.add(stem(word));
  }
  return { content: [...content].sort(), asks: [...asks].sort() };
}

/** A stable key for a wording: its meaningful words, or the trimmed text when it has none. */
export function gapKey(question: string): string {
  const { content, asks } = gapWords(question);
  return content.length
    ? `${content.join(" ")}${asks.length ? ` ?${asks.join(" ")}` : ""}`
    : question.trim().toLocaleLowerCase();
}

/**
 * Two wordings are the same gap when at least three quarters of the longer one's meaningful words
 * appear in the other, and their question words don't clash ("who owns billing" is not "when is
 * billing due"). "What is our refund policy?" and "refund policy" are the same gap.
 */
export function sameGap(a: GapWords, b: GapWords): boolean {
  if (!a.content.length || !b.content.length) return false;
  const shared = a.content.filter((word) => b.content.includes(word)).length;
  if (shared / Math.max(a.content.length, b.content.length) < 0.75) return false;
  return !a.asks.length || !b.asks.length || a.asks.join() === b.asks.join();
}

/**
 * Groups wordings into gaps. `add` returns the group's value (made by `init` for a new group), so
 * callers accumulate their own counts on it. Wordings join the first group they match.
 */
export function createGapGroups<T>(init: (question: string) => T) {
  const groups: Array<{ key: string; words: GapWords; value: T }> = [];
  return {
    add(question: string): T {
      const key = gapKey(question);
      const words = gapWords(question);
      const found = groups.find((group) => group.key === key || sameGap(group.words, words));
      if (found) return found.value;
      const value = init(question);
      groups.push({ key, words, value });
      return value;
    },
    entries(): Array<[string, T]> {
      return groups.map((group) => [group.key, group.value]);
    },
  };
}

/** How far back unanswered questions and reports count. */
const WINDOW_DAYS = 90;
const DAY = 86_400_000;
const STATUS_KIND = "knowledge_gap_status";

const gapId = (key: string) => Buffer.from(key).toString("base64url");

interface Group {
  key: string;
  words: GapWords;
  wordings: Map<string, { text: string; count: number }>;
  askers: Set<string>;
  /** People who reported it; shared on purpose, so they can hear when it's answered. */
  reporters: Set<string>;
  asks: number;
  reports: number;
  projects: Map<string, number>;
  firstAt: Date;
  lastAt: Date;
  /** The last time someone asked it and got no answer (reports don't reopen an answered gap). */
  lastUnansweredAt: Date | null;
}

export function createKnowledgeGapRoutes(container: Container) {
  const { db, audit } = container;
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);

  /** Who may see which gaps: every gap, the gaps of some projects, or none (null). */
  const scopeOf = (actor: Actor): { all: true } | { all: false; projects: Set<string> } | null => {
    if (actor.role === "owner" || actor.role === "admin") return { all: true };
    if (actor.role === "guest") return null;
    const owned = db
      .select({ scopeType: assignments.scopeType, scopeId: assignments.scopeId })
      .from(assignments)
      .where(
        and(
          eq(assignments.workspaceId, actor.workspaceId),
          eq(assignments.userId, actor.id),
          eq(assignments.type, "domain_owner"),
          or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
        ),
      )
      .all();
    if (owned.some((row) => row.scopeType === "workspace")) return { all: true };
    const ids = new Set(
      owned.flatMap((row) =>
        row.scopeType === "project"
          ? [row.scopeId]
          : row.scopeType === "section"
            ? [row.scopeId.split(":")[0] ?? ""]
            : [],
      ),
    );
    ids.delete("");
    return ids.size ? { all: false, projects: ids } : null;
  };

  /** Every gap group in the workspace from the last 90 days, before privacy and scope. */
  const collect = (workspaceId: string): Group[] => {
    const since = new Date(Date.now() - WINDOW_DAYS * DAY);
    const groups = createGapGroups<Group>((question) => ({
      key: gapKey(question),
      words: gapWords(question),
      wordings: new Map(),
      askers: new Set(),
      reporters: new Set(),
      asks: 0,
      reports: 0,
      projects: new Map(),
      firstAt: new Date(8.64e15),
      lastAt: new Date(0),
      lastUnansweredAt: null,
    }));
    const signal = (
      question: string,
      at: Date,
      person: string,
      projectId: string | null,
      reported: boolean,
    ) => {
      const text = question.trim();
      if (text.length < 3) return;
      const group = groups.add(text);
      const wording = group.wordings.get(text.toLocaleLowerCase()) ?? { text, count: 0 };
      wording.count += 1;
      group.wordings.set(text.toLocaleLowerCase(), wording);
      group.askers.add(person);
      if (reported) {
        group.reports += 1;
        group.reporters.add(person);
      } else {
        group.asks += 1;
        if (!group.lastUnansweredAt || at > group.lastUnansweredAt) group.lastUnansweredAt = at;
      }
      if (projectId) group.projects.set(projectId, (group.projects.get(projectId) ?? 0) + 1);
      if (at < group.firstAt) group.firstAt = at;
      if (at > group.lastAt) group.lastAt = at;
    };
    // Oldest first, so a group keeps the wording it started with.
    const asked = db
      .select({
        question: questions.question,
        answer: questions.answer,
        actorId: questions.actorId,
        projectId: questions.projectId,
        createdAt: questions.createdAt,
      })
      .from(questions)
      .innerJoin(projects, eq(projects.id, questions.projectId))
      .where(and(eq(projects.workspaceId, workspaceId), gte(questions.createdAt, since)))
      .all()
      .filter((row) => row.answer.confidence === "insufficient");
    const reported = store
      .listWhere(workspaceId, "knowledge_gap", {}, 1000)
      .filter(
        (row) =>
          row.ownerId !== SYSTEM_USER_ID &&
          row.createdAt >= since &&
          typeof row.data.question === "string",
      );
    const flagged = store
      .listWhere(workspaceId, "flag", {}, 1000)
      .filter(
        (row) =>
          row.createdAt >= since &&
          row.data.kind === "missing_context" &&
          row.data.targetType === "answer" &&
          typeof row.data.comment === "string",
      );
    const events = [
      ...asked.map((row) => ({
        at: row.createdAt,
        add: () => signal(row.question, row.createdAt, row.actorId, row.projectId, false),
      })),
      ...reported.map((row) => ({
        at: row.createdAt,
        add: () =>
          signal(String(row.data.question), row.createdAt, row.ownerId, row.projectId, true),
      })),
      ...flagged.map((row) => ({
        at: row.createdAt,
        add: () =>
          signal(String(row.data.comment), row.createdAt, row.ownerId, row.projectId, true),
      })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    for (const event of events) event.add();
    return groups.entries().map(([, group]) => group);
  };

  /** The group's project: the one it was asked or reported in most. */
  const projectOf = (group: Group) =>
    [...group.projects.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const statusRows = (workspaceId: string) => store.listWhere(workspaceId, STATUS_KIND, {}, 1000);

  const resolve = (group: Group, rows: PlatformRecord[]) => {
    const row = rows.find((candidate) => {
      const words = candidate.data.words as GapWords | undefined;
      return candidate.data.key === group.key || (words ? sameGap(words, group.words) : false);
    });
    if (!row || row.status === "open") return { status: "open" as GapStatus, row: undefined };
    // An answered gap that someone asks again without an answer is open again; a dismissed one
    // stays dismissed.
    if (
      row.status === "answered" &&
      group.lastUnansweredAt &&
      group.lastUnansweredAt > row.updatedAt
    )
      return { status: "open" as GapStatus, row: undefined };
    return { status: row.status as GapStatus, row };
  };

  /** The gaps this person may see, with their status. */
  const visible = (actor: Actor) => {
    const scope = scopeOf(actor);
    if (!scope)
      throw new AppError(403, "FORBIDDEN", "Knowledge gaps are for domain owners and admins");
    const floor = workspaceSettings(db, actor.workspaceId).policies.askKAnonymityThreshold;
    const rows = statusRows(actor.workspaceId);
    const names = new Map(
      db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.workspaceId, actor.workspaceId))
        .all()
        .map((row) => [row.id, row.name]),
    );
    const gaps = collect(actor.workspaceId)
      // Asking is private: an unreported question shows only once enough different people asked.
      .filter((group) => group.reports > 0 || group.askers.size >= floor)
      .map((group) => ({ group, projectId: projectOf(group), ...resolve(group, rows) }))
      .filter(
        ({ projectId }) => scope.all || (projectId !== null && scope.projects.has(projectId)),
      );
    return { scope, floor, gaps, names };
  };

  const personRef = (workspaceId: string, userId: string) => {
    const user = db
      .select({ name: users.name, title: memberships.organization })
      .from(users)
      .leftJoin(
        memberships,
        and(eq(memberships.userId, users.id), eq(memberships.workspaceId, workspaceId)),
      )
      .where(eq(users.id, userId))
      .get();
    const jobTitle = (user?.title as { jobTitle?: unknown } | null | undefined)?.jobTitle;
    return {
      id: userId,
      name: user?.name ?? "Someone",
      title: typeof jobTitle === "string" ? jobTitle : null,
    };
  };

  const toEntry = (
    workspaceId: string,
    { group, projectId, status, row }: ReturnType<typeof visible>["gaps"][number],
    names: Map<string, string>,
  ): KnowledgeGapEntry => {
    const top = [...group.wordings.values()].sort((a, b) => b.count - a.count)[0];
    return {
      id: gapId(group.key),
      question: top?.text ?? group.key,
      wordings: group.wordings.size,
      asks: group.asks,
      askers: group.askers.size,
      reports: group.reports,
      project: projectId ? { id: projectId, name: names.get(projectId) ?? "Project" } : null,
      status,
      firstAskedAt: group.firstAt.toISOString(),
      lastAskedAt: group.lastAt.toISOString(),
      resolution: row
        ? {
            by: personRef(workspaceId, typeof row.data.by === "string" ? row.data.by : row.ownerId),
            at: row.updatedAt.toISOString(),
            note: typeof row.data.note === "string" ? row.data.note : null,
          }
        : null,
    };
  };

  return new Hono<AppEnv>()
    .get("/knowledge-gaps", zValidator("query", KnowledgeGapQuerySchema, validationHook), (c) => {
      const actor = c.get("actor");
      const { status, projectId } = c.req.valid("query");
      const { scope, floor, gaps, names } = visible(actor);
      const inProject = gaps.filter((gap) => !projectId || gap.projectId === projectId);
      const counts = { open: 0, answered: 0, dismissed: 0 };
      for (const gap of inProject) counts[gap.status] += 1;
      return c.json({
        items: inProject
          .filter((gap) => gap.status === status)
          .sort(
            (a, b) =>
              b.group.reports + b.group.askers.size - (a.group.reports + a.group.askers.size) ||
              b.group.lastAt.getTime() - a.group.lastAt.getTime(),
          )
          .map((gap) => toEntry(actor.workspaceId, gap, names)),
        counts,
        privacyFloor: floor,
        scope: scope.all ? "workspace" : "projects",
      } satisfies KnowledgeGapEntryList);
    })
    .post(
      "/knowledge-gaps/:id/status",
      zValidator("json", GapStatusInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        const { gaps, names } = visible(actor);
        const gap = gaps.find((entry) => gapId(entry.group.key) === c.req.param("id"));
        if (!gap) throw new NotFoundError("Knowledge gap");
        const { group, projectId } = gap;
        const data = {
          key: group.key,
          words: group.words,
          question: [...group.wordings.values()][0]?.text ?? group.key,
          by: actor.id,
          note: input.note?.length ? input.note : null,
        };
        const existing = statusRows(actor.workspaceId).find(
          (row) =>
            row.data.key === group.key ||
            (row.data.words ? sameGap(row.data.words as GapWords, group.words) : false),
        );
        if (existing) store.patch(existing, { data, status: input.status });
        else
          store.insert({
            workspaceId: actor.workspaceId,
            ownerId: actor.id,
            kind: STATUS_KIND,
            projectId,
            status: input.status,
            data,
          });
        audit.record({
          actor,
          projectId: projectId ?? undefined,
          action: `knowledge_gap.${input.status}`,
          targetType: "knowledge_gap",
          targetId: gapId(group.key),
          metadata: { question: data.question },
        });
        // People who reported it asked to hear back; unreported askers stay private.
        if (input.status === "answered")
          for (const userId of group.reporters)
            if (userId !== actor.id)
              notifier.notify(actor.workspaceId, userId, {
                type: "knowledge.gap_answered",
                category: "maintenance",
                title: `Your question now has an answer: ${data.question.slice(0, 120)}`,
                body: data.note ?? "Ask Context Bot again to see it.",
                link: projectId ? `/projects/${projectId}` : "/knowledge",
                ...(projectId ? { projectId } : {}),
              });
        const updated = visible(actor).gaps.find(
          (entry) => gapId(entry.group.key) === gapId(group.key),
        );
        return c.json(toEntry(actor.workspaceId, updated ?? gap, names));
      },
    );
}
