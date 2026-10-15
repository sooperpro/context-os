import { accountMocks } from "@/mocks/account";
import { contributionMocks } from "@/mocks/contributions";
import { learningMocks } from "@/mocks/learning";
import { welcomeMocks } from "@/mocks/welcome";
import { employeeMocks } from "@/mocks/home/employee";

/**
 * Every endpoint the mock layer answers. Only endpoints the API does not serve belong here: requests
 * to anything else pass through to the real API. When an endpoint ships, delete its mock and update
 * the status table in docs/api-change-requests.md.
 */
export const mockEndpoints = [
  ...employeeMocks,
  ...learningMocks,
  ...contributionMocks,
  ...welcomeMocks,
  ...accountMocks,
];
