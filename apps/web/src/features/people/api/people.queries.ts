import type { PeopleFilter } from "@contextos/shared";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  fetchDirectory,
  fetchExperts,
  fetchOwnership,
  fetchPerson,
  fetchTeams,
} from "./people.api";

export const peopleKeys = {
  all: ["people"] as const,
  directory: (q: string, filter: PeopleFilter) =>
    [...peopleKeys.all, "directory", q, filter] as const,
  experts: () => [...peopleKeys.all, "experts"] as const,
  teams: () => [...peopleKeys.all, "teams"] as const,
  person: (id: string) => [...peopleKeys.all, "person", id] as const,
};

/** Searching keeps the last results on screen while the next ones load. */
export const directoryQuery = (q: string, filter: PeopleFilter) =>
  queryOptions({
    queryKey: peopleKeys.directory(q, filter),
    queryFn: ({ signal }) => fetchDirectory({ q, filter }, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

export const expertsQuery = () =>
  queryOptions({
    queryKey: peopleKeys.experts(),
    queryFn: ({ signal }) => fetchExperts(signal),
    staleTime: 5 * 60_000,
  });

export const teamsDirectoryQuery = () =>
  queryOptions({
    queryKey: peopleKeys.teams(),
    queryFn: ({ signal }) => fetchTeams(signal),
    staleTime: 5 * 60_000,
  });

export const ownershipQuery = (id: string) =>
  queryOptions({
    queryKey: [...peopleKeys.person(id), "ownership"] as const,
    queryFn: ({ signal }) => fetchOwnership(id, signal),
    staleTime: 60_000,
  });

export const personQuery = (id: string) =>
  queryOptions({
    queryKey: peopleKeys.person(id),
    queryFn: ({ signal }) => fetchPerson(id, signal),
  });
