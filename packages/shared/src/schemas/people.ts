import { z } from "zod";
import { KnowledgeSectionSchema, OnboardingStatusSchema, PersonRefSchema } from "./refs.js";

/*
 * Contracts for the People directory and profiles (prototype "People"). The API's `GET /users` has
 * names and roles only; these add what the directory shows: title, team, location, skills, expertise
 * and what each person owns in the Knowledge Hub. Until they are served, the web app's development
 * mock layer answers them; docs/api-change-requests.md tracks them.
 */

const DateOnly = z.iso.date();
const Count = z.number().int().min(0);

/** How someone relates to the viewer, for the badges on cards and profiles. */
export const PersonRelationSchema = z.enum(["you", "manager", "buddy", "report"]);
export type PersonRelation = z.infer<typeof PersonRelationSchema>;

/** What a team works on; the UI picks its icon from this. */
export const TeamAreaSchema = z.enum([
  "engineering",
  "finance",
  "product",
  "data",
  "design",
  "support",
  "sales",
  "people",
  "it",
  "leadership",
  "other",
]);
export type TeamArea = z.infer<typeof TeamAreaSchema>;

/** The expressive shapes someone can pick for their avatar (prototype settings.js `SHAPES`). */
export const AvatarShapeSchema = z.enum([
  "cookie9",
  "cookie6",
  "clover4",
  "sunny",
  "flower",
  "cookie4",
  "clover8",
  "cookie12",
]);
export type AvatarShapeChoice = z.infer<typeof AvatarShapeSchema>;

/** Longest values for the fields people write about themselves. */
export const PROFILE_LIMITS = { pronouns: 40, location: 100, bio: 600, skill: 40, skills: 20 };

/**
 * What a person says about themselves (role access spec §4.9, Settings › Profile), on
 * `GET /users/me` and their People profile. Empty strings mean "not set"; a null avatar shape means
 * the one picked from their id.
 */
export const PersonalProfileSchema = z.object({
  pronouns: z.string(),
  location: z.string(),
  bio: z.string(),
  skills: z.array(z.string()),
  avatarShape: AvatarShapeSchema.nullable(),
});
export type PersonalProfile = z.infer<typeof PersonalProfileSchema>;

export const DirectoryPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  team: z.object({ id: z.string(), name: z.string() }).nullable(),
  location: z.string().nullable(),
  /** IANA zone, e.g. "Europe/London"; the UI shows the current offset. */
  timeZone: z.string().nullable(),
  /** A future date means they are starting soon. */
  joinedOn: DateOnly.nullable(),
  skills: z.array(z.string()),
  /** Recognized as an expert from what they own and contribute. */
  expert: z.boolean(),
  /** Joined in the last 90 days, or starting soon. */
  isNew: z.boolean(),
  relations: z.array(PersonRelationSchema),
});
export type DirectoryPerson = z.infer<typeof DirectoryPersonSchema>;

export const PeopleFilterSchema = z.enum(["all", "team", "experts", "new"]);
export type PeopleFilter = z.infer<typeof PeopleFilterSchema>;

/** `GET /v1/people?q=&filter=`: the directory, best match first. `total` counts the whole workspace. */
export const PeopleDirectorySchema = z.object({
  total: Count,
  teamCount: Count,
  items: z.array(DirectoryPersonSchema),
});
export type PeopleDirectory = z.infer<typeof PeopleDirectorySchema>;

/** `GET /v1/people/experts`: who to ask about what. */
export const ExpertListSchema = z.object({
  items: z.array(z.object({ topic: z.string(), area: TeamAreaSchema, person: PersonRefSchema })),
});
export type ExpertList = z.infer<typeof ExpertListSchema>;

export const DirectoryTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  area: TeamAreaSchema,
  size: Count,
  /** What the team owns: "Ingest gateway, event bus, ledger service", or its department. */
  focus: z.string(),
  /** Null for a team nobody is on yet and with no lead set. */
  lead: PersonRefSchema.nullable(),
  /** A few members for the avatar stack. */
  members: z.array(PersonRefSchema),
});
export type DirectoryTeam = z.infer<typeof DirectoryTeamSchema>;

/** `GET /v1/people/teams`: the viewer's team as an org chart, then every team. */
export const TeamDirectorySchema = z.object({
  myTeam: z
    .object({
      id: z.string(),
      name: z.string(),
      lead: DirectoryPersonSchema,
      members: z.array(DirectoryPersonSchema),
    })
    .nullable(),
  items: z.array(DirectoryTeamSchema),
});
export type TeamDirectory = z.infer<typeof TeamDirectorySchema>;

/** `GET /v1/people/:id`: a profile. */
export const PersonProfileSchema = DirectoryPersonSchema.extend({
  bio: z.string().nullable(),
  pronouns: z.string().nullable().default(null),
  /** The avatar shape they picked; null for the one picked from their id. */
  avatarShape: AvatarShapeSchema.nullable().default(null),
  manager: PersonRefSchema.nullable(),
  reports: z.array(PersonRefSchema),
  /** Knowledge Hub pages they own. */
  owns: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      section: KnowledgeSectionSchema,
      /** The project page to open, when the item lives in one. */
      projectId: z.string().nullable(),
    }),
  ),
  /** Their onboarding, shown only to their manager and HR; null for everyone else. */
  onboarding: z.object({ startedOn: DateOnly, status: OnboardingStatusSchema }).nullable(),
});
export type PersonProfile = z.infer<typeof PersonProfileSchema>;
