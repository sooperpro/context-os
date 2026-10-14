import { accountMocks } from "@/mocks/account";
import { adminPageMocks } from "@/mocks/admin";
import { contributionMocks } from "@/mocks/contributions";
import { learningMocks } from "@/mocks/learning";
import { peopleOpsPageMocks } from "@/mocks/people-ops";
import { welcomeMocks } from "@/mocks/welcome";
import { teamMocks } from "@/mocks/team";
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
  ...contributionMocks,
  ...teamMocks,
  ...managerMocks,
  ...peopleOpsMocks,
  ...peopleOpsPageMocks,
  ...adminPageMocks,
  ...welcomeMocks,
  ...accountMocks,
];
