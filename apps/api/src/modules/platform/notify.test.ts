import { afterEach, describe, expect, it } from "vitest";
import { memberships, users } from "../../db/schema.js";
import { createTestApp, type TestApp } from "../../test/helpers.js";
import { createNotifier } from "./notify.js";

describe("Notifications: the switches in Settings and quiet hours", () => {
  let t: TestApp;
  afterEach(() => t?.close());

  const person = (notifications: Record<string, unknown>) => {
    t.container.db
      .insert(users)
      .values({ id: "maya", name: "Maya", preferences: { notifications } })
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
});
