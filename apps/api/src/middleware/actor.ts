import type { MiddlewareHandler } from "hono";
import type { Actor, AppEnv } from "../types.js";

/**
 * Resolves the acting user for the request. V0 has no identity provider, so a
 * single development actor is used; swap the resolver for Clerk/OIDC later.
 */
export function actorMiddleware(resolve: () => Actor): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set("actor", resolve());
    await next();
  };
}
