import { describe, expect, it } from "vitest";
import { serializeSafeError } from "./logger.js";

describe("privacy-safe SDK error logging", () => {
  it("does not log SDK request bodies, tokens, OAuth codes, messages or nested causes", () => {
    const error = Object.assign(new Error("OAuth code=secret-code"), {
      config: { data: { refresh_token: "secret-token", client_secret: "secret-client" } },
      cause: new Error("Private Ask content"),
    });
    expect(serializeSafeError(error)).toEqual({ type: "Error" });
    expect(JSON.stringify(serializeSafeError(error))).not.toContain("secret");
    expect(serializeSafeError({ refresh_token: "secret-token" })).toEqual({ type: "UnknownError" });
  });
});
