import type { ContextItemKind, JobStatus } from "@contextos/shared";

/** Every project-scoped key lives under `detail(id)` so one invalidation refreshes the whole project. */
export const projectKeys = {
  all: ["projects"] as const,
  lists: () => [...projectKeys.all, "list"] as const,
  detail: (projectId: string) => [...projectKeys.all, "detail", projectId] as const,
  hub: (projectId: string) => [...projectKeys.detail(projectId), "hub"] as const,
  contextItemsAll: (projectId: string) =>
    [...projectKeys.detail(projectId), "context-items"] as const,
  contextItems: (projectId: string, kind?: ContextItemKind) =>
    [...projectKeys.contextItemsAll(projectId), kind ?? "all"] as const,
  sources: (projectId: string) => [...projectKeys.detail(projectId), "sources"] as const,
  source: (projectId: string, sourceId: string) =>
    [...projectKeys.sources(projectId), sourceId] as const,
  questions: (projectId: string) => [...projectKeys.detail(projectId), "questions"] as const,
  jobs: (projectId: string, status?: JobStatus) =>
    [...projectKeys.detail(projectId), "jobs", status ?? "all"] as const,
};
