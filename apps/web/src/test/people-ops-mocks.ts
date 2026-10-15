import { peopleOpsMocks } from "@/mocks/home/people-ops";
import { peopleOpsPageMocks } from "@/mocks/people-ops";

/**
 * The API serves every People Ops endpoint, so they are not in the development mock layer
 * (src/mocks/endpoints.ts). Tests of HR screens install these fixtures per test:
 * `beforeEach(() => mockServer.use(...peopleOpsHandlers()))`.
 */
export const peopleOpsHandlers = () =>
  [...peopleOpsMocks, ...peopleOpsPageMocks].map((endpoint) => endpoint.handler);

/** Every People Ops fixture, for the schema check in src/mocks/endpoints.test.ts. */
export const peopleOpsFixtures = [...peopleOpsMocks, ...peopleOpsPageMocks];
