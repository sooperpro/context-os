import {
  ContinuityChecklistSchema,
  ContinuityUpdateInputSchema,
  type ContinuityUpdateInput,
} from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

/**
 * Hand-over checklists from offboarding, for the leaver's manager and admins
 * (apps/api/src/modules/identity/identity.routes.ts). Contract:
 * packages/shared/src/schemas/continuity.ts.
 */
export const CONTINUITY_ENDPOINTS = {
  checklist: {
    path: "/v1/continuity/checklists/:id",
    schema: ContinuityChecklistSchema,
    input: ContinuityUpdateInputSchema,
  },
} as const;

const E = CONTINUITY_ENDPOINTS;
const withId = (path: string, id: string) => path.replace(":id", encodeURIComponent(id));

export const fetchChecklist = (id: string, signal?: AbortSignal) =>
  apiRequest(withId(E.checklist.path, id), { schema: E.checklist.schema, signal });

export const updateChecklist = (id: string, input: ContinuityUpdateInput) =>
  apiRequest(withId(E.checklist.path, id), {
    method: "PATCH",
    body: input,
    schema: E.checklist.schema,
  });
