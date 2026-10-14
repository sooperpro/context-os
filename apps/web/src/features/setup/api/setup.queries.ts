import type { SetupUpdate } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceKeys } from "@/features/workspace/api/workspace.queries";
import { fetchSetup, updateSetupStep } from "./setup.api";

export const setupKeys = {
  all: () => [...workspaceKeys.all, "setup"] as const,
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
