import type { SaveInput } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceKeys } from "@/features/workspace/api/workspace.queries";
import { fetchSaved, setSaved } from "./saved.api";

export const savedKeys = { all: [...workspaceKeys.all, "saved"] as const };

export const savedQuery = () =>
  queryOptions({ queryKey: savedKeys.all, queryFn: ({ signal }) => fetchSaved(signal) });

export function useSetSaved() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetId, ...input }: SaveInput & { targetId: string }) =>
      setSaved(targetId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: savedKeys.all }),
  });
}
