import {
  SelectWorkspaceSchema,
  type AuthOptions,
  type SessionDevice,
  type SessionState,
  type SignInMethod,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gt, ne } from "drizzle-orm";
import { Hono } from "hono";
import type { Container } from "../../container.js";
import { authAccounts, authSessions, users } from "../../db/schema.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { AppEnv } from "../../types.js";

/** `magic-link`, `social:google`, `sso:<providerId>` → the method shown to people. */
function signInMethod(authMethod: string | null | undefined): SignInMethod | null {
  if (!authMethod) return null;
  if (authMethod === "magic-link") return "magic-link";
  if (authMethod === "password") return "password";
  if (authMethod.startsWith("sso:")) return "sso";
  if (authMethod === "social:google") return "google";
  if (authMethod === "social:microsoft") return "microsoft";
  return null;
}

/** Sign-in options, the signed-in session and its workspaces, and where the person is signed in. */
export function createSessionRoutes(container: Container) {
  const { db, env, identity, devActor } = container;
  const auth = identity.auth;

  /** The verified session, or 401. Only called in `accounts` mode. */
  const requireSession = async (request: Request) => {
    const result = await identity.readSession(request);
    if (!result) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue");
    return result;
  };

  const developmentState = (): SessionState => {
    const user = db.select().from(users).where(eq(users.id, devActor.id)).get();
    return {
      authentication: "development",
      user: {
        id: devActor.id,
        name: user?.name ?? devActor.name,
        email: user?.email ?? null,
        image: null,
      },
      signInMethod: "development",
      linkedMethods: [],
      activeWorkspaceId: devActor.workspaceId,
      workspaces: identity
        .workspacesFor(devActor.id)
        .map((workspace) => ({ ...workspace, ssoRequired: false })),
    };
  };

  const sessionState = async (request: Request): Promise<SessionState> => {
    if (!auth) return developmentState();
    const { session, user } = await requireSession(request);
    if (user.emailVerified) identity.acceptInvitations(user.id, user.email);
    const workspaces = identity.workspacesFor(user.id).map((workspace) => ({
      ...workspace,
      ssoRequired: !identity.ssoSatisfied(workspace.id, workspace.role, session.authMethod),
    }));
    // Keep the chosen workspace while it is still open to them; with exactly one, choose it.
    let activeWorkspaceId = workspaces.some((entry) => entry.id === session.activeWorkspaceId)
      ? (session.activeWorkspaceId ?? null)
      : null;
    if (!activeWorkspaceId && workspaces.length === 1) activeWorkspaceId = workspaces[0]!.id;
    if (activeWorkspaceId !== (session.activeWorkspaceId ?? null))
      identity.setActiveWorkspace(session.id, activeWorkspaceId);
    const providers = db
      .select({ providerId: authAccounts.providerId })
      .from(authAccounts)
      .where(eq(authAccounts.userId, user.id))
      .all()
      .map((row) =>
        row.providerId === "google" || row.providerId === "microsoft"
          ? row.providerId
          : row.providerId === "credential"
            ? "password"
            : "sso",
      );
    const profile = db.select().from(users).where(eq(users.id, user.id)).get();
    return {
      authentication: "accounts",
      user: {
        id: user.id,
        name: profile?.name ?? user.name,
        email: user.email,
        image: user.image ?? null,
      },
      signInMethod: signInMethod(session.authMethod),
      linkedMethods: [...new Set(["email", ...providers])],
      activeWorkspaceId,
      workspaces,
    };
  };

  return (
    new Hono<AppEnv>()
      .get("/auth-options", (c) =>
        c.json({
          authentication: env.AUTH_MODE,
          methods: {
            email: !!auth,
            password: !!auth,
            google: !!auth && !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET,
            microsoft: !!auth && !!env.MICROSOFT_CLIENT_ID && !!env.MICROSOFT_CLIENT_SECRET,
            sso: !!auth,
          },
        } satisfies AuthOptions),
      )
      .get("/session", async (c) => c.json(await sessionState(c.req.raw)))
      .put(
        "/session/workspace",
        zValidator("json", SelectWorkspaceSchema, validationHook),
        async (c) => {
          const { workspaceId } = c.req.valid("json");
          if (!auth) {
            if (workspaceId !== devActor.workspaceId) throw new NotFoundError("Workspace");
            return c.json(developmentState());
          }
          const { session, user } = await requireSession(c.req.raw);
          if (!identity.workspacesFor(user.id).some((entry) => entry.id === workspaceId))
            throw new NotFoundError("Workspace");
          identity.setActiveWorkspace(session.id, workspaceId);
          return c.json(await sessionState(c.req.raw));
        },
      )
      .get("/session/devices", async (c) => {
        if (!auth) return c.json({ items: [] });
        const { session, user } = await requireSession(c.req.raw);
        const items: SessionDevice[] = db
          .select()
          .from(authSessions)
          .where(and(eq(authSessions.userId, user.id), gt(authSessions.expiresAt, new Date())))
          .all()
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .map((row) => ({
            id: row.id,
            userAgent: row.userAgent,
            ipAddress: row.ipAddress,
            signInMethod: signInMethod(row.authMethod),
            createdAt: row.createdAt.toISOString(),
            lastActiveAt: row.updatedAt.toISOString(),
            current: row.id === session.id,
          }));
        return c.json({ items });
      })
      // Sign out on every other device. This device signs out through `POST /auth/sign-out`.
      .delete("/session/devices", async (c) => {
        if (!auth) return c.body(null, 204);
        const { session, user } = await requireSession(c.req.raw);
        db.delete(authSessions)
          .where(and(eq(authSessions.userId, user.id), ne(authSessions.id, session.id)))
          .run();
        return c.body(null, 204);
      })
      .delete("/session/devices/:id", async (c) => {
        if (!auth) throw new NotFoundError("Session");
        const { session, user } = await requireSession(c.req.raw);
        const id = c.req.param("id");
        if (id === session.id)
          throw new AppError(409, "CONFLICT", "Sign out of this device with sign out");
        const removed = db
          .delete(authSessions)
          .where(and(eq(authSessions.id, id), eq(authSessions.userId, user.id)))
          .returning({ id: authSessions.id })
          .all();
        if (!removed.length) throw new NotFoundError("Session");
        return c.body(null, 204);
      })
  );
}
