import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";
import { registerPreviewEndpoints } from "@/lib/preview-data";
import { resetContributionMocks } from "@/mocks/contributions";
import { mockEndpoints } from "@/mocks/endpoints";
import { resetLearningMocks } from "@/mocks/learning";
import { resetTeamMocks } from "@/mocks/team";

/**
 * The development mock layer under Node, for tests. `setupMockApi()` answers the mocked endpoints
 * with the same schema-checked data the browser sees; add `server.use(...)` overrides per test.
 * Unhandled requests fail the test so a missing fixture is never silent.
 */
export const mockServer = setupServer(...mockEndpoints.map((endpoint) => endpoint.handler));

export function setupMockApi(): void {
  beforeAll(() => {
    mockServer.listen({ onUnhandledRequest: "error" });
    registerPreviewEndpoints(mockEndpoints.map((endpoint) => endpoint.key));
  });
  afterEach(() => {
    mockServer.resetHandlers();
    resetContributionMocks();
    resetLearningMocks();
    resetTeamMocks();
  });
  afterAll(() => mockServer.close());
}
