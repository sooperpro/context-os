import {
  CurrentWorkspaceSchema,
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
