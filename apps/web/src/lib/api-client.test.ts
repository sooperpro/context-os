import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiClientError, apiDownload, apiRequest } from "@/lib/api-client";
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

  it("relies on the same-origin session cookie and sends no bearer token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));

    await apiRequest("/v1/things", {
      schema: z.object({ ok: z.boolean() }),
    });

    const requestInit = fetchSpy.mock.calls.at(0)?.[1];
    expect(new Headers(requestInit?.headers).get("Authorization")).toBeNull();
    expect(requestInit?.credentials ?? "same-origin").toBe("same-origin");
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

describe("apiDownload", () => {
  it("saves the file under the name the API gives, and throws the API's error", async () => {
    const created = vi.fn(() => "blob:export");
    const revoked = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("id,action\n", {
        status: 200,
        headers: { "Content-Disposition": 'attachment; filename="audit-log.csv"' },
      }),
    );
    await expect(
      apiDownload("/v1/audit", { query: { format: "csv" }, fallbackName: "export.csv" }),
    ).resolves.toBe("audit-log.csv");
    expect(fetchSpy).toHaveBeenCalledWith("/api/v1/audit?format=csv", expect.anything());
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoked).toHaveBeenCalledWith("blob:export");

    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ error: { code: "FORBIDDEN", message: "Not for you" } }, { status: 403 }),
    );
    await expect(apiDownload("/v1/admin/export", { fallbackName: "x.json" })).rejects.toThrow(
      "Not for you",
    );
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
