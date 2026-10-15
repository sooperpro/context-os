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

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

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
    /** Background jobs run at once (Drive downloads, AI processing). */
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),

    /** Default workspace for the explicit local-only development actor. */
    WORKSPACE_NAME: z.string().min(1).default("Default workspace"),
    DEV_ACTOR_ID: z.string().min(1).default("dev-user"),
    DEV_ACTOR_NAME: z.string().min(1).default("Developer"),
    /** `accounts`: real sign-in (magic link, Google, Microsoft, company SSO) with our own sessions. */
    AUTH_MODE: z.enum(["development", "accounts"]).default("development"),
    /** Signs session cookies and verification tokens. At least 32 random characters. */
    AUTH_SECRET: z.string().min(32).optional(),
    /**
     * Public origin people open the app at (the web origin; `/api` is proxied on it). Sign-in links
     * and OAuth/SSO callbacks are built from it. Defaults to the first CORS origin.
     */
    AUTH_URL: z.url().optional(),
    /** Sign in with Microsoft (Entra ID). Tenant `common` accepts work and personal accounts. */
    MICROSOFT_CLIENT_ID: z.string().optional(),
    MICROSOFT_CLIENT_SECRET: z.string().optional(),
    MICROSOFT_TENANT_ID: z.string().min(1).default("common"),
    /** Outgoing email (sign-in links, invitations), e.g. `smtps://user:pass@smtp.example.com:465`. */
    SMTP_URL: z.url().optional(),
    EMAIL_FROM: z.string().min(3).default("ContextOS <no-reply@localhost>"),
    /** Google OAuth client: Drive connector, and "Continue with Google" sign-in. */
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z
      .url()
      .default("http://localhost:3000/api/v1/connectors/google-drive/callback"),
    CONNECTOR_TOKEN_ENCRYPTION_KEY: z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/)
      .optional(),
    MAX_DOCUMENT_BYTES: z.coerce.number().int().positive().max(200_000_000).default(50_000_000),
    /**
     * Text kept per document (~1,000 pages). Longer documents keep this much, marked truncated;
     * all of it is searchable in chat.
     */
    MAX_SOURCE_TEXT_CHARS: z.coerce.number().int().positive().default(2_000_000),
    /** Parsing a PDF or Word file runs in a worker thread with these limits. */
    DOCUMENT_PARSE_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
    DOCUMENT_PARSE_MEMORY_MB: z.coerce.number().int().min(64).default(512),
    /** Files one Drive folder or shared drive may sync; more are reported, not imported. */
    DRIVE_MAX_FILES_PER_SCOPE: z.coerce.number().int().positive().default(20_000),
    /** Sections of ~120k characters the AI reads per document for the Knowledge Hub. */
    EXTRACTION_MAX_WINDOWS: z.coerce.number().int().min(1).max(20).default(4),
    /** Webhook receivers verify provider signatures with these secrets (503 when unset). */
    SLACK_SIGNING_SECRET: z.string().optional(),
    GITHUB_WEBHOOK_SECRET: z.string().optional(),
    JIRA_WEBHOOK_SECRET: z.string().optional(),
    GOOGLE_WEBHOOK_TOKEN: z.string().optional(),
    /** Interval for background maintenance sweeps (bounty expiry, nudges, purges). */
    MAINTENANCE_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    /** Max requests per window per client. 0 disables rate limiting. */
    RATE_LIMIT_MAX: z.coerce.number().int().min(0).default(120),

    /** Trust X-Forwarded-For (only enable behind a reverse proxy you control). */
    TRUST_PROXY: booleanString.default(false),

    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  })
  .superRefine((value, ctx) => {
    if (
      value.CORS_ORIGINS.length === 0 ||
      value.CORS_ORIGINS.some((origin) => {
        try {
          const url = new URL(origin);
          return !["http:", "https:"].includes(url.protocol) || url.origin !== origin;
        } catch {
          return true;
        }
      })
    )
      ctx.addIssue({
        code: "custom",
        path: ["CORS_ORIGINS"],
        message: "At least one exact HTTP(S) browser origin is required",
      });
    if (value.NODE_ENV === "production" && value.AUTH_MODE !== "accounts") {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_MODE"],
        message: "Production requires AUTH_MODE=accounts",
      });
    }
    if (value.AUTH_MODE === "accounts" && !value.AUTH_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_SECRET"],
        message: "AUTH_SECRET (32+ random characters) is required for sign-in",
      });
    }
    if (value.NODE_ENV === "production" && value.AUTH_MODE === "accounts" && !value.SMTP_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_URL"],
        message: "Production sign-in sends email: SMTP_URL is required",
      });
    }
    if (
      value.NODE_ENV === "production" &&
      value.CORS_ORIGINS.some((origin) => !origin.startsWith("https://"))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["CORS_ORIGINS"],
        message: "Production browser origins must use HTTPS",
      });
    }
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
