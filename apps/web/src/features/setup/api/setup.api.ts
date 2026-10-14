import {
  SetupRecordSchema,
  WorkspaceSetupSchema,
  type SetupRecord,
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
