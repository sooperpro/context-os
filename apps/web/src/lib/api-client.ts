import { ApiErrorResponseSchema } from "@contextos/shared";
import type { z } from "zod";
import { env } from "@/config/env";

/** Error thrown for any non-2xx API response, carrying the server's error envelope. */
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

type QueryValue = string | number | boolean | null | undefined;
type AccessTokenProvider = () => Promise<string | null>;

let accessTokenProvider: AccessTokenProvider | undefined;

/** Connects the framework-agnostic API client to the active auth session. */
export function setApiAccessTokenProvider(provider?: AccessTokenProvider): void {
  accessTokenProvider = provider;
}

export interface ApiRequestOptions<TResponse> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Zod schema used to validate the response at the boundary. */
  schema: z.ZodType<TResponse>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const base = env.VITE_API_BASE_URL.replace(/\/+$/, "");
  const url = `${base}/${path.replace(/^\/+/, "")}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Minimal typed fetch wrapper. Every response is validated against a schema
 * from `@contextos/shared`, so the UI never trusts unvalidated JSON.
 */
export async function apiRequest<TResponse>(
  path: string,
  { method = "GET", body, query, schema, signal }: ApiRequestOptions<TResponse>,
): Promise<TResponse> {
  const accessToken = await accessTokenProvider?.();
  const response = await fetch(buildUrl(path, query), {
    method,
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (response.status === 204) {
    return schema.parse(undefined);
  }

  const json: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = ApiErrorResponseSchema.safeParse(json);
    if (parsed.success) {
      const { code, message, details, requestId } = parsed.data.error;
      throw new ApiClientError(response.status, code, message, details, requestId);
    }
    throw new ApiClientError(
      response.status,
      "HTTP_ERROR",
      `Request failed with status ${response.status}`,
    );
  }

  return schema.parse(json);
}
