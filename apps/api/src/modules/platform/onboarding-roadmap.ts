import { randomUUID } from "node:crypto";
import type { TemplateModule } from "@contextos/shared";
import type { PlatformRecord } from "./store.js";

/*
 * A person's onboarding roadmap (handoff §7.1 and §7.6): the modules of their template, laid out by
 * stage with due dates, plus anything their manager assigned. One `roadmap` record per person
 * (ownerId = the person) that the learner, their manager and People Ops all read. It is materialized
 * from the template when one is assigned and keeps the template version it was built from, so a
 * newly published template version never changes an existing roadmap.
 */

export const ROADMAP = "roadmap";
const DAY = 86_400_000;

export type RoadmapModuleStatus = "todo" | "active" | "done";
export type RoadmapModuleKind = TemplateModule["kind"] | "task";

export interface RoadmapModule {
  id: string;
  /** The catalog module it came from (`mod-…` or `path-<pathId>`); null for a custom task. */
  catalogId: string | null;
  title: string;
  kind: RoadmapModuleKind;
  stageId: string;
  dueOn: string;
  status: RoadmapModuleStatus;
  completedOn: string | null;
  /** Moved by the manager. */
  postponed: boolean;
  /** Set when a manager assigned it, with their note. */
  assignedBy: string | null;
  note: string | null;
  /** Knowledge checks: whether the last attempt passed, and the result to show ("Passed 4 of 5"). */
  passed: boolean | null;
  result: string | null;
  attempts: number;
}

export interface RoadmapStage {
  id: string;
  name: string;
  weekStart: number;
  weekEnd: number;
}

export interface RoadmapData {
  templateId: string | null;
  templateVersion: number | null;
  startDate: string;
  stages: RoadmapStage[];
  modules: RoadmapModule[];
  addOnIds: string[];
  history: Array<{ on: string; text: string; by: string | null }>;
}

export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const today = () => new Date().toISOString().slice(0, 10);

/** The stage a day of the plan falls in (week 1 = days 0–6); the last stage once the plan runs out. */
export function stageAt(stages: RoadmapStage[], elapsedDays: number): RoadmapStage | null {
  if (!stages.length) return null;
  if (elapsedDays < 0) return stages[0]!;
  const week = Math.floor(elapsedDays / 7) + 1;
  return stages.find((stage) => week >= stage.weekStart && week <= stage.weekEnd) ?? stages.at(-1)!;
}

const newModule = (
  entry: TemplateModule,
  stageId: string,
  dueOn: string,
  extra: Partial<RoadmapModule> = {},
): RoadmapModule => ({
  id: randomUUID(),
  catalogId: entry.id,
  title: entry.title,
  kind: entry.kind,
  stageId,
  dueOn,
  status: "todo",
  completedOn: null,
  postponed: false,
  assignedBy: null,
  note: null,
  passed: null,
  result: null,
  attempts: 0,
  ...extra,
});

/**
 * Lay a template's stages out from the start date: each stage's modules are spread evenly over its
 * weeks. Add-ons join the last stage. Unknown module ids are skipped. Nothing is due before
 * `notBefore`: a plan made after someone started gives them time to catch up instead of arriving
 * overdue.
 */
export function buildRoadmap(input: {
  templateId: string | null;
  templateVersion: number | null;
  startDate: string;
  stages: Array<RoadmapStage & { moduleIds: string[] }>;
  catalog: Map<string, TemplateModule>;
  addOnIds?: string[];
  notBefore?: string;
}): RoadmapData {
  const modules: RoadmapModule[] = [];
  const due = (date: string) =>
    input.notBefore && date < input.notBefore ? input.notBefore : date;
  const stages = input.stages.map(({ moduleIds: _ids, ...stage }) => stage);
  const lastStage = input.stages.at(-1);
  input.stages.forEach((stage) => {
    const entries = stage.moduleIds.flatMap((id) => input.catalog.get(id) ?? []);
    const firstDay = (stage.weekStart - 1) * 7;
    const days = (stage.weekEnd - stage.weekStart + 1) * 7;
    entries.forEach((entry, index) =>
      modules.push(
        newModule(
          entry,
          stage.id,
          due(
            addDays(
              input.startDate,
              firstDay + Math.ceil(((index + 1) * days) / entries.length) - 1,
            ),
          ),
        ),
      ),
    );
  });
  const addOns = (input.addOnIds ?? []).flatMap((id) => input.catalog.get(id) ?? []);
  if (lastStage)
    addOns.forEach((entry) => {
      if (!modules.some((existing) => existing.catalogId === entry.id))
        modules.push(
          newModule(entry, lastStage.id, due(addDays(input.startDate, lastStage.weekEnd * 7 - 1))),
        );
    });
  return {
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    startDate: input.startDate,
    stages,
    modules,
    addOnIds: input.addOnIds ?? [],
    history: [],
  };
}

/**
 * Switch an existing roadmap to another template without losing completed work: with nothing done
 * (or before the start date) it is rebuilt; otherwise done modules and manager-assigned tasks stay,
 * the old template's unfinished modules go, and the new template's modules not already done join.
 */
export function switchTemplate(current: RoadmapData, next: RoadmapData): RoadmapData {
  const started = Date.parse(`${current.startDate}T00:00:00Z`) <= Date.now();
  const kept = current.modules.filter(
    (entry) => entry.status === "done" || entry.assignedBy !== null,
  );
  if (!started || !current.modules.some((entry) => entry.status === "done"))
    return {
      ...next,
      modules: [...next.modules, ...kept.filter((entry) => entry.assignedBy !== null)],
      history: current.history,
    };
  const done = new Set(
    kept.filter((entry) => entry.status === "done").map((entry) => entry.catalogId),
  );
  return {
    ...next,
    modules: [...kept, ...next.modules.filter((entry) => !done.has(entry.catalogId))],
    history: current.history,
  };
}

export interface PathStatus {
  status: RoadmapModuleStatus;
  completedOn: string | null;
}

/**
 * The modules as they stand today. Modules backed by a learning path (`path-<id>`) take their state
 * from the person's path assignment; the rest from what the roadmap recorded.
 */
export function currentModules(
  data: RoadmapData,
  pathStatus: (pathId: string) => PathStatus | null,
): RoadmapModule[] {
  return data.modules.map((entry) => {
    if (!entry.catalogId?.startsWith("path-") || entry.status === "done") return entry;
    const path = pathStatus(entry.catalogId.slice("path-".length));
    return path && path.status !== "todo"
      ? { ...entry, status: path.status, completedOn: path.completedOn }
      : entry;
  });
}

/** Done modules over all modules on the roadmap (manager tasks included). */
export function roadmapProgress(modules: RoadmapModule[]): number {
  return modules.length
    ? modules.filter((entry) => entry.status === "done").length / modules.length
    : 0;
}

export const roadmapData = (row: PlatformRecord) => row.data as unknown as RoadmapData;
