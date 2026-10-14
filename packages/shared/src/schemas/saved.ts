import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";

/*
 * Saved knowledge (prototype "Save" on knowledge items and the Knowledge Hub's "Saved" card). Saves
 * are personal. The web app's development mock layer answers these until they are served;
 * docs/api-change-requests.md tracks them.
 */

export const SavedTargetTypeSchema = z.enum(["context_item", "project"]);
export type SavedTargetType = z.infer<typeof SavedTargetTypeSchema>;

export const SavedItemSchema = z.object({
  targetType: SavedTargetTypeSchema,
  targetId: z.string(),
  projectId: z.string(),
  savedAt: IsoDateTimeSchema,
});
export type SavedItem = z.infer<typeof SavedItemSchema>;

/** `GET /v1/me/saved`: what the person saved, newest first. Titles come from the items themselves. */
export const SavedListSchema = z.object({ items: z.array(SavedItemSchema) });
export type SavedList = z.infer<typeof SavedListSchema>;

/** `PUT /v1/me/saved/:targetId`: save or unsave one item or project. */
export const SaveInputSchema = z
  .object({ targetType: SavedTargetTypeSchema, projectId: z.string(), saved: z.boolean() })
  .strict();
export type SaveInput = z.infer<typeof SaveInputSchema>;
