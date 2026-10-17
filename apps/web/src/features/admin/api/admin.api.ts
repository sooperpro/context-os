import {
  AccessPolicyInputSchema,
  AccessPolicyListSchema,
  AccessPolicySchema,
  AccessPreviewSchema,
  AdminConnectorListSchema,
  AdminConnectorSchema,
  AdminConnectorScopeListSchema,
  AdminConnectorSyncResultSchema,
  AiSettingsInputSchema,
  AiSettingsSchema,
  AuditEntryListSchema,
  ConnectInputSchema,
  ConnectorConsentSchema,
  ConnectorListSchema,
  ConnectorRequestInputSchema,
  ConnectorRequestResultSchema,
  DirectorySyncResultSchema,
  MembersOverviewSchema,
  ReconnectInputSchema,
  ResolveConflictInputSchema,
  RoleRequestDecisionInputSchema,
  RoleRequestDecisionSchema,
  RoleRequestListSchema,
  type AccessPolicyInput,
  type AiSettingsInput,
  type ConnectInput,
  type ConnectorRequestInput,
} from "@contextos/shared";
import { z } from "zod";
import { apiRequest } from "@/lib/api-client";

/**
 * The admin's workspace endpoints (role access spec §4.8), all served by the API: members overview,
 * directory sync and role requests (platform/members-admin.routes.ts), the connector catalog
 * (connectors/admin-connectors.routes.ts), access policies (platform/access-policies.routes.ts), AI
 * settings and the audit log. Contracts: packages/shared/src/schemas/admin.ts.
 */
export const ADMIN_ENDPOINTS = {
  membersOverview: { path: "/v1/admin/members/overview", schema: MembersOverviewSchema },
  directorySync: {
    path: "/v1/admin/directory-sync",
    schema: DirectorySyncResultSchema,
    input: z.object({}).strict(),
  },
  roleRequests: { path: "/v1/admin/role-requests", schema: RoleRequestListSchema },
  decideRoleRequest: {
    path: "/v1/admin/role-requests/:id/decision",
    schema: RoleRequestDecisionSchema,
    input: RoleRequestDecisionInputSchema,
  },
  connectors: { path: "/v1/admin/connectors", schema: AdminConnectorListSchema },
  authorize: {
    path: "/v1/admin/connectors/:id/authorize",
    schema: ConnectorConsentSchema,
    input: z.object({}).strict(),
  },
  connect: {
    path: "/v1/admin/connectors/:id/connect",
    schema: AdminConnectorSchema,
    input: ConnectInputSchema,
  },
  reconnect: {
    path: "/v1/admin/connectors/:id/reconnect",
    schema: AdminConnectorSchema,
    input: ReconnectInputSchema,
  },
  connectorScopes: {
    path: "/v1/admin/connectors/:id/scopes",
    schema: AdminConnectorScopeListSchema,
  },
  syncConnector: { path: "/v1/admin/connectors/:id/sync", schema: AdminConnectorSyncResultSchema },
  removeConnectorScope: { path: "/v1/admin/connectors/:id/scopes/:scopeId" },
  requestConnector: {
    path: "/v1/admin/connector-requests",
    schema: ConnectorRequestResultSchema,
    input: ConnectorRequestInputSchema,
  },
  policies: { path: "/v1/admin/access-policies", schema: AccessPolicyListSchema },
  createPolicy: {
    path: "/v1/admin/access-policies",
    schema: AccessPolicySchema,
    input: AccessPolicyInputSchema,
  },
  updatePolicy: {
    path: "/v1/admin/access-policies/:id",
    schema: AccessPolicySchema,
    input: AccessPolicyInputSchema,
  },
  deletePolicy: { path: "/v1/admin/access-policies/:id" },
  resolveConflict: {
    path: "/v1/admin/access-conflicts/:id/resolve",
    schema: AccessPolicyListSchema,
    input: ResolveConflictInputSchema,
  },
  preview: { path: "/v1/admin/access-preview", schema: AccessPreviewSchema },
  aiSettings: { path: "/v1/admin/ai-settings", schema: AiSettingsSchema },
  updateAiSettings: {
    path: "/v1/admin/ai-settings",
    schema: AiSettingsSchema,
    input: AiSettingsInputSchema,
  },
  /** Newest first; `from`/`to` (ISO) narrow the range before paging. */
  audit: { path: "/v1/audit", schema: AuditEntryListSchema },
} as const;

const E = ADMIN_ENDPOINTS;
const withId = (path: string, id: string) => path.replace(":id", encodeURIComponent(id));

export const fetchMembersOverview = (signal?: AbortSignal) =>
  apiRequest(E.membersOverview.path, { schema: E.membersOverview.schema, signal });

export const runDirectorySync = () =>
  apiRequest(E.directorySync.path, { method: "POST", body: {}, schema: E.directorySync.schema });

export const fetchRoleRequests = (signal?: AbortSignal) =>
  apiRequest(E.roleRequests.path, { schema: E.roleRequests.schema, signal });

export const decideRoleRequest = (id: string, decision: "approve" | "decline") =>
  apiRequest(withId(E.decideRoleRequest.path, id), {
    method: "POST",
    body: { decision },
    schema: E.decideRoleRequest.schema,
  });

export const fetchAdminConnectors = (signal?: AbortSignal) =>
  apiRequest(E.connectors.path, { schema: E.connectors.schema, signal });

export const authorizeConnector = (id: string) =>
  apiRequest(withId(E.authorize.path, id), {
    method: "POST",
    body: {},
    schema: E.authorize.schema,
  });

/** The signed-in person's own connections; consent is recorded here once the provider redirects back. */
export const fetchOwnConnections = async (signal?: AbortSignal) =>
  (await apiRequest("/v1/connectors", { schema: ConnectorListSchema, signal })).items;

export const connectConnector = (id: string, input: ConnectInput) =>
  apiRequest(withId(E.connect.path, id), { method: "POST", body: input, schema: E.connect.schema });

export const reconnectConnector = (id: string) =>
  apiRequest(withId(E.reconnect.path, id), {
    method: "POST",
    body: {},
    schema: E.reconnect.schema,
  });

export const fetchConnectorScopes = (id: string, signal?: AbortSignal) =>
  apiRequest(withId(E.connectorScopes.path, id), { schema: E.connectorScopes.schema, signal });

export const syncConnector = (id: string) =>
  apiRequest(withId(E.syncConnector.path, id), { method: "POST", schema: E.syncConnector.schema });

export const removeConnectorScope = (id: string, scopeId: string) =>
  apiRequest(
    withId(E.removeConnectorScope.path, id).replace(":scopeId", encodeURIComponent(scopeId)),
    { method: "DELETE", schema: z.undefined() },
  );

export const requestConnector = (input: ConnectorRequestInput) =>
  apiRequest(E.requestConnector.path, {
    method: "POST",
    body: input,
    schema: E.requestConnector.schema,
  });

export const fetchPolicies = (signal?: AbortSignal) =>
  apiRequest(E.policies.path, { schema: E.policies.schema, signal });

export const createPolicy = (input: AccessPolicyInput) =>
  apiRequest(E.createPolicy.path, { method: "POST", body: input, schema: E.createPolicy.schema });

export const updatePolicy = (id: string, input: AccessPolicyInput) =>
  apiRequest(withId(E.updatePolicy.path, id), {
    method: "PATCH",
    body: input,
    schema: E.updatePolicy.schema,
  });

export const deletePolicy = (id: string) =>
  apiRequest(withId(E.deletePolicy.path, id), { method: "DELETE", schema: z.undefined() });

export const resolveConflict = (id: string, optionId: string) =>
  apiRequest(withId(E.resolveConflict.path, id), {
    method: "POST",
    body: { optionId },
    schema: E.resolveConflict.schema,
  });

export const fetchAccessPreview = (personId: string, signal?: AbortSignal) =>
  apiRequest(E.preview.path, { query: { personId }, schema: E.preview.schema, signal });

export const fetchAiSettings = (signal?: AbortSignal) =>
  apiRequest(E.aiSettings.path, { schema: E.aiSettings.schema, signal });

export const updateAiSettings = (input: AiSettingsInput) =>
  apiRequest(E.updateAiSettings.path, {
    method: "PATCH",
    body: input,
    schema: E.updateAiSettings.schema,
  });

/** The newest events since `from` (the API caps `limit` at 100). */
export const fetchAudit = (from?: string, signal?: AbortSignal) =>
  apiRequest(E.audit.path, {
    query: { limit: 100, offset: 0, from },
    schema: E.audit.schema,
    signal,
  });
