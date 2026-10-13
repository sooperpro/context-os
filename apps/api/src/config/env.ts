import { z } from "zod";

// Load `.env` from the current working directory for local development only.
// In production, inject real environment variables (container/orchestrator secrets).
if (process.env.NODE_ENV !== "production") {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file present: rely on the process environment.
  }
}

const booleanString = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  /** SQLite file path, or ":memory:" for an ephemeral database. */
  DATABASE_URL: z.string().min(1).default("./data/contextos.db"),

  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  /** Model for extraction, synthesis and answers. */
  GEMINI_MODEL: z.string().min(1).default("gemini-3.8-flash"),
  /** Model for retrieval embeddings. */
  GEMINI_EMBEDDING_MODEL: z.string().min(1).default("gemini-embedding-001"),
  GEMINI_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),

  /** Run the background job worker inside this process. */
  WORKER_ENABLED: booleanString.default(true),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),

  /** Single default workspace until real identity/tenancy is wired in. */
  WORKSPACE_NAME: z.string().min(1).default("Default workspace"),
  DEV_ACTOR_ID: z.string().min(1).default("dev-user"),
  DEV_ACTOR_NAME: z.string().min(1).default("Developer"),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  /** Max requests per window per client. 0 disables rate limiting. */
  RATE_LIMIT_MAX: z.coerce.number().int().min(0).default(120),

  /** Trust X-Forwarded-For (only enable behind a reverse proxy you control). */
  TRUST_PROXY: booleanString.default(false),

  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Validate and parse environment variables. Fails fast with a readable report
 * so misconfiguration is caught at startup rather than on the first request.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    console.error("Invalid environment configuration:\n" + z.prettifyError(result.error));
    throw new Error("Invalid environment configuration");
  }
  return result.data;
}

export const env = loadEnv();
