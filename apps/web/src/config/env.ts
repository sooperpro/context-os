import { z } from "zod";

const EnvSchema = z.object({
  VITE_API_BASE_URL: z.string().min(1).default("/api"),
  MODE: z.string(),
  DEV: z.boolean(),
  PROD: z.boolean(),
});

/** Validated, typed access to build-time environment (only VITE_* vars reach the browser). */
export const env = EnvSchema.parse(import.meta.env);
