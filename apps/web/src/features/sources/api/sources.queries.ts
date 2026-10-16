import type { CreateSourceInput } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectKeys } from "@/features/projects/api/keys";
import {
  createSource,
  deleteSource,
  getSource,
  grantSourceAccess,
  listSourceAccess,
  listSources,
  reprocessSource,
  revokeSourceAccess,
} from "./sources.api";

export const sourcesQuery = (projectId: string) =>
  queryOptions({
    queryKey: projectKeys.sources(projectId),
    queryFn: ({ signal }) => listSources(projectId, signal),
    // Keep polling while anything is still being processed.
    refetchInterval: (query) =>
      query.state.data?.items.some((s) => s.status === "pending" || s.status === "processing")
        ? 2500
        : false,
  });

export const sourceQuery = (projectId: string, sourceId: string) =>
  queryOptions({
    queryKey: projectKeys.source(projectId, sourceId),
    queryFn: ({ signal }) => getSource(projectId, sourceId, signal),
  });

export function useCreateSource(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSourceInput) => createSource(projectId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
  });
}

export function useReprocessSource(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => reprocessSource(projectId, sourceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
  });
}

export function useDeleteSource(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => deleteSource(projectId, sourceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
  });
}

export const sourceAccessQuery = (projectId: string, sourceId: string) =>
  queryOptions({
    queryKey: [...projectKeys.detail(projectId), "sources", sourceId, "access"] as const,
    queryFn: ({ signal }) => listSourceAccess(projectId, sourceId, signal),
  });

/** Shares a source with one person, or stops sharing it; the list refreshes either way. */
export function useSourceAccess(projectId: string, sourceId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: sourceAccessQuery(projectId, sourceId).queryKey });
  return {
    grant: useMutation({
      mutationFn: (input: { userId: string; expiresAt?: string }) =>
        grantSourceAccess(projectId, sourceId, input),
      onSettled: refresh,
    }),
    revoke: useMutation({
      mutationFn: (userId: string) => revokeSourceAccess(projectId, sourceId, userId),
      onSettled: refresh,
    }),
  };
}
