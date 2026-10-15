import { z } from "zod";

const EnvSchema = z.object({
  VITE_API_BASE_URL: z.string().min(1).default("/api"),
  /** Development only: answer endpoints the API does not serve yet with preview data (src/mocks). */
  VITE_MOCK_API: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  MODE: z.string(),
  DEV: z.boolean(),
  PROD: z.boolean(),
});

/** Validated, typed access to build-time environment (only VITE_* vars reach the browser). */
export const env = EnvSchema.parse(import.meta.env);
