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
  listConnectors,
} from "./connectors.api";

export const connectorKeys = {
  all: () => [...workspaceKeys.all, "connectors"] as const,
  files: (connectionId: string, folderId: string | undefined) =>
    [...connectorKeys.all(), connectionId, "files", folderId ?? "root"] as const,
};

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
    mutationFn: ({ connectionId, fileId }: { connectionId: string; fileId: string }) =>
      importConnectorFile(connectionId, { projectId, fileId } satisfies DriveImportInput),
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
