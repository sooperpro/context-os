import type {
  CheckinInput,
  CheckinType,
  LearningAssignmentInput,
  RoadmapAssignmentInput,
  RoadmapEditInput,
} from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { homeKeys } from "@/features/home/api/home.queries";
import {
  assignLearning,
  assignRoadmap,
  editMemberRoadmap,
  escalateMember,
  fetchAssignOptions,
  fetchCheckinPrep,
  fetchCheckMatrix,
  fetchTeamMember,
  saveCheckin,
} from "./team.api";

export const teamKeys = {
  all: ["team"] as const,
  matrix: () => [...teamKeys.all, "matrix"] as const,
  member: (id: string) => [...teamKeys.all, "member", id] as const,
  prep: (id: string, type: CheckinType) => [...teamKeys.all, "prep", id, type] as const,
  assignOptions: (id: string) => [...teamKeys.all, "assign-options", id] as const,
};

export const checkMatrixQuery = () =>
  queryOptions({ queryKey: teamKeys.matrix(), queryFn: ({ signal }) => fetchCheckMatrix(signal) });

export const teamMemberQuery = (id: string) =>
  queryOptions({ queryKey: teamKeys.member(id), queryFn: ({ signal }) => fetchTeamMember(id, signal) });

export const checkinPrepQuery = (id: string, type: CheckinType) =>
  queryOptions({
    queryKey: teamKeys.prep(id, type),
    queryFn: ({ signal }) => fetchCheckinPrep(id, type, signal),
    staleTime: 5 * 60_000,
  });

export const assignOptionsQuery = (id: string) =>
  queryOptions({ queryKey: teamKeys.assignOptions(id), queryFn: ({ signal }) => fetchAssignOptions(id, signal) });

/** Team changes show on the member page, the team page and the manager's Home. */
function useRefreshTeam() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: teamKeys.all }),
      queryClient.invalidateQueries({ queryKey: homeKeys.all }),
    ]);
}

export function useEditMemberRoadmap(id: string) {
  const refresh = useRefreshTeam();
  return useMutation({ mutationFn: (input: RoadmapEditInput) => editMemberRoadmap(id, input), onSuccess: () => refresh() });
}

export function useSaveCheckin(id: string) {
  const refresh = useRefreshTeam();
  return useMutation({ mutationFn: (input: CheckinInput) => saveCheckin(id, input), onSuccess: () => refresh() });
}

export function useAssignLearning(id: string) {
  const refresh = useRefreshTeam();
  return useMutation({ mutationFn: (input: LearningAssignmentInput) => assignLearning(id, input), onSuccess: () => refresh() });
}

/** Escalates a stuck new hire: to the admins when they wait on access, else to People Ops. */
export function useEscalateMember() {
  const refresh = useRefreshTeam();
  return useMutation({ mutationFn: (id: string) => escalateMember(id), onSuccess: () => refresh() });
}

/**
 * Takes an assigned task back (the toast's Undo): a roadmap edit that removes it. It doesn't depend
 * on the dialog that assigned it, which has closed by then.
 */
export function useUnassignLearning() {
  const refresh = useRefreshTeam();
  return (personId: string, moduleId: string) =>
    editMemberRoadmap(personId, { changes: [{ moduleId, action: "remove" }] }).then(refresh);
}

export function useAssignRoadmap(id: string) {
  const refresh = useRefreshTeam();
  return useMutation({ mutationFn: (input: RoadmapAssignmentInput) => assignRoadmap(id, input), onSuccess: () => refresh() });
}
