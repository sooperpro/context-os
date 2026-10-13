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
