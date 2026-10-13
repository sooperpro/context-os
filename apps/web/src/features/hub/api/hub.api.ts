import {
  ContextItemListSchema,
  ContextItemSchema,
  HubSchema,
  SyncStatusSchema,
  type ContextItem,
  type ContextItemKind,
  type ContextItemList,
  type Hub,
  type SyncStatus,
  type Verification,
} from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

export const getHub = (projectId: string, signal?: AbortSignal): Promise<Hub> =>
  apiRequest(`/v1/projects/${projectId}/hub`, { schema: HubSchema, signal });

export const refreshHub = (projectId: string): Promise<SyncStatus> =>
  apiRequest(`/v1/projects/${projectId}/hub/refresh`, { method: "POST", schema: SyncStatusSchema });

export const listContextItems = (
  projectId: string,
  kind?: ContextItemKind,
  signal?: AbortSignal,
): Promise<ContextItemList> =>
  apiRequest(`/v1/projects/${projectId}/context-items`, {
    query: { kind },
    schema: ContextItemListSchema,
    signal,
  });

export const setVerification = (
  projectId: string,
  itemId: string,
  verification: Verification,
): Promise<ContextItem> =>
  apiRequest(`/v1/projects/${projectId}/context-items/${itemId}/verification`, {
    method: "PATCH",
    body: { verification },
    schema: ContextItemSchema,
  });
