import { WelcomeInputSchema, WelcomeSchema, type WelcomeInput } from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

/**
 * The first-day welcome, served by the API (apps/api/src/modules/platform/employee.routes.ts).
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
