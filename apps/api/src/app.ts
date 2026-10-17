import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import type { Env } from "./config/env.js";
import type { Container } from "./container.js";
import { AppError, NotFoundError, PayloadTooLargeError } from "./lib/errors.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { projectScope } from "./middleware/project-scope.js";
import { apiRateLimiter } from "./middleware/rate-limit.js";
import { requestLogger } from "./middleware/request-logger.js";
import { createAskRoutes, createQuestionRoutes } from "./modules/ask/ask.routes.js";
import { AUTH_BASE_PATH } from "./modules/auth/auth.js";
import { createSessionRoutes } from "./modules/auth/session.routes.js";
import { createSsoRoutes } from "./modules/auth/sso.routes.js";
import { createAssistantRoutes } from "./modules/ask/assistant.routes.js";
import { createKnowledgeGapRoutes } from "./modules/ask/knowledge-gaps.js";
import { createOrgContext } from "./modules/ask/org-context.js";
import { createSkillRoutes } from "./modules/identity/skills.js";
import { createDirectMessageRoutes } from "./modules/platform/direct-messages.routes.js";
import { createMessageRoutes } from "./modules/ask/messages.routes.js";
import { createThreadRoutes } from "./modules/ask/threads.routes.js";
import { createAdminConnectorRoutes } from "./modules/connectors/admin-connectors.routes.js";
import { createConnectorRoutes } from "./modules/connectors/connectors.routes.js";
import { createGoogleDriveService } from "./modules/connectors/google-drive.js";
import { createWebhookRoutes } from "./modules/connectors/webhooks.routes.js";
import {
  createCanonicalSourceRoutes,
  createConflictRoutes,
} from "./modules/context/conflicts.routes.js";
import { createContextRoutes } from "./modules/context/context.routes.js";
import { createEvidenceRoutes } from "./modules/context/evidence.routes.js";
import { createFeedbackRoutes } from "./modules/feedback/feedback.routes.js";
import { createHealthRoutes } from "./modules/health/health.routes.js";
import {
  createHealthScoreRoutes,
  createHubRoutes,
  createSectionRoutes,
} from "./modules/hub/hub.routes.js";
import { createIdentityLinkRoutes } from "./modules/identity/identity-links.routes.js";
import { createIdentityRoutes } from "./modules/identity/identity.routes.js";
import { createJobRoutes } from "./modules/jobs/jobs.routes.js";
import { createAdminOverviewRoutes } from "./modules/platform/admin-overview.routes.js";
import { createAccessPolicyRoutes } from "./modules/platform/access-policies.routes.js";
import { createAdminRoutes } from "./modules/platform/admin.routes.js";
import { createAnalyticsRoutes } from "./modules/platform/analytics.routes.js";
import { createBountyRoutes } from "./modules/platform/bounties.routes.js";
import { createCompanionRoutes } from "./modules/platform/companion.routes.js";
import { createEpmRoutes } from "./modules/platform/epm.routes.js";
import { createGamificationRoutes } from "./modules/platform/gamification.routes.js";
import { createKnowledgeRoutes } from "./modules/platform/knowledge.routes.js";
import { createLearningRoutes } from "./modules/platform/learning.routes.js";
import { createMemberAdminRoutes } from "./modules/platform/members-admin.routes.js";
import { createPeopleOpsRoutes } from "./modules/platform/people-ops.routes.js";
import { createRoadmapGeneration } from "./modules/platform/roadmap-generation.routes.js";
import { createSetupTemplates } from "./modules/platform/setup-templates.js";
import { createLearnerRoutes } from "./modules/learning/learner.routes.js";
import { createTutorialRoutes } from "./modules/learning/tutorials.routes.js";
import { createManagerRoutes } from "./modules/platform/manager.routes.js";
import { createEmployeeRoutes } from "./modules/platform/employee.routes.js";
import { createTeamRoutes } from "./modules/platform/team.routes.js";
import { createOnboardingRoutes } from "./modules/platform/onboarding.routes.js";
import { createRewardRoutes } from "./modules/platform/rewards.routes.js";
import { createSavedRoutes } from "./modules/platform/saved.routes.js";
import { createProjectRoutes, createProjectsRoutes } from "./modules/projects/projects.routes.js";
import { createSearchRoutes } from "./modules/search/search.routes.js";
import { createSourceRoutes } from "./modules/sources/sources.routes.js";
import { createWorkspaceRoutes } from "./modules/workspace/workspace.routes.js";
import type { AppEnv, ProjectEnv } from "./types.js";

export interface AppDeps {
  env: Env;
  container: Container;
  version?: string;
}

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MiB (sources are capped at 200k chars)
const REQUEST_TIMEOUT_MS = 90_000; // Ask calls the model synchronously
/** Routes served without a signed-in actor. */
const PUBLIC_PATHS = [
  "/api/v1/health",
  "/api/v1/health/ready",
  "/api/v1/auth-options",
  "/api/v1/connectors/google-drive/callback",
];
const PUBLIC_PREFIXES = ["/api/v1/webhooks/", `${AUTH_BASE_PATH}/`];
/** Better Auth SSO endpoints that manage providers; sign-in, callbacks and SAML metadata stay open. */
const SSO_MANAGEMENT = new Set([
  "/sso/register",
  "/sso/update-provider",
  "/sso/delete-provider",
  "/sso/get-provider",
  "/sso/providers",
  "/sso/request-domain-verification",
  "/sso/verify-domain",
]);
/** Signed-in routes that work before a workspace is chosen: the session itself, creating one. */
const workspaceOptional = (method: string, path: string) =>
  path === "/api/v1/session" ||
  path.startsWith("/api/v1/session/") ||
  (method === "POST" && path === "/api/v1/workspaces");

/**
 * Build the Hono application with all middleware and routes wired to the
 * container. Pure function of its inputs so tests can construct an app with
 * an in-memory database and a fake Gemini client.
 */
export function createApp({ env, container, version = "0.1.0" }: AppDeps) {
  const app = new Hono<AppEnv>();
  const { services, repos } = container;
  const drive = createGoogleDriveService(container);
  container.connectors.sync = (job) => drive.syncScope(job);
  container.connectors.importFile = (job) => drive.importListedFile(job);
  container.connectors.refreshAccess = (job) => drive.refreshScopeAccess(job);
  const tutorials = createTutorialRoutes(container);
  container.connectors.generateTutorial = (job) => tutorials.generate(job);
  const roadmaps = createRoadmapGeneration(container, tutorials);
  container.connectors.generateTemplate = (job) => roadmaps.generate(job);
  container.connectors.templateForRole = (actor, person, options) =>
    roadmaps.templateFor(actor, person, options);
  container.connectors.hubChanged = (projectId) => tutorials.hubChanged(projectId);
  container.connectors.publishModules = (actor, ids) => tutorials.publishModules(actor, ids);

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
  // Cross-site request forgery: the session is a cookie, so a write must come from the app itself.
  // Browsers send `Origin` (and `Sec-Fetch-Site`) with every write; requests from other sites are
  // refused even when the cookie would be sent (sibling subdomains are "same-site"). Clients that
  // aren't browsers send neither and still need a valid session. Webhooks verify signatures instead,
  // and sign-in routes are checked by Better Auth (a SAML IdP posts back from its own site).
  const trustedOrigins = new Set([
    ...env.CORS_ORIGINS,
    ...(env.AUTH_URL ? [new URL(env.AUTH_URL).origin] : []),
  ]);
  app.use("/api/*", async (c, next) => {
    if (
      ["GET", "HEAD", "OPTIONS"].includes(c.req.method) ||
      c.req.path.startsWith("/api/v1/webhooks/") ||
      c.req.path.startsWith(`${AUTH_BASE_PATH}/`)
    )
      return next();
    const origin = c.req.header("origin");
    const fetchSite = c.req.header("sec-fetch-site");
    if ((origin && !trustedOrigins.has(origin)) || (!origin && fetchSite === "cross-site"))
      throw new AppError(403, "FORBIDDEN", "This request didn't come from ContextOS");
    return next();
  });
  // Sign-in, callbacks and sign-out (magic link, Google, Microsoft, company SSO).
  const auth = container.identity.auth;
  if (auth)
    app.on(["GET", "POST"], `${AUTH_BASE_PATH}/*`, (c) => {
      // The SSO plugin's provider management is only reached through the admin routes
      // (`/admin/sso/*`, owners and admins), never directly: over HTTP it would let any session
      // register, repoint or delete a workspace's identity provider.
      if (SSO_MANAGEMENT.has(c.req.path.slice(AUTH_BASE_PATH.length)))
        throw new NotFoundError("Route");
      return auth.handler(c.req.raw);
    });
  // Session-authenticated identity, or the explicit local-only development actor.
  app.use("/api/*", async (c, next) => {
    const path = c.req.path;
    if (PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix)))
      return next();
    // Who may read which Drive file is worked out by background jobs: requests never call Google.
    const actor = await container.identity.authenticate(
      c.req.raw,
      workspaceOptional(c.req.method, path),
    );
    c.set("actor", actor);
    return next();
  });

  // ----- project-scoped routes: project is loaded + tenant-checked once (UUID or slug) -----
  const projectRouter = new Hono<ProjectEnv>()
    .use("*", projectScope(repos.projects, container.identity))
    .route("/", createProjectRoutes(services.projects))
    .route("/hub", createHubRoutes(services.hub))
    .route("/sections", createSectionRoutes(services.hub))
    .route("/health", createHealthScoreRoutes(services.hub))
    .route("/sources", createSourceRoutes(services.sources, container.identity))
    .route("/context-items", createContextRoutes(services.context))
    .route("/conflicts", createConflictRoutes(container))
    .route("/canonical-sources", createCanonicalSourceRoutes(container))
    .route("/ask", createAskRoutes(services.ask, createOrgContext(container)))
    .route("/questions", createQuestionRoutes(services.ask))
    .route("/feedback", createFeedbackRoutes(services.feedback))
    .route(
      "/jobs",
      createJobRoutes(container.queue, container.audit, container.identity, repos.sources),
    );

  const routes = app
    .route("/api/v1", createWebhookRoutes(container))
    .route("/api/v1", createSessionRoutes(container))
    .route("/api/v1", createSsoRoutes(container))
    .route("/api/v1", createWorkspaceRoutes(container))
    .route("/api/v1", createIdentityRoutes(container))
    .route("/api/v1", createIdentityLinkRoutes(container, drive))
    .route("/api/v1", createThreadRoutes(container))
    .route("/api/v1", createMessageRoutes(container))
    .route("/api/v1", createAssistantRoutes(container))
    .route("/api/v1", createKnowledgeGapRoutes(container))
    .route("/api/v1", createSkillRoutes(container))
    .route("/api/v1", createDirectMessageRoutes(container))
    .route("/api/v1", createKnowledgeRoutes(container))
    .route("/api/v1", createBountyRoutes(container))
    .route("/api/v1", createLearningRoutes(container))
    .route("/api/v1", createCompanionRoutes(container))
    .route("/api/v1", createGamificationRoutes(container))
    .route("/api/v1", createRewardRoutes(container))
    .route("/api/v1", createEpmRoutes(container))
    .route("/api/v1", createConnectorRoutes(drive, env.CORS_ORIGINS[0]!))
    .route("/api/v1", createOnboardingRoutes(container))
    .route("/api/v1", createSearchRoutes(container))
    .route("/api/v1", createEvidenceRoutes(container))
    .route("/api/v1", createAnalyticsRoutes(container))
    .route("/api/v1", createAdminRoutes(container))
    .route("/api/v1", createAdminOverviewRoutes(container))
    .route("/api/v1", createAdminConnectorRoutes(container, drive))
    .route("/api/v1", createSavedRoutes(container))
    .route("/api/v1", createAccessPolicyRoutes(container))
    .route("/api/v1", createMemberAdminRoutes(container))
    .route("/api/v1", createPeopleOpsRoutes(container))
    .route("/api/v1", createTeamRoutes(container))
    .route("/api/v1", createManagerRoutes(container))
    .route("/api/v1", createEmployeeRoutes(container))
    .route("/api/v1", tutorials.routes)
    .route("/api/v1", roadmaps.routes)
    .route("/api/v1", createSetupTemplates(container).routes)
    .route("/api/v1", createLearnerRoutes(container))
    .route("/api/v1/health", createHealthRoutes({ db: container.db, version }))
    .route("/api/v1/projects", createProjectsRoutes(services.projects))
    .route("/api/v1/projects/:projectId", projectRouter);

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return routes;
}

/** Type of the composed app, usable with `hono/client` for end-to-end typed RPC. */
export type AppType = ReturnType<typeof createApp>;
