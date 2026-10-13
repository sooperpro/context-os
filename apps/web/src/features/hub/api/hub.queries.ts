import type { ContextItemKind, Verification } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectKeys } from "@/features/projects/api/keys";
import { getHub, listContextItems, refreshHub, setVerification } from "./hub.api";

export const hubQuery = (projectId: string) =>
  queryOptions({
    queryKey: projectKeys.hub(projectId),
    queryFn: ({ signal }) => getHub(projectId, signal),
    // Poll while background jobs are running so sync state and counts stay live.
    refetchInterval: (query) => (query.state.data?.sync.state === "processing" ? 2500 : false),
  });

export const contextItemsQuery = (projectId: string, kind?: ContextItemKind) =>
  queryOptions({
    queryKey: projectKeys.contextItems(projectId, kind),
    queryFn: ({ signal }) => listContextItems(projectId, kind, signal),
  });

export function useRefreshHub(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => refreshHub(projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.hub(projectId) }),
  });
}

export function useSetVerification(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, verification }: { itemId: string; verification: Verification }) =>
      setVerification(projectId, itemId, verification),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.contextItemsAll(projectId) }),
  });
}
