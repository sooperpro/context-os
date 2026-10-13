import type { MiddlewareHandler } from "hono";
import { logger } from "../lib/logger.js";
import type { AppEnv } from "../types.js";

/** Structured one-line-per-request logging with timing and request id. */
export function requestLogger(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const startedAt = performance.now();
    await next();
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const status = c.res.status;
    const entry = {
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs,
    };
    if (status >= 500) logger.error(entry, "request failed");
    else if (status >= 400) logger.warn(entry, "request rejected");
    else logger.info(entry, "request");
  };
}
