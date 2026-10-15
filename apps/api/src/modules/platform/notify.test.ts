import { afterEach, describe, expect, it } from "vitest";
import type { Mail } from "../../lib/mailer.js";
import { memberships, users } from "../../db/schema.js";
import { createTestApp, type TestApp } from "../../test/helpers.js";
import { createNotifier } from "./notify.js";

describe("Notifications: the switches in Settings and quiet hours", () => {
  let t: TestApp;
  afterEach(() => t?.close());

  const person = (notifications: Record<string, unknown>, email: string | null = null) => {
    t.container.db
      .insert(users)
      .values({ id: "maya", name: "Maya", email, preferences: { notifications } })
      .run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: "maya", role: "member" })
      .run();
    Object.assign(t.container.devActor, { id: "maya", name: "Maya", role: "member" });
  };
  const send = (category: "onboarding" | "security", title: string) =>
    createNotifier(t.container.db).notify(t.container.workspace.id, "maya", {
      type: "test",
      category,
      title,
    });
  const bell = async () =>
    (
      (await (await t.app.request("/api/v1/notifications")).json()) as {
        items: Array<{ data: { title: string } }>;
      }
    ).items.map((row) => row.data.title);
  // Quiet hours that cover right now, in UTC (Maya has no time zone set).
  const hour = new Date().getUTCHours();
  const quietNow = { quietStartHour: hour, quietEndHour: (hour + 1) % 24 };
  const awake = { quietStartHour: (hour + 2) % 24, quietEndHour: (hour + 3) % 24 };

  it("turns the bell off with the in-app switch, except for security", async () => {
    t = createTestApp();
    person({ ...awake, inApp: false });
    expect(send("onboarding", "Your roadmap is ready")).toBeNull();
    expect(send("security", "New sign-in")).not.toBeNull();
    expect(await bell()).toEqual(["New sign-in"]);
  });

  it("sends email for every category when the email switch is on", async () => {
    t = createTestApp();
    // Settings saves every category with email off; the global switch still applies.
    person({
      ...awake,
      email: true,
      inApp: false,
      categories: { onboarding: { inApp: true, email: false, slack: false } },
    });
    const row = send("onboarding", "Your roadmap is ready");
    expect(row?.data.channels).toEqual({ inApp: false, email: true, slack: false });
    // Kept for email delivery, but not in the bell.
    expect(await bell()).toEqual([]);
  });

  it("holds notifications until quiet hours end, but never security alerts", async () => {
    t = createTestApp();
    person(quietNow);
    send("onboarding", "Your roadmap is ready");
    send("security", "New sign-in");
    expect(await bell()).toEqual(["New sign-in"]);
  });

  describe("email delivery", () => {
    let mails: Mail[] = [];
    const app = () => {
      mails = [];
      t = createTestApp({
        mailer: {
          send: (mail) => {
            mails.push(mail);
            return Promise.resolve();
          },
        },
      });
    };

    it("emails people who turned email on, one summary each, once", async () => {
      app();
      person({ ...awake, email: true }, "maya@example.test");
      send("onboarding", "Your roadmap is ready");
      send("onboarding", "Dan shared notes from your weekly 1:1");
      // Held a few minutes so notifications close together share one email.
      expect(await t.container.emailDelivery.deliver()).toBe(0);
      const soon = new Date(Date.now() + 11 * 60_000);
      expect(await t.container.emailDelivery.deliver(soon)).toBe(2);
      expect(mails).toHaveLength(1);
      expect(mails[0]).toMatchObject({
        to: "maya@example.test",
        subject: "2 new notifications in ContextOS",
      });
      expect(mails[0]!.text).toContain("Your roadmap is ready");
      // Nothing is sent twice.
      expect(await t.container.emailDelivery.deliver(soon)).toBe(0);
      expect(mails).toHaveLength(1);
      // Security alerts go straight away.
      send("security", "New sign-in");
      expect(await t.container.emailDelivery.deliver()).toBe(1);
      expect(mails[1]).toMatchObject({ subject: "New sign-in" });
    });

    it("waits for quiet hours to end, and skips people with email off or no address", async () => {
      app();
      person({ ...quietNow, email: true }, "maya@example.test");
      send("onboarding", "Your roadmap is ready");
      expect(await t.container.emailDelivery.deliver()).toBe(0);
      // Once quiet hours are over (and the batching window), it goes out.
      const later = new Date(Date.now() + 3 * 3_600_000);
      expect(await t.container.emailDelivery.deliver(later)).toBe(1);

      t.close();
      app();
      person({ ...awake, email: false }, "maya@example.test");
      send("onboarding", "Your roadmap is ready");
      expect(await t.container.emailDelivery.deliver()).toBe(0);

      t.close();
      app();
      person({ ...awake, email: true }, null);
      send("onboarding", "Your roadmap is ready");
      expect(await t.container.emailDelivery.deliver()).toBe(0);
      expect(mails).toEqual([]);
    });
  });
});
