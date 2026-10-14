import type { WelcomeInput } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceKeys } from "@/features/workspace/api/workspace.queries";
import { completeWelcome, fetchWelcome } from "./welcome.api";

const welcomeKey = [...workspaceKeys.all, "welcome"] as const;

export const welcomeQuery = () =>
  queryOptions({ queryKey: welcomeKey, queryFn: ({ signal }) => fetchWelcome(signal) });

export function useCompleteWelcome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WelcomeInput) => completeWelcome(input),
    onSuccess: (welcome) => queryClient.setQueryData(welcomeKey, welcome),
  });
}
