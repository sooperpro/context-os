import { describe, expect, it } from "vitest";
import { BOTTOM_NAV_LIMIT, NAV_ITEMS, navItemsFor } from "@/components/layout/navigation";

describe("navigation config", () => {
  it("shows ungated items to every role, including guests and while the role is unknown", () => {
    const everyone = NAV_ITEMS.filter((item) => !item.roles && !item.personas).map(
      (item) => item.id,
    );
    expect(navItemsFor("guest").map((item) => item.id)).toEqual(expect.arrayContaining(everyone));
    expect(navItemsFor(undefined).map((item) => item.id)).toEqual(everyone);
  });

  it("hides role-gated items from roles not listed", () => {
    const gated = NAV_ITEMS.filter((item) => item.roles && !item.personas);
    for (const item of gated) {
      expect(navItemsFor("guest").some((candidate) => candidate.id === item.id)).toBe(
        item.roles?.includes("guest") ?? true,
      );
    }
  });

  it("gives each prototype persona its rail", () => {
    const rail = (
      role: Parameters<typeof navItemsFor>[0],
      persona: Parameters<typeof navItemsFor>[1],
    ) => navItemsFor(role, persona).map((item) => item.id);
    expect(rail("member", "employee")).toEqual([
      "home",
      "roadmap",
      "knowledge",
      "people",
      "contributions",
    ]);
    expect(rail("manager", "manager")).toEqual([
      "home",
      "team",
      "knowledge",
      "reviews",
      "people",
      "learning",
    ]);
    expect(rail("member", "people_ops")).toEqual([
      "home",
      "onboarding",
      "probation",
      "templates",
      "people",
      "knowledge",
    ]);
    expect(rail("owner", "admin")).toEqual([
      "overview",
      "members",
      "connectors",
      "access",
      "ai",
      "audit",
      "knowledge",
      "setup",
    ]);
  });

  it("never configures more bottom-bar destinations than M3 allows for everyone", () => {
    expect(navItemsFor(undefined).length).toBeLessThanOrEqual(BOTTOM_NAV_LIMIT);
  });
});
