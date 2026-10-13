import type { ApiErrorResponse } from "@contextos/shared";
import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { AppEnv } from "../types.js";

export const errorHandler: ErrorHandler<AppEnv> = (error, c) => {
  const requestId = c.get("requestId");

  if (error instanceof AppError) {
    const log = error.status >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
    log({ err: error, requestId, status: error.status, code: error.code }, error.message);
    const body: ApiErrorResponse = {
      error: { code: error.code, message: error.message, details: error.details, requestId },
    };
    return c.json(body, error.status);
  }

  if (error instanceof HTTPException) {
    logger.warn({ err: error, requestId, status: error.status }, error.message);
    const code = error.status === 504 ? "TIMEOUT" : "BAD_REQUEST";
    const body: ApiErrorResponse = {
      error: { code, message: error.message || "Request failed", requestId },
    };
    return c.json(body, error.status);
  }

  logger.error({ err: error, requestId }, "Unhandled error");
  const body: ApiErrorResponse = {
    error: { code: "INTERNAL_ERROR", message: "Internal server error", requestId },
  };
  return c.json(body, 500);
};

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) => {
  const body: ApiErrorResponse = {
    error: {
      code: "NOT_FOUND",
      message: `Route ${c.req.method} ${c.req.path} not found`,
      requestId: c.get("requestId"),
    },
  };
  return c.json(body, 404);
};
