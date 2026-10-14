import {
  AccessPolicyInputSchema,
  AccessPolicyListSchema,
  AccessPolicySchema,
  AccessPreviewSchema,
  AdminConnectorListSchema,
  AdminConnectorSchema,
  AiSettingsInputSchema,
  AiSettingsSchema,
  AuditEntryListSchema,
  ConnectInputSchema,
  ConnectorConsentSchema,
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
 * The admin's workspace endpoints. The audit log is live; the rest are not served yet and the
 * development mock layer answers them (src/mocks/admin.ts). Contracts:
 * packages/shared/src/schemas/admin.ts.
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
  /** Live. Oldest first, paged; no filters or sort yet (docs/api-change-requests.md, item 5). */
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

export const connectConnector = (id: string, input: ConnectInput) =>
  apiRequest(withId(E.connect.path, id), { method: "POST", body: input, schema: E.connect.schema });

export const reconnectConnector = (id: string) =>
  apiRequest(withId(E.reconnect.path, id), {
    method: "POST",
    body: {},
    schema: E.reconnect.schema,
  });

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

/** The most recent page the API returns (it caps `limit` at 100). */
export const fetchAudit = (signal?: AbortSignal) =>
  apiRequest(E.audit.path, { query: { limit: 100, offset: 0 }, schema: E.audit.schema, signal });
