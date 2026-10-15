import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/api-client";

/**
 * Search across what the person can open (apps/api/src/modules/search/search.routes.ts). Only the
 * types the app has pages for: knowledge items, sources, projects and people.
 */
export const SEARCH_TYPES = ["context_item", "source", "project", "person"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

const SearchResultsSchema = z.object({
  total: z.number(),
  facets: z.record(z.string(), z.number()),
  items: z.array(
    z.object({
      type: z.string(),
      id: z.string(),
      projectId: z.string().nullable(),
      title: z.string(),
      snippet: z.string(),
      kind: z.string().optional(),
      link: z.string(),
    }),
  ),
});
export type SearchResults = z.infer<typeof SearchResultsSchema>;

export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: ["search", q] as const,
    queryFn: ({ signal }) =>
      apiRequest("/v1/search", {
        query: { q, types: SEARCH_TYPES.join(","), limit: 100 },
        schema: SearchResultsSchema,
        signal,
      }),
    enabled: q.trim().length >= 2,
  });

/** Where a result opens in the app. Sources open on their project's Sources tab. */
export const resultPath = (result: SearchResults["items"][number]) =>
  result.type === "source" ? result.link.replace(/\/sources\/[^/]+$/, "/sources") : result.link;
