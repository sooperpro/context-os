import {
  AuthOptionsSchema,
  PasswordResultSchema,
  SessionDeviceListSchema,
  SessionStateSchema,
  type AuthOptions,
  type PasswordInput,
  type SessionDevice,
  type SessionState,
} from "@contextos/shared";
import { z } from "zod";
import { apiRequest, buildApiUrl } from "@/lib/api-client";

/** Sign-in methods this deployment offers (public). */
export const fetchAuthOptions = (signal?: AbortSignal): Promise<AuthOptions> =>
  apiRequest("/v1/auth-options", { schema: AuthOptionsSchema, signal });

/** Who is signed in and the workspaces they can open; 401 when signed out. */
export const fetchSession = (signal?: AbortSignal): Promise<SessionState> =>
  apiRequest("/v1/session", { schema: SessionStateSchema, signal });

/** Change the password (with the current one), or add one to an account that has none (N-17). */
export const savePassword = (input: PasswordInput) =>
  apiRequest("/v1/session/password", {
    method: "POST",
    body: input,
    schema: PasswordResultSchema,
  });

export const selectWorkspace = (workspaceId: string): Promise<SessionState> =>
  apiRequest("/v1/session/workspace", {
    method: "PUT",
    body: { workspaceId },
    schema: SessionStateSchema,
  });

export const fetchDevices = (signal?: AbortSignal): Promise<SessionDevice[]> =>
  apiRequest("/v1/session/devices", { schema: SessionDeviceListSchema, signal }).then(
    (result) => result.items,
  );

export const signOutDevice = (id: string): Promise<undefined> =>
  apiRequest(`/v1/session/devices/${encodeURIComponent(id)}`, {
    method: "DELETE",
    schema: z.undefined(),
  });

export const signOutOtherDevices = (): Promise<undefined> =>
  apiRequest("/v1/session/devices", { method: "DELETE", schema: z.undefined() });

/** Error from a sign-in endpoint, with its code (e.g. `INVALID_EMAIL`) when the server sent one. */
export class SignInError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SignInError";
  }
}

const SignInResponseSchema = z.object({ url: z.string().optional() }).passthrough();
const SignInErrorSchema = z.object({ code: z.string().optional(), message: z.string().optional() });

/** POST to the sign-in service (`/api/v1/auth/*`); it answers with its own JSON, not the API envelope. */
async function signInRequest(path: string, body?: unknown) {
  const response = await fetch(buildApiUrl(`/v1/auth/${path}`), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = SignInErrorSchema.safeParse(json);
    const detail = error.success ? error.data : {};
    throw new SignInError(
      detail.message?.trim() ? detail.message : "Sign-in failed. Please try again.",
      detail.code,
      response.status,
    );
  }
  return SignInResponseSchema.parse(json ?? {});
}

/**
 * Where people land after any sign-in: the app root, which then picks the workspace. A failed sign-in
 * comes back to the same place with `?error=<CODE>`, which the sign-in screen explains.
 */
const CALLBACK = "/";
/** Where a password reset link lands (with `?token=`, or `?error=` when it expired). */
export const RESET_PASSWORD_PATH = "/reset-password";
const ERROR_CALLBACK = "/";

/** Email a one-time sign-in link (it also creates the account on first use). */
export const sendMagicLink = (email: string) =>
  signInRequest("sign-in/magic-link", {
    email,
    callbackURL: CALLBACK,
    errorCallbackURL: ERROR_CALLBACK,
  }).then(() => undefined);

/** Start Google or Microsoft sign-in and leave for the provider. */
export async function signInWithProvider(provider: "google" | "microsoft"): Promise<void> {
  const { url } = await signInRequest("sign-in/social", {
    provider,
    callbackURL: CALLBACK,
    errorCallbackURL: ERROR_CALLBACK,
  });
  if (url) window.location.assign(url);
}

/** Find the company's SSO connection by email domain and leave for it. */
export async function signInWithSso(email: string): Promise<void> {
  const { url } = await signInRequest("sign-in/sso", {
    email,
    callbackURL: CALLBACK,
    errorCallbackURL: ERROR_CALLBACK,
  }).catch((error: unknown) => {
    // No workspace has connected (and verified) an identity provider for this email's domain.
    if (error instanceof SignInError && error.status === 404)
      throw new SignInError(
        `Company single sign-on isn't set up for ${email.split("@").pop() ?? "this domain"}. Sign in with an email link or Google instead, or ask your admin to connect your company's identity provider.`,
        "SSO_NOT_SET_UP",
        404,
      );
    throw error;
  });
  if (url) window.location.assign(url);
}

/**
 * Create an account with an email and password. Nobody is signed in yet: a confirmation email goes to
 * the address, and opening it signs them in. (The answer is the same when the address already has
 * an account; its owner gets an email instead.)
 */
export const signUpWithPassword = (input: { name: string; email: string; password: string }) =>
  signInRequest("sign-up/email", { ...input, callbackURL: CALLBACK }).then(() => undefined);

/** Sign in with an email and password; the session cookie is set on success. */
export const signInWithPassword = (input: { email: string; password: string }) =>
  signInRequest("sign-in/email", { ...input, callbackURL: CALLBACK }).then(() => undefined);

/** Email a link to choose a new password (sent only when the address has an account). */
export const requestPasswordReset = (email: string) =>
  signInRequest("request-password-reset", { email, redirectTo: RESET_PASSWORD_PATH }).then(
    () => undefined,
  );

/** Choose a new password with the token from the reset link. Signs out every session. */
export const resetPassword = (input: { token: string; newPassword: string }) =>
  signInRequest("reset-password", input).then(() => undefined);

export const signOut = () => signInRequest("sign-out").then(() => undefined);
