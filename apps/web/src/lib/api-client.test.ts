import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { jsonResponse } from "@/test/utils";

describe("apiRequest", () => {
  it("builds the URL with query params and validates the response", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));

    const result = await apiRequest("/v1/things", {
      query: { limit: 5, cursor: undefined },
      schema: z.object({ ok: z.boolean() }),
    });

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith("/api/v1/things?limit=5", expect.anything());
  });

  it("throws ApiClientError with the server's error envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        { error: { code: "NOT_FOUND", message: "Nope", requestId: "req-1" } },
        { status: 404 },
      ),
    );

    const promise = apiRequest("/v1/things/1", { schema: z.unknown() });
    await expect(promise).rejects.toBeInstanceOf(ApiClientError);
    await expect(promise).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Nope",
    });
  });

  it("rejects responses that do not match the schema", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: "yes" }));

    await expect(
      apiRequest("/v1/things", { schema: z.object({ ok: z.boolean() }) }),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});
