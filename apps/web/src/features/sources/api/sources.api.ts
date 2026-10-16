import {
  SourceListSchema,
  SourceObjectDetailSchema,
  SourceObjectSchema,
  type CreateSourceInput,
  type SourceList,
  type SourceObject,
  type SourceObjectDetail,
} from "@contextos/shared";
import { z } from "zod";
import { apiRequest } from "@/lib/api-client";

export const listSources = (projectId: string, signal?: AbortSignal): Promise<SourceList> =>
  apiRequest(`/v1/projects/${projectId}/sources`, { schema: SourceListSchema, signal });

export const getSource = (
  projectId: string,
  sourceId: string,
  signal?: AbortSignal,
): Promise<SourceObjectDetail> =>
  apiRequest(`/v1/projects/${projectId}/sources/${sourceId}`, {
    schema: SourceObjectDetailSchema,
    signal,
  });

export const createSource = (projectId: string, input: CreateSourceInput): Promise<SourceObject> =>
  apiRequest(`/v1/projects/${projectId}/sources`, {
    method: "POST",
    body: input,
    schema: SourceObjectSchema,
  });

export const reprocessSource = (projectId: string, sourceId: string): Promise<SourceObject> =>
  apiRequest(`/v1/projects/${projectId}/sources/${sourceId}/reprocess`, {
    method: "POST",
    schema: SourceObjectSchema,
  });

export const deleteSource = (projectId: string, sourceId: string): Promise<void> =>
  apiRequest(`/v1/projects/${projectId}/sources/${sourceId}`, {
    method: "DELETE",
    schema: z.void(),
  });

const SourceAccessListSchema = z.object({
  items: z.array(
    z.object({ userId: z.string(), name: z.string(), expiresAt: z.string().nullable() }),
  ),
});
const accessPath = (projectId: string, sourceId: string) =>
  `/v1/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}/access`;

/** Who a pasted or uploaded restricted source is shared with, one by one. Admins only. */
export function listSourceAccess(projectId: string, sourceId: string, signal?: AbortSignal) {
  return apiRequest(accessPath(projectId, sourceId), { schema: SourceAccessListSchema, signal });
}

export function grantSourceAccess(
  projectId: string,
  sourceId: string,
  input: { userId: string; expiresAt?: string },
) {
  return apiRequest(accessPath(projectId, sourceId), {
    method: "POST",
    body: input,
    schema: z.unknown(),
  });
}

export function revokeSourceAccess(projectId: string, sourceId: string, userId: string) {
  return apiRequest(`${accessPath(projectId, sourceId)}/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    schema: z.unknown(),
  });
}
