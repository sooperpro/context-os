import { queryOptions } from "@tanstack/react-query";
import { fetchCurrentWorkspace } from "@/features/workspace/api/workspace.api";

export const workspaceKeys = {
  all: ["workspace"] as const,
  current: () => [...workspaceKeys.all, "current"] as const,
};

/** The active workspace and the caller's role. Changes only when the organization changes. */
export function currentWorkspaceQuery() {
  return queryOptions({
    queryKey: workspaceKeys.current(),
    queryFn: ({ signal }) => fetchCurrentWorkspace(signal),
    staleTime: 5 * 60_000,
  });
}
