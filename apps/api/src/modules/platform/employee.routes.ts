import {
  AssistantPreferencesInputSchema,
  IsoDateTimeSchema,
  NotificationPreferencesSchema,
  WelcomeInputSchema,
  type AssistantPreferences,
  type ContextItem,
  type ContextItemKind,
  type KnowledgeOrigin,
  type KnowledgeUpdate,
  type MyPerson,
  type PersonRef,
  type ReminderChannel,
  type SourceConnector,
  type TeamActivity,
  type Welcome,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import {
  assignments,
  memberships,
  platformRecords,
  projectMemberships,
  projects,
  questions,
  sourceObjects,
  teams,
  users,
  workspaces,
  type ProjectRow,
} from "../../db/schema.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { linkEmail } from "../../lib/mailer.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { publicOrigin } from "../auth/auth.js";
import { createNotifier } from "./notify.js";
import { addDays, createOnboardingRecords, shortDate } from "./onboarding-records.js";

const DAY = 86_400_000;
/** How far back Home's "what changed" cards look, and how far ahead "joining soon" reaches. */
const WINDOW_DAYS = 14;
const EXPORT = "data_export";
const EXPORT_DAYS = 7;
/** A second request within this window returns the export already made instead of building another. */
const EXPORT_REUSE_MS = 3600_000;

const ExportParam = z.object({ id: z.string().min(1).max(200) });
const EmptyBody = z.object({}).strict();

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const str = (value: unknown) => (typeof value === "string" ? value : "");
const firstName = (name: string) => name.trim().split(/\s+/).find(Boolean) ?? name;
const day = (value: unknown) => {
  const text = str(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`))
    ? text
    : null;
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const ORIGIN: Record<SourceConnector, KnowledgeOrigin> = {
  manual: "knowledge_hub",
  slack: "slack",
  jira: "jira",
  google_drive: "google_drive",
  github: "github",
};
/** The collection a context item belongs to, as Home's knowledge cards label it. */
const TAG: Record<ContextItemKind, string> = {
  decision: "Decision",
  event: "Event",
  status_claim: "Status",
  person: "People",
  component: "System",
  dependency: "System",
  term: "Glossary",
  company: "Company",
  product: "Product",
  initiative: "Project",
  process: "Process",
};
const NOUN: Record<ContextItemKind, string> = {
  decision: "decision",
  event: "event",
  status_claim: "status update",
  person: "person",
  component: "system",
  dependency: "dependency",
  term: "glossary term",
  company: "company fact",
  product: "product",
  initiative: "project",
  process: "process",
};

/** Topics someone may already know, by the kind of role their title and team suggest. */
const KNOWN_TOPICS: Array<{ match: RegExp; topics: string[] }> = [
  {
    match: /engineer|developer|sre\b|devops|platform|infrastructure/i,
    topics: [
      "TypeScript",
      "APIs",
      "React",
      "Postgres",
      "Kafka",
      "Kubernetes",
      "Code review",
      "Incident response",
    ],
  },
  {
    match: /sales|account exec|business development/i,
    topics: ["CRM", "Discovery calls", "Product demos", "Pricing", "Negotiation"],
  },
  {
    match: /support|success|customer/i,
    topics: ["Help desk tools", "Ticket triage", "Writing help articles", "Escalations"],
  },
  { match: /design/i, topics: ["Design systems", "Figma", "User research", "Prototyping"] },
  {
    match: /data|analyst|analytics/i,
    topics: ["SQL", "Data warehouses", "Dashboards", "Python", "Statistics"],
  },
  { match: /manager|lead|head of/i, topics: ["1:1s", "Hiring", "Performance reviews"] },
];
const GENERAL_TOPICS = ["Our product", "Our customers", "Security basics", "Project management"];

type Helper = { person: PersonRef; relation: MyPerson["relation"]; note: string };
const HELPER_NOTE: Record<MyPerson["relation"], string> = {
  manager: "Your manager",
  buddy: "Your onboarding buddy",
  people_partner: "Your People partner",
  mentor: "Your mentor",
  expert: "",
};
const WELCOME_DETAIL: Record<Welcome["people"][number]["relation"], string> = {
  manager: "Weekly check-ins, and your 30-, 60- and 90-day reviews",
  buddy: "Pairs with you on practical tasks and everyday questions",
  people_partner: "Questions about policies, benefits and probation",
};
const ASSISTANT_DEFAULTS: AssistantPreferences = { openBesideLessons: true, showSuggestions: true };

/**
 * The caller's own employee views (handoff §7.2, §7.3, §7.5): the people to know first, recent
 * knowledge changes and team news for Home, the first-day welcome, Context Bot preferences and a
 * personal data export. Everything here is about the caller; knowledge is filtered to what they can
 * open (project access and source permissions, `identity.visibleSourceIds`).
 */
export function createEmployeeRoutes(container: Container) {
  const { db, identity, audit, services, repos, mailer, logger, env } = container;
  const records = createOnboardingRecords(container);
  const { store } = records;
  const notifier = createNotifier(db);

  const userRow = (actor: Actor) => {
    const row = db.select().from(users).where(eq(users.id, actor.id)).get();
    if (!row) throw new NotFoundError("User");
    return row;
  };
  const membershipOf = (actor: Actor) =>
    identity.requireMemberOptional(actor.workspaceId, actor.id);
  /** A person as cards show them, only while they are an active member of the workspace. */
  const activeRef = (workspaceId: string, userId: string | null | undefined) =>
    userId && identity.requireMemberOptional(workspaceId, userId)
      ? records.personRef(workspaceId, userId)
      : null;

  /* ---- Projects ---------------------------------------------------------------------------- */

  const readableProjects = (actor: Actor): ProjectRow[] =>
    repos.projects.list(actor.workspaceId).filter((row) => {
      try {
        identity.requireProject(actor, row.id);
        return true;
      } catch {
        return false;
      }
    });

  /** Projects people work on: project membership, ownership (project or section), or a course. */
  const projectsOf = (workspaceId: string, userIds: string[]) => {
    const ids = new Set<string>();
    if (!userIds.length) return ids;
    for (const row of db
      .select({ projectId: projectMemberships.projectId })
      .from(projectMemberships)
      .where(inArray(projectMemberships.userId, userIds))
      .all())
      ids.add(row.projectId);
    for (const row of db
      .select({ scopeType: assignments.scopeType, scopeId: assignments.scopeId })
      .from(assignments)
      .where(
        and(
          eq(assignments.workspaceId, workspaceId),
          eq(assignments.type, "domain_owner"),
          inArray(assignments.userId, userIds),
          or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
        ),
      )
      .all()) {
      if (row.scopeType === "project") ids.add(row.scopeId);
      else if (row.scopeType === "section") ids.add(row.scopeId.split(":")[0]!);
    }
    for (const row of db
      .select({ projectId: platformRecords.projectId, status: platformRecords.status })
      .from(platformRecords)
      .where(
        and(
          eq(platformRecords.workspaceId, workspaceId),
          eq(platformRecords.kind, "path_assignment"),
          inArray(platformRecords.ownerId, userIds),
        ),
      )
      .all())
      if (row.projectId && ["active", "completed"].includes(row.status)) ids.add(row.projectId);
    return ids;
  };

  /* ---- People ------------------------------------------------------------------------------ */

  /**
   * Manager, buddy, People partner and other mentors: the one source for `/me/people` and the
   * welcome. Manager from the membership (else the HR record); buddy and People partner from the HR
   * onboarding record, with a mentor assignment on the person standing in for a missing buddy.
   */
  const helpersOf = (actor: Actor): Helper[] => {
    const membership = membershipOf(actor);
    const row = records.recordFor(actor, actor.id);
    const data = row ? records.recordData(row) : null;
    const mentorIds = db
      .select({ userId: assignments.userId })
      .from(assignments)
      .where(
        and(
          eq(assignments.workspaceId, actor.workspaceId),
          eq(assignments.type, "mentor"),
          eq(assignments.scopeType, "user"),
          eq(assignments.scopeId, actor.id),
          or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
        ),
      )
      .all()
      .map((entry) => entry.userId);
    const helpers: Helper[] = [];
    const seen = new Set([actor.id]);
    const add = (userId: string | null | undefined, relation: MyPerson["relation"]) => {
      if (!userId || seen.has(userId)) return;
      const person = activeRef(actor.workspaceId, userId);
      if (!person) return;
      seen.add(userId);
      helpers.push({ person, relation, note: HELPER_NOTE[relation] });
    };
    add(membership?.managerId ?? data?.managerId, "manager");
    for (const id of [data?.buddyId, ...mentorIds]) {
      if (helpers.some((helper) => helper.relation === "buddy")) break;
      add(id, "buddy");
    }
    add(data?.peoplePartnerId, "people_partner");
    for (const id of mentorIds) add(id, "mentor");
    return helpers;
  };

  /** Domain owners of projects (or sections) the caller can open; their own projects first. */
  const expertsOf = (actor: Actor, exclude: Set<string>, limit = 3): Helper[] => {
    const names = new Map(readableProjects(actor).map((row) => [row.id, row.name]));
    if (!names.size) return [];
    const mine = projectsOf(actor.workspaceId, [actor.id]);
    const owners = new Map<string, { topics: string[]; score: number; projects: number }>();
    const rows = db
      .select({
        userId: assignments.userId,
        scopeType: assignments.scopeType,
        scopeId: assignments.scopeId,
      })
      .from(assignments)
      .where(
        and(
          eq(assignments.workspaceId, actor.workspaceId),
          eq(assignments.type, "domain_owner"),
          inArray(assignments.scopeType, ["project", "section"]),
          or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
        ),
      )
      .all();
    for (const row of rows) {
      if (exclude.has(row.userId)) continue;
      const [projectId, section] =
        row.scopeType === "section" ? row.scopeId.split(":") : [row.scopeId];
      const name = projectId ? names.get(projectId) : undefined;
      if (!name) continue;
      const topic = section ? `${name} ${section.replaceAll("_", " ")}` : name;
      const entry = owners.get(row.userId) ?? { topics: [], score: 0, projects: 0 };
      if (entry.topics.includes(topic)) continue;
      entry.topics.push(topic);
      if (!section) entry.projects += 1;
      if (mine.has(projectId!)) entry.score += 1;
      owners.set(row.userId, entry);
    }
    return (
      [...owners.entries()]
        // Owners of projects the caller works on first, then whole projects before sections.
        .sort(
          (a, b) =>
            b[1].score - a[1].score ||
            b[1].projects - a[1].projects ||
            b[1].topics.length - a[1].topics.length ||
            a[0].localeCompare(b[0]),
        )
        .flatMap(([userId, entry]): Helper[] => {
          const person = activeRef(actor.workspaceId, userId);
          if (!person) return [];
          const topics =
            entry.topics.length <= 2
              ? entry.topics.join(" & ")
              : `${entry.topics.slice(0, 2).join(", ")} and ${entry.topics.length - 2} more`;
          return [{ person, relation: "expert", note: `Owns ${topics}` }];
        })
        .slice(0, limit)
    );
  };

  /* ---- Knowledge --------------------------------------------------------------------------- */

  /** Context items changed in the last two weeks that the caller can open, newest first. */
  const recentItems = (actor: Actor, only?: Set<string>) => {
    const since = Date.now() - WINDOW_DAYS * DAY;
    const found: Array<{ item: ContextItem; project: ProjectRow }> = [];
    for (const project of readableProjects(actor)) {
      if (only && !only.has(project.id)) continue;
      for (const item of services.context.listItems(project, undefined, actor))
        if (Date.parse(item.updatedAt) >= since) found.push({ item, project });
    }
    return found.sort((a, b) => b.item.updatedAt.localeCompare(a.item.updatedAt));
  };
  const isNew = (item: ContextItem) =>
    Date.parse(item.updatedAt) - Date.parse(item.createdAt) < 60_000;

  const knowledgeUpdates = (actor: Actor, limit = 10): KnowledgeUpdate[] => {
    const picked = recentItems(actor).slice(0, limit);
    const ids = [
      ...new Set(picked.flatMap(({ item }) => item.evidence.map((entry) => entry.sourceObjectId))),
    ];
    const sources = new Map(
      (ids.length
        ? db
            .select({
              id: sourceObjects.id,
              connector: sourceObjects.connector,
              author: sourceObjects.author,
              visibility: sourceObjects.visibility,
            })
            .from(sourceObjects)
            .where(inArray(sourceObjects.id, ids))
            .all()
        : []
      ).map((row) => [row.id, row]),
    );
    const mine = projectsOf(actor.workspaceId, [actor.id]);
    return picked.map(({ item, project }) => {
      const supporting = item.evidence.flatMap((entry) => {
        const source = sources.get(entry.sourceObjectId);
        return source ? [source] : [];
      });
      const first = supporting[0];
      return {
        id: item.id,
        title: item.title,
        origin: first ? ORIGIN[first.connector] : "knowledge_hub",
        author: first?.author ?? null,
        updatedAt: item.updatedAt,
        tag: TAG[item.kind],
        reason: mine.has(project.id)
          ? `In ${project.name}, a project you work on`
          : `${isNew(item) ? "New" : "Updated"} in ${project.name}`,
        restrictedTo: supporting.some((source) => source.visibility === "restricted")
          ? "People with access to its sources"
          : null,
        projectId: project.id,
        itemId: item.id,
      };
    });
  };

  /* ---- Team activity ----------------------------------------------------------------------- */

  const teamOf = (actor: Actor) => {
    const teamId = membershipOf(actor)?.organization.teamId;
    return typeof teamId === "string"
      ? (db
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .where(and(eq(teams.workspaceId, actor.workspaceId), eq(teams.id, teamId)))
          .get() ?? null)
      : null;
  };

  const teamActivity = (actor: Actor) => {
    const team = teamOf(actor);
    if (!team || actor.role === "guest") return { team, items: [] as TeamActivity[] };
    const now = Date.now();
    const window = WINDOW_DAYS * DAY;
    const members = records
      .activeMembers(actor.workspaceId)
      .filter((row) => row.organization.teamId === team.id);
    const teammates = new Set(members.map((row) => row.userId));
    const items: TeamActivity[] = [];
    // Teammates who started in the last two weeks, or start in the next two.
    for (const member of members) {
      const start = day(member.organization.startDate);
      if (member.userId === actor.id || !start) continue;
      const at = Date.parse(`${start}T00:00:00Z`);
      if (Math.abs(at - now) > window) continue;
      const title = str(member.organization.jobTitle);
      const who = title ? `${member.name} (${title})` : member.name;
      items.push({
        id: `joiner:${member.userId}`,
        kind: "joiner",
        text: `${who} ${at > now ? "joins" : "joined"} ${team.name} on ${shortDate(start)}.`,
        actor: records.personRef(actor.workspaceId, member.userId),
        where: "New teammate",
        at: new Date(at).toISOString(),
      });
    }
    // Knowledge that changed in the team's projects, as far as the caller can open it.
    const projectIds = projectsOf(actor.workspaceId, [...teammates]);
    for (const { item, project } of recentItems(actor, projectIds).slice(0, 5)) {
      const release = item.kind === "event" && record(item.data).category === "release";
      items.push({
        id: `item:${item.id}`,
        kind: release ? "release" : "update",
        text: release
          ? `Released: ${item.title}`
          : `${isNew(item) ? "New" : "Updated"} ${NOUN[item.kind]}: “${item.title}”`,
        actor: null,
        where: project.name,
        at: item.updatedAt,
      });
    }
    // Courses teammates published recently, in projects the caller can open.
    for (const path of store.listWhere(actor.workspaceId, "learning_path", {
      status: "published",
    })) {
      if (
        !teammates.has(path.ownerId) ||
        !path.projectId ||
        now - path.updatedAt.getTime() > window
      )
        continue;
      let project: ProjectRow;
      try {
        project = identity.requireProject(actor, path.projectId);
      } catch {
        continue;
      }
      const author = activeRef(actor.workspaceId, path.ownerId);
      items.push({
        id: `course:${path.id}`,
        kind: "update",
        text: `${author?.name ?? "A teammate"} published the course “${str(path.data.title) || "Untitled"}”.`,
        actor: author,
        where: project.name,
        at: path.updatedAt.toISOString(),
      });
    }
    return { team, items: items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10) };
  };

  /* ---- Welcome ------------------------------------------------------------------------------ */

  /** Onboarding reminders follow the onboarding category of the notification preferences. */
  const remindersOf = (preferences: Record<string, unknown>): ReminderChannel => {
    const parsed = NotificationPreferencesSchema.safeParse(preferences.notifications ?? {});
    const onboarding = parsed.success ? parsed.data.categories.onboarding : null;
    if (onboarding?.email && onboarding.slack) return "both";
    if (onboarding?.email) return "email";
    if (onboarding?.slack) return "slack";
    const stored = str(record(preferences.profile).reminders);
    return stored === "email" || stored === "both" ? stored : "slack";
  };

  const welcomeOf = (actor: Actor): Welcome => {
    const user = userRow(actor);
    const membership = membershipOf(actor);
    const organization = membership?.organization ?? {};
    const row = records.recordFor(actor, actor.id);
    const data = row ? records.recordData(row) : null;
    const workspace = db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, actor.workspaceId))
      .get();

    const firstDay = day(organization.startDate) ?? day(data?.startDate) ?? isoDay(user.createdAt);
    const title = (str(organization.jobTitle) || str(data?.title)).trim() || "team member";
    const orgTeam = records.teamName(actor.workspaceId, organization);
    const team =
      orgTeam !== "Unassigned"
        ? orgTeam
        : data?.team && data.team !== "Unassigned"
          ? data.team
          : (workspace?.name ?? "ContextOS");

    const people = helpersOf(actor).flatMap((helper) =>
      helper.relation === "manager" ||
      helper.relation === "buddy" ||
      helper.relation === "people_partner"
        ? [
            {
              person: helper.person,
              relation: helper.relation,
              detail: WELCOME_DETAIL[helper.relation],
            },
          ]
        : [],
    );
    const nameOf = (relation: string) => {
      const entry = people.find((person) => person.relation === relation);
      return entry ? firstName(entry.person.name) : null;
    };
    const manager = nameOf("manager");
    const buddy = nameOf("buddy");
    const partner = nameOf("people_partner");
    const reviewOn =
      data?.probation.reviewOn ?? addDays(firstDay, records.probationDays(actor.workspaceId));

    const stored = record(user.preferences.profile);
    const known = (Array.isArray(stored.known) ? stored.known : [])
      .filter((topic): topic is string => typeof topic === "string" && topic.length <= 60)
      .slice(0, 20);
    const family = KNOWN_TOPICS.find((entry) => entry.match.test(`${title} ${team}`));
    const completedAt = str(record(user.preferences.welcome).completedAt);

    return {
      firstDay,
      title,
      team,
      people,
      profile: {
        preferredName: (str(stored.preferredName).trim() || firstName(user.name) || "there").slice(
          0,
          100,
        ),
        pronouns: str(stored.pronouns).trim().slice(0, 40),
        location: (str(stored.location) || str(organization.location)).trim().slice(0, 100),
        known,
        reminders: remindersOf(user.preferences),
      },
      knownOptions: [...new Set([...(family?.topics ?? GENERAL_TOPICS), ...known])],
      expectations: [
        `Finish the first stage of your roadmap by ${shortDate(addDays(firstDay, 14))}`,
        manager
          ? `Meet ${manager} every week for a check-in`
          : "Check in with your manager every week",
        "Pass each knowledge check (retakes are allowed)",
        `Your 30-day review is on ${shortDate(addDays(firstDay, 30))}, and readiness around day 60`,
        `Probation review on ${shortDate(reviewOn)}`,
      ],
      support: [
        ...(buddy ? [`${buddy} pairs with you on practical tasks`] : []),
        ...(manager ? [`${manager} checks in with you every week`] : []),
        "Context Bot answers questions with sources, any time",
        partner
          ? `${partner} is your contact for policies and probation`
          : "People Ops can help with policies and probation",
      ],
      completedAt: IsoDateTimeSchema.safeParse(completedAt).success ? completedAt : null,
    };
  };

  /* ---- Assistant preferences ---------------------------------------------------------------- */

  const assistantOf = (preferences: Record<string, unknown>): AssistantPreferences => {
    const stored = record(preferences.assistant);
    return {
      openBesideLessons:
        typeof stored.openBesideLessons === "boolean"
          ? stored.openBesideLessons
          : ASSISTANT_DEFAULTS.openBesideLessons,
      showSuggestions:
        typeof stored.showSuggestions === "boolean"
          ? stored.showSuggestions
          : ASSISTANT_DEFAULTS.showSuggestions,
    };
  };

  /* ---- Data export -------------------------------------------------------------------------- */

  /**
   * Everything the person put in or was given: profile, Ask history, check-in notes shared with
   * them, contributions and saved items. Answers drawing on sources they can no longer open are
   * withheld (the question stays).
   */
  const buildExport = (actor: Actor, user: ReturnType<typeof userRow>) => {
    const membership = membershipOf(actor);
    const workspace = db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, actor.workspaceId))
      .get();
    const visible = new Map<string, Set<string> | null>();
    const visibleIn = (projectId: string) => {
      if (!visible.has(projectId))
        try {
          visible.set(projectId, new Set(identity.visibleSourceIds(actor, projectId)));
        } catch {
          visible.set(projectId, null);
        }
      return visible.get(projectId) ?? null;
    };
    const asked = db
      .select({ question: questions, projectName: projects.name })
      .from(questions)
      .innerJoin(projects, eq(projects.id, questions.projectId))
      .where(and(eq(projects.workspaceId, actor.workspaceId), eq(questions.actorId, actor.id)))
      .orderBy(asc(questions.createdAt))
      .all()
      .map(({ question: row, projectName }) => {
        const allowed = visibleIn(row.projectId);
        const open = !!allowed && (row.sourceIds ?? []).every((id) => allowed.has(id));
        return {
          id: row.id,
          project: projectName,
          question: row.question,
          askedAt: row.createdAt.toISOString(),
          answer: open ? row.answer.answer : null,
          confidence: open ? row.answer.confidence : null,
          note: open ? null : "Answer withheld: it draws on sources you can no longer open",
          feedback: row.feedback ?? null,
        };
      });
    const owned = (kind: string) => store.listOwned(actor, kind, actor.id, 1000);
    const authorName = (id: unknown) =>
      typeof id === "string" ? (records.personRef(actor.workspaceId, id)?.name ?? null) : null;
    return {
      format: "contextos.personal-data.v1",
      exportedAt: new Date().toISOString(),
      workspace: workspace ?? { id: actor.workspaceId, name: null },
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: actor.role,
        managerId: membership?.managerId ?? null,
        organization: membership?.organization ?? {},
        joinedAt: user.createdAt.toISOString(),
        welcome: welcomeOf(actor).profile,
        preferences: user.preferences,
      },
      askHistory: asked,
      checkinsSharedWithYou: owned("checkin")
        .filter((row) => row.status === "published")
        .map((row) => ({
          id: row.id,
          type: str(row.data.type) || null,
          at: str(row.data.publishedAt) || row.createdAt.toISOString(),
          by: authorName(row.data.authorId),
          pulse: str(row.data.pulse) || null,
          notes: str(row.data.notes),
          nextSteps: str(row.data.nextSteps),
        })),
      contributions: {
        proposedAnswers: owned("promotion").map((row) => ({
          id: row.id,
          title: str(row.data.title) || null,
          question: str(row.data.question) || null,
          status: row.status,
          submittedAt: row.createdAt.toISOString(),
        })),
        reportedGaps: owned("knowledge_gap").map((row) => ({
          id: row.id,
          question: str(row.data.question),
          reportedAt: row.createdAt.toISOString(),
        })),
        flags: owned("flag").map((row) => ({
          id: row.id,
          kind: str(row.data.kind) || null,
          targetType: str(row.data.targetType) || null,
          status: row.status,
          raisedAt: row.createdAt.toISOString(),
        })),
      },
      saved: owned("saved").map((row) => ({
        targetType: str(row.data.targetType),
        targetId: str(row.data.targetId),
        projectId: str(row.data.projectId),
        savedAt: row.updatedAt.toISOString(),
      })),
    };
  };

  return new Hono<AppEnv>()
    .get("/me/people", (c) => {
      const actor = c.get("actor");
      const helpers = helpersOf(actor);
      const listed = new Set([actor.id, ...helpers.map((helper) => helper.person.id)]);
      return c.json({ items: [...helpers, ...expertsOf(actor, listed)] });
    })
    .get("/me/knowledge-updates", (c) => c.json({ items: knowledgeUpdates(c.get("actor")) }))
    .get("/me/team-activity", (c) => c.json(teamActivity(c.get("actor"))))
    .get("/me/welcome", (c) => c.json(welcomeOf(c.get("actor"))))
    .post("/me/welcome", zValidator("json", WelcomeInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      const user = userRow(actor);
      const now = new Date().toISOString();
      db.transaction(() => {
        // Unreadable stored preferences start again from the defaults.
        const notifications =
          NotificationPreferencesSchema.safeParse(user.preferences.notifications ?? {}).data ??
          NotificationPreferencesSchema.parse({});
        db.update(users)
          .set({
            preferences: {
              ...user.preferences,
              // Bio and skills from Settings › Profile stay.
              profile: { ...record(user.preferences.profile), ...input, updatedAt: now },
              // Finishing again keeps the first completion time.
              welcome: { completedAt: str(record(user.preferences.welcome).completedAt) || now },
              // One switch for onboarding reminders: the notification preferences' onboarding category.
              notifications: {
                ...notifications,
                categories: {
                  ...notifications.categories,
                  onboarding: {
                    ...notifications.categories.onboarding,
                    email: input.reminders !== "slack",
                    slack: input.reminders !== "email",
                  },
                },
              },
            },
          })
          .where(eq(users.id, user.id))
          .run();
        const membership = membershipOf(actor);
        if (membership) {
          const { location: _previous, ...organization } = membership.organization;
          db.update(memberships)
            .set({
              organization: input.location
                ? { ...organization, location: input.location }
                : organization,
            })
            .where(
              and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.userId, actor.id)),
            )
            .run();
        }
        audit.record({
          actor,
          action: "user.welcome_complete",
          targetType: "user",
          targetId: actor.id,
          metadata: { known: input.known.length, reminders: input.reminders },
        });
      });
      return c.json(welcomeOf(actor));
    })
    .get("/me/assistant-preferences", (c) =>
      c.json(assistantOf(userRow(c.get("actor")).preferences)),
    )
    .patch(
      "/me/assistant-preferences",
      zValidator("json", AssistantPreferencesInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const user = userRow(actor);
        const merged = { ...assistantOf(user.preferences), ...c.req.valid("json") };
        db.update(users)
          .set({ preferences: { ...user.preferences, assistant: merged } })
          .where(eq(users.id, user.id))
          .run();
        audit.record({
          actor,
          action: "user.assistant_preferences_update",
          targetType: "user",
          targetId: actor.id,
          metadata: merged,
        });
        return c.json(merged);
      },
    )
    .post("/me/data-export", zValidator("json", EmptyBody, validationHook), (c) => {
      const actor = c.get("actor");
      const user = userRow(actor);
      if (!user.email)
        throw new AppError(
          409,
          "CONFLICT",
          "Your account has no email address, so there is nowhere to send the download link.",
        );
      const now = Date.now();
      // Expired exports are deleted; a request within the hour returns the export already made.
      db.delete(platformRecords)
        .where(
          and(
            eq(platformRecords.workspaceId, actor.workspaceId),
            eq(platformRecords.kind, EXPORT),
            eq(platformRecords.ownerId, actor.id),
            lt(platformRecords.createdAt, new Date(now - EXPORT_DAYS * DAY)),
          ),
        )
        .run();
      const recent = store
        .listOwned(actor, EXPORT, actor.id, 5)
        .find((row) => now - row.createdAt.getTime() < EXPORT_REUSE_MS);
      if (recent)
        return c.json({ email: user.email, readyBy: recent.createdAt.toISOString() }, 202);

      const row = db.transaction(() => {
        const created = store.create(
          actor,
          EXPORT,
          {
            export: buildExport(actor, user),
            email: user.email,
            expiresAt: new Date(now + EXPORT_DAYS * DAY).toISOString(),
          },
          { status: "ready" },
        );
        audit.record({
          actor,
          action: "user.data_export",
          targetType: "data_export",
          targetId: created.id,
        });
        return created;
      });
      const link = `/api/v1/me/data-export/${row.id}`;
      notifier.notify(actor.workspaceId, actor.id, {
        type: "data_export.ready",
        // Personal data leaving the product: always delivered, like other security notices.
        category: "security",
        title: "Your data export is ready",
        body: `Download a copy of your profile, contributions, check-in notes shared with you and Context Bot history. The link works for ${EXPORT_DAYS} days.`,
        link,
        data: { exportId: row.id },
      });
      mailer
        .send(
          linkEmail({
            to: user.email,
            subject: "Your ContextOS data export is ready",
            intro:
              "Here is the copy of your data you asked for: your profile, contributions, check-in notes shared with you and Context Bot history.",
            action: "Download your data",
            url: new URL(link, publicOrigin(env)).toString(),
            outro: `The link works for ${EXPORT_DAYS} days, and only when you are signed in.`,
          }),
        )
        .catch((error: unknown) =>
          logger.error({ err: error }, "Data export email could not be sent"),
        );
      return c.json({ email: user.email, readyBy: row.createdAt.toISOString() }, 202);
    })
    .get("/me/data-export/:id", zValidator("param", ExportParam, validationHook), (c) => {
      const actor = c.get("actor");
      const row = store.find(actor.workspaceId, EXPORT, c.req.valid("param").id);
      const expiresAt = Date.parse(str(row?.data.expiresAt));
      // Only its owner may download it, and only until it expires (anyone else: not found).
      if (row?.ownerId !== actor.id || expiresAt <= Date.now())
        throw new NotFoundError("Data export");
      audit.record({
        actor,
        action: "user.data_export_download",
        targetType: "data_export",
        targetId: row.id,
      });
      c.header(
        "Content-Disposition",
        `attachment; filename="contextos-data-${isoDay(row.createdAt)}.json"`,
      );
      c.header("Cache-Control", "no-store");
      return c.json(record(row.data.export));
    });
}
