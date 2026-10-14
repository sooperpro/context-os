import {
  ExpertListSchema,
  PeopleDirectorySchema,
  PersonProfileSchema,
  TeamDirectorySchema,
  type ExpertList,
  type PeopleDirectory,
  type PeopleFilter,
  type PersonProfile,
  type TeamDirectory,
} from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

/**
 * The People directory endpoints. None is served yet (`GET /users` has names and roles only); in
 * development the mock layer answers them (src/mocks/people.ts). Contracts:
 * packages/shared/src/schemas/people.ts.
 */
export const PEOPLE_ENDPOINTS = {
  directory: { path: "/v1/people", schema: PeopleDirectorySchema },
  experts: { path: "/v1/people/experts", schema: ExpertListSchema },
  teams: { path: "/v1/people/teams", schema: TeamDirectorySchema },
  profile: { path: "/v1/people/:id", schema: PersonProfileSchema },
} as const;

const E = PEOPLE_ENDPOINTS;

export const fetchDirectory = (
  query: { q: string; filter: PeopleFilter },
  signal?: AbortSignal,
): Promise<PeopleDirectory> =>
  apiRequest(E.directory.path, { query: { q: query.q || undefined, filter: query.filter }, schema: E.directory.schema, signal });

export const fetchExperts = (signal?: AbortSignal): Promise<ExpertList> =>
  apiRequest(E.experts.path, { schema: E.experts.schema, signal });

export const fetchTeams = (signal?: AbortSignal): Promise<TeamDirectory> =>
  apiRequest(E.teams.path, { schema: E.teams.schema, signal });

export const fetchPerson = (id: string, signal?: AbortSignal): Promise<PersonProfile> =>
  apiRequest(E.profile.path.replace(":id", encodeURIComponent(id)), { schema: E.profile.schema, signal });
