import type {
  AccessPolicyInput,
  AiSettingsInput,
  ConnectInput,
  ConnectorRequestInput,
} from "@contextos/shared";
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { homeKeys } from "@/features/home/api/home.queries";
import { workspaceKeys } from "@/features/workspace/api/workspace.queries";
import {
  authorizeConnector,
  connectConnector,
  createPolicy,
  decideRoleRequest,
  deletePolicy,
  fetchAccessPreview,
  fetchAdminConnectors,
  fetchAiSettings,
  fetchAudit,
  fetchConnectorScopes,
  fetchMembersOverview,
  fetchOwnConnections,
  fetchPolicies,
  fetchRoleRequests,
  reconnectConnector,
  removeConnectorScope,
  requestConnector,
  resolveConflict,
  runDirectorySync,
  syncConnector,
  updateAiSettings,
  updatePolicy,
} from "./admin.api";

export const adminKeys = {
  all: [...workspaceKeys.all, "admin"] as const,
  membersOverview: () => [...adminKeys.all, "members-overview"] as const,
  roleRequests: () => [...adminKeys.all, "role-requests"] as const,
  connectors: () => [...adminKeys.all, "connectors"] as const,
  policies: () => [...adminKeys.all, "policies"] as const,
  preview: (personId: string) => [...adminKeys.all, "preview", personId] as const,
  aiSettings: () => [...adminKeys.all, "ai-settings"] as const,
  audit: (days: number) => [...adminKeys.all, "audit", days] as const,
  connectorScopes: (id: string) => [...adminKeys.all, "connector-scopes", id] as const,
};

export const membersOverviewQuery = () =>
  queryOptions({
    queryKey: adminKeys.membersOverview(),
    queryFn: ({ signal }) => fetchMembersOverview(signal),
  });

export const roleRequestsQuery = () =>
  queryOptions({
    queryKey: adminKeys.roleRequests(),
    queryFn: ({ signal }) => fetchRoleRequests(signal),
  });

/** Polls while a connector syncs, so progress moves on its own. */
export const adminConnectorsQuery = () =>
  queryOptions({
    queryKey: adminKeys.connectors(),
    queryFn: ({ signal }) => fetchAdminConnectors(signal),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.state === "syncing" && item.progress !== null)
        ? 1000
        : false,
  });

export const policiesQuery = () =>
  queryOptions({ queryKey: adminKeys.policies(), queryFn: ({ signal }) => fetchPolicies(signal) });

export const accessPreviewQuery = (personId: string) =>
  queryOptions({
    queryKey: adminKeys.preview(personId),
    queryFn: ({ signal }) => fetchAccessPreview(personId, signal),
    enabled: Boolean(personId),
    // Keep the list while another person's loads, so the picker never disappears.
    placeholderData: keepPreviousData,
  });

export const aiSettingsQuery = () =>
  queryOptions({
    queryKey: adminKeys.aiSettings(),
    queryFn: ({ signal }) => fetchAiSettings(signal),
  });

/** The newest events in the last `days` days; the page filters categories on top. */
export const auditQuery = (days: number) =>
  queryOptions({
    queryKey: adminKeys.audit(days),
    queryFn: ({ signal }) =>
      fetchAudit(new Date(Date.now() - days * 86_400_000).toISOString(), signal),
    placeholderData: keepPreviousData,
  });

export const connectorScopesQuery = (id: string) =>
  queryOptions({
    queryKey: adminKeys.connectorScopes(id),
    queryFn: ({ signal }) => fetchConnectorScopes(id, signal),
  });

export function useSyncConnector() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id: string) => syncConnector(id), onSuccess: () => refresh() });
}

export function useRemoveConnectorScope() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, scopeId }: { id: string; scopeId: string }) =>
      removeConnectorScope(id, scopeId),
    onSuccess: () => refresh(),
  });
}

export function useDeletePolicy() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id: string) => deletePolicy(id), onSuccess: () => refresh() });
}

/** Admin changes show on these pages and on the admin's Home. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: adminKeys.all }),
      queryClient.invalidateQueries({ queryKey: homeKeys.all }),
    ]);
}

export function useDirectorySync() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: () => runDirectorySync(), onSuccess: () => refresh() });
}

export function useDecideRoleRequest() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "decline" }) =>
      decideRoleRequest(id, decision),
    onSuccess: () => refresh(),
  });
}

const CONSENT_POLL_MS = 2_000;
const CONSENT_TIMEOUT_MS = 3 * 60_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read-only consent for a connector; resolves with the account that granted it. When the provider
 * needs its own consent page, that page opens in a new tab and this waits until the provider has
 * redirected back and the connection is recorded.
 */
export function useAuthorizeConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const consent = await authorizeConnector(id);
      if (consent.account) return consent.account;
      if (!consent.authorizationUrl)
        throw new Error("The connector did not return a sign-in page.");
      window.open(consent.authorizationUrl, "_blank", "noopener,noreferrer");
      const provider = id.replaceAll("-", "_");
      for (const deadline = Date.now() + CONSENT_TIMEOUT_MS; Date.now() < deadline;) {
        await wait(CONSENT_POLL_MS);
        const connections = await fetchOwnConnections();
        if (connections.some((row) => row.provider === provider && row.status === "connected")) {
          const granted = await authorizeConnector(id);
          if (granted.account) return granted.account;
        }
      }
      throw new Error("Access wasn't granted in time. Please try again.");
    },
    // The catalog now lists what the account can index.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.connectors() }),
  });
}

export function useConnectConnector() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConnectInput }) => connectConnector(id, input),
    onSuccess: () => refresh(),
  });
}

export function useReconnectConnector() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => reconnectConnector(id),
    onSuccess: () => refresh(),
  });
}

export function useRequestConnector() {
  return useMutation({ mutationFn: (input: ConnectorRequestInput) => requestConnector(input) });
}

export function useSavePolicy(id: string | null) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: AccessPolicyInput) => (id ? updatePolicy(id, input) : createPolicy(input)),
    onSuccess: () => refresh(),
  });
}

export function useResolveConflict() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, optionId }: { id: string; optionId: string }) =>
      resolveConflict(id, optionId),
    onSuccess: () => refresh(),
  });
}

export function useUpdateAiSettings() {
  const queryClient = useQueryClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: AiSettingsInput) => updateAiSettings(input),
    // Switches answer at once; the server's copy replaces this when it arrives.
    onSuccess: (settings) => {
      queryClient.setQueryData(adminKeys.aiSettings(), settings);
      return refresh();
    },
  });
}
