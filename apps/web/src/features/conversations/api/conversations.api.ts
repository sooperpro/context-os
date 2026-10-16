import { PersonConversationsSchema, type PersonConversations } from "@contextos/shared";
import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";

/** Owners only: everything a member asked Context Bot. The API audits each read. */
export const fetchPersonConversations = (
  personId: string,
  signal?: AbortSignal,
): Promise<PersonConversations> =>
  apiRequest(`/v1/people/${encodeURIComponent(personId)}/conversations`, {
    schema: PersonConversationsSchema,
    signal,
  });

export const personConversationsQuery = (personId: string) =>
  queryOptions({
    queryKey: ["conversations", personId] as const,
    queryFn: ({ signal }) => fetchPersonConversations(personId, signal),
  });
