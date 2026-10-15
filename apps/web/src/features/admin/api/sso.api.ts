import {
  SsoEnforcementSchema,
  SsoProviderInputSchema,
  SsoProviderSchema,
  SsoSettingsSchema,
  type SsoProviderInput,
} from "@contextos/shared";
import { z } from "zod";
import { apiRequest } from "@/lib/api-client";

/**
 * Company single sign-on (owner/admin): connect an OIDC or SAML 2.0 identity provider per email
 * domain, prove the domain with a DNS TXT record, and optionally require SSO for everyone.
 * Contracts: packages/shared/src/schemas/auth.ts.
 */
export const SSO_ENDPOINTS = {
  settings: { path: "/v1/admin/sso", schema: SsoSettingsSchema },
  addProvider: {
    path: "/v1/admin/sso/providers",
    schema: SsoProviderSchema,
    input: SsoProviderInputSchema,
  },
  verifyProvider: { path: "/v1/admin/sso/providers/:id/verify", schema: SsoProviderSchema },
  removeProvider: { path: "/v1/admin/sso/providers/:id" },
  enforcement: {
    path: "/v1/admin/sso/enforcement",
    schema: SsoSettingsSchema,
    input: SsoEnforcementSchema,
  },
} as const;

const E = SSO_ENDPOINTS;
const withId = (path: string, id: string) => path.replace(":id", encodeURIComponent(id));

export const fetchSsoSettings = (signal?: AbortSignal) =>
  apiRequest(E.settings.path, { schema: E.settings.schema, signal });

export const addSsoProvider = (input: SsoProviderInput) =>
  apiRequest(E.addProvider.path, { method: "POST", body: input, schema: E.addProvider.schema });

/** Checks the domain's TXT record; a 409 says the record isn't visible yet. */
export const verifySsoProvider = (id: string) =>
  apiRequest(withId(E.verifyProvider.path, id), {
    method: "POST",
    schema: E.verifyProvider.schema,
  });

export const removeSsoProvider = (id: string) =>
  apiRequest(withId(E.removeProvider.path, id), { method: "DELETE", schema: z.undefined() });

export const setSsoEnforcement = (enforced: boolean) =>
  apiRequest(E.enforcement.path, {
    method: "PUT",
    body: { enforced },
    schema: E.enforcement.schema,
  });
