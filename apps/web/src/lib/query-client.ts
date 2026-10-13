import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api-client";

export function createQueryClient(): QueryClient {
  return new QueryClient({
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
    mutationCache: new MutationCache({
      // Centralized feedback for failed mutations; components can still override per-call.
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      },
    }),
  });
}
