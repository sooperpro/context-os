import {
  ExpertListSchema,
  PeopleDirectorySchema,
  PersonProfileSchema,
  TeamDirectorySchema,
  type DirectoryPerson,
  type ExpertList,
  type KnowledgeSection,
  type PeopleDirectory,
  type PeopleFilter,
  type PersonProfile,
  type PersonRef,
  type TeamArea,
  type TeamDirectory,
} from "@contextos/shared";
import { z } from "zod";
import { apiRequest } from "@/lib/api-client";

const OrganizationSchema = z
  .object({
    departmentId: z.string().nullable().optional(),
    teamId: z.string().nullable().optional(),
    jobTitle: z.string().nullable().optional(),
    roleFamily: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    timezone: z.string().nullable().optional(),
    startDate: z.string().nullable().optional(),
    isNewHire: z.boolean().optional(),
  })
  .passthrough();

const MemberSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
    status: z.string(),
    managerId: z.string().nullable().optional(),
    organization: OrganizationSchema.default({}),
  })
  .passthrough();

const MemberListSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(MemberSchema),
});

const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  departmentId: z.string(),
  parentId: z.string().nullable(),
});
const TeamListSchema = z.object({ items: z.array(TeamSchema) });

const AssignmentSchema = z.object({
  id: z.string(),
  type: z.string(),
  scopeType: z.string(),
  scopeId: z.string(),
});
const PublicProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  organization: OrganizationSchema.default({}),
  assignments: z.array(AssignmentSchema).default([]),
});
const ViewerSchema = z.object({ id: z.string() }).passthrough();

type Member = z.infer<typeof MemberSchema>;
type Team = z.infer<typeof TeamSchema>;
type PublicProfile = z.infer<typeof PublicProfileSchema>;

/** The directory is assembled from the live user, team and public-profile APIs. */
export const PEOPLE_ENDPOINTS = {
  directory: { path: "/v1/users", schema: PeopleDirectorySchema },
  experts: { path: "/v1/people/:id", schema: ExpertListSchema },
  teams: { path: "/v1/org/teams", schema: TeamDirectorySchema },
  profile: { path: "/v1/people/:id", schema: PersonProfileSchema },
} as const;

const ROLE_LABEL: Record<string, string> = {
  owner: "Workspace owner",
  admin: "Workspace admin",
  manager: "Manager",
  member: "Team member",
  guest: "Guest",
};

const roleTitle = (member: Member) =>
  member.organization.jobTitle ?? ROLE_LABEL[member.role] ?? member.role;
const personRef = (member: Member): PersonRef => ({
  id: member.id,
  name: member.name,
  title: roleTitle(member),
});

function teamArea(team: Team, members: Member[]): TeamArea {
  const families = members
    .filter((member) => member.organization.teamId === team.id)
    .map((member) => member.organization.roleFamily?.toLocaleLowerCase() ?? "");
  const value = `${team.name.toLocaleLowerCase()} ${families.join(" ")}`;
  if (value.includes("design")) return "design";
  if (value.includes("sales")) return "sales";
  if (value.includes("support") || value.includes("customer") || /\bcs\b/.test(value))
    return "support";
  if (value.includes("data") || value.includes("analytics")) return "data";
  if (value.includes("product") || /\bpm\b/.test(value)) return "product";
  if (value.includes("people") || value.includes("human") || /\bhr\b/.test(value)) return "people";
  if (value.includes("finance") || value.includes("billing")) return "finance";
  if (value.includes("leadership") || value.includes("executive")) return "leadership";
  if (/\bit\b/.test(value) || value.includes("security") || value.includes("systems")) return "it";
  if (value.includes("eng") || value.includes("developer")) return "engineering";
  return "other";
}

const isNewMember = (member: Member) => {
  if (member.organization.isNewHire) return true;
  if (!member.organization.startDate) return false;
  const age = Date.now() - Date.parse(`${member.organization.startDate}T00:00:00Z`);
  return Number.isFinite(age) && Math.abs(age) <= 90 * 86_400_000;
};

function relationsFor(member: Member, viewer: Member | undefined): DirectoryPerson["relations"] {
  if (!viewer) return [];
  const relations: DirectoryPerson["relations"] = [];
  if (member.id === viewer.id) relations.push("you");
  if (member.id === viewer.managerId) relations.push("manager");
  if (member.managerId === viewer.id) relations.push("report");
  return relations;
}

function toDirectoryPerson(
  member: Member,
  teams: Map<string, Team>,
  viewer: Member | undefined,
  profile?: PublicProfile,
): DirectoryPerson {
  const team = member.organization.teamId ? teams.get(member.organization.teamId) : undefined;
  return {
    id: member.id,
    name: member.name,
    title: roleTitle(member),
    team: team ? { id: team.id, name: team.name } : null,
    location: member.organization.location ?? null,
    timeZone: member.organization.timezone ?? null,
    joinedOn: member.organization.startDate ?? null,
    skills: [],
    expert: Boolean(profile?.assignments.length),
    isNew: isNewMember(member),
    relations: relationsFor(member, viewer),
  };
}

async function loadDirectory(signal?: AbortSignal, withProfiles = false) {
  const [members, teams, viewer] = await Promise.all([
    apiRequest("/v1/users", {
      query: { limit: 100, offset: 0 },
      schema: MemberListSchema,
      signal,
    }),
    apiRequest("/v1/org/teams", {
      query: { limit: 100, offset: 0 },
      schema: TeamListSchema,
      signal,
    }),
    apiRequest("/v1/users/me", { schema: ViewerSchema, signal }),
  ]);
  const active = members.items.filter((member) => member.status === "active");
  const profiles = withProfiles
    ? await Promise.all(
        active.map((member) =>
          apiRequest(`/v1/people/${encodeURIComponent(member.id)}`, {
            schema: PublicProfileSchema,
            signal,
          }),
        ),
      )
    : [];
  return {
    total: members.total,
    members: active,
    teams: teams.items,
    viewer: active.find((member) => member.id === viewer.id),
    profiles: new Map(profiles.map((profile) => [profile.id, profile])),
  };
}

export async function fetchDirectory(
  query: { q: string; filter: PeopleFilter },
  signal?: AbortSignal,
): Promise<PeopleDirectory> {
  const data = await loadDirectory(signal, query.filter === "experts");
  const teams = new Map(data.teams.map((team) => [team.id, team]));
  const people = data.members.map((member) =>
    toDirectoryPerson(member, teams, data.viewer, data.profiles.get(member.id)),
  );
  const needle = query.q.trim().toLocaleLowerCase();
  // "My team" is empty, not everyone, for a viewer who is not on a team yet.
  const ownTeamId = data.viewer?.organization.teamId ?? null;
  const items = people.filter((person) => {
    if (query.filter === "team" && (!ownTeamId || person.team?.id !== ownTeamId)) return false;
    if (query.filter === "experts" && !person.expert) return false;
    if (query.filter === "new" && !person.isNew) return false;
    return (
      !needle ||
      `${person.name} ${person.title} ${person.team?.name ?? ""} ${person.skills.join(" ")}`
        .toLocaleLowerCase()
        .includes(needle)
    );
  });
  return PeopleDirectorySchema.parse({
    total: data.members.length,
    teamCount: data.teams.length,
    items,
  });
}

const scopeTopic = (assignment: PublicProfile["assignments"][number]) => {
  if (assignment.scopeType === "workspace") return "Workspace knowledge";
  if (assignment.scopeType === "project") return "Project knowledge";
  const section = assignment.scopeId.split(":").at(-1)?.replaceAll("_", " ");
  return section
    ? `${section.replace(/^\w/, (letter) => letter.toUpperCase())} knowledge`
    : "Knowledge owner";
};

export async function fetchExperts(signal?: AbortSignal): Promise<ExpertList> {
  const data = await loadDirectory(signal, true);
  const teams = new Map(data.teams.map((team) => [team.id, team]));
  return ExpertListSchema.parse({
    items: data.members.flatMap((member) => {
      const profile = data.profiles.get(member.id);
      const team = member.organization.teamId ? teams.get(member.organization.teamId) : undefined;
      return (profile?.assignments ?? []).map((assignment) => ({
        topic: scopeTopic(assignment),
        area: team ? teamArea(team, data.members) : "other",
        person: personRef(member),
      }));
    }),
  });
}

function teamLead(teamMembers: Member[]): Member | undefined {
  return (
    [...teamMembers]
      .sort(
        (a, b) =>
          teamMembers.filter((member) => member.managerId === b.id).length -
          teamMembers.filter((member) => member.managerId === a.id).length,
      )
      .find(
        (member) =>
          member.role === "manager" || teamMembers.some((row) => row.managerId === member.id),
      ) ?? teamMembers[0]
  );
}

export async function fetchTeams(signal?: AbortSignal): Promise<TeamDirectory> {
  const data = await loadDirectory(signal);
  const teams = new Map(data.teams.map((team) => [team.id, team]));
  const directory = new Map(
    data.members.map((member) => [
      member.id,
      toDirectoryPerson(member, teams, data.viewer, data.profiles.get(member.id)),
    ]),
  );
  const items = data.teams.flatMap((team) => {
    const members = data.members.filter((member) => member.organization.teamId === team.id);
    const lead = teamLead(members);
    if (!lead) return [];
    return [
      {
        id: team.id,
        name: team.name,
        area: teamArea(team, data.members),
        size: members.length,
        focus: "Team directory",
        lead: personRef(lead),
        members: members
          .filter((member) => member.id !== lead.id)
          .slice(0, 5)
          .map(personRef),
      },
    ];
  });
  const ownTeamId = data.viewer?.organization.teamId;
  const ownTeam = ownTeamId ? teams.get(ownTeamId) : undefined;
  const ownMembers = ownTeam
    ? data.members.filter((member) => member.organization.teamId === ownTeam.id)
    : [];
  const lead = teamLead(ownMembers);
  return TeamDirectorySchema.parse({
    myTeam:
      ownTeam && lead
        ? {
            id: ownTeam.id,
            name: ownTeam.name,
            lead: directory.get(lead.id),
            members: ownMembers
              .filter((member) => member.id !== lead.id)
              .map((member) => directory.get(member.id)),
          }
        : null,
    items,
  });
}

const SECTION_BY_KEY: Record<string, KnowledgeSection> = {
  overview: "project",
  business_context: "product",
  architecture: "system",
  timeline: "project",
  decisions: "decision",
  people: "company",
  current_state: "project",
  dependencies: "system",
  resources: "project",
  glossary: "glossary",
};

export async function fetchPerson(id: string, signal?: AbortSignal): Promise<PersonProfile> {
  const [profile, members, teams, viewer] = await Promise.all([
    apiRequest(`/v1/people/${encodeURIComponent(id)}`, { schema: PublicProfileSchema, signal }),
    apiRequest("/v1/users", {
      query: { limit: 100, offset: 0 },
      schema: MemberListSchema,
      signal,
    }),
    apiRequest("/v1/org/teams", {
      query: { limit: 100, offset: 0 },
      schema: TeamListSchema,
      signal,
    }),
    apiRequest("/v1/users/me", { schema: ViewerSchema, signal }),
  ]);
  const member = members.items.find((entry) => entry.id === profile.id);
  if (!member) throw new Error("Member not found in the workspace directory");
  const teamMap = new Map(teams.items.map((team) => [team.id, team]));
  const viewerMember = members.items.find((entry) => entry.id === viewer.id);
  const manager = members.items.find((entry) => entry.id === member.managerId);
  const owns = profile.assignments.map((assignment) => {
    const key =
      assignment.scopeType === "section" ? assignment.scopeId.split(":").at(-1) : undefined;
    const projectId =
      assignment.scopeType === "project"
        ? assignment.scopeId
        : assignment.scopeType === "section"
          ? (assignment.scopeId.split(":")[0] ?? null)
          : null;
    return {
      id: assignment.id,
      title: scopeTopic(assignment),
      section: key
        ? (SECTION_BY_KEY[key] ?? "project")
        : assignment.scopeType === "workspace"
          ? "company"
          : "project",
      projectId,
    };
  });
  return PersonProfileSchema.parse({
    ...toDirectoryPerson(member, teamMap, viewerMember, profile),
    bio: null,
    manager: manager ? personRef(manager) : null,
    reports: members.items.filter((entry) => entry.managerId === member.id).map(personRef),
    owns,
    onboarding: null,
  });
}
