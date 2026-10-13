import type { JobStatus } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectKeys } from "@/features/projects/api/keys";
import { listJobs, retryJob } from "./jobs.api";

export const jobsQuery = (projectId: string, status?: JobStatus) =>
  queryOptions({
    queryKey: projectKeys.jobs(projectId, status),
    queryFn: ({ signal }) => listJobs(projectId, status, signal),
  });

export function useRetryJob(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => retryJob(projectId, jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
  });
}
