import { z } from "zod";
import { PersonRefSchema } from "./refs.js";

/**
 * Knowledge continuity (PRD §8.11): when someone is offboarded, their manager gets a checklist of
 * the responsibilities they held, to hand each one to someone else.
 */

/** One responsibility the leaver held, and who takes it over. */
export const ContinuityAreaSchema = z.object({
  key: z.string(),
  /** What it is: "Domain owner", "Mentor". */
  type: z.string(),
  /** What it covers: a project, a section, a person or the whole workspace. */
  scope: z.string(),
  status: z.enum(["unowned", "reassigned"]),
  assignee: PersonRefSchema.nullable(),
  /** The new owner holds it. A manager's pick waits until an admin applies it. */
  granted: z.boolean(),
});
export type ContinuityArea = z.infer<typeof ContinuityAreaSchema>;

/** `GET /v1/continuity/checklists/:id`, and what `PATCH` returns. */
export const ContinuityChecklistSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  status: z.enum(["open", "completed"]),
  leaver: PersonRefSchema,
  createdAt: z.string(),
  areas: z.array(ContinuityAreaSchema),
  /** Whether the viewer's picks take effect at once (admins) or wait for an admin (managers). */
  canGrant: z.boolean(),
});
export type ContinuityChecklist = z.infer<typeof ContinuityChecklistSchema>;

/** `PATCH /v1/continuity/checklists/:id`: hand areas to someone, or leave them unowned. */
export const ContinuityUpdateInputSchema = z
  .object({
    version: z.number().int().positive(),
    areas: z
      .array(
        z.object({
          key: z.string().min(1).max(300),
          status: z.enum(["reassigned", "unowned"]),
          assigneeId: z.string().min(1).max(200).optional(),
        }),
      )
      .min(1)
      .max(200),
  })
  .strict();
export type ContinuityUpdateInput = z.infer<typeof ContinuityUpdateInputSchema>;
