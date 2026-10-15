import type { SsoProviderInput } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminKeys } from "./admin.queries";
import {
  addSsoProvider,
  fetchSsoSettings,
  removeSsoProvider,
  setSsoEnforcement,
  verifySsoProvider,
} from "./sso.api";

export const ssoKeys = {
  all: [...adminKeys.all, "sso"] as const,
  settings: () => [...ssoKeys.all, "settings"] as const,
};

export const ssoSettingsQuery = () =>
  queryOptions({
    queryKey: ssoKeys.settings(),
    queryFn: ({ signal }) => fetchSsoSettings(signal),
  });

/** Every change can move enforcement too (removing the last verified connection turns it off). */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ssoKeys.all });
}

export function useAddSsoProvider() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: SsoProviderInput) => addSsoProvider(input),
    onSuccess: () => refresh(),
  });
}

export function useVerifySsoProvider() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (providerId: string) => verifySsoProvider(providerId),
    onSuccess: () => refresh(),
  });
}

export function useRemoveSsoProvider() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (providerId: string) => removeSsoProvider(providerId),
    onSuccess: () => refresh(),
  });
}

export function useSetSsoEnforcement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enforced: boolean) => setSsoEnforcement(enforced),
    onSuccess: (settings) => queryClient.setQueryData(ssoKeys.settings(), settings),
  });
}
