import { WelcomeInputSchema, WelcomeSchema, type WelcomeInput } from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

/**
 * The first-day welcome. Not served yet; in development the mock layer answers (src/mocks/welcome.ts).
 * Contract: packages/shared/src/schemas/welcome.ts.
 */
export const WELCOME_ENDPOINTS = {
  welcome: { path: "/v1/me/welcome", schema: WelcomeSchema },
  complete: { path: "/v1/me/welcome", schema: WelcomeSchema, input: WelcomeInputSchema },
} as const;

export const fetchWelcome = (signal?: AbortSignal) =>
  apiRequest(WELCOME_ENDPOINTS.welcome.path, { schema: WELCOME_ENDPOINTS.welcome.schema, signal });

export const completeWelcome = (input: WelcomeInput) =>
  apiRequest(WELCOME_ENDPOINTS.complete.path, {
    method: "POST",
    body: input,
    schema: WELCOME_ENDPOINTS.complete.schema,
  });
