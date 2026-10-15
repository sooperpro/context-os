import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { magicLink } from "better-auth/plugins";
import { and, eq, ne, sql } from "drizzle-orm";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/index.js";
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  memberships,
  ssoProviders,
  users,
} from "../../db/schema.js";
import type { Logger } from "../../lib/logger.js";
import { linkEmail, type Mail, type Mailer } from "../../lib/mailer.js";

/** Better Auth serves sign-in under this path on the API (`/api` is same-origin with the web app). */
export const AUTH_BASE_PATH = "/api/v1/auth";
const MAGIC_LINK_MINUTES = 15;
const PASSWORD_RESET_MINUTES = 60;
const CONFIRM_EMAIL_HOURS = 24;
/**
 * Sign-in emails per address in a rolling window. Requests beyond it succeed (nothing reveals whether
 * an address exists) but send nothing, so nobody can flood an inbox, from however many IPs.
 */
const EMAILS_PER_ADDRESS = 3;
const EMAIL_WINDOW_MS = 15 * 60_000;

/** How a session signed in, from the endpoint that created it. */
function authMethodFor(
  context: { path?: string; params?: Record<string, string | undefined> } | null,
): string | null {
  const path = context?.path ?? "";
  if (path.startsWith("/magic-link")) return "magic-link";
  // Signing in with a password, or the first sign-in from the confirmation email after signing up.
  if (path === "/sign-in/email" || path === "/verify-email") return "password";
  if (path.startsWith("/sso/")) {
    const providerId = context?.params?.providerId;
    return providerId ? `sso:${providerId}` : null;
  }
  if (path.startsWith("/callback/")) {
    const provider = context?.params?.id;
    return provider ? `social:${provider}` : null;
  }
  return null;
}

/** The public origin people open the app at; sign-in links and callbacks are built from it. */
export function publicOrigin(env: Env): string {
  return new URL(env.AUTH_URL ?? env.CORS_ORIGINS[0]!).origin;
}

/**
 * Sign-in for `AUTH_MODE=accounts`: email magic links, Google, Microsoft and company SSO (OIDC or
 * SAML), with sessions in our database behind an HttpOnly cookie. Identity lives here; workspaces,
 * memberships, roles and invitations stay in the application tables, which remain the source of truth
 * for what someone may do.
 */
export function createAuth({
  env,
  db,
  mailer,
  logger,
}: {
  env: Env;
  db: Db;
  mailer: Mailer;
  logger: Logger;
}) {
  const origin = publicOrigin(env);
  const sentTo = new Map<string, number[]>();
  /** Whether another sign-in email may go to this address now (and records it if so). */
  const mayEmail = (address: string) => {
    const now = Date.now();
    if (sentTo.size > 10_000)
      for (const [key, times] of sentTo)
        if (times.every((at) => now - at >= EMAIL_WINDOW_MS)) sentTo.delete(key);
    const recent = (sentTo.get(address) ?? []).filter((at) => now - at < EMAIL_WINDOW_MS);
    if (recent.length >= EMAILS_PER_ADDRESS) {
      sentTo.set(address, recent);
      return false;
    }
    sentTo.set(address, [...recent, now]);
    return true;
  };
  /** Sends a sign-in email (link, confirmation, reset) unless the address had too many lately. */
  const sendAuthEmail = async (mail: Mail) => {
    if (!mayEmail(mail.to.toLowerCase())) {
      logger.warn({ to: mail.to }, "Sign-in email not sent: too many requested for this address");
      return;
    }
    await mailer.send(mail);
  };
  /**
   * The profile someone already has from before these accounts existed (a Clerk-era member, someone
   * added from a directory) with this email and no sign-in account yet: the workspace's own member,
   * if more than one.
   */
  const existingProfileFor = (email: string) => {
    const candidates = db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
      .all()
      .filter(
        ({ id }) =>
          !db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.id, id)).get(),
      );
    return (
      candidates.find(
        ({ id }) =>
          !!db
            .select({ userId: memberships.userId })
            .from(memberships)
            .where(eq(memberships.userId, id))
            .get(),
      ) ?? candidates[0]
    )?.id;
  };
  /**
   * Someone from before these accounts asks to reset a password they never had: give their existing
   * profile an unconfirmed sign-in identity so the reset email reaches them (the reset confirms it).
   */
  const provisionExistingProfile = (email: string) => {
    const address = email.trim().toLowerCase();
    if (db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, address)).get())
      return;
    const id = existingProfileFor(address);
    if (!id) return;
    const profile = db.select({ name: users.name }).from(users).where(eq(users.id, id)).get();
    db.insert(authUsers)
      .values({ id, name: profile?.name ?? address, email: address, emailVerified: false })
      .onConflictDoNothing()
      .run();
  };
  const socialProviders = {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            prompt: "select_account" as const,
          },
        }
      : {}),
    ...(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
      ? {
          microsoft: {
            clientId: env.MICROSOFT_CLIENT_ID,
            clientSecret: env.MICROSOFT_CLIENT_SECRET,
            tenantId: env.MICROSOFT_TENANT_ID,
            prompt: "select_account" as const,
          },
        }
      : {}),
  };

  return betterAuth({
    appName: "ContextOS",
    secret: env.AUTH_SECRET,
    baseURL: origin,
    basePath: AUTH_BASE_PATH,
    trustedOrigins: [...new Set([origin, ...env.CORS_ORIGINS])],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
        ssoProvider: ssoProviders,
      },
    }),
    telemetry: { enabled: false },
    // Per IP (Better Auth only enables this in production by default): sign-in endpoints are the
    // ones worth abusing, so they get tighter limits than the rest.
    rateLimit: {
      enabled: env.NODE_ENV !== "test",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/magic-link": { window: 60, max: 5 },
        "/sign-in/sso": { window: 60, max: 10 },
        "/sign-in/social": { window: 60, max: 10 },
        "/magic-link/verify": { window: 60, max: 20 },
        "/sign-up/email": { window: 60, max: 5 },
        "/sign-in/email": { window: 60, max: 10 },
        "/request-password-reset": { window: 60, max: 5 },
        "/reset-password": { window: 60, max: 10 },
        "/send-verification-email": { window: 60, max: 5 },
      },
    },
    advanced: { cookiePrefix: "contextos" },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      additionalFields: {
        activeWorkspaceId: { type: "string", required: false, input: false },
        authMethod: { type: "string", required: false, input: false },
      },
    },
    user: { changeEmail: { enabled: false } },
    emailAndPassword: {
      enabled: true,
      // Nobody signs in with a password until the confirmation email is opened, so an address
      // someone else typed never becomes their account.
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_MINUTES * 60,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        await sendAuthEmail(
          linkEmail({
            to: user.email,
            subject: "Reset your ContextOS password",
            intro: "Use this link to choose a new password for ContextOS.",
            action: "Choose a new password",
            url,
            outro: `The link works once and expires in ${PASSWORD_RESET_MINUTES} minutes. If you didn't ask for it, ignore this email: your password stays the same.`,
          }),
        );
      },
      onPasswordReset({ user }) {
        // The reset link proved the mailbox. An account that wasn't confirmed keeps nothing it
        // gained before that proof (another provider's link, sessions), then counts as confirmed.
        if (!user.emailVerified)
          db.transaction((tx) => {
            tx.delete(authAccounts)
              .where(
                and(eq(authAccounts.userId, user.id), ne(authAccounts.providerId, "credential")),
              )
              .run();
            tx.delete(authSessions).where(eq(authSessions.userId, user.id)).run();
            tx.update(authUsers)
              .set({ emailVerified: true })
              .where(eq(authUsers.id, user.id))
              .run();
          });
        return Promise.resolve();
      },
      async onExistingUserSignUp({ user }) {
        // The sign-up form answers the same either way (nothing reveals which emails have accounts);
        // the owner of the address learns how to get in.
        await sendAuthEmail(
          linkEmail({
            to: user.email,
            subject: "You already have a ContextOS account",
            intro:
              "Someone, probably you, tried to create a ContextOS account with this email. You already have one.",
            action: "Sign in",
            url: `${origin}/`,
            outro:
              "Sign in with an email link, Google, or your password. Forgot it? Choose “Forgot password?” on the sign-in page. If this wasn't you, ignore this email.",
          }),
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // Signing in with the right password before confirming sends the email again.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: CONFIRM_EMAIL_HOURS * 3600,
      async sendVerificationEmail({ user, url }) {
        await sendAuthEmail(
          linkEmail({
            to: user.email,
            subject: "Confirm your email for ContextOS",
            intro: "Confirm this email address to finish creating your ContextOS account.",
            action: "Confirm email",
            url,
            outro: `The link expires in ${CONFIRM_EMAIL_HOURS} hours. If you didn't create a ContextOS account, ignore this email and the account stays inactive.`,
          }),
        );
      },
    },
    hooks: {
      before: createAuthMiddleware((ctx) => {
        const body = ctx.body as { email?: unknown } | undefined;
        if (ctx.path === "/request-password-reset" && typeof body?.email === "string")
          provisionExistingProfile(body.email);
        return Promise.resolve();
      }),
    },
    socialProviders,
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_MINUTES * 60,
        storeToken: "hashed",
        async sendMagicLink({ email, url }) {
          await sendAuthEmail(
            linkEmail({
              to: email,
              subject: "Your ContextOS sign-in link",
              intro: "Use this link to sign in to ContextOS.",
              action: "Sign in",
              url,
              outro: `The link works once and expires in ${MAGIC_LINK_MINUTES} minutes. If you didn't ask for it, ignore this email.`,
            }),
          );
        },
      }),
      sso({
        // A provider signs people in only after its workspace proves it owns the email domain.
        domainVerification: { enabled: true },
        // Providers are managed through the workspace admin routes, never by end users directly.
        providersLimit: 100,
        // An IdP may only sign in addresses on the domain its workspace verified: otherwise it could
        // claim someone else's email and own that account.
        resolveUser({ providerId, providerUser }) {
          const provider = db
            .select({ domain: ssoProviders.domain })
            .from(ssoProviders)
            .where(eq(ssoProviders.providerId, providerId))
            .get();
          const emailDomain = providerUser.email.toLowerCase().split("@").pop() ?? "";
          const allowed = (provider?.domain ?? "")
            .split(",")
            .map((domain) => domain.trim().toLowerCase())
            .filter(Boolean);
          return allowed.includes(emailDomain)
            ? { action: "continue" }
            : {
                action: "reject",
                code: "EMAIL_DOMAIN_MISMATCH",
                message: "This account's email is not on the workspace's verified domain",
              };
        },
        provisionUserOnEveryLogin: true,
        provisionUser({ user, provider }) {
          // Just-in-time membership: someone from the verified domain joins the provider's workspace.
          const workspaceId = provider.organizationId;
          if (!workspaceId) return;
          db.insert(memberships)
            .values({ workspaceId, userId: user.id, role: "member" })
            .onConflictDoNothing()
            .run();
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          // People who used ContextOS before keep their profile, workspaces and history: their
          // first sign-in takes over their existing id. Only for a proven address (email link,
          // Google) or a password sign-up, which can't sign in until its confirmation email is
          // opened. A provider that doesn't verify emails could otherwise claim anyone's account.
          before(user, context) {
            const proven = user.emailVerified || context?.path === "/sign-up/email";
            const existing = proven ? existingProfileFor(user.email) : undefined;
            return Promise.resolve(existing ? { data: { ...user, id: existing } } : undefined);
          },
          // The application profile shares the sign-in id; people migrated from earlier keep theirs.
          after(user) {
            db.insert(users)
              .values({ id: user.id, name: user.name || user.email, email: user.email })
              .onConflictDoNothing()
              .run();
            return Promise.resolve();
          },
        },
        update: {
          after(user) {
            db.update(users)
              .set({ name: user.name || user.email, email: user.email })
              .where(eq(users.id, user.id))
              .run();
            return Promise.resolve();
          },
        },
      },
      session: {
        create: {
          before(session, context) {
            return Promise.resolve({ data: { ...session, authMethod: authMethodFor(context) } });
          },
        },
      },
    },
    logger: {
      log(level, message, ...args) {
        if (level === "error") logger.error({ args }, `auth: ${message}`);
        else if (level === "warn") logger.warn({ args }, `auth: ${message}`);
        else logger.debug({ args }, `auth: ${message}`);
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
