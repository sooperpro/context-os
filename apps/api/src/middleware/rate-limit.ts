import { getConnInfo } from "@hono/node-server/conninfo";
import type { MiddlewareHandler } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { RateLimitedError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

export interface RateLimitOptions {
  windowMs: number;
  limit: number;
  trustProxy: boolean;
}

/**
 * Per-client in-memory rate limiting. For multi-instance deployments swap the
 * default MemoryStore for a shared store (see hono-rate-limiter docs).
 */
export function apiRateLimiter({
  windowMs,
  limit,
  trustProxy,
}: RateLimitOptions): MiddlewareHandler<AppEnv> {
  return rateLimiter<AppEnv>({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    keyGenerator: (c) => {
      if (trustProxy) {
        const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
        if (forwarded) return forwarded;
      }
      try {
        return getConnInfo(c).remote.address ?? "unknown";
      } catch {
        // No underlying socket (e.g. in-process tests via app.request()).
        return "unknown";
      }
    },
    handler: () => {
      throw new RateLimitedError();
    },
  });
}
