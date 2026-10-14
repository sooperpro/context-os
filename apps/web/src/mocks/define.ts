import { delay, http, HttpResponse, type HttpHandler, type JsonBodyType } from "msw";
import type { z } from "zod";
import { buildApiUrl } from "@/lib/api-client";
import { mockKey } from "@/lib/preview-data";

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
      const body = endpoint.schema.parse(resolve({ request, params })) as JsonBodyType;
      return HttpResponse.json(body, { headers: { "X-ContextOS-Mock": "1" } });
    }),
  });
}
