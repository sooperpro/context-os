import { contributionMocks } from "@/mocks/contributions";
import { learningMocks } from "@/mocks/learning";
import { peopleMocks } from "@/mocks/people";
import { peopleOpsPageMocks } from "@/mocks/people-ops";
import { teamMocks } from "@/mocks/team";
import { adminMocks } from "@/mocks/home/admin";
import { employeeMocks } from "@/mocks/home/employee";
import { managerMocks } from "@/mocks/home/manager";
import { peopleOpsMocks } from "@/mocks/home/people-ops";

/**
 * Every endpoint the mock layer answers. Only endpoints the API does not serve belong here: requests
 * to anything else pass through to the real API. When an endpoint ships, delete its mock and update
 * the status table in docs/api-change-requests.md.
 */
export const mockEndpoints = [
  ...employeeMocks,
  ...learningMocks,
  ...peopleMocks,
  ...contributionMocks,
  ...teamMocks,
  ...managerMocks,
  ...peopleOpsMocks,
  ...peopleOpsPageMocks,
  ...adminMocks,
];
