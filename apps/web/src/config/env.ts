import { z } from "zod";

const EnvSchema = z.object({
  VITE_API_BASE_URL: z.string().min(1).default("/api"),
  VITE_CLERK_PUBLISHABLE_KEY: z.string().startsWith("pk_").optional(),
  MODE: z.string(),
  DEV: z.boolean(),
  PROD: z.boolean(),
});

/** Validated, typed access to build-time environment (only VITE_* vars reach the browser). */
export const env = EnvSchema.parse(import.meta.env);
