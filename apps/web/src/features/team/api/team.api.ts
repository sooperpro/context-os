import {
  AssignOptionsSchema,
  CheckinInputSchema,
  CheckinPrepSchema,
  CheckinRecordSchema,
  CheckMatrixSchema,
  CreatedSchema,
  LearningAssignmentInputSchema,
  RoadmapAssignmentInputSchema,
  RoadmapEditInputSchema,
  TeamMemberDetailSchema,
  type AssignOptions,
  type CheckinInput,
  type CheckinPrep,
  type CheckinRecord,
  type CheckinType,
  type CheckMatrix,
  type LearningAssignmentInput,
  type RoadmapAssignmentInput,
  type RoadmapEditInput,
  type TeamMemberDetail,
} from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

/**
 * The manager's team endpoints. None is served yet (the API's `/probation/*` routes return generic
 * records); in development the mock layer answers them (src/mocks/team.ts). Contracts:
 * packages/shared/src/schemas/manager.ts. The team roster is Home's `/v1/team/onboarding`.
 */
export const TEAM_ENDPOINTS = {
  matrix: { path: "/v1/team/check-matrix", schema: CheckMatrixSchema },
  member: { path: "/v1/team/members/:id", schema: TeamMemberDetailSchema },
  editRoadmap: { path: "/v1/team/members/:id/roadmap", schema: TeamMemberDetailSchema, input: RoadmapEditInputSchema },
  checkinPrep: { path: "/v1/team/members/:id/checkin-prep", schema: CheckinPrepSchema },
  saveCheckin: { path: "/v1/team/members/:id/checkins", schema: CheckinRecordSchema, input: CheckinInputSchema },
  assignOptions: { path: "/v1/team/members/:id/assign-options", schema: AssignOptionsSchema },
  assignLearning: { path: "/v1/team/members/:id/assignments", schema: CreatedSchema, input: LearningAssignmentInputSchema },
  assignRoadmap: { path: "/v1/team/members/:id/roadmap", schema: CreatedSchema, input: RoadmapAssignmentInputSchema },
} as const;

const E = TEAM_ENDPOINTS;
const withId = (path: string, id: string) => path.replace(":id", encodeURIComponent(id));

export const fetchCheckMatrix = (signal?: AbortSignal): Promise<CheckMatrix> =>
  apiRequest(E.matrix.path, { schema: E.matrix.schema, signal });

export const fetchTeamMember = (id: string, signal?: AbortSignal): Promise<TeamMemberDetail> =>
  apiRequest(withId(E.member.path, id), { schema: E.member.schema, signal });

export const editMemberRoadmap = (id: string, input: RoadmapEditInput): Promise<TeamMemberDetail> =>
  apiRequest(withId(E.editRoadmap.path, id), { method: "PATCH", body: input, schema: E.editRoadmap.schema });

export const fetchCheckinPrep = (id: string, type: CheckinType, signal?: AbortSignal): Promise<CheckinPrep> =>
  apiRequest(withId(E.checkinPrep.path, id), { query: { type }, schema: E.checkinPrep.schema, signal });

export const saveCheckin = (id: string, input: CheckinInput): Promise<CheckinRecord> =>
  apiRequest(withId(E.saveCheckin.path, id), { method: "POST", body: input, schema: E.saveCheckin.schema });

export const fetchAssignOptions = (id: string, signal?: AbortSignal): Promise<AssignOptions> =>
  apiRequest(withId(E.assignOptions.path, id), { schema: E.assignOptions.schema, signal });

export const assignLearning = (id: string, input: LearningAssignmentInput) =>
  apiRequest(withId(E.assignLearning.path, id), { method: "POST", body: input, schema: E.assignLearning.schema });

export const assignRoadmap = (id: string, input: RoadmapAssignmentInput) =>
  apiRequest(withId(E.assignRoadmap.path, id), { method: "POST", body: input, schema: E.assignRoadmap.schema });
