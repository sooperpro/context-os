import { describe, expect, it, vi } from "vitest";
import { withRetry } from "./retry.js";

describe("withRetry", () => {
  it("returns the first successful result", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries retryable failures then succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("flaky")).mockResolvedValueOnce("ok");
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("stops when shouldRetry returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fatal"));
    await expect(
      withRetry(fn, { attempts: 3, baseDelayMs: 1, shouldRetry: () => false }),
    ).rejects.toThrow("fatal");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws the last error after exhausting attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always"));
    await expect(withRetry(fn, { attempts: 2, baseDelayMs: 1 })).rejects.toThrow("always");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
