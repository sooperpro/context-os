import { contributionMocks } from "@/mocks/contributions";

/**
 * Every endpoint the mock layer answers. Only endpoints the API does not serve belong here: requests
 * to anything else pass through to the real API. When an endpoint ships, delete its mock and update
 * the status table in docs/api-change-requests.md.
 */
export const mockEndpoints = [...contributionMocks];
