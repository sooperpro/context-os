import { describe, expect, it } from "vitest";
import { BOTTOM_NAV_LIMIT, NAV_ITEMS, navItemsFor } from "@/components/layout/navigation";

describe("navigation config", () => {
  it("shows ungated items to every role, including guests and while the role is unknown", () => {
    const everyone = NAV_ITEMS.filter((item) => !item.roles).map((item) => item.id);
    expect(navItemsFor("guest").map((item) => item.id)).toEqual(expect.arrayContaining(everyone));
    expect(navItemsFor(undefined).map((item) => item.id)).toEqual(everyone);
  });

  it("hides role-gated items from roles not listed", () => {
    const gated = NAV_ITEMS.filter((item) => item.roles);
    for (const item of gated) {
      expect(navItemsFor("guest").some((candidate) => candidate.id === item.id)).toBe(
        item.roles?.includes("guest") ?? true,
      );
    }
  });

  it("never configures more bottom-bar destinations than M3 allows for everyone", () => {
    expect(navItemsFor(undefined).length).toBeLessThanOrEqual(BOTTOM_NAV_LIMIT);
  });
});
