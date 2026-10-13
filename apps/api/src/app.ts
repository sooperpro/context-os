import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import type { Env } from "./config/env.js";
import type { Container } from "./container.js";
import { PayloadTooLargeError } from "./lib/errors.js";
import { actorMiddleware } from "./middleware/actor.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { projectScope } from "./middleware/project-scope.js";
import { apiRateLimiter } from "./middleware/rate-limit.js";
import { requestLogger } from "./middleware/request-logger.js";
import { createAskRoutes, createQuestionRoutes } from "./modules/ask/ask.routes.js";
import { createContextRoutes } from "./modules/context/context.routes.js";
import { createFeedbackRoutes } from "./modules/feedback/feedback.routes.js";
import { createHealthRoutes } from "./modules/health/health.routes.js";
import { createHubRoutes } from "./modules/hub/hub.routes.js";
import { createJobRoutes } from "./modules/jobs/jobs.routes.js";
import { createProjectRoutes, createProjectsRoutes } from "./modules/projects/projects.routes.js";
import { createSourceRoutes } from "./modules/sources/sources.routes.js";
import type { AppEnv, ProjectEnv } from "./types.js";

export interface AppDeps {
  env: Env;
  container: Container;
  version?: string;
}

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MiB (sources are capped at 200k chars)
const REQUEST_TIMEOUT_MS = 90_000; // Ask calls the model synchronously

/**
 * Build the Hono application with all middleware and routes wired to the
 * container. Pure function of its inputs so tests can construct an app with
 * an in-memory database and a fake Gemini client.
 */
export function createApp({ env, container, version = "0.1.0" }: AppDeps) {
  const app = new Hono<AppEnv>();
  const { services, repos } = container;

  // ----- global middleware -----
  app.use(requestId());
  app.use(requestLogger());
  app.use(secureHeaders());

  // ----- API-scoped middleware -----
  app.use(
    "/api/*",
    cors({
      origin: env.CORS_ORIGINS,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      exposeHeaders: ["X-Request-Id", "RateLimit", "RateLimit-Policy"],
      maxAge: 600,
    }),
  );
  app.use("/api/*", timeout(REQUEST_TIMEOUT_MS));
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new PayloadTooLargeError(MAX_BODY_BYTES);
      },
    }),
  );
  if (env.RATE_LIMIT_MAX > 0) {
    app.use(
      "/api/*",
      apiRateLimiter({
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        limit: env.RATE_LIMIT_MAX,
        trustProxy: env.TRUST_PROXY,
      }),
    );
  }
  // Identity: single development actor until an identity provider is wired in.
  app.use(
    "/api/*",
    actorMiddleware(() => container.devActor),
  );

  // ----- project-scoped routes: project is loaded + tenant-checked once -----
  const projectRouter = new Hono<ProjectEnv>()
    .use("*", projectScope(repos.projects))
    .route("/", createProjectRoutes(services.projects))
    .route("/hub", createHubRoutes(services.hub))
    .route("/sources", createSourceRoutes(services.sources))
    .route("/context-items", createContextRoutes(services.context))
    .route("/ask", createAskRoutes(services.ask))
    .route("/questions", createQuestionRoutes(services.ask))
    .route("/feedback", createFeedbackRoutes(services.feedback))
    .route("/jobs", createJobRoutes(container.queue, container.audit));

  const routes = app
    .route("/api/v1/health", createHealthRoutes({ db: container.db, version }))
    .route("/api/v1/projects", createProjectsRoutes(services.projects))
    .route("/api/v1/projects/:projectId", projectRouter);

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return routes;
}

/** Type of the composed app, usable with `hono/client` for end-to-end typed RPC. */
export type AppType = ReturnType<typeof createApp>;
