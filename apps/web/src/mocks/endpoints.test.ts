import { describe, expect, it } from "vitest";
import { buildApiUrl } from "@/lib/api-client";
import { mockEndpoints } from "@/mocks/endpoints";
import { setupMockApi } from "@/test/msw";

setupMockApi();

describe("mock layer", () => {
  it("registers each endpoint once", () => {
    const keys = mockEndpoints.map((endpoint) => endpoint.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // Each handler parses its fixture with the shared schema, so a fixture that drifts from the
  // contract turns into a 500 here instead of a screen that renders impossible data.
  it.each(mockEndpoints.map((endpoint) => endpoint.key))(
    "%s answers with data its schema accepts",
    async (key) => {
      const path = key.replace(/^GET /, "");
      const response = await fetch(new URL(buildApiUrl(path), window.location.origin));
      expect(response.status).toBe(200);
      expect(response.headers.get("X-ContextOS-Mock")).toBe("1");
    },
  );
});
