import type { InviteInput } from "@contextos/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceKeys } from "@/features/workspace/api/workspace.queries";
import { inviteMember } from "./members.api";

export const membersKeys = {
  all: () => [...workspaceKeys.all, "members"] as const,
};

/** Sends a Clerk organization invitation. The API returns 503 until Clerk is configured. */
export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteInput) => inviteMember(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.all }),
  });
}
