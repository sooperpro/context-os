import {
  DirectMessageResultSchema,
  WorkspaceMemberListSchema,
  type DirectMessageInput,
  type DirectMessageResult,
} from "@contextos/shared";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";

/** Message a colleague: in the app, with an email copy (ALL-3). */
export function sendMessage(
  personId: string,
  input: DirectMessageInput,
): Promise<DirectMessageResult> {
  return apiRequest(`/v1/people/${encodeURIComponent(personId)}/messages`, {
    method: "POST",
    body: input,
    schema: DirectMessageResultSchema,
  });
}

/**
 * A member by their exact name, for people the Hub only knows by name (who wrote a decision,
 * say). Null when nobody in the workspace has that name.
 */
export async function findMemberByName(name: string, signal?: AbortSignal) {
  const result = await apiRequest("/v1/users", {
    query: { q: name, limit: 20, offset: 0 },
    schema: WorkspaceMemberListSchema,
    signal,
  });
  const wanted = name.trim().toLocaleLowerCase();
  return (
    result.items.find(
      (member) => member.status === "active" && member.name.trim().toLocaleLowerCase() === wanted,
    ) ?? null
  );
}

export const useSendMessage = () =>
  useMutation({
    mutationFn: ({ personId, ...input }: DirectMessageInput & { personId: string }) =>
      sendMessage(personId, input),
  });
