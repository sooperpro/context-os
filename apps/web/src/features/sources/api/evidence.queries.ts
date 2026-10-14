import { queryOptions } from "@tanstack/react-query";
import { getEvidence } from "./evidence.api";

export const evidenceQuery = (evidenceId: string) =>
  queryOptions({
    queryKey: ["evidence", evidenceId] as const,
    queryFn: ({ signal }) => getEvidence(evidenceId, signal),
    enabled: Boolean(evidenceId),
  });
