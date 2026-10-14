import type { DriveImportInput } from "@contextos/shared";
import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { projectKeys } from "@/features/projects/api/keys";
import { workspaceKeys } from "@/features/workspace/api/workspace.queries";
import {
  authorizeGoogleDrive,
  importConnectorFile,
  listConnectorFiles,
  listConnectorScopes,
  listConnectors,
  requestConnectorSync,
  setConnectorScopes,
  type ScopeSelectionInput,
} from "./connectors.api";

export const connectorKeys = {
  all: () => [...workspaceKeys.all, "connectors"] as const,
  files: (connectionId: string, folderId: string | undefined) =>
    [...connectorKeys.all(), connectionId, "files", folderId ?? "root"] as const,
  scopes: (connectionId: string) => [...connectorKeys.all(), connectionId, "scopes"] as const,
};

/** Selectable Drive scopes with their selections; polls while a scope is still backfilling. */
export function connectorScopesQuery(connectionId: string) {
  return queryOptions({
    queryKey: connectorKeys.scopes(connectionId),
    queryFn: ({ signal }) => listConnectorScopes(connectionId, signal),
    refetchInterval: (query) =>
      query.state.data?.items.some((option) =>
        option.selections.some((scope) => scope.status === "backfilling"),
      )
        ? 5_000
        : false,
  });
}

/** Replace the scopes feeding a project; the connection's health and the project refresh. */
export function useSetConnectorScopes(connectionId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scopes: ScopeSelectionInput[]) =>
      setConnectorScopes(connectionId, projectId, scopes),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: connectorKeys.all() }),
        queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
      ]),
  });
}

/** Queue a sync; new sources show up in the project as the worker imports them. */
export function useRequestConnectorSync(connectionId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scopeId?: string) => requestConnectorSync(connectionId, scopeId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: connectorKeys.all() }),
        queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
      ]),
  });
}

/** One Drive folder (or the root), paged by Google's page tokens. */
export function connectorFilesQuery(connectionId: string, folderId: string | undefined) {
  return infiniteQueryOptions({
    queryKey: connectorKeys.files(connectionId, folderId),
    queryFn: ({ pageParam, signal }) =>
      listConnectorFiles(connectionId, { folderId, pageToken: pageParam ?? undefined }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextPageToken,
    staleTime: 60_000,
  });
}

/** Import a selected file into a project; the project's queries refresh so the new source shows up. */
export function useImportDriveFile(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      fileId,
      visibility,
    }: {
      connectionId: string;
      fileId: string;
      visibility: DriveImportInput["visibility"];
    }) => importConnectorFile(connectionId, { projectId, fileId, visibility }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
  });
}

export function connectorsQuery() {
  return queryOptions({
    queryKey: connectorKeys.all(),
    queryFn: ({ signal }) => listConnectors(signal),
  });
}

export function useAuthorizeGoogleDrive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authorizeGoogleDrive(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectorKeys.all() }),
  });
}
