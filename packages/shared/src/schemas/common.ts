import { z } from "zod";

export const IdSchema = z.uuid();
export const IsoDateTimeSchema = z.iso.datetime();
export const IsoDateSchema = z.iso.date();

/** URL-safe identifier: lowercase letters, digits and single hyphens. */
export const SlugSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and single hyphens");

export const ProjectIdParamSchema = z.object({ projectId: IdSchema });
/** Project routes accept either the project UUID or its slug. */
export const ProjectRefParamSchema = z.object({ projectId: z.union([IdSchema, SlugSchema]) });

export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** Generic `{ items }` list envelope. */
export function listOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item) });
}
