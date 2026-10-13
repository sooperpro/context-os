import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { createContainer } from "./container.js";
import { createDb } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { createGeminiClient } from "./lib/gemini.js";
import { logger } from "./lib/logger.js";

const database = createDb(env.DATABASE_URL);
runMigrations(database.db);
logger.info({ databaseUrl: env.DATABASE_URL }, "Database ready");

const gemini = createGeminiClient({
  apiKey: env.GEMINI_API_KEY,
  model: env.GEMINI_MODEL,
  embeddingModel: env.GEMINI_EMBEDDING_MODEL,
  embeddingDimensions: env.GEMINI_EMBEDDING_DIMENSIONS,
  logger,
});

const container = createContainer({ env, db: database.db, gemini, logger });
const app = createApp({ env, container });

if (env.WORKER_ENABLED) {
  container.worker.start();
  logger.info({ pollIntervalMs: env.WORKER_POLL_INTERVAL_MS }, "Job worker started");
}

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
  logger.info(
    {
      host: info.address,
      port: info.port,
      env: env.NODE_ENV,
      model: env.GEMINI_MODEL,
      embeddingModel: env.GEMINI_EMBEDDING_MODEL,
      workspace: container.workspace.name,
    },
    `API listening on http://${info.address}:${info.port}`,
  );
});

// ----- graceful shutdown -----
let shuttingDown = false;

function shutdown(reason: string, exitCode = 0): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason }, "Shutting down");

  const forceExit = setTimeout(() => {
    logger.error("Shutdown timed out, forcing exit");
    process.exit(1);
  }, env.SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  void container.worker.stop().finally(() => {
    server.close((error) => {
      try {
        database.close();
      } catch (closeError) {
        logger.error({ err: closeError }, "Error closing database");
      }
      if (error) {
        logger.error({ err: error }, "Error closing HTTP server");
        process.exit(1);
      }
      logger.info("Shutdown complete");
      process.exit(exitCode);
    });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  shutdown("unhandledRejection", 1);
});
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  shutdown("uncaughtException", 1);
});
