import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authKeys } from "@/features/auth/api/auth.queries";
import { ApiClientError } from "@/lib/api-client";

/**
 * The session ended (expired, signed out on another device) or no longer reaches the workspace
 * (removed, suspended, the workspace now requires company SSO). The sign-in gate decides what to show
 * from the session, so any of these makes it check the session again.
 */
const lostAccess = (error: unknown) =>
  error instanceof ApiClientError &&
  (error.status === 401 ||
    (error.status === 403 &&
      (error.code === "WORKSPACE_REQUIRED" || error.code === "SSO_REQUIRED")));

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Don't retry client errors (4xx); they won't succeed on retry.
          if (error instanceof ApiClientError && error.isClientError) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        retry: 0,
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        // The session query's own 401 is what the gate shows; anything else re-checks it.
        if (lostAccess(error) && query.queryKey[0] !== authKeys.all[0])
          void client.invalidateQueries({ queryKey: authKeys.session() });
      },
    }),
    mutationCache: new MutationCache({
      // Centralized feedback for failed mutations; components can still override per-call.
      onError: (error) => {
        if (lostAccess(error)) {
          toast.error("Your session changed. Sign in again to continue.");
          void client.invalidateQueries({ queryKey: authKeys.session() });
          return;
        }
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      },
    }),
  });
  return client;
}
