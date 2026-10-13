import { describe, expect, it } from "vitest";
import { containsQuote, normalizeKey, parseLooseDate } from "./text.js";

describe("text helpers", () => {
  it("verifies quotes tolerant of case, whitespace and smart quotes", () => {
    const content = "We “will move” billing   into\n a dedicated ledger service.";
    expect(containsQuote(content, 'we "will move" billing into a dedicated')).toBe(true);
    expect(containsQuote(content, "something else entirely")).toBe(false);
    expect(containsQuote(content, "short")).toBe(false);
  });

  it("normalizes keys", () => {
    expect(normalizeKey("  Payments-Service!! ")).toBe("payments service");
  });

  it("parses loose dates and rejects junk", () => {
    expect(parseLooseDate("2026-03-04")?.toISOString()).toBe("2026-03-04T00:00:00.000Z");
    expect(parseLooseDate("2026-03")?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(parseLooseDate("Q2 2026")).toBeNull();
    expect(parseLooseDate("1800-01-01")).toBeNull();
    expect(parseLooseDate(undefined)).toBeNull();
  });
});
