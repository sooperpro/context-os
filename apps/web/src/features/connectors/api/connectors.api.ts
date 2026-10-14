import {
  ConnectorAuthorizationSchema,
  ConnectorListSchema,
  type ConnectorConnection,
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
