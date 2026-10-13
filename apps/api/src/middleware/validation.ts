import type { ValidationIssue } from "@contextos/shared";
import type { Hook } from "@hono/zod-validator";
import type { Env } from "hono";
import type { z } from "zod";
import { ValidationError } from "../lib/errors.js";

/**
 * Shared hook for @hono/zod-validator: converts Zod failures into our
 * standard error envelope instead of the validator's default 400 body.
 * Typed against Hono's base Env because the hook never reads context variables.
 */
export const validationHook: Hook<unknown, Env, string> = (result) => {
  if (!result.success) {
    const issues: ValidationIssue[] = (result.error as z.ZodError).issues.map((issue) => ({
      path: issue.path.map((segment) => (typeof segment === "symbol" ? String(segment) : segment)),
      message: issue.message,
      code: issue.code,
    }));
    throw new ValidationError(issues);
  }
};
