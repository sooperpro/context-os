import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { auditLog, memberships, platformRecords, users } from "../../db/schema.js";
import type { Mail } from "../../lib/mailer.js";
import { createTestApp, jsonRequest, type TestApp } from "../../test/helpers.js";
import type { Actor } from "../../types.js";

describe("Messages and booking links (ALL-3)", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const sent: Mail[] = [];
  const start = () => {
    sent.length = 0;
    t = createTestApp({
      mailer: {
        send: (mail) => {
          sent.push(mail);
          return Promise.resolve();
        },
      },
    });
  };
  const member = (id: string, role: Actor["role"] = "member") => {
    t.container.db
      .insert(users)
      .values({ id, name: `${id[0]!.toUpperCase()}${id.slice(1)}`, email: `${id}@example.test` })
      .run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role })
      .run();
  };
  const as = (id: string, role: Actor["role"] = "member") =>
    Object.assign(t.container.devActor, {
      id,
      name: `${id[0]!.toUpperCase()}${id.slice(1)}`,
      role,
    });
  const message = (to: string, body: unknown) =>
    t.app.request(`/api/v1/people/${to}/messages`, jsonRequest(body));
  const inbox = (userId: string) =>
    t.container.db
      .select()
      .from(platformRecords)
      .where(and(eq(platformRecords.kind, "notification"), eq(platformRecords.ownerId, userId)))
      .all();

  it("delivers a message in the app with an email copy, once", async () => {
    start();
    member("maya");
    member("dan", "manager");
    as("maya");
    const res = await message("dan", {
      text: "Can we go through the pricing module tomorrow?",
      about: { title: "Pricing and discounts", link: "/roadmap/modules/m1" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inApp: true, emailed: true });

    const [notice] = inbox("dan");
    expect(notice?.data).toMatchObject({
      type: "message.received",
      title: "Maya sent you a message about Pricing and discounts",
      body: "Can we go through the pricing module tomorrow?",
      link: "/roadmap/modules/m1",
    });
    // Emailed already, so the notification digest leaves it alone.
    expect(typeof notice?.data.emailedAt).toBe("string");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "dan@example.test",
      subject: "Maya sent you a message about Pricing and discounts",
    });
    expect(sent[0]!.text).toContain("Can we go through the pricing module tomorrow?");
    expect(sent[0]!.text).toContain("/roadmap/modules/m1");

    // Without a subject, the link is the sender's profile, to reply.
    await message("dan", { text: "Thanks!" });
    expect(inbox("dan").map((row) => row.data.link)).toContain("/people/maya");
    // The audit log notes that a message went, never what it said.
    const audits = t.container.db
      .select()
      .from(auditLog)
      .all()
      .filter((row) => row.action === "message.send");
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits)).not.toContain("pricing module");
  });

  it("refuses yourself, guests, strangers, outside links and too many at once", async () => {
    start();
    member("maya");
    member("dan");
    member("gus", "guest");
    as("maya");
    expect((await message("maya", { text: "Hi me" })).status).toBe(400);
    expect((await message("nobody", { text: "Hi" })).status).toBe(404);
    expect((await message("dan", { text: "" })).status).toBe(400);
    expect(
      (await message("dan", { text: "Look", about: { title: "Evil", link: "//evil.test" } }))
        .status,
    ).toBe(400);
    for (let index = 0; index < 30; index += 1)
      expect((await message("dan", { text: `Note ${index}` })).status).toBe(200);
    expect((await message("dan", { text: "One more" })).status).toBe(429);
    as("gus", "guest");
    expect((await message("dan", { text: "Hello" })).status).toBe(403);
  });

  it("keeps a booking link on the profile for Book time", async () => {
    start();
    member("maya");
    member("dan");
    as("maya");
    const save = (bookingUrl: string) =>
      t.app.request("/api/v1/users/me", jsonRequest({ bookingUrl }, "PATCH"));
    expect((await save("http://cal.example.test/maya")).status).toBe(400);
    expect((await save("https://cal.example.test/maya")).status).toBe(200);
    as("dan");
    const profile = (await (await t.app.request("/api/v1/people/maya")).json()) as {
      profile: { bookingUrl: string };
    };
    expect(profile.profile.bookingUrl).toBe("https://cal.example.test/maya");
    as("maya");
    expect((await save("")).status).toBe(200);
    as("dan");
    expect(
      (
        (await (await t.app.request("/api/v1/people/maya")).json()) as {
          profile: { bookingUrl: string };
        }
      ).profile.bookingUrl,
    ).toBe("");
  });
});
