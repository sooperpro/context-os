import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectKeys } from "./keys";
import type { UpdateProjectInput } from "@contextos/shared";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "./projects.api";

export const projectsQuery = () =>
  queryOptions({ queryKey: projectKeys.lists(), queryFn: ({ signal }) => listProjects(signal) });

export const projectQuery = (projectId: string) =>
  queryOptions({
    queryKey: projectKeys.detail(projectId),
    queryFn: ({ signal }) => getProject(projectId, signal),
  });

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProject,
    onSuccess: (_data, projectId) => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(projectId) });
      return queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

/** Renames a project or changes its description; everything under it refreshes. */
export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) => updateProject(projectId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      await queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}
