import {
  ConnectorAuthorizationSchema,
  ConnectorListSchema,
  ConnectorScopeListSchema,
  ConnectorScopeOptionListSchema,
  ConnectorScopesInputSchema,
  ConnectorSyncResultSchema,
  DriveFileListSchema,
  SourceObjectSchema,
  type ConnectorConnection,
  type ConnectorScope,
  type ConnectorScopeOptionList,
  type ConnectorSyncResult,
  type DriveFileList,
  type DriveImportInput,
  type SourceObject,
} from "@contextos/shared";
import type { z } from "zod";
import { apiRequest } from "@/lib/api-client";

/** One folder or shared drive to keep in sync (`excluded` and `backfillFrom` are optional). */
export type ScopeSelectionInput = z.input<typeof ConnectorScopesInputSchema>["scopes"][number];

export async function listConnectors(signal?: AbortSignal): Promise<ConnectorConnection[]> {
  const result = await apiRequest("/v1/connectors", { schema: ConnectorListSchema, signal });
  return result.items;
}

/** Starts Google consent. The URL must be opened in a browser tab; the callback records the connection. */
export async function authorizeGoogleDrive(): Promise<string> {
  const result = await apiRequest("/v1/connectors/google-drive/authorize", {
    method: "POST",
    schema: ConnectorAuthorizationSchema,
  });
  return result.authorizationUrl;
}

export function listConnectorFiles(
  connectionId: string,
  params: { folderId?: string; pageToken?: string },
  signal?: AbortSignal,
): Promise<DriveFileList> {
  return apiRequest(`/v1/connectors/${connectionId}/files`, {
    query: { folderId: params.folderId, pageToken: params.pageToken },
    schema: DriveFileListSchema,
    signal,
  });
}

/** Imports one explicitly selected file into a project. The API rejects unsupported types with a 400. */
export function importConnectorFile(
  connectionId: string,
  input: DriveImportInput,
): Promise<SourceObject> {
  return apiRequest(`/v1/connectors/${connectionId}/import`, {
    method: "POST",
    body: input,
    schema: SourceObjectSchema,
  });
}

/** The person's Drive as selectable scopes (My Drive, shared drives, top-level folders) with current selections. */
export function listConnectorScopes(
  connectionId: string,
  signal?: AbortSignal,
): Promise<ConnectorScopeOptionList> {
  return apiRequest(`/v1/connectors/${connectionId}/scopes`, {
    schema: ConnectorScopeOptionListSchema,
    signal,
  });
}

/** Replaces the scopes this connection feeds into a project. Owner or admin only. */
export async function setConnectorScopes(
  connectionId: string,
  projectId: string,
  scopes: ScopeSelectionInput[],
): Promise<ConnectorScope[]> {
  const result = await apiRequest(`/v1/connectors/${connectionId}/scopes`, {
    method: "PUT",
    body: ConnectorScopesInputSchema.parse({ projectId, scopes }),
    schema: ConnectorScopeListSchema,
  });
  return result.items;
}

/** Queues a sync of one scope, or of every selected scope; each scope syncs at most every 10 minutes. */
export function requestConnectorSync(
  connectionId: string,
  scopeId?: string,
): Promise<ConnectorSyncResult> {
  return apiRequest(`/v1/connectors/${connectionId}/sync`, {
    method: "POST",
    body: scopeId ? { scopeId } : {},
    schema: ConnectorSyncResultSchema,
  });
}
