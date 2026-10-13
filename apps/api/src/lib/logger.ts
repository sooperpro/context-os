import { pino, type Logger } from "pino";
import { env } from "../config/env.js";

export type { Logger };

/** SDK errors can include bearer tokens, OAuth codes, client secrets and request bodies. */
export function serializeSafeError(error: unknown) {
  return { type: error instanceof Error ? error.name : "UnknownError" };
}

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "contextos-api" },
  serializers: { err: serializeSafeError },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.apiKey",
      "*.GEMINI_API_KEY",
      "*.CLERK_SECRET_KEY",
      "*.GOOGLE_CLIENT_SECRET",
      "*.CONNECTOR_TOKEN_ENCRYPTION_KEY",
      "*.access_token",
      "*.refresh_token",
      "*.id_token",
      "*.client_secret",
      "*.credentials",
    ],
    censor: "[REDACTED]",
  },
  ...(env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname" },
        },
      }
    : {}),
});
