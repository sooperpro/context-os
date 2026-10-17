import {
  CompanyProfileSchema,
  CurrentWorkspaceSchema,
  type CompanyProfile,
  type CompanyProfileInput,
  type CurrentWorkspace,
  type WorkspaceCreateInput,
} from "@contextos/shared";
import { z } from "zod";
import { apiRequest } from "@/lib/api-client";

export function fetchCurrentWorkspace(signal?: AbortSignal): Promise<CurrentWorkspace> {
  return apiRequest("/v1/workspaces/current", { schema: CurrentWorkspaceSchema, signal });
}

/** Create a workspace; the caller becomes its owner and the session switches to it. */
export function createWorkspace(input: WorkspaceCreateInput): Promise<{ id: string }> {
  return apiRequest("/v1/workspaces", {
    method: "POST",
    body: input,
    schema: z.object({ id: z.string() }).passthrough(),
  });
}

/** How the company describes itself (N-7); every member can read it. */
export function fetchCompanyProfile(signal?: AbortSignal): Promise<CompanyProfile> {
  return apiRequest("/v1/workspaces/current/company", { schema: CompanyProfileSchema, signal });
}

/** Owners and admins: replace the company profile. */
export function saveCompanyProfile(input: CompanyProfileInput): Promise<CompanyProfile> {
  return apiRequest("/v1/workspaces/current/company", {
    method: "PUT",
    body: input,
    schema: CompanyProfileSchema,
  });
}
