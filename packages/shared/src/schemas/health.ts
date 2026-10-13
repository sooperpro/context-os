import { z } from "zod";

export const HealthCheckStatusSchema = z.enum(["ok", "error"]);

export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  timestamp: z.iso.datetime(),
  uptimeSeconds: z.number().nonnegative(),
  version: z.string(),
  checks: z.record(z.string(), HealthCheckStatusSchema),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
