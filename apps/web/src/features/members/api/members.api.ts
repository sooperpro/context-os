import {
  type AssignmentInputSchema,
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

const ProjectAccessSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
});

/** The projects someone was added to one by one: what a guest can see. Admins only. */
export function listProjectAccess(userId: string, signal?: AbortSignal) {
  return apiRequest(`/v1/users/${encodeURIComponent(userId)}/projects`, {
    schema: ProjectAccessSchema,
    signal,
  });
}

/** Adds and removes project access to match `projectIds`. */
export async function setProjectAccess(userId: string, from: string[], projectIds: string[]) {
  const path = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}/memberships`;
  for (const projectId of projectIds.filter((id) => !from.includes(id)))
    await apiRequest(path(projectId), { method: "POST", body: { userId }, schema: z.unknown() });
  for (const projectId of from.filter((id) => !projectIds.includes(id)))
    await apiRequest(`${path(projectId)}/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      schema: z.unknown(),
    });
}

const AssignmentRowSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.string(),
  scopeType: z.string(),
  scopeId: z.string(),
  expiresAt: z.union([z.string(), z.number()]).nullable().optional(),
});
export type AssignmentRow = z.infer<typeof AssignmentRowSchema>;
export type AssignmentInput = z.input<typeof AssignmentInputSchema>;

/** Every responsibility in the workspace: domain owners, mentors, curators. Admins only. */
export function listAssignments(signal?: AbortSignal) {
  return apiRequest("/v1/assignments", {
    schema: z.object({ items: z.array(AssignmentRowSchema) }),
    signal,
  });
}

export function grantAssignment(input: AssignmentInput) {
  return apiRequest("/v1/assignments", { method: "POST", body: input, schema: z.unknown() });
}

export function removeAssignment(id: string) {
  return apiRequest(`/v1/assignments/${encodeURIComponent(id)}`, {
    method: "DELETE",
    schema: z.unknown(),
  });
}

const InvitationRowSchema = z.object({
  id: z.string(),
  status: z.string(),
  createdAt: z.string(),
  data: z.object({
    email: z.string(),
    role: z.string().optional(),
    name: z.string().optional(),
    expiresAt: z.string().optional(),
  }),
});
export type InvitationRow = z.infer<typeof InvitationRowSchema>;

/** Invitations still waiting to be accepted (not expired). Admins only. */
export async function listPendingInvitations(signal?: AbortSignal): Promise<InvitationRow[]> {
  const result = await apiRequest("/v1/users/invitations", {
    query: { limit: 100, offset: 0 },
    schema: z.object({ items: z.array(InvitationRowSchema) }),
    signal,
  });
  return result.items.filter(
    (row) =>
      row.status === "pending" &&
      (!row.data.expiresAt || Date.parse(row.data.expiresAt) > Date.now()),
  );
}

export function revokeInvitation(id: string) {
  return apiRequest(`/v1/users/invitations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    schema: z.unknown(),
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
