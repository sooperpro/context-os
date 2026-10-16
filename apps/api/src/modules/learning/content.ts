import type { ModuleKind, TutorialCheck, TutorialContent, TutorialLesson } from "@contextos/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { Container } from "../../container.js";
import { platformRecords, sourceObjects } from "../../db/schema.js";
import type { Actor } from "../../types.js";
import {
  roadmapData,
  type RoadmapData,
  type RoadmapModule,
} from "../platform/onboarding-roadmap.js";
import { createPlatformStore, type PlatformRecord } from "../platform/store.js";

/*
 * What a learner reads for one module, wherever the module came from:
 *  - a tutorial (`tutorial-<id>`): the published version, pinned per learner (FR-LRN-012);
 *  - a template module (`mod-…`): the published tutorial that teaches it, else a short placeholder;
 *  - a learning path (`path-<id>`): its items as lessons;
 *  - a manager's custom task: its title and note.
 * Progress is one `learning_progress` record per learner and module.
 */

export const TUTORIAL = "tutorial";
export const TUTORIAL_VERSION = "tutorial_version";
export const PROGRESS = "learning_progress";
/** Learner module ids for tutorials taken outside a roadmap (My learning). */
export const TUTORIAL_PREFIX = "tutorial-";

export interface ModuleContent {
  title: string;
  kind: ModuleKind;
  /** Markdown. */
  summary: string;
  objectives: string[];
  lessons: TutorialLesson[];
  check: TutorialCheck | null;
  tutorialId: string | null;
  versionId: string | null;
  version: number | null;
  publishedAt: string | null;
  publishedBy: string | null;
  /** Who wrote it (the curator who created the tutorial). */
  ownerId: string | null;
  projectId: string | null;
  /** Every source behind it; a learner who can't open all of them gets it locked. */
  sourceIds: string[];
}

export interface ProgressData {
  moduleKey: string;
  tutorialId: string | null;
  versionId: string | null;
  lessonsDone: string[];
  attempts: Array<{ at: string; score: number; total: number; passed: boolean }>;
  passed: boolean | null;
  ratings: Record<string, "up" | "down">;
  /** Lesson ids, and `module` for the module itself, the learner wants to come back to. */
  revisit?: string[];
  startedAt: string;
  completedAt: string | null;
  /** My learning entries: who assigned it and by when. */
  placement: "roadmap" | "my_learning";
  assignedBy: string | null;
  dueOn: string | null;
}

/** Template module kinds the learner contract doesn't have, mapped to the closest one. */
const LEARNER_KIND: Record<string, ModuleKind> = {
  check: "company",
  sales: "business",
  support: "process",
  design: "product",
  data: "systems",
  people: "process",
};
export const learnerKind = (kind: string): ModuleKind =>
  (
    [
      "company",
      "business",
      "product",
      "process",
      "systems",
      "project",
      "decisions",
      "practical",
      "contribution",
    ] as const
  ).includes(kind as ModuleKind)
    ? (kind as ModuleKind)
    : (LEARNER_KIND[kind] ?? "project");

/** Content for a module nobody has written a tutorial for yet: honest guidance, one lesson. */
function placeholder(
  title: string,
  kind: string,
  minutes: number | null,
  note: string | null,
): Pick<ModuleContent, "summary" | "objectives" | "lessons" | "check" | "kind"> {
  const practical = kind === "practical" || kind === "contribution";
  const body = practical
    ? [
        `## What to do`,
        ``,
        `**${title}.** ${note ? `${note}\n\n` : ""}Agree the details with your manager or buddy, do it, and mark this step done when it's finished.`,
        ``,
        `### Tips`,
        ``,
        `- Ask Context Bot about the systems and decisions involved before you start.`,
        `- If you get stuck, say so at your next check-in: it's what they're for.`,
      ].join("\n")
    : kind === "check"
      ? [
          `## How this check works`,
          ``,
          `Your team hasn't published questions for **${title}** yet. Go through the topics with your manager or buddy, and mark this done once you've talked them through.`,
        ].join("\n")
      : [
          `## About this module`,
          ``,
          `**${title}** is part of your onboarding. ${note ? `${note}\n\n` : ""}Your team hasn't published a tutorial for it yet, so:`,
          ``,
          `1. Ask your buddy or manager to walk you through it.`,
          `2. Use Context Bot to look up the decisions, systems and people involved.`,
          `3. Mark this done when you're comfortable with it.`,
        ].join("\n");
  return {
    kind: learnerKind(kind),
    summary: note ?? "",
    objectives: [],
    lessons: [
      {
        id: "l1",
        title: practical ? "What to do" : kind === "check" ? "Talk it through" : "Overview",
        type: practical ? "practical" : "article",
        minutes: Math.max(1, Math.min(600, minutes ?? 10)),
        body,
        basedOn: [],
        sourceIds: [],
      },
    ],
    check: null,
  };
}

export function createLearningContent(container: Container) {
  const { db } = container;
  const store = createPlatformStore(db);

  const byId = (workspaceId: string, kind: string, id: string) =>
    db
      .select()
      .from(platformRecords)
      .where(
        and(
          eq(platformRecords.id, id),
          eq(platformRecords.workspaceId, workspaceId),
          eq(platformRecords.kind, kind),
        ),
      )
      .get() ?? null;
  const tutorialRow = (workspaceId: string, id: string) => byId(workspaceId, TUTORIAL, id);
  const versionRow = (workspaceId: string, id: string | null | undefined) =>
    id ? byId(workspaceId, TUTORIAL_VERSION, id) : null;

  /** A published tutorial's content (a learner's pinned version when given). */
  const tutorialContent = (
    workspaceId: string,
    tutorialId: string,
    pinnedVersionId?: string | null,
  ): ModuleContent | null => {
    const tutorial = tutorialRow(workspaceId, tutorialId);
    if (!tutorial) return null;
    const version =
      versionRow(workspaceId, pinnedVersionId) ??
      versionRow(workspaceId, tutorial.data.publishedVersionId as string | undefined);
    if (!version) return null;
    const content = version.data.content as TutorialContent;
    const sources = (version.data.sources as Array<{ id: string }> | undefined) ?? [];
    return {
      ...content,
      sourceIds: [
        ...new Set([
          ...sources.map((source) => source.id),
          ...content.lessons.flatMap((lesson) => lesson.sourceIds),
        ]),
      ],
      tutorialId: tutorial.id,
      versionId: version.id,
      version: Number(version.data.version),
      publishedAt: String(version.data.publishedAt),
      publishedBy: (version.data.publishedBy as string | undefined) ?? null,
      ownerId: tutorial.ownerId,
      projectId: tutorial.projectId,
    };
  };

  /** The newest published tutorial a curator marked as teaching this template module. */
  const coveringTutorial = (workspaceId: string, catalogId: string) =>
    store
      .listWhere(workspaceId, TUTORIAL, { status: "published" }, 1000)
      .filter((row) => row.data.coversModule === catalogId)
      .sort((a, b) => String(b.data.publishedAt).localeCompare(String(a.data.publishedAt)))[0];

  /** Learning path items as lessons (older paths without written lessons). */
  const pathContent = (workspaceId: string, pathId: string): Partial<ModuleContent> | null => {
    const path = store
      .listWhere(workspaceId, "learning_path", { status: "published" }, 500)
      .find((row) => row.id === pathId);
    if (!path) return null;
    const items = (path.data.items as Array<Record<string, unknown>> | undefined) ?? [];
    return {
      summary: "",
      objectives: [],
      check: null,
      lessons: items.map((item, index) => ({
        id: `p${index + 1}`,
        title: String(item.title),
        type: item.type === "do" ? ("practical" as const) : ("article" as const),
        minutes: Math.max(1, Math.min(600, Number(item.estMinutes ?? 15))),
        body: `## ${String(item.title)}\n\n${typeof item.objective === "string" ? item.objective : ""}`,
        basedOn: [],
        sourceIds: typeof item.sourceId === "string" ? [item.sourceId] : [],
      })),
      ownerId: path.ownerId,
      projectId: path.projectId,
    };
  };

  /** What a roadmap module (or a My learning tutorial) teaches. */
  const forModule = (
    workspaceId: string,
    entry: { catalogId: string | null; title: string; kind: string; note?: string | null },
    minutes: number | null,
    pinnedVersionId?: string | null,
  ): ModuleContent => {
    const empty = {
      tutorialId: null,
      versionId: null,
      version: null,
      publishedAt: null,
      publishedBy: null,
      ownerId: null,
      projectId: null,
      sourceIds: [] as string[],
    };
    const id = entry.catalogId;
    if (id?.startsWith(TUTORIAL_PREFIX)) {
      const content = tutorialContent(
        workspaceId,
        id.slice(TUTORIAL_PREFIX.length),
        pinnedVersionId,
      );
      if (content) return content;
    }
    if (id?.startsWith("mod-")) {
      const covering = coveringTutorial(workspaceId, id);
      const content = covering && tutorialContent(workspaceId, covering.id, pinnedVersionId);
      if (content) return { ...content, title: entry.title };
    }
    if (id?.startsWith("path-")) {
      const content = pathContent(workspaceId, id.slice("path-".length));
      if (content?.lessons?.length)
        return {
          ...empty,
          ...placeholder(entry.title, entry.kind, minutes, entry.note ?? null),
          ...content,
          sourceIds: [...new Set((content.lessons ?? []).flatMap((lesson) => lesson.sourceIds))],
          title: entry.title,
          kind: "project",
        };
    }
    return {
      ...empty,
      title: entry.title,
      ...placeholder(entry.title, entry.kind, minutes, entry.note ?? null),
    };
  };

  /* ---- Progress ---------------------------------------------------------------------------- */

  const progressRows = (workspaceId: string, userId: string) =>
    store.listWhere(workspaceId, PROGRESS, { ownerId: userId }, 2000);
  const progressFor = (workspaceId: string, userId: string, moduleKey: string) =>
    progressRows(workspaceId, userId).find((row) => row.data.moduleKey === moduleKey) ?? null;
  const progressData = (row: PlatformRecord | null) => (row?.data ?? null) as ProgressData | null;

  const startProgress = (
    workspaceId: string,
    userId: string,
    moduleKey: string,
    content: ModuleContent,
    extra: Partial<ProgressData> = {},
  ) =>
    progressFor(workspaceId, userId, moduleKey) ??
    store.insert({
      workspaceId,
      ownerId: userId,
      kind: PROGRESS,
      status: "active",
      parentId: content.tutorialId ?? undefined,
      data: {
        moduleKey,
        tutorialId: content.tutorialId,
        versionId: content.versionId,
        lessonsDone: [],
        attempts: [],
        passed: null,
        ratings: {},
        startedAt: new Date().toISOString(),
        completedAt: null,
        placement: "roadmap",
        assignedBy: null,
        dueOn: null,
        ...extra,
      } satisfies ProgressData,
    });

  const patchProgress = (row: PlatformRecord, data: Partial<ProgressData>) =>
    store.patch(row, {
      status: data.completedAt ? "completed" : row.status,
      data: { ...row.data, ...data },
    });

  /** Projects the person can open. */
  const readableProjects = (actor: Actor) =>
    container.repos.projects.list(actor.workspaceId).filter((project) => {
      try {
        container.identity.requireProject(actor, project.id);
        return true;
      } catch {
        return false;
      }
    });

  /**
   * Of these sources, the ones the person can read. Each is checked in its own project, so a
   * company-wide tutorial (sources from several projects) follows every project's permissions.
   */
  const visibleOf = (actor: Actor, sourceIds: string[]) => {
    const visible = new Set<string>();
    if (!sourceIds.length) return visible;
    const rows = db
      .select({ id: sourceObjects.id, projectId: sourceObjects.projectId })
      .from(sourceObjects)
      .where(inArray(sourceObjects.id, [...new Set(sourceIds)]))
      .all();
    for (const projectId of new Set(rows.map((row) => row.projectId))) {
      let allowed: Set<string>;
      try {
        allowed = new Set(container.identity.visibleSourceIds(actor, projectId));
      } catch {
        continue;
      }
      for (const row of rows)
        if (row.projectId === projectId && allowed.has(row.id)) visible.add(row.id);
    }
    return visible;
  };

  /** Lessons a learner may open: ones whose sources they can read (restricted ones are locked). */
  const access = (actor: Actor, content: ModuleContent) => {
    const ids = [...content.sourceIds, ...content.lessons.flatMap((lesson) => lesson.sourceIds)];
    if (!ids.length)
      return { open: true, lessonOpen: () => true, questions: content.check?.questions ?? [] };
    const visible = visibleOf(actor, ids);
    // A tutorial is written from all of its sources at once (summary, objectives and questions
    // draw on every one), so it opens only for someone who can read every source behind it.
    const open = content.sourceIds.every((id) => visible.has(id));
    return {
      open,
      lessonOpen: (lesson: TutorialLesson) =>
        open && lesson.sourceIds.every((id) => visible.has(id)),
      questions: open
        ? (content.check?.questions ?? []).filter(
            (question) => !question.sourceId || visible.has(question.sourceId),
          )
        : [],
    };
  };

  /** Done when every lesson is done and the check (if any) is passed. */
  const isComplete = (
    content: ModuleContent,
    progress: ProgressData | null,
    questionCount: number,
  ) =>
    Boolean(
      progress &&
      content.lessons.every((lesson) => progress.lessonsDone.includes(lesson.id)) &&
      (!content.check || questionCount === 0 || progress.passed),
    );
  /** Lessons plus the check, done over total. */
  const fraction = (
    content: ModuleContent,
    progress: ProgressData | null,
    questionCount: number,
  ) => {
    const hasCheck = Boolean(content.check && questionCount);
    const total = content.lessons.length + (hasCheck ? 1 : 0);
    if (!total) return 0;
    const done =
      content.lessons.filter((lesson) => progress?.lessonsDone.includes(lesson.id)).length +
      (hasCheck && progress?.passed ? 1 : 0);
    return done / total;
  };

  /* ---- Roadmap ------------------------------------------------------------------------------ */

  const roadmapRow = (workspaceId: string, userId: string) =>
    store
      .listWhere(workspaceId, "roadmap", { ownerId: userId }, 5)
      .find((row) => row.status === "active") ?? null;

  /** Reflect a module's progress on the roadmap HR and the manager read. */
  const syncRoadmapModule = (
    workspaceId: string,
    userId: string,
    moduleId: string,
    change: Partial<RoadmapModule>,
    historyText?: string,
  ) => {
    const row = roadmapRow(workspaceId, userId);
    if (!row) return;
    const data = roadmapData(row);
    if (!data.modules.some((entry) => entry.id === moduleId)) return;
    const today = new Date().toISOString().slice(0, 10);
    store.patch(row, {
      data: {
        ...data,
        modules: data.modules.map((entry) =>
          entry.id === moduleId ? { ...entry, ...change } : entry,
        ),
        history: historyText
          ? [{ on: today, text: historyText, by: userId }, ...data.history]
          : data.history,
      } satisfies RoadmapData,
    });
  };

  return {
    store,
    byId,
    tutorialRow,
    versionRow,
    tutorialContent,
    coveringTutorial,
    forModule,
    progressRows,
    progressFor,
    progressData,
    startProgress,
    patchProgress,
    access,
    visibleOf,
    readableProjects,
    isComplete,
    fraction,
    roadmapRow,
    syncRoadmapModule,
  };
}

export type LearningContent = ReturnType<typeof createLearningContent>;
