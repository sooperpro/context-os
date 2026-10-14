import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceKeys } from "@/features/workspace/api/workspace.queries";
import { authorizeGoogleDrive, listConnectors } from "./connectors.api";

export const connectorKeys = {
  all: () => [...workspaceKeys.all, "connectors"] as const,
};

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
