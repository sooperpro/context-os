import type { ContextItem } from "@contextos/shared";

/** Where a project and one of its knowledge items live. */
export const projectPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;

export const itemPath = (item: Pick<ContextItem, "id" | "projectId">) =>
  `${projectPath(item.projectId)}/items/${encodeURIComponent(item.id)}`;
