import { z } from "zod";
import { SystemRoleSchema } from "./platform.js";

/** `development`: one local actor, no sign-in. `accounts`: real sign-in and sessions. */
export const AuthenticationModeSchema = z.enum(["development", "accounts"]);
export type AuthenticationMode = z.infer<typeof AuthenticationModeSchema>;

/** `GET /auth-options` (public): which sign-in methods this deployment offers. */
export const AuthOptionsSchema = z.object({
  authentication: AuthenticationModeSchema,
  methods: z.object({
    /** One-time sign-in links by email. */
    email: z.boolean(),
    /** Sign up and sign in with an email and password (confirmed by email first). */
    password: z.boolean(),
    google: z.boolean(),
    microsoft: z.boolean(),
    sso: z.boolean(),
  }),
});
export type AuthOptions = z.infer<typeof AuthOptionsSchema>;

/** How a session signed in. */
export const SignInMethodSchema = z.enum([
  "development",
  "magic-link",
  "password",
  "google",
  "microsoft",
  "sso",
]);
export type SignInMethod = z.infer<typeof SignInMethodSchema>;

export const SessionWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  role: SystemRoleSchema,
  /** The workspace enforces company SSO and this session signed in another way. */
  ssoRequired: z.boolean(),
});
export type SessionWorkspace = z.infer<typeof SessionWorkspaceSchema>;

/** `GET /session`: who is signed in, how, and the workspaces they can open. */
export const SessionStateSchema = z.object({
  authentication: AuthenticationModeSchema,
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    image: z.string().nullable(),
  }),
  signInMethod: SignInMethodSchema.nullable(),
  /** Sign-in methods linked to this person: `email`, `password`, `google`, `microsoft`, or `sso`. */
  linkedMethods: z.array(z.string()),
  activeWorkspaceId: z.string().nullable(),
  workspaces: z.array(SessionWorkspaceSchema),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

/** `PUT /session/workspace`. */
export const SelectWorkspaceSchema = z.object({ workspaceId: z.string().min(1).max(200) }).strict();

/** `GET /session/devices`: where this person is signed in. */
export const SessionDeviceSchema = z.object({
  id: z.string(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  signInMethod: SignInMethodSchema.nullable(),
  createdAt: z.iso.datetime(),
  lastActiveAt: z.iso.datetime(),
  current: z.boolean(),
});
export type SessionDevice = z.infer<typeof SessionDeviceSchema>;
export const SessionDeviceListSchema = z.object({ items: z.array(SessionDeviceSchema) });

export const DomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    "Enter a domain like company.com",
  );

/** `POST /admin/sso/providers`: connect the company identity provider (OIDC or SAML 2.0). */
export const SsoProviderInputSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("oidc"),
      domain: DomainSchema,
      /** Issuer URL; discovery is read from `<issuer>/.well-known/openid-configuration`. */
      issuer: z.url().max(500),
      clientId: z.string().trim().min(1).max(500),
      clientSecret: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal("saml"),
      domain: DomainSchema,
      /** IdP single sign-on URL. */
      entryPoint: z.url().max(2000),
      /** IdP entity ID (issuer). */
      entityId: z.string().trim().min(1).max(500),
      /** IdP signing certificate (PEM). */
      certificate: z.string().trim().min(1).max(20_000),
    })
    .strict(),
]);
export type SsoProviderInput = z.infer<typeof SsoProviderInputSchema>;

export const SsoProviderSchema = z.object({
  providerId: z.string(),
  type: z.enum(["oidc", "saml"]),
  domain: z.string(),
  issuer: z.string(),
  domainVerified: z.boolean(),
  /** DNS TXT record proving the workspace owns `domain`. */
  verification: z.object({ name: z.string(), value: z.string() }),
  /** Values to enter in the identity provider. */
  serviceProvider: z.object({
    /** OIDC redirect URI, or SAML ACS URL. */
    callbackUrl: z.string(),
    /** SAML only: SP entity ID and metadata URL. */
    entityId: z.string().nullable(),
    metadataUrl: z.string().nullable(),
  }),
});
export type SsoProvider = z.infer<typeof SsoProviderSchema>;

/** `GET /admin/sso`. */
export const SsoSettingsSchema = z.object({
  available: z.boolean(),
  enforced: z.boolean(),
  providers: z.array(SsoProviderSchema),
});
export type SsoSettings = z.infer<typeof SsoSettingsSchema>;

/** `PUT /admin/sso/enforcement`. */
export const SsoEnforcementSchema = z.object({ enforced: z.boolean() }).strict();
