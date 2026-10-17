import type { SetupRole, SetupUpdate } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceKeys } from "@/features/workspace/api/workspace.queries";
import {
  fetchSetup,
  fetchSetupRoles,
  generateSetupTemplates,
  saveSetupRoles,
  updateSetupStep,
} from "./setup.api";

export const setupKeys = {
  all: () => [...workspaceKeys.all, "setup"] as const,
  roles: () => [...workspaceKeys.all, "setup", "roles"] as const,
};

export function setupQuery() {
  return queryOptions({
    queryKey: setupKeys.all(),
    queryFn: ({ signal }) => fetchSetup(signal),
  });
}

/** Mark a step completed (only with evidence), skipped, or pending again to resume it. */
export function useUpdateSetupStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetupUpdate) => updateSetupStep(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: setupKeys.all() }),
  });
}

/** The company's roles and their templates; checks back while drafts are being written. */
export function setupRolesQuery() {
  return queryOptions({
    queryKey: setupKeys.roles(),
    queryFn: ({ signal }) => fetchSetupRoles(signal),
    refetchInterval: (query) =>
      query.state.data?.roles.some((role) => role.template?.generating) ? 4000 : false,
  });
}

export function useSaveSetupRoles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roles: SetupRole[]) => saveSetupRoles(roles),
    onSuccess: (data) => queryClient.setQueryData(setupKeys.roles(), data),
  });
}

export function useGenerateSetupTemplates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roles: SetupRole[]) => generateSetupTemplates(roles),
    onSuccess: async (data) => {
      queryClient.setQueryData(setupKeys.roles(), data);
      await queryClient.invalidateQueries({ queryKey: setupKeys.all() });
    },
  });
}
