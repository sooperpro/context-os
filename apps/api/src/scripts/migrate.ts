import { env } from "../config/env.js";
import { createDb } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../lib/logger.js";

const handle = createDb(env.DATABASE_URL);
try {
  runMigrations(handle.db);
  logger.info({ databaseUrl: env.DATABASE_URL }, "Migrations applied");
} finally {
  handle.close();
}
