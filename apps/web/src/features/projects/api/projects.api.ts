import {
  ProjectListSchema,
  ProjectWithStatsSchema,
  type CreateProjectInput,
  type ProjectList,
  type ProjectWithStats,
  type UpdateProjectInput,
} from "@contextos/shared";
import { z } from "zod";
import { apiRequest } from "@/lib/api-client";

export const listProjects = (signal?: AbortSignal): Promise<ProjectList> =>
  apiRequest("/v1/projects", { schema: ProjectListSchema, signal });

export const getProject = (projectId: string, signal?: AbortSignal): Promise<ProjectWithStats> =>
  apiRequest(`/v1/projects/${projectId}`, { schema: ProjectWithStatsSchema, signal });

export const createProject = (input: CreateProjectInput): Promise<ProjectWithStats> =>
  apiRequest("/v1/projects", { method: "POST", body: input, schema: ProjectWithStatsSchema });

export const updateProject = (
  projectId: string,
  input: UpdateProjectInput,
): Promise<ProjectWithStats> =>
  apiRequest(`/v1/projects/${projectId}`, {
    method: "PATCH",
    body: input,
    schema: ProjectWithStatsSchema,
  });

export const deleteProject = (projectId: string): Promise<void> =>
  apiRequest(`/v1/projects/${projectId}`, { method: "DELETE", schema: z.void() });
