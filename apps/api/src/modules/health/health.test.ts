import { HealthResponseSchema } from "@contextos/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../../test/helpers.js";

describe("health routes", () => {
  let ctx: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    ctx = createTestApp();
  });

  afterEach(() => {
    ctx.close();
  });

  it("GET /api/v1/health reports liveness", async () => {
    const res = await ctx.app.request("/api/v1/health");
    expect(res.status).toBe(200);
    const body = HealthResponseSchema.parse(await res.json());
    expect(body.status).toBe("ok");
  });

  it("GET /api/v1/health/ready checks the database", async () => {
    const res = await ctx.app.request("/api/v1/health/ready");
    expect(res.status).toBe(200);
    const body = HealthResponseSchema.parse(await res.json());
    expect(body.checks).toEqual({ database: "ok" });
  });

  it("returns the standard error envelope for unknown routes", async () => {
    const res = await ctx.app.request("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});
