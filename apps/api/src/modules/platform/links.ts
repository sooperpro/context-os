/**
 * Web links for notifications about a knowledge flag (N-12). There is no flag queue page: a flag
 * on a knowledge item opens that item, anything else opens the project.
 */
export function flagLink(projectId: string | null | undefined, data: Record<string, unknown>) {
  if (!projectId) return "/";
  return data.targetType === "context_item" && typeof data.targetId === "string"
    ? `/projects/${projectId}/items/${data.targetId}`
    : `/projects/${projectId}`;
}
