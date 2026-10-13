import { pino, type Logger } from "pino";
import { env } from "../config/env.js";

export type { Logger };

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "contextos-api" },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "*.apiKey", "*.GEMINI_API_KEY"],
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
