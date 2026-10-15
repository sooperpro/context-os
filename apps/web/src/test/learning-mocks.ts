import { employeeMocks } from "@/mocks/home/employee";
import { learningMocks } from "@/mocks/learning";

/**
 * The API serves the learner's endpoints (apps/api/src/modules/learning/learner.routes.ts): My
 * roadmap, modules, lessons, knowledge checks, ratings, requests, and Home's "Up next", onboarding
 * summary, tasks and milestones. They are not in the development mock layer
 * (src/mocks/endpoints.ts). Tests of those screens install these fixtures per test:
 * `beforeEach(() => mockServer.use(...learnerHandlers()))`.
 */
export const learnerFixtures = [...learningMocks, ...employeeMocks];

export const learnerHandlers = () => learnerFixtures.map((endpoint) => endpoint.handler);
