import { reviewQueueMocks } from "@/mocks/contributions";
import { managerMocks } from "@/mocks/home/manager";
import { myLearningMocks } from "@/mocks/learning";
import { teamMocks } from "@/mocks/team";

/**
 * The API serves the manager's endpoints (team onboarding, member pages, check-ins, assigning, Home's
 * attention, check-ins and knowledge cards, the review queue and My learning), so they are not in the
 * development mock layer (src/mocks/endpoints.ts). Tests of manager screens install these fixtures
 * per test: `beforeEach(() => mockServer.use(...managerHandlers()))`.
 */
export const managerFixtures = [
  ...teamMocks,
  ...managerMocks,
  ...reviewQueueMocks,
  ...myLearningMocks,
];

export const managerHandlers = () => managerFixtures.map((endpoint) => endpoint.handler);
