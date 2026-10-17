import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import {
  SsoEnforcementSchema,
  SsoProviderInputSchema,
  type SsoProvider,
  type SsoSettings,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Container } from "../../container.js";
import { authAccounts, ssoProviders, workspaces } from "../../db/schema.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { AppEnv } from "../../types.js";
import { requireRole } from "../identity/identity.service.js";
import { createNotifier } from "../platform/notify.js";
import { AUTH_BASE_PATH, publicOrigin } from "./auth.js";

const VERIFICATION_PREFIX = "contextos-domain-verification=";
const verificationRecord = (domain: string) => `_contextos-verification.${domain}`;

type ProviderRow = typeof ssoProviders.$inferSelect;

/**
 * Company single sign-on for a workspace (owners and admins): connect an OIDC or SAML identity
 * provider, prove the email domain with a DNS TXT record, then optionally require SSO for everyone
 * but owners. People from the verified domain join the workspace as members on first SSO sign-in.
 */
export function createSsoRoutes(container: Container) {
  const { db, env, identity, audit } = container;
  const notifier = createNotifier(db);
  const auth = identity.auth;
  const base = `${publicOrigin(env)}${AUTH_BASE_PATH}`;

  const requireAuth = () => {
    if (!auth)
      throw new AppError(
        503,
        "NOT_CONFIGURED",
        "Single sign-on needs AUTH_MODE=accounts on the API",
      );
    return auth;
  };

  const view = (row: ProviderRow): SsoProvider => {
    const saml = !!row.samlConfig;
    const metadataUrl = `${base}/sso/saml2/sp/metadata?providerId=${encodeURIComponent(row.providerId)}`;
    return {
      providerId: row.providerId,
      type: saml ? "saml" : "oidc",
      domain: row.domain,
      issuer: row.issuer,
      domainVerified: row.domainVerified,
      verification: {
        name: verificationRecord(row.domain),
        value: `${VERIFICATION_PREFIX}${row.verificationToken ?? ""}`,
      },
      serviceProvider: saml
        ? {
            callbackUrl: `${base}/sso/saml2/sp/acs/${row.providerId}`,
            entityId: metadataUrl,
            metadataUrl,
          }
        : {
            callbackUrl: `${base}/sso/callback/${row.providerId}`,
            entityId: null,
            metadataUrl: null,
          },
    };
  };

  const providersOf = (workspaceId: string) =>
    db.select().from(ssoProviders).where(eq(ssoProviders.organizationId, workspaceId)).all();

  const providerOf = (workspaceId: string, providerId: string) => {
    const row = db
      .select()
      .from(ssoProviders)
      .where(
        and(eq(ssoProviders.organizationId, workspaceId), eq(ssoProviders.providerId, providerId)),
      )
      .get();
    if (!row) throw new NotFoundError("SSO provider");
    return row;
  };

  const settings = (workspaceId: string): SsoSettings => ({
    available: !!auth,
    enforced:
      db
        .select({ ssoEnforced: workspaces.ssoEnforced })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .get()?.ssoEnforced ?? false,
    providers: providersOf(workspaceId).map(view),
  });

  const setEnforced = (workspaceId: string, enforced: boolean) =>
    db
      .update(workspaces)
      .set({ ssoEnforced: enforced })
      .where(eq(workspaces.id, workspaceId))
      .run();

  return new Hono<AppEnv>()
    .get("/admin/sso", (c) => {
      const actor = c.get("actor");
      requireRole(actor, "owner", "admin");
      return c.json(settings(actor.workspaceId));
    })
    .post(
      "/admin/sso/providers",
      zValidator("json", SsoProviderInputSchema, validationHook),
      async (c) => {
        const actor = c.get("actor");
        requireRole(actor, "owner", "admin");
        const authApi = requireAuth().api;
        const input = c.req.valid("json");
        if (db.select().from(ssoProviders).where(eq(ssoProviders.domain, input.domain)).get())
          throw new AppError(
            409,
            "CONFLICT",
            "That domain already has a single sign-on connection",
          );
        const workspace = db
          .select({ slug: workspaces.slug })
          .from(workspaces)
          .where(eq(workspaces.id, actor.workspaceId))
          .get();
        const providerId = `${workspace?.slug ?? actor.workspaceId.slice(0, 8)}-${input.type}-${randomBytes(3).toString("hex")}`;
        const spEntityId = `${base}/sso/saml2/sp/metadata?providerId=${encodeURIComponent(providerId)}`;
        try {
          await authApi.registerSSOProvider({
            headers: c.req.raw.headers,
            body:
              input.type === "oidc"
                ? {
                    providerId,
                    domain: input.domain,
                    issuer: input.issuer,
                    oidcConfig: {
                      clientId: input.clientId,
                      clientSecret: input.clientSecret,
                      discoveryEndpoint: `${input.issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`,
                      scopes: ["openid", "email", "profile"],
                    },
                  }
                : {
                    providerId,
                    domain: input.domain,
                    // For SAML the record's issuer is our (service provider) entity ID.
                    issuer: spEntityId,
                    samlConfig: {
                      entryPoint: input.entryPoint,
                      cert: input.certificate,
                      callbackUrl: `${publicOrigin(env)}/`,
                      idpMetadata: { entityID: input.entityId },
                      spMetadata: { entityID: spEntityId },
                      wantAssertionsSigned: true,
                    },
                  },
          });
        } catch (error) {
          const message =
            error instanceof Error && error.message
              ? error.message
              : "The identity provider could not be registered";
          throw new AppError(400, "BAD_REQUEST", message);
        }
        db.update(ssoProviders)
          .set({
            organizationId: actor.workspaceId,
            domainVerified: false,
            verificationToken: randomBytes(16).toString("hex"),
          })
          .where(eq(ssoProviders.providerId, providerId))
          .run();
        audit.record({
          actor,
          action: "workspace.sso.provider.create",
          targetType: "sso_provider",
          targetId: providerId,
          metadata: { type: input.type, domain: input.domain },
        });
        return c.json(view(providerOf(actor.workspaceId, providerId)), 201);
      },
    )
    .post("/admin/sso/providers/:providerId/verify", async (c) => {
      const actor = c.get("actor");
      requireRole(actor, "owner", "admin");
      requireAuth();
      const row = providerOf(actor.workspaceId, c.req.param("providerId"));
      if (!row.domainVerified) {
        const expected = `${VERIFICATION_PREFIX}${row.verificationToken ?? ""}`;
        const records = await resolveTxt(verificationRecord(row.domain)).catch(
          () => [] as string[][],
        );
        if (!row.verificationToken || !records.some((chunks) => chunks.join("") === expected))
          throw new AppError(
            409,
            "CONFLICT",
            `No matching TXT record at ${verificationRecord(row.domain)} yet. DNS changes can take a while to appear.`,
          );
        db.update(ssoProviders)
          .set({ domainVerified: true })
          .where(eq(ssoProviders.id, row.id))
          .run();
        audit.record({
          actor,
          action: "workspace.sso.domain.verify",
          targetType: "sso_provider",
          targetId: row.providerId,
          metadata: { domain: row.domain },
        });
      }
      return c.json(view(providerOf(actor.workspaceId, row.providerId)));
    })
    .delete("/admin/sso/providers/:providerId", (c) => {
      const actor = c.get("actor");
      requireRole(actor, "owner", "admin");
      const row = providerOf(actor.workspaceId, c.req.param("providerId"));
      db.transaction((tx) => {
        tx.delete(authAccounts).where(eq(authAccounts.providerId, row.providerId)).run();
        tx.delete(ssoProviders).where(eq(ssoProviders.id, row.id)).run();
      });
      // Enforcement needs a working connection; without one, nobody but owners could sign in.
      const wasEnforced = settings(actor.workspaceId).enforced;
      if (!providersOf(actor.workspaceId).some((entry) => entry.domainVerified))
        setEnforced(actor.workspaceId, false);
      audit.record({
        actor,
        action: "workspace.sso.provider.delete",
        targetType: "sso_provider",
        targetId: row.providerId,
      });
      notifier.notifyAdmins(actor.workspaceId, {
        type: "security.sso_provider_removed",
        category: "security",
        title: `${actor.name} removed the single sign-on connection for ${row.domain}`,
        ...(wasEnforced && !settings(actor.workspaceId).enforced
          ? { body: "Single sign-on is no longer required." }
          : {}),
        link: "/access",
      });
      return c.body(null, 204);
    })
    .put(
      "/admin/sso/enforcement",
      zValidator("json", SsoEnforcementSchema, validationHook),
      async (c) => {
        const actor = c.get("actor");
        requireRole(actor, "owner", "admin");
        requireAuth();
        const { enforced } = c.req.valid("json");
        if (enforced) {
          if (!providersOf(actor.workspaceId).some((entry) => entry.domainVerified))
            throw new AppError(
              409,
              "CONFLICT",
              "Verify a single sign-on connection before requiring it",
            );
          // An admin who signed in another way would lock themselves out the moment this applies.
          const session = await identity.readSession(c.req.raw);
          if (actor.role !== "owner" && !session?.session.authMethod?.startsWith("sso:"))
            throw new AppError(
              409,
              "CONFLICT",
              "Sign in with single sign-on before requiring it, so you keep access",
            );
        }
        const was = settings(actor.workspaceId).enforced;
        setEnforced(actor.workspaceId, enforced);
        audit.record({
          actor,
          action: "workspace.sso.enforce",
          targetType: "workspace",
          targetId: actor.workspaceId,
          metadata: { enforced },
        });
        // Admins hear about it; everyone else learns how they sign in from now on (N-12).
        if (was !== enforced) {
          notifier.notifyAdmins(actor.workspaceId, {
            type: "security.sso_enforcement",
            category: "security",
            title: `${actor.name} ${enforced ? "required" : "stopped requiring"} single sign-on`,
            link: "/access",
          });
          if (enforced)
            notifier.notifyRoles(
              actor.workspaceId,
              ["manager", "hr", "member", "guest"],
              {
                type: "security.sso_required",
                category: "security",
                title: "Sign in with your company's single sign-on from now on",
                body: "Other ways of signing in to this workspace stop working.",
              },
              actor.id,
            );
        }
        return c.json(settings(actor.workspaceId));
      },
    );
}
