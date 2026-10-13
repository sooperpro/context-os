import type { ApiErrorCode, ValidationIssue } from "@contextos/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Base class for errors that are safe to surface to API clients.
 * Anything that is not an AppError is treated as an unexpected 500.
 */
export class AppError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown) {
    super(400, "BAD_REQUEST", message, details);
  }
}

export class ValidationError extends AppError {
  constructor(issues: ValidationIssue[], message = "Request validation failed") {
    super(400, "VALIDATION_ERROR", message, { issues });
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(404, "NOT_FOUND", id ? `${resource} '${id}' was not found` : `${resource} was not found`);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(maxBytes: number) {
    super(413, "PAYLOAD_TOO_LARGE", `Request body exceeds the ${maxBytes} byte limit`);
  }
}

export class RateLimitedError extends AppError {
  constructor() {
    super(429, "RATE_LIMITED", "Too many requests, please try again later");
  }
}

export class UpstreamServiceError extends AppError {
  constructor(message: string, details?: unknown, options?: ErrorOptions) {
    super(502, "UPSTREAM_ERROR", message, details, options);
  }
}
