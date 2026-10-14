import type { InviteInput, OrgNameInput, TeamInput, TeamUpdateInput, UserUpdate } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceKeys } from "@/features/workspace/api/workspace.queries";
import {
  createDepartment,
  createTeam,
  deleteDepartment,
  deleteTeam,
  inviteMember,
  listDepartments,
  listMembers,
  listTeams,
  renameDepartment,
  updateMember,
  updateTeam,
} from "./members.api";

export const membersKeys = {
  all: () => [...workspaceKeys.all, "members"] as const,
  list: () => [...membersKeys.all(), "list"] as const,
  departments: () => [...workspaceKeys.all, "departments"] as const,
  teams: () => [...workspaceKeys.all, "teams"] as const,
};

export const membersQuery = () =>
  queryOptions({ queryKey: membersKeys.list(), queryFn: ({ signal }) => listMembers(signal) });
export const departmentsQuery = () =>
  queryOptions({ queryKey: membersKeys.departments(), queryFn: ({ signal }) => listDepartments(signal) });
export const teamsQuery = () =>
  queryOptions({ queryKey: membersKeys.teams(), queryFn: ({ signal }) => listTeams(signal) });

function useInvalidating<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  keys: () => readonly unknown[],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys() }),
  });
}

/** Sends a Clerk organization invitation. The API returns 503 until Clerk is configured. */
export const useInviteMember = () => useInvalidating((input: InviteInput) => inviteMember(input), membersKeys.all);
/** Role, status, manager or guest expiry. The API protects the last owner and ownership changes. */
export const useUpdateMember = () =>
  useInvalidating(({ userId, ...input }: UserUpdate & { userId: string }) => updateMember(userId, input), membersKeys.all);

export const useCreateDepartment = () => useInvalidating((input: OrgNameInput) => createDepartment(input), membersKeys.departments);
export const useRenameDepartment = () =>
  useInvalidating(({ id, ...input }: OrgNameInput & { id: string }) => renameDepartment(id, input), membersKeys.departments);
export const useDeleteDepartment = () => useInvalidating((id: string) => deleteDepartment(id), membersKeys.departments);
export const useCreateTeam = () => useInvalidating((input: TeamInput) => createTeam(input), membersKeys.teams);
export const useUpdateTeam = () =>
  useInvalidating(({ id, ...input }: TeamUpdateInput & { id: string }) => updateTeam(id, input), membersKeys.teams);
export const useDeleteTeam = () => useInvalidating((id: string) => deleteTeam(id), membersKeys.teams);
