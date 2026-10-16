import type { ContinuityUpdateInput } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceKeys } from "@/features/workspace/api/workspace.queries";
import { fetchChecklist, updateChecklist } from "./continuity.api";

export const continuityKeys = {
  checklist: (id: string) => [...workspaceKeys.all, "continuity", id] as const,
};

export const checklistQuery = (id: string) =>
  queryOptions({
    queryKey: continuityKeys.checklist(id),
    queryFn: ({ signal }) => fetchChecklist(id, signal),
  });

/** Saves the picks; the response is the checklist as it now stands. */
export const useUpdateChecklist = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ContinuityUpdateInput) => updateChecklist(id, input),
    onSuccess: (checklist) => queryClient.setQueryData(continuityKeys.checklist(id), checklist),
  });
};
