import {
  SetupGenerateResultSchema,
  SetupRecordSchema,
  SetupRolesSchema,
  WorkspaceSetupSchema,
  type SetupRecord,
  type SetupRole,
  type SetupUpdate,
  type WorkspaceSetup,
} from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

export function fetchSetup(signal?: AbortSignal): Promise<WorkspaceSetup> {
  return apiRequest("/v1/workspaces/current/setup", { schema: WorkspaceSetupSchema, signal });
}

export function updateSetupStep(input: SetupUpdate): Promise<SetupRecord> {
  return apiRequest("/v1/workspaces/current/setup", {
    method: "PATCH",
    body: input,
    schema: SetupRecordSchema,
  });
}

/** Every role in the company with the template that covers it (the "Onboarding templates" step). */
export const SETUP_ROLES_PATH = "/v1/workspaces/current/setup/roles";

export function fetchSetupRoles(signal?: AbortSignal) {
  return apiRequest(SETUP_ROLES_PATH, { schema: SetupRolesSchema, signal });
}

/** Replace the roles added in setup (before anyone is hired into them). */
export function saveSetupRoles(roles: SetupRole[]) {
  return apiRequest(SETUP_ROLES_PATH, { method: "PUT", body: { roles }, schema: SetupRolesSchema });
}

/** Draft templates for these roles; roles that already have one keep it. */
export function generateSetupTemplates(roles: SetupRole[]) {
  return apiRequest(`${SETUP_ROLES_PATH}/generate`, {
    method: "POST",
    body: { roles },
    schema: SetupGenerateResultSchema,
  });
}
