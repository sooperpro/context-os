import { CurrentWorkspaceSchema, type CurrentWorkspace } from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

export function fetchCurrentWorkspace(signal?: AbortSignal): Promise<CurrentWorkspace> {
  return apiRequest("/v1/workspaces/current", { schema: CurrentWorkspaceSchema, signal });
}
