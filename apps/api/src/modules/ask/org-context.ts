import type { PersonRef, SystemRole } from "@contextos/shared";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { Container } from "../../container.js";
import { assignments, departments, memberships, teams, users } from "../../db/schema.js";
import type { Actor } from "../../types.js";
import { organizationFor, personalProfileOf } from "../identity/identity.service.js";
import {
  createOnboardingRecords,
  ONBOARDING,
  type OnboardingRecords,
} from "../platform/onboarding-records.js";
import { reportsOf } from "../platform/reports.js";

/**
 * One thing ContextOS itself knows about the organisation: a person, a team, a department or who
 * owns a project. `text` is what the model reads; the rest is how the answer cites it.
 */
export interface OrgFact {
  kind: "person" | "team" | "department" | "project";
  id: string;
  title: string;
  /** "Engineering Manager · Platform team", shown under the source title. */
  detail: string;
  text: string;
  /** The in-app page it comes from: a profile, the teams view or the project. */
  to: string;
  person: PersonRef | null;
}

/** What the people page calls each workspace role ("member" is an Employee). */
const ROLE_NAME: Record<SystemRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  hr: "HR",
  member: "Employee",
  guest: "Guest",
};

/** Workspace roles a question can ask about: "who is HR", "who are the admins". */
const ROLE_WORDS: Array<[RegExp, SystemRole]> = [
  [/\b(owners?)\b/, "owner"],
  [/\b(admins?|administrators?)\b/, "admin"],
  [/\b(hr|people ops|people operations|people partners?)\b/, "hr"],
  [/\b(managers?)\b/, "manager"],
  [/\b(guests?)\b/, "guest"],
];

/** Words that are also first names, which alone never pick out a person. */
const COMMON_WORDS = new Set([
  "april",
  "art",
  "august",
  "bill",
  "chase",
  "dawn",
  "faith",
  "frank",
  "grace",
  "guy",
  "hope",
  "hunter",
  "joy",
  "june",
  "mark",
  "max",
  "may",
  "pat",
  "ray",
  "rich",
  "rose",
  "sue",
  "summer",
  "sunny",
  "will",
  "the",
  "and",
  "who",
  "team",
]);

const SELF = /\b(my|me|i|i'm|im|am i|mine)\b/;
const OWNERSHIP =
  /\b(own|owns|owner|owners|owned|responsible|in charge|maintains?|leads?|contact)\b/;
const PEOPLE_CUE = /\b(who|whom|whose|people|person|someone|contact|talk to|ask)\b/;

/** At most this many facts go to the model, people first. */
const MAX_PEOPLE = 12;
const MAX_OTHER = 8;
const MAX_LISTED = 15;

/** Lower case, punctuation and possessives out, single spaces, padded so phrases match whole words. */
const normalize = (text: string) =>
  ` ${text
    .toLocaleLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
const mentions = (question: string, phrase: string) => {
  const needle = normalize(phrase).trim();
  return needle.length >= 2 && question.includes(` ${needle} `);
};
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const list = (names: string[], more: number) =>
  `${names.join(", ")}${more > 0 ? ` and ${more} more` : ""}`;

/*
 * Context Bot's organisation context: people, workspace roles, teams, departments, reporting
 * lines, skills and who owns what, from ContextOS itself. Only the asker's active workspace is read,
 * with what the People pages would show them (organizationFor), so nothing from another workspace
 * and no private profile fields reach the answer. Guests get none, as they get no directory. A
 * person's onboarding is added only for them, their manager, People Ops (HR) and the Owner.
 */
export function createOrgContext(container: Container) {
  const { db, services } = container;
  let onboardingRecords: OnboardingRecords | undefined;
  const records = () => (onboardingRecords ??= createOnboardingRecords(container));

  const load = (actor: Actor) => {
    const ws = actor.workspaceId;
    const members = db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        preferences: users.preferences,
        role: memberships.role,
        managerId: memberships.managerId,
        organization: memberships.organization,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.workspaceId, ws), eq(memberships.status, "active")))
      .orderBy(users.name)
      .all();
    const departmentRows = db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(eq(departments.workspaceId, ws))
      .all();
    const teamRows = db
      .select({ id: teams.id, name: teams.name, departmentId: teams.departmentId })
      .from(teams)
      .where(eq(teams.workspaceId, ws))
      .all();
    const owned = db
      .select({
        userId: assignments.userId,
        scopeType: assignments.scopeType,
        scopeId: assignments.scopeId,
      })
      .from(assignments)
      .where(
        and(
          eq(assignments.workspaceId, ws),
          eq(assignments.type, "domain_owner"),
          or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
        ),
      )
      .all();
    // Only projects the asker can open are named.
    const projects = services.projects.list(actor);
    let onboarding: ReturnType<OnboardingRecords["store"]["listWhere"]> | undefined;
    const onboardingOf = (userId: string) =>
      (onboarding ??= records().store.listWhere(ws, ONBOARDING, { status: "active" }, 1000)).find(
        (row) => records().recordData(row).personId === userId,
      );
    return { members, departmentRows, teamRows, owned, projects, onboardingOf };
  };

  type Directory = ReturnType<typeof load>;
  type Member = Directory["members"][number];

  /** Onboarding: only for the person, their manager (decision D5), HR and the Owner. */
  const onboardingLine = (
    actor: Actor,
    member: Member,
    directory: Directory,
    managed: Set<string>,
  ) => {
    const self = actor.id === member.id;
    if (!self && !managed.has(member.id) && actor.role !== "hr" && actor.role !== "owner")
      return null;
    const row = directory.onboardingOf(member.id);
    if (!row) return null;
    const view = records().evaluate(row);
    const template = records().templateRef(actor.workspaceId, view.data.templateId);
    const buddy = view.data.buddyId
      ? db.select({ name: users.name }).from(users).where(eq(users.id, view.data.buddyId)).get()
      : undefined;
    const parts = [
      view.started
        ? `started ${view.data.startDate} (week ${Math.floor(view.elapsed / 7) + 1})`
        : `starts ${view.data.startDate}`,
      view.stage ? `current stage “${view.stage}”` : null,
      template ? `roadmap from the “${template.name}” template` : "no roadmap template yet",
      buddy ? `buddy ${buddy.name}` : "no buddy yet",
      // How it's going is for the people who look after it, not a line people read about themselves.
      self ? null : `${view.status.replace(/_/g, " ")} (${view.note})`,
    ].filter(Boolean);
    return `Onboarding: ${parts.join("; ")}.`;
  };

  const personFact = (
    actor: Actor,
    member: Member,
    directory: Directory,
    managed: Set<string>,
  ): OrgFact => {
    const { members, teamRows, departmentRows, owned, projects } = directory;
    const organization = organizationFor(actor, {
      userId: member.id,
      managerId: member.managerId,
      organization: member.organization,
    });
    const profile = personalProfileOf(member.preferences, member.organization);
    const title = text(organization.jobTitle);
    const team = teamRows.find((row) => row.id === organization.teamId);
    const department = departmentRows.find(
      (row) => row.id === (organization.departmentId ?? team?.departmentId),
    );
    const manager = members.find((row) => row.id === member.managerId);
    const reports = members.filter((row) => row.managerId === member.id);
    const owns = owned
      .filter((row) => row.userId === member.id)
      .flatMap((row) => {
        if (row.scopeType === "workspace") return ["the whole workspace"];
        const project = projects.find((entry) => entry.id === row.scopeId);
        return row.scopeType === "project" && project ? [`the ${project.name} project`] : [];
      });
    const lines = [
      `${member.name}${title ? `, ${title}` : ""}.`,
      `Workspace role: ${ROLE_NAME[member.role]}.`,
      profile.pronouns ? `Pronouns: ${profile.pronouns}.` : null,
      team || department
        ? `Team: ${[
            team ? `${team.name} team` : null,
            department ? `${department.name} department` : null,
          ]
            .filter(Boolean)
            .join(", ")}.`
        : "No team set.",
      manager ? `Reports to ${manager.name}.` : "No manager set.",
      reports.length
        ? `Manages ${list(
            reports.slice(0, MAX_LISTED).map((row) => row.name),
            reports.length - MAX_LISTED,
          )}.`
        : null,
      owns.length ? `Owns ${owns.join(", ")} in ContextOS.` : null,
      profile.skills.length ? `Skills: ${profile.skills.join(", ")}.` : null,
      profile.location || text(organization.timezone)
        ? `Based in ${[profile.location, text(organization.timezone)].filter(Boolean).join(", ")}.`
        : null,
      organization.isNewHire === true || typeof organization.startDate === "string"
        ? typeof organization.startDate === "string"
          ? `Start date ${organization.startDate}.`
          : "A new joiner."
        : null,
      member.email ? `Email: ${member.email}.` : null,
      profile.bio ? `Profile bio (their own words): ${profile.bio.slice(0, 300)}` : null,
      onboardingLine(actor, member, directory, managed),
    ].filter(Boolean);
    return {
      kind: "person",
      id: member.id,
      title: member.name,
      detail: [title || ROLE_NAME[member.role], team ? `${team.name} team` : null]
        .filter(Boolean)
        .join(" · "),
      text: lines.join(" "),
      to: `/people/${member.id}`,
      person: { id: member.id, name: member.name, title: title || null },
    };
  };

  const who = (member: Member) => {
    const title = text(member.organization.jobTitle);
    return title ? `${member.name} (${title})` : member.name;
  };

  return {
    /**
     * The facts a question needs: people it names (or the asker, for "my manager"), people in a
     * workspace role or job title it names, teams and departments it names, and who owns a project
     * it names (or the current project, for "who owns what"). Nothing when nothing matches.
     */
    factsFor(
      actor: Actor,
      question: string,
      { projectId }: { projectId?: string } = {},
    ): OrgFact[] {
      if (actor.role === "guest") return [];
      const q = normalize(question);
      const directory = load(actor);
      const { members, teamRows, departmentRows, owned, projects } = directory;
      const managed = new Set(reportsOf(db, actor));
      const words = new Set(q.trim().split(" "));

      // People: whole names first, then a first or last name, an email name, or a job title.
      const picked = new Map<string, Member>();
      const pick = (member: Member | undefined) => {
        if (member && picked.size < MAX_PEOPLE) picked.set(member.id, member);
      };
      for (const member of members) if (mentions(q, member.name)) pick(member);
      for (const member of members) {
        const parts = normalize(member.name).trim().split(" ");
        const handle = member.email?.split("@")[0]?.toLocaleLowerCase();
        if (
          parts.some((part) => part.length >= 3 && !COMMON_WORDS.has(part) && words.has(part)) ||
          (handle && handle.length >= 3 && words.has(handle))
        )
          pick(member);
      }
      const self = SELF.test(q) ? members.find((member) => member.id === actor.id) : undefined;
      if (self) pick(self);
      // "Who is Rahul's manager": their manager too.
      if (/\b(manager|boss)\b/.test(q))
        for (const member of [...picked.values()])
          pick(members.find((entry) => entry.id === member.managerId));
      const named = picked.size > 0;
      if (!named) {
        for (const [pattern, role] of ROLE_WORDS)
          if (pattern.test(q)) for (const member of members) if (member.role === role) pick(member);
        const titles = new Set(members.map((member) => text(member.organization.jobTitle)));
        for (const title of titles)
          if (title.length >= 3 && (mentions(q, title) || mentions(q, `${title}s`)))
            for (const member of members)
              if (text(member.organization.jobTitle) === title) pick(member);
      }

      const facts: OrgFact[] = [...picked.values()].map((member) =>
        personFact(actor, member, directory, managed),
      );

      // Teams and departments it names, and the asker's own for "my team". A project's name is
      // taken out first, so "Platform architecture" isn't the Platform team.
      const other: OrgFact[] = [];
      const ownTeam = self ? self.organization.teamId : null;
      const rest = projects.reduce(
        (text, project) => text.replaceAll(normalize(project.name), " "),
        q,
      );
      for (const team of teamRows) {
        if (!mentions(rest, team.name) && !(team.id === ownTeam && /\bteam\b/.test(q))) continue;
        const people = members.filter((member) => member.organization.teamId === team.id);
        const department = departmentRows.find((row) => row.id === team.departmentId);
        other.push({
          kind: "team",
          id: team.id,
          title: `${team.name} team`,
          detail: department ? `${department.name} department` : "Team",
          text: `The ${team.name} team${department ? `, in the ${department.name} department` : ""}, has ${
            people.length === 1 ? "1 person" : `${people.length} people`
          }${people.length ? `: ${list(people.slice(0, MAX_LISTED).map(who), people.length - MAX_LISTED)}` : ""}.`,
          to: "/people?view=teams",
          person: null,
        });
      }
      for (const department of departmentRows) {
        if (!mentions(rest, department.name)) continue;
        const inIt = teamRows.filter((team) => team.departmentId === department.id);
        const people = members.filter(
          (member) =>
            member.organization.departmentId === department.id ||
            inIt.some((team) => team.id === member.organization.teamId),
        );
        const teamOf = (member: Member) =>
          inIt.find((team) => team.id === member.organization.teamId)?.name;
        other.push({
          kind: "department",
          id: department.id,
          title: `${department.name} department`,
          detail: "Department",
          text: `The ${department.name} department has ${
            inIt.length ? `the teams ${inIt.map((team) => team.name).join(", ")}` : "no teams yet"
          } and ${people.length === 1 ? "1 person" : `${people.length} people`}${
            people.length
              ? `: ${list(
                  people
                    .slice(0, MAX_LISTED)
                    .map((member) =>
                      teamOf(member) ? `${who(member)} in ${teamOf(member)}` : who(member),
                    ),
                  people.length - MAX_LISTED,
                )}`
              : ""
          }.`,
          to: "/people?view=teams",
          person: null,
        });
      }

      // Who owns a project it names, or the current one when it asks who owns or leads things.
      const ownerNames = (scopeId: string) =>
        owned
          .filter((row) => row.scopeId === scopeId)
          .map((row) => members.find((member) => member.id === row.userId))
          .filter((member): member is Member => member !== undefined)
          .map(who);
      const asksOwnership = OWNERSHIP.test(q) || PEOPLE_CUE.test(q);
      const workspaceOwners = ownerNames(actor.workspaceId);
      for (const project of projects) {
        const named = mentions(q, project.name);
        // "Who owns what here?" in a project means that project; "who owns checkout?" doesn't.
        const here =
          project.id === projectId && OWNERSHIP.test(q) && /\b(this|here|what|it)\b/.test(q);
        if (!(named && asksOwnership) && !here) continue;
        const projectOwners = ownerNames(project.id);
        other.push({
          kind: "project",
          id: project.id,
          title: project.name,
          detail: "Project owners",
          text: projectOwners.length
            ? `The ${project.name} project's domain owners in ContextOS are ${projectOwners.join(", ")}.`
            : `No one owns the ${project.name} project in ContextOS yet${
                workspaceOwners.length
                  ? `; the workspace-wide domain owners are ${workspaceOwners.join(", ")}`
                  : ""
              }.`,
          to: `/projects/${project.slug ?? project.id}`,
          person: null,
        });
      }
      return [...facts, ...other.slice(0, MAX_OTHER)];
    },
  };
}

export type OrgContext = ReturnType<typeof createOrgContext>;

/** The facts as the prompt's numbered directory section, [D1..Dn]. */
export const formatOrgFacts = (facts: OrgFact[]) =>
  facts.map((fact, index) => `[D${index + 1}] ${fact.text}`);
