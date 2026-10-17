import {
  KnowledgeGapEntryListSchema,
  KnowledgeGapEntrySchema,
  type GapStatus,
  type GapStatusInput,
  type KnowledgeGapEntry,
  type KnowledgeGapEntryList,
} from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";

export const gapKeys = {
  all: ["knowledge-gaps"] as const,
  list: (status: GapStatus, projectId: string | undefined) =>
    [...gapKeys.all, status, projectId ?? "all"] as const,
};

/** Domain owners see their projects' gaps; admins and owners every gap (403 for anyone else). */
export const fetchGaps = (
  status: GapStatus,
  projectId: string | undefined,
  signal?: AbortSignal,
): Promise<KnowledgeGapEntryList> =>
  apiRequest("/v1/knowledge-gaps", {
    query: { status, ...(projectId ? { projectId } : {}) },
    schema: KnowledgeGapEntryListSchema,
    signal,
  });

export const gapsQuery = (status: GapStatus, projectId?: string) =>
  queryOptions({
    queryKey: gapKeys.list(status, projectId),
    queryFn: ({ signal }) => fetchGaps(status, projectId, signal),
  });

/** Mark a gap answered (its reporters are told), dismissed, or open again. */
export function useSetGapStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: GapStatusInput & { id: string }): Promise<KnowledgeGapEntry> =>
      apiRequest(`/v1/knowledge-gaps/${encodeURIComponent(id)}/status`, {
        method: "POST",
        body: input,
        schema: KnowledgeGapEntrySchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gapKeys.all }),
  });
}
