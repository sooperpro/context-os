import { queryOptions } from "@tanstack/react-query";
import { fetchHome, type HomeEndpoint } from "./home.api";

export const homeKeys = {
  all: ["home"] as const,
  endpoint: (endpoint: HomeEndpoint, query?: Record<string, unknown>) =>
    [...homeKeys.all, endpoint, query ?? {}] as const,
};

/** One Home card's data. Cards load and fail independently, so one slow endpoint never blanks the page. */
export function homeQuery<K extends HomeEndpoint>(
  endpoint: K,
  query?: Record<string, string | number | boolean | undefined>,
) {
  return queryOptions({
    queryKey: homeKeys.endpoint(endpoint, query),
    queryFn: ({ signal }) => fetchHome(endpoint, query, signal),
    staleTime: 60_000,
  });
}
