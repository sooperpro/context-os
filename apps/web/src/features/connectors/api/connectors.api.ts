import {
  ConnectorAuthorizationSchema,
  ConnectorListSchema,
  DriveFileListSchema,
  SourceObjectSchema,
  type ConnectorConnection,
  type DriveFileList,
  type DriveImportInput,
  type SourceObject,
} from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

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
export function importConnectorFile(connectionId: string, input: DriveImportInput): Promise<SourceObject> {
  return apiRequest(`/v1/connectors/${connectionId}/import`, {
    method: "POST",
    body: input,
    schema: SourceObjectSchema,
  });
}
