import { readFileSync } from "node:fs";
import { SessionStateSchema, SsoProviderSchema, SsoSettingsSchema } from "@contextos/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authSessions, memberships, platformRecords, users } from "../../db/schema.js";
import type { Mail } from "../../lib/mailer.js";
import { createTestApp, type TestApp } from "../../test/helpers.js";

const txtRecords = new Map<string, string[][]>();
vi.mock("node:dns/promises", () => ({
  resolveTxt: (name: string) => Promise.resolve(txtRecords.get(name) ?? []),
}));

const ORIGIN = "http://localhost:5173";
const IDP_CERT = readFileSync(new URL("./__fixtures__/idp-cert.pem", import.meta.url), "utf8");

describe("Sign-in with our own accounts (AUTH_MODE=accounts)", () => {
  let t: TestApp;
  let outbox: Mail[];
  afterEach(() => {
    t?.close();
    txtRecords.clear();
  });

  const start = () => {
    outbox = [];
    t = createTestApp({
      env: {
        AUTH_MODE: "accounts",
        AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
        AUTH_URL: ORIGIN,
      },
      mailer: {
        send(mail) {
          outbox.push(mail);
          return Promise.resolve();
        },
      },
    });
  };

  /** Request a magic link for an email, open it, and return the session cookie it sets. */
  const signIn = async (email: string): Promise<string> => {
    const res = await t.app.request("/api/v1/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, callbackURL: "/" }),
    });
    expect(res.status).toBe(200);
    const mail = outbox.findLast((entry) => entry.to === email);
    const link = /https?:\/\/\S+magic-link\/verify\S+/.exec(mail?.text ?? "")?.[0];
    expect(link).toBeTruthy();
    const verified = await t.app.request(link!, { headers: { origin: ORIGIN } });
    expect(verified.status).toBe(302);
    const cookie = verified.headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0]!)
      .find((entry) => entry.startsWith("contextos.session_token="));
    expect(cookie).toBeTruthy();
    return cookie!;
  };

  const call = (cookie: string, path: string, init: RequestInit = {}) =>
    t.app.request(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        cookie,
        ...(init.headers as Record<string, string> | undefined),
      },
    });

  const session = async (cookie: string) => {
    const res = await call(cookie, "/api/v1/session");
    expect(res.status).toBe(200);
    return SessionStateSchema.parse(await res.json());
  };

  const createWorkspace = async (cookie: string, slug: string) => {
    const res = await call(cookie, "/api/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: `Workspace ${slug}`, slug }),
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };

  it("lists sign-in options publicly and rejects requests without a session", async () => {
    start();
    const options = await t.app.request("/api/v1/auth-options");
    expect(await options.json()).toEqual({
      authentication: "accounts",
      methods: { email: true, password: true, google: false, microsoft: false, sso: true },
    });
    expect((await t.app.request("/api/v1/projects")).status).toBe(401);
    expect((await t.app.request("/api/v1/session")).status).toBe(401);
  });

  it("signs up by magic link, creates a workspace and works in it", async () => {
    start();
    const cookie = await signIn("ada@example.com");
    const before = await session(cookie);
    expect(before.user.email).toBe("ada@example.com");
    expect(before.signInMethod).toBe("magic-link");
    expect(before.workspaces).toEqual([]);
    expect((await call(cookie, "/api/v1/projects")).status).toBe(403);

    const workspaceId = await createWorkspace(cookie, "analytical");
    const after = await session(cookie);
    expect(after.activeWorkspaceId).toBe(workspaceId);
    expect(after.workspaces).toEqual([
      expect.objectContaining({ id: workspaceId, role: "owner", ssoRequired: false }),
    ]);
    const project = await call(cookie, "/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({ name: "Engine" }),
    });
    expect(project.status).toBe(201);
  });

  it("emails an invitation and applies its role when the invitee signs in", async () => {
    start();
    const owner = await signIn("owner@example.com");
    const workspaceId = await createWorkspace(owner, "acme");
    const invite = await call(owner, "/api/v1/users/invite", {
      method: "POST",
      body: JSON.stringify({ email: "Bob@Example.com", role: "admin" }),
    });
    expect(invite.status).toBe(201);
    expect(await invite.json()).toMatchObject({ status: "pending", delivery: "email" });
    const invitation = outbox.find((mail) => mail.to === "bob@example.com");
    expect(invitation?.subject).toContain("Workspace acme");
    expect(invitation?.text).toContain(`${ORIGIN}/?email=bob%40example.com`);

    const bob = await signIn("bob@example.com");
    const state = await session(bob);
    expect(state.activeWorkspaceId).toBe(workspaceId);
    expect(state.workspaces).toEqual([expect.objectContaining({ id: workspaceId, role: "admin" })]);
    const me = await call(bob, "/api/v1/users/me");
    expect(await me.json()).toMatchObject({ role: "admin", workspaceId });
    const record = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.kind, "invitation"))
      .get();
    expect(record?.status).toBe("accepted");
  });

  it("keeps the workspaces of someone who used ContextOS before these accounts", async () => {
    start();
    const workspaceId = t.container.workspace.id;
    // Members from before (Clerk-era ids), with no sign-in account yet.
    t.container.db
      .insert(users)
      .values([
        { id: "user_2clerkOwner", name: "Owner", email: "Owner@Example.com" },
        { id: "user_2clerkOther", name: "Other", email: "other@example.com" },
      ])
      .run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId, userId: "user_2clerkOwner", role: "owner" })
      .run();
    const owner = await session(await signIn("owner@example.com"));
    expect(owner.user.id).toBe("user_2clerkOwner");
    expect(owner.workspaces).toEqual([expect.objectContaining({ id: workspaceId, role: "owner" })]);
    // Signing in again finds the same account, and nobody else's profile is touched.
    expect((await session(await signIn("owner@example.com"))).user.id).toBe("user_2clerkOwner");
    expect((await session(await signIn("new@example.com"))).user.id).not.toMatch(/^user_2clerk/);
  });

  const post = (path: string, body: unknown, cookie?: string) =>
    t.app.request(`/api/v1/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  const sessionCookie = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0]!)
      .find((entry) => entry.startsWith("contextos.session_token=") && !entry.endsWith("="));
  const linkIn = (to: string, pattern: RegExp) =>
    pattern.exec(outbox.findLast((entry) => entry.to === to)?.text ?? "")?.[0];
  const passwordSignIn = (email: string, password: string) =>
    post("/sign-in/email", { email, password, callbackURL: "/" });

  it("signs up with a password, confirms the email, then signs in with it", async () => {
    start();
    const workspaceId = t.container.workspace.id;
    // A member from before these accounts signs up with their email and keeps their workspace.
    t.container.db
      .insert(users)
      .values({ id: "user_2clerkMaya", name: "Maya", email: "maya@example.com" })
      .run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId, userId: "user_2clerkMaya", role: "admin" })
      .run();

    const signedUp = await post("/sign-up/email", {
      name: "Maya Okafor",
      email: "maya@example.com",
      password: "correct horse battery",
      callbackURL: "/",
    });
    expect(signedUp.status).toBe(200);
    expect(sessionCookie(signedUp)).toBeUndefined();
    // Not until the email is confirmed (trying again sends the confirmation again).
    const early = await passwordSignIn("maya@example.com", "correct horse battery");
    expect(early.status).toBe(403);
    expect(await early.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });

    const confirm = linkIn("maya@example.com", /https?:\/\/\S+\/verify-email\S+/);
    expect(confirm).toBeTruthy();
    const confirmed = await t.app.request(confirm!, { headers: { origin: ORIGIN } });
    expect(confirmed.status).toBe(302);
    const cookie = sessionCookie(confirmed);
    expect(cookie).toBeTruthy();
    const state = await session(cookie!);
    expect(state).toMatchObject({ signInMethod: "password", user: { id: "user_2clerkMaya" } });
    expect(state.linkedMethods).toContain("password");
    expect(state.workspaces).toEqual([expect.objectContaining({ id: workspaceId, role: "admin" })]);

    expect((await passwordSignIn("maya@example.com", "wrong password")).status).toBe(401);
    const again = await passwordSignIn("maya@example.com", "correct horse battery");
    expect(again.status).toBe(200);
    expect((await session(sessionCookie(again)!)).user.id).toBe("user_2clerkMaya");
  });

  it("adds a password for an email-link user, and changes it with the current one (N-17)", async () => {
    start();
    const cookie = await signIn("lee@example.com");
    const password = (body: object, from = cookie) =>
      call(from, "/api/v1/session/password", { method: "POST", body: JSON.stringify(body) });

    // No password yet: changing needs one, adding works and sends a security email.
    expect((await password({ currentPassword: "x", newPassword: "first password 1" })).status).toBe(
      409,
    );
    expect((await password({ newPassword: "short" })).status).toBe(400);
    const added = await password({ newPassword: "first password 1" });
    expect(added.status).toBe(200);
    expect(await added.json()).toEqual({ password: "added" });
    expect(outbox.findLast((mail) => mail.to === "lee@example.com")?.subject).toBe(
      "A password was added to your ContextOS account",
    );
    expect((await session(cookie)).linkedMethods).toContain("password");
    expect((await passwordSignIn("lee@example.com", "first password 1")).status).toBe(200);
    expect((await password({ newPassword: "another one 22" })).status).toBe(409);

    // Changing: the wrong current password is refused; the right one works, the old one stops.
    const other = await signIn("lee@example.com");
    expect(
      (await password({ currentPassword: "wrong password", newPassword: "second password 2" }))
        .status,
    ).toBe(400);
    const changed = await password({
      currentPassword: "first password 1",
      newPassword: "second password 2",
      signOutOtherDevices: true,
    });
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ password: "changed" });
    expect(outbox.findLast((mail) => mail.to === "lee@example.com")?.subject).toBe(
      "Your ContextOS password was changed",
    );
    expect((await passwordSignIn("lee@example.com", "first password 1")).status).toBe(401);
    expect((await passwordSignIn("lee@example.com", "second password 2")).status).toBe(200);
    // This device stays signed in; the other one is signed out.
    expect((await call(cookie, "/api/v1/session")).status).toBe(200);
    expect((await call(other, "/api/v1/session")).status).toBe(401);
  });

  it("resets a forgotten password, also for members who never signed in", async () => {
    start();
    t.container.db
      .insert(users)
      .values({ id: "user_2clerkRavi", name: "Ravi", email: "ravi@example.com" })
      .run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: "user_2clerkRavi", role: "member" })
      .run();
    expect(
      (
        await post("/request-password-reset", {
          email: "ravi@example.com",
          redirectTo: "/reset-password",
        })
      ).status,
    ).toBe(200);
    const link = linkIn("ravi@example.com", /https?:\/\/\S+\/reset-password\/\S+/);
    expect(link).toBeTruthy();
    const opened = await t.app.request(link!, { headers: { origin: ORIGIN } });
    expect(opened.status).toBe(302);
    const token = new URL(opened.headers.get("location")!, ORIGIN).searchParams.get("token");
    expect(token).toBeTruthy();
    expect(
      (await post("/reset-password", { token, newPassword: "a brand new password" })).status,
    ).toBe(200);
    // The reset proved the address: they can sign in straight away, into their own account.
    const signedIn = await passwordSignIn("ravi@example.com", "a brand new password");
    expect(signedIn.status).toBe(200);
    expect((await session(sessionCookie(signedIn)!)).user.id).toBe("user_2clerkRavi");
    // Each reset link works once.
    expect(
      (await post("/reset-password", { token, newPassword: "another password!" })).status,
    ).toBe(400);
  });

  it("never lets a password sign-up take over someone else's account", async () => {
    start();
    // Signing up with an email that already has an account looks the same, and tells its owner.
    await signIn("ada@example.com");
    const taken = await post("/sign-up/email", {
      name: "Mallory",
      email: "ada@example.com",
      password: "mallory's password",
      callbackURL: "/",
    });
    expect(taken.status).toBe(200);
    expect(outbox.at(-1)).toMatchObject({
      to: "ada@example.com",
      subject: "You already have a ContextOS account",
    });
    expect((await passwordSignIn("ada@example.com", "mallory's password")).status).toBe(401);

    // A password set on someone's address before they ever confirmed it stops working once they
    // sign in by email link.
    await post("/sign-up/email", {
      name: "Mallory",
      email: "grace@example.com",
      password: "mallory's password",
      callbackURL: "/",
    });
    await signIn("grace@example.com");
    expect((await passwordSignIn("grace@example.com", "mallory's password")).status).toBe(401);
  });

  it("only switches to workspaces the person belongs to, and loses access when removed", async () => {
    start();
    const ada = await signIn("ada@example.com");
    const first = await createWorkspace(ada, "first");
    const second = await createWorkspace(ada, "second");
    const grace = await signIn("grace@example.com");
    const graces = await createWorkspace(grace, "graces");

    expect(
      (
        await call(ada, "/api/v1/session/workspace", {
          method: "PUT",
          body: JSON.stringify({ workspaceId: graces }),
        })
      ).status,
    ).toBe(404);
    const switched = await call(ada, "/api/v1/session/workspace", {
      method: "PUT",
      body: JSON.stringify({ workspaceId: first }),
    });
    expect(SessionStateSchema.parse(await switched.json()).activeWorkspaceId).toBe(first);
    const current = await call(ada, "/api/v1/workspaces/current");
    expect(await current.json()).toMatchObject({ id: first, authentication: "accounts" });

    // Suspended in the active workspace: requests there stop working at once.
    t.container.db
      .update(memberships)
      .set({ status: "suspended" })
      .where(eq(memberships.workspaceId, first))
      .run();
    const denied = await call(ada, "/api/v1/projects");
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: { code: "WORKSPACE_REQUIRED" } });
    expect((await session(ada)).workspaces.map((entry) => entry.id)).toEqual([second]);
  });

  it("lists devices and signs out everywhere else", async () => {
    start();
    const laptop = await signIn("ada@example.com");
    const phone = await signIn("ada@example.com");
    const devices = await call(laptop, "/api/v1/session/devices");
    const { items } = (await devices.json()) as { items: Array<{ id: string; current: boolean }> };
    expect(items).toHaveLength(2);
    expect(items.filter((entry) => entry.current)).toHaveLength(1);

    expect((await call(laptop, "/api/v1/session/devices", { method: "DELETE" })).status).toBe(204);
    expect((await t.app.request("/api/v1/session", { headers: { cookie: phone } })).status).toBe(
      401,
    );
    expect((await call(laptop, "/api/v1/session")).status).toBe(200);
    expect(t.container.db.select().from(authSessions).all()).toHaveLength(1);
  });

  it("connects company SSO, verifies the domain by DNS and enforces it for members", async () => {
    start();
    const owner = await signIn("owner@acme.test");
    const workspaceId = await createWorkspace(owner, "acme");
    const created = await call(owner, "/api/v1/admin/sso/providers", {
      method: "POST",
      body: JSON.stringify({
        type: "saml",
        domain: "acme.test",
        entryPoint: "https://idp.acme.test/sso",
        entityId: "https://idp.acme.test/entity",
        certificate: IDP_CERT,
      }),
    });
    expect(created.status).toBe(201);
    const provider = SsoProviderSchema.parse(await created.json());
    expect(provider).toMatchObject({ type: "saml", domain: "acme.test", domainVerified: false });
    expect(provider.serviceProvider.callbackUrl).toBe(
      `${ORIGIN}/api/v1/auth/sso/saml2/sp/acs/${provider.providerId}`,
    );

    // Requiring SSO needs a verified domain first.
    const early = await call(owner, "/api/v1/admin/sso/enforcement", {
      method: "PUT",
      body: JSON.stringify({ enforced: true }),
    });
    expect(early.status).toBe(409);

    const verify = `/api/v1/admin/sso/providers/${provider.providerId}/verify`;
    expect((await call(owner, verify, { method: "POST" })).status).toBe(409);
    txtRecords.set(provider.verification.name, [[provider.verification.value]]);
    const verified = await call(owner, verify, { method: "POST" });
    expect(SsoProviderSchema.parse(await verified.json()).domainVerified).toBe(true);

    // Another workspace cannot claim the same domain.
    const other = await signIn("mallory@evil.test");
    await createWorkspace(other, "evil");
    const claim = await call(other, "/api/v1/admin/sso/providers", {
      method: "POST",
      body: JSON.stringify({
        type: "saml",
        domain: "acme.test",
        entryPoint: "https://idp.evil.test/sso",
        entityId: "https://idp.evil.test/entity",
        certificate: IDP_CERT,
      }),
    });
    expect(claim.status).toBe(409);

    // A member who signed in by email link loses access once SSO is required; the owner keeps it.
    await call(owner, "/api/v1/users/invite", {
      method: "POST",
      body: JSON.stringify({ email: "member@acme.test", role: "member" }),
    });
    const member = await signIn("member@acme.test");
    expect((await session(member)).activeWorkspaceId).toBe(workspaceId);
    expect((await call(member, "/api/v1/projects")).status).toBe(200);
    const enforce = await call(owner, "/api/v1/admin/sso/enforcement", {
      method: "PUT",
      body: JSON.stringify({ enforced: true }),
    });
    expect(SsoSettingsSchema.parse(await enforce.json()).enforced).toBe(true);
    const blocked = await call(member, "/api/v1/projects");
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ error: { code: "SSO_REQUIRED" } });
    expect((await session(member)).workspaces).toEqual([
      expect.objectContaining({ id: workspaceId, ssoRequired: true }),
    ]);
    expect((await call(owner, "/api/v1/projects")).status).toBe(200);

    // Removing the only connection lifts enforcement so members are not locked out.
    expect(
      (
        await call(owner, `/api/v1/admin/sso/providers/${provider.providerId}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(204);
    expect((await call(member, "/api/v1/projects")).status).toBe(200);
  });

  it("refuses writes from other sites even with a valid session cookie", async () => {
    start();
    const cookie = await signIn("alex@example.com");
    await createWorkspace(cookie, "acme-csrf");
    const gap = (headers: Record<string, string>) =>
      call(cookie, "/api/v1/assistant/gaps", {
        method: "POST",
        body: JSON.stringify({ question: "Who approves refunds?" }),
        headers,
      });
    // Another site (a sibling subdomain counts as same-site for cookies): refused.
    expect((await gap({ origin: "https://evil.example" })).status).toBe(403);
    expect((await gap({ origin: "", "sec-fetch-site": "cross-site" })).status).toBe(403);
    // The app itself, and clients that aren't browsers, are fine.
    expect((await gap({})).status).toBe(201);
    expect((await gap({ origin: "" })).status).toBe(201);
    // Reads are never blocked by this check.
    expect(
      (await call(cookie, "/api/v1/session", { headers: { origin: "https://evil.example" } }))
        .status,
    ).toBe(200);
  });

  it("doesn't expose SSO provider management outside the admin routes", async () => {
    start();
    const cookie = await signIn("mallory@example.com");
    await createWorkspace(cookie, "acme-sso-block");
    for (const path of [
      "register",
      "update-provider",
      "delete-provider",
      "providers",
      "verify-domain",
    ])
      expect(
        (
          await call(cookie, `/api/v1/auth/sso/${path}`, {
            method: path === "providers" ? "GET" : "POST",
            body:
              path === "providers"
                ? undefined
                : JSON.stringify({ providerId: "x", domain: "corp.com" }),
          })
        ).status,
        path,
      ).toBe(404);
  });

  it("sends at most three sign-in emails per address in fifteen minutes", async () => {
    start();
    const request = () =>
      t.app.request("/api/v1/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ email: "busy@example.com", callbackURL: "/" }),
      });
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await request()).status).toBe(200);
    // Every request looks the same to the caller; only three emails go out.
    expect(outbox.filter((mail) => mail.to === "busy@example.com")).toHaveLength(3);
  });

  it("keeps SSO administration to owners and admins", async () => {
    start();
    const owner = await signIn("owner@example.com");
    await createWorkspace(owner, "acme");
    await call(owner, "/api/v1/users/invite", {
      method: "POST",
      body: JSON.stringify({ email: "member@example.com", role: "member" }),
    });
    const member = await signIn("member@example.com");
    expect((await call(member, "/api/v1/admin/sso")).status).toBe(403);
  });
});

describe("Development mode", () => {
  let t: TestApp;
  afterEach(() => t?.close());

  it("reports the local actor as the session without signing in", async () => {
    t = createTestApp();
    const res = await t.app.request("/api/v1/session");
    const state = SessionStateSchema.parse(await res.json());
    expect(state).toMatchObject({
      authentication: "development",
      signInMethod: "development",
      activeWorkspaceId: t.container.workspace.id,
    });
    expect((await t.app.request("/api/v1/admin/sso")).status).toBe(200);
    const register = await t.app.request("/api/v1/admin/sso/providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "oidc",
        domain: "example.com",
        issuer: "https://idp.example.com",
        clientId: "id",
        clientSecret: "secret",
      }),
    });
    expect(register.status).toBe(503);
  });
});
