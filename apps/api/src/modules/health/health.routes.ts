import type { HealthResponse } from "@contextos/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../../db/index.js";
import { logger } from "../../lib/logger.js";
import type { AppEnv } from "../../types.js";

export interface HealthRoutesDeps {
  db: Db;
  version: string;
}

export function createHealthRoutes({ db, version }: HealthRoutesDeps) {
  const base = (checks: HealthResponse["checks"]): HealthResponse => ({
    status: Object.values(checks).every((check) => check === "ok") ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    version,
    checks,
  });

  return (
    new Hono<AppEnv>()
      // Liveness: the process is up.
      .get("/", (c) => c.json(base({})))
      // Readiness: the process can serve traffic (dependencies reachable).
      .get("/ready", (c) => {
        let database: "ok" | "error" = "ok";
        try {
          db.run(sql`select 1`);
        } catch (error) {
          logger.error({ err: error }, "Database readiness check failed");
          database = "error";
        }
        const body = base({ database });
        return c.json(body, body.status === "ok" ? 200 : 503);
      })
  );
}
