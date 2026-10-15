import { queryOptions } from "@tanstack/react-query";
import { fetchAuthOptions, fetchDevices, fetchSession } from "./auth.api";

export const authKeys = {
  all: ["auth"] as const,
  options: () => [...authKeys.all, "options"] as const,
  session: () => [...authKeys.all, "session"] as const,
  devices: () => [...authKeys.all, "devices"] as const,
};

export const authOptionsQuery = () =>
  queryOptions({
    queryKey: authKeys.options(),
    queryFn: ({ signal }) => fetchAuthOptions(signal),
    staleTime: Infinity,
  });

/** The signed-in session and its workspaces. A 401 means signed out, so it is not retried. */
export const sessionQuery = () =>
  queryOptions({
    queryKey: authKeys.session(),
    queryFn: ({ signal }) => fetchSession(signal),
    staleTime: 5 * 60_000,
    retry: false,
  });

export const devicesQuery = () =>
  queryOptions({ queryKey: authKeys.devices(), queryFn: ({ signal }) => fetchDevices(signal) });
