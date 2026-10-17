import type { CompanyProfileInput } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCompanyProfile,
  fetchCurrentWorkspace,
  saveCompanyProfile,
} from "@/features/workspace/api/workspace.api";

export const workspaceKeys = {
  all: ["workspace"] as const,
  current: () => [...workspaceKeys.all, "current"] as const,
  company: () => [...workspaceKeys.all, "company"] as const,
};

export const companyProfileQuery = () =>
  queryOptions({
    queryKey: workspaceKeys.company(),
    queryFn: ({ signal }) => fetchCompanyProfile(signal),
    staleTime: 5 * 60_000,
  });

/** Saving the profile also refreshes setup, whose first step it completes. */
export function useSaveCompanyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CompanyProfileInput) => saveCompanyProfile(input),
    onSuccess: (saved) => {
      queryClient.setQueryData(workspaceKeys.company(), saved);
      void queryClient.invalidateQueries({ queryKey: [...workspaceKeys.all, "setup"] });
    },
  });
}

/** The active workspace and the caller's role. Changes only when the organization changes. */
export function currentWorkspaceQuery() {
  return queryOptions({
    queryKey: workspaceKeys.current(),
    queryFn: ({ signal }) => fetchCurrentWorkspace(signal),
    staleTime: 5 * 60_000,
  });
}
