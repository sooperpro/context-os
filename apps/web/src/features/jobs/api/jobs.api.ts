import {
  JobListSchema,
  JobSchema,
  type Job,
  type JobList,
  type JobStatus,
} from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

export const listJobs = (
  projectId: string,
  status?: JobStatus,
  signal?: AbortSignal,
): Promise<JobList> =>
  apiRequest(`/v1/projects/${projectId}/jobs`, {
    query: { status, limit: 50 },
    schema: JobListSchema,
    signal,
  });

export const retryJob = (projectId: string, jobId: string): Promise<Job> =>
  apiRequest(`/v1/projects/${projectId}/jobs/${jobId}/retry`, {
    method: "POST",
    schema: JobSchema,
  });
