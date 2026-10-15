import {
  DepartmentListSchema,
  DepartmentSchema,
  InviteResultSchema,
  MembershipUpdateResultSchema,
  TeamListSchema,
  TeamSchema,
  WorkspaceMemberListSchema,
  type Department,
  type InviteForm,
  type InviteResult,
  type OrgNameInput,
  type Team,
  type TeamInput,
  type TeamUpdateInput,
  type UserUpdate,
  type WorkspaceMember,
} from "@contextos/shared";
import { z } from "zod";
import { apiRequest } from "@/lib/api-client";

export function inviteMember(input: InviteForm): Promise<InviteResult> {
  return apiRequest("/v1/users/invite", {
    method: "POST",
    body: input,
    schema: InviteResultSchema,
  });
}

export async function listMembers(signal?: AbortSignal): Promise<WorkspaceMember[]> {
  const result = await apiRequest("/v1/users", {
    query: { limit: 100, offset: 0 },
    schema: WorkspaceMemberListSchema,
    signal,
  });
  return result.items;
}

export function updateMember(userId: string, input: UserUpdate) {
  return apiRequest(`/v1/users/${userId}`, {
    method: "PATCH",
    body: input,
    schema: MembershipUpdateResultSchema,
  });
}

export async function listDepartments(signal?: AbortSignal): Promise<Department[]> {
  const result = await apiRequest("/v1/org/departments", {
    query: { limit: 100, offset: 0 },
    schema: DepartmentListSchema,
    signal,
  });
  return result.items;
}

export function createDepartment(input: OrgNameInput): Promise<Department> {
  return apiRequest("/v1/org/departments", {
    method: "POST",
    body: input,
    schema: DepartmentSchema,
  });
}

export function renameDepartment(id: string, input: OrgNameInput): Promise<Department> {
  return apiRequest(`/v1/org/departments/${id}`, {
    method: "PATCH",
    body: input,
    schema: DepartmentSchema,
  });
}

export function deleteDepartment(id: string): Promise<void> {
  return apiRequest(`/v1/org/departments/${id}`, { method: "DELETE", schema: z.undefined() });
}

export async function listTeams(signal?: AbortSignal): Promise<Team[]> {
  const result = await apiRequest("/v1/org/teams", {
    query: { limit: 100, offset: 0 },
    schema: TeamListSchema,
    signal,
  });
  return result.items;
}

export function createTeam(input: TeamInput): Promise<Team> {
  return apiRequest("/v1/org/teams", { method: "POST", body: input, schema: TeamSchema });
}

export function updateTeam(id: string, input: TeamUpdateInput): Promise<Team> {
  return apiRequest(`/v1/org/teams/${id}`, { method: "PATCH", body: input, schema: TeamSchema });
}

export function deleteTeam(id: string): Promise<void> {
  return apiRequest(`/v1/org/teams/${id}`, { method: "DELETE", schema: z.undefined() });
}
