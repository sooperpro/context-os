import { z } from "zod";

export const IdSchema = z.uuid();
export const IsoDateTimeSchema = z.iso.datetime();

export const ProjectIdParamSchema = z.object({ projectId: IdSchema });

export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** Generic `{ items }` list envelope. */
export function listOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item) });
}
