import type {
  InviteForm,
  OrgNameInput,
  TeamInput,
  TeamMembersInput,
  TeamUpdateInput,
  UserUpdate,
} from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { peopleKeys } from "@/features/people/api/people.queries";
import { workspaceKeys } from "@/features/workspace/api/workspace.queries";
import {
  addTeamMembers,
  createDepartment,
  createTeam,
  grantAssignment,
  listAssignments,
  listPendingInvitations,
  removeAssignment,
  removeTeamMember,
  revokeInvitation,
  deleteDepartment,
  deleteTeam,
  inviteMember,
  listDepartments,
  listMembers,
  listOrgPeople,
  listProjectAccess,
  listTeams,
  renameDepartment,
  setProjectAccess,
  updateMember,
  updateTeam,
} from "./members.api";

export const membersKeys = {
  all: () => [...workspaceKeys.all, "members"] as const,
  list: () => [...membersKeys.all(), "list"] as const,
  orgPeople: () => [...membersKeys.all(), "org-people"] as const,
  departments: () => [...workspaceKeys.all, "departments"] as const,
  teams: () => [...workspaceKeys.all, "teams"] as const,
  projectAccess: (userId: string) => [...membersKeys.all(), "projects", userId] as const,
  assignments: () => [...membersKeys.all(), "assignments"] as const,
  invitations: () => [...membersKeys.all(), "invitations"] as const,
};

export const membersQuery = () =>
  queryOptions({ queryKey: membersKeys.list(), queryFn: ({ signal }) => listMembers(signal) });
export const departmentsQuery = () =>
  queryOptions({
    queryKey: membersKeys.departments(),
    queryFn: ({ signal }) => listDepartments(signal),
  });
export const projectAccessQuery = (userId: string) =>
  queryOptions({
    queryKey: membersKeys.projectAccess(userId),
    queryFn: ({ signal }) => listProjectAccess(userId, signal),
  });
export const pendingInvitationsQuery = () =>
  queryOptions({
    queryKey: membersKeys.invitations(),
    queryFn: ({ signal }) => listPendingInvitations(signal),
  });
export const useRevokeInvitation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeInvitation,
    onSettled: () => queryClient.invalidateQueries({ queryKey: membersKeys.invitations() }),
  });
};
export const assignmentsQuery = () =>
  queryOptions({
    queryKey: membersKeys.assignments(),
    queryFn: ({ signal }) => listAssignments(signal),
  });
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

/** Emails an invitation; development mode records it without sending. */
export const useInviteMember = () =>
  useInvalidating((input: InviteForm) => inviteMember(input), membersKeys.all);
/** Role, status, manager or guest expiry. The API protects the last owner and ownership changes. */
export const useUpdateMember = () =>
  useInvalidating(
    ({ userId, ...input }: UserUpdate & { userId: string }) => updateMember(userId, input),
    membersKeys.all,
  );

export const useCreateDepartment = () =>
  useInvalidating((input: OrgNameInput) => createDepartment(input), membersKeys.departments);
export const useRenameDepartment = () =>
  useInvalidating(
    ({ id, ...input }: OrgNameInput & { id: string }) => renameDepartment(id, input),
    membersKeys.departments,
  );
export const useDeleteDepartment = () =>
  useInvalidating((id: string) => deleteDepartment(id), membersKeys.departments);
export const useCreateTeam = () =>
  useInvalidating((input: TeamInput) => createTeam(input), membersKeys.teams);
/** Renames, moves or sets the lead of a team; People › Teams shows the lead. */
export const useUpdateTeam = () =>
  useTeamChange(({ id, ...input }: TeamUpdateInput & { id: string }) => updateTeam(id, input));
export const useDeleteTeam = () =>
  useInvalidating((id: string) => deleteTeam(id), membersKeys.teams);

export const orgPeopleQuery = () =>
  queryOptions({
    queryKey: membersKeys.orgPeople(),
    queryFn: ({ signal }) => listOrgPeople(signal),
  });
/** A team or who is on it changed: refresh Members & roles, the teams and People › Teams. */
function useTeamChange<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: membersKeys.all() });
      await queryClient.invalidateQueries({ queryKey: membersKeys.teams() });
      await queryClient.invalidateQueries({ queryKey: peopleKeys.all });
    },
  });
}
export const useAddTeamMembers = () =>
  useTeamChange(({ teamId, ...input }: TeamMembersInput & { teamId: string }) =>
    addTeamMembers(teamId, input),
  );
export const useRemoveTeamMember = () =>
  useTeamChange(({ teamId, userId }: { teamId: string; userId: string }) =>
    removeTeamMember(teamId, userId),
  );

/** Matches a guest's project access to the chosen projects. */
export const useSetProjectAccess = (userId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ from, to }: { from: string[]; to: string[] }) =>
      setProjectAccess(userId, from, to),
    onSettled: () => queryClient.invalidateQueries({ queryKey: membersKeys.projectAccess(userId) }),
  });
};

/** Grants and removals change who owns what: the list, expertise on People, and who can verify. */
function useAssignmentMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: membersKeys.assignments() });
      await queryClient.invalidateQueries({ queryKey: peopleKeys.all });
    },
  });
}
export const useGrantAssignment = () => useAssignmentMutation(grantAssignment);
export const useRemoveAssignment = () => useAssignmentMutation(removeAssignment);
