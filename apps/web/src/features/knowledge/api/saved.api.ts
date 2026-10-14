import {
  SaveInputSchema,
  SavedItemSchema,
  SavedListSchema,
  type SaveInput,
} from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

/**
 * Saved knowledge. Not served yet; in development the mock layer answers (src/mocks/saved.ts).
 * Contract: packages/shared/src/schemas/saved.ts.
 */
export const SAVED_ENDPOINTS = {
  list: { path: "/v1/me/saved", schema: SavedListSchema },
  save: { path: "/v1/me/saved/:id", schema: SavedItemSchema.nullable(), input: SaveInputSchema },
} as const;

export const fetchSaved = (signal?: AbortSignal) =>
  apiRequest(SAVED_ENDPOINTS.list.path, { schema: SAVED_ENDPOINTS.list.schema, signal });

/** Answers the saved entry, or null once unsaved. */
export const setSaved = (targetId: string, input: SaveInput) =>
  apiRequest(SAVED_ENDPOINTS.save.path.replace(":id", encodeURIComponent(targetId)), {
    method: "PUT",
    body: input,
    schema: SAVED_ENDPOINTS.save.schema,
  });
