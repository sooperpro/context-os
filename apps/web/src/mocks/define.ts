import { delay, http, HttpResponse, type HttpHandler, type JsonBodyType } from "msw";
import type { z } from "zod";
import { buildApiUrl } from "@/lib/api-client";
import { mockKey } from "@/lib/preview-data";

/** Throw from a resolver to answer 404 with the API's error envelope. */
export class MockNotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "MockNotFoundError";
  }
}

function notFound(error: unknown) {
  if (!(error instanceof MockNotFoundError)) throw error;
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: error.message } }, { status: 404 });
}

export interface MockEndpoint {
  /** "GET /v1/me/tasks": the path as the UI requests it, before the API base is added. */
  key: string;
  handler: HttpHandler;
}

interface ResolverContext {
  request: Request;
  params: Record<string, string | readonly string[] | undefined>;
}

/**
 * A mocked API endpoint, for one the backend does not serve yet:
 * `mockGet(HOME_ENDPOINTS.myTasks)(() => ({ ... }))`. The fixture is type-checked against the shared
 * schema, and the response is parsed with it at runtime too, so a mock that drifts from the contract
 * fails here, loudly, instead of rendering data the real endpoint will never send. Two calls, so the
 * schema fixes the fixture's type before the fixture is checked. Delete the mock when the endpoint ships.
 */
export function mockGet<S extends z.ZodType>(endpoint: { path: string; schema: S }) {
  return (resolve: (context: ResolverContext) => z.input<S>): MockEndpoint => ({
    key: mockKey("GET", endpoint.path),
    handler: http.get(buildApiUrl(endpoint.path), async ({ request, params }) => {
      // A realistic pause in the browser (instant under Node), so loading states get exercised.
      await delay();
      try {
        const body = endpoint.schema.parse(resolve({ request, params })) as JsonBodyType;
        return HttpResponse.json(body, { headers: { "X-ContextOS-Mock": "1" } });
      } catch (error) {
        return notFound(error);
      }
    }),
  });
}

/**
 * A mocked write endpoint: `mockPost(ENDPOINTS.create)((input, context) => ({ ... }))`. The request
 * body is validated with the endpoint's input schema, as the API would; an invalid body answers 400
 * with the API's error envelope. The response is parsed with the response schema.
 */
export function mockPost<S extends z.ZodType, I extends z.ZodType>(endpoint: {
  path: string;
  schema: S;
  input: I;
}) {
  return (
    resolve: (input: z.output<I>, context: ResolverContext) => z.input<S>,
    status = 200,
  ): MockEndpoint => ({
    key: mockKey("POST", endpoint.path),
    handler: http.post(buildApiUrl(endpoint.path), async ({ request, params }) => {
      await delay();
      const text = await request.text();
      const parsed = endpoint.input.safeParse(text ? JSON.parse(text) : {});
      if (!parsed.success) {
        return HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "The request is not valid.",
              details: parsed.error.issues,
            },
          },
          { status: 400 },
        );
      }
      try {
        const body = endpoint.schema.parse(resolve(parsed.data, { request, params })) as JsonBodyType;
        return HttpResponse.json(body, { status, headers: { "X-ContextOS-Mock": "1" } });
      } catch (error) {
        return notFound(error);
      }
    }),
  });
}
