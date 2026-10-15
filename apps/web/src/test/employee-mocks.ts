import { accountMocks } from "@/mocks/account";
import { employeeHomeFixtures } from "@/mocks/home/employee";
import { welcomeMocks } from "@/mocks/welcome";

/**
 * The API serves the employee's own endpoints (apps/api/src/modules/platform/employee.routes.ts): Home's
 * knowledge updates, team news and people to know, the first-day welcome, Context Bot preferences and
 * the data export. They are not in the development mock layer (src/mocks/endpoints.ts). Tests of
 * those screens install these fixtures per test: `beforeEach(() => mockServer.use(...employeeHandlers()))`.
 * What a test saves (welcome, preferences) lasts until `setupMockApi` resets it after the test.
 */
export const employeeFixtures = [...employeeHomeFixtures, ...welcomeMocks, ...accountMocks];

export const employeeHandlers = () => employeeFixtures.map((endpoint) => endpoint.handler);
