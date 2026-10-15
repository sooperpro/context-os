import { randomUUID } from "node:crypto";
import type {
  OnboardingStatus,
  ProbationRecommendationInput,
  PersonRef,
  SetupStepId,
  TemplateDraftInput,
  TemplateFamily,
  TemplateModule,
} from "@contextos/shared";
import { and, eq } from "drizzle-orm";
import type { Container } from "../../container.js";
import { departments, memberships, teams, users } from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import type { Actor } from "../../types.js";
import { sendInvitationEmail } from "../auth/invitations.js";
import { createNotifier } from "./notify.js";
import {
  buildRoadmap,
  currentModules,
  ROADMAP,
  roadmapData,
  roadmapProgress,
  switchTemplate,
  type PathStatus,
  type RoadmapData,
} from "./onboarding-roadmap.js";
import { workspaceSettings } from "./settings.js";
import { createPlatformStore, type PlatformRecord } from "./store.js";

/*
 * Onboarding records, probation reviews and onboarding templates, shared by the People Ops routes
 * (people-ops.routes.ts, HR only) and the manager's team routes. Nothing here checks roles: callers
 * decide who may read or change what (role access spec §3).
 *
 * An onboarding record (`hr_onboarding`) exists before the person has an account. It links to their
 * account by work email, and is backfilled for people already onboarding (a manager's onboarding
 * plan, or a membership marked as a new hire). Progress comes from their roadmap (onboarding-roadmap.ts,
 * materialized from the record's template) or, without one, their learning path assignments.
 * Check-ins are stored on the record (the manager's check-ins) or on a legacy onboarding plan, and the
 * probation review lives on the record.
 */

export const ONBOARDING = "hr_onboarding";
export const TEMPLATE = "onboarding_template";
export const DAY = 86_400_000;
const INVITATION_DAYS = 14;

export const SETUP: Array<{ id: SetupStepId; label: string }> = [
  { id: "account", label: "Account active (they have signed in)" },
  { id: "laptop", label: "Laptop delivered" },
  { id: "roadmap", label: "Onboarding roadmap assigned" },
  { id: "buddy", label: "Onboarding buddy assigned" },
  { id: "welcome", label: "Welcome message sent" },
  { id: "calendar", label: "First-week calendar booked" },
];

export type Recommendation = "confirm" | "extend" | "discuss";
export type ActivityKind =
  "started" | "review" | "recommended_confirm" | "recommended_extend" | "missed" | "decided";
export interface Activity {
  id: string;
  on: string;
  text: string;
  kind: ActivityKind;
}
export interface Decision {
  outcome: "confirmed" | "extended";
  extension: string | null;
  decidedOn: string;
  effectiveOn: string;
  decidedById: string;
  note: string;
  notified: boolean;
}
export interface OnboardingData {
  personId: string | null;
  name: string;
  title: string;
  email: string | null;
  team: string;
  managerId: string | null;
  buddyId: string | null;
  templateId: string | null;
  peoplePartnerId: string | null;
  startDate: string;
  invitationId: string | null;
  /** Setup steps done: when, and who did it when not People Ops ("Created by SCIM"). */
  setup: Partial<Record<SetupStepId, { at: string; by: string | null }>>;
  probation: {
    reviewOn: string;
    recommendation: Recommendation | null;
    recommendedOn: string | null;
    ratings: Array<{ area: string; level: number }> | null;
    managerNote: string | null;
    decision: Decision | null;
  };
  activity: Activity[];
  /** The last computed status and when it changed, for HR Home's week-over-week change. */
  risk?: { status: OnboardingStatus; previous: OnboardingStatus | null; at: string };
}

export interface TemplateStage {
  id: string;
  name: string;
  weekStart: number;
  weekEnd: number;
  moduleIds: string[];
}
export interface TemplateData {
  name: string;
  family: TemplateFamily;
  version: number;
  status: "published" | "draft";
  publishedVersion: number | null;
  roles: string[];
  teams: string[];
  weeks: number;
  passMark: number;
  stages: TemplateStage[];
  history: Array<{ version: number; on: string; note: string; snapshot?: TemplateSnapshot }>;
  updatedBy: string;
  /** When People Ops archived it: hidden from new onboardings, kept for the people already on it. */
  archivedAt?: string | null;
}
/** What a version looked like when it was published, so an old version can still be opened. */
export interface TemplateSnapshot {
  name: string;
  roles: string[];
  teams: string[];
  weeks: number;
  passMark: number;
  stages: TemplateStage[];
}

/* ---- Built-in module catalog and starter templates ------------------------------------------ */

const mod = (
  id: string,
  title: string,
  kind: TemplateModule["kind"],
  minutes: number | null,
): TemplateModule => ({ id, title, kind, minutes, owner: null });

/** Generic onboarding modules every workspace starts with; published learning paths join them. */
const BUILT_IN: TemplateModule[] = [
  mod("mod-welcome", "Welcome and how we work", "company", 25),
  mod("mod-security", "Security basics", "company", 20),
  mod("mod-customers", "Our customers and what they need", "business", 35),
  mod("mod-money", "How the business makes money", "business", 30),
  mod("mod-tour", "Product tour", "product", 40),
  mod("mod-decisions", "Decisions you should know", "decisions", 25),
  mod("mod-company-check", "Knowledge check: Company and business", "check", 8),
  mod("mod-dev-env", "Set up your development environment", "practical", 90),
  mod("mod-engineering", "How engineering works here", "process", 30),
  mod("mod-architecture", "Architecture overview", "systems", 45),
  mod("mod-code-review", "Code review norms", "process", 20),
  mod("mod-first-pr", "Ship your first pull request", "practical", 240),
  mod("mod-on-call", "Shadow two on-call rotations", "practical", null),
  mod("mod-incidents", "Incident reviews", "process", 30),
  mod("mod-release", "Release process", "process", 25),
  mod("mod-runbook", "Write or update a runbook", "contribution", 120),
  mod("mod-pricing", "Pricing and packaging", "sales", 40),
  mod("mod-crm", "CRM setup and hygiene", "practical", 60),
  mod("mod-discovery", "Discovery calls that work", "sales", 45),
  mod("mod-demo", "Give the standard demo", "practical", 90),
  mod("mod-shadow-calls", "Shadow five customer calls", "practical", null),
  mod("mod-helpdesk", "Help desk basics", "practical", 45),
  mod("mod-support-playbook", "Common issues playbook", "support", 40),
  mod("mod-mentor-tickets", "Resolve 20 tickets with a mentor", "practical", null),
  mod("mod-help-article", "Write a help center article", "contribution", 90),
  mod("mod-design-system", "The design system", "design", 45),
  mod("mod-interviews", "Run three customer interviews", "practical", null),
  mod("mod-ship-design", "Ship a design end to end", "practical", null),
  mod("mod-warehouse", "The data warehouse", "data", 45),
  mod("mod-dashboard", "Build your first dashboard", "practical", null),
  mod("mod-recurring-report", "Own a recurring report", "practical", null),
  mod("mod-one-on-ones", "How we run 1:1s and check-ins", "people", 30),
  mod("mod-probation", "Probation and readiness reviews", "people", 30),
  mod("mod-readiness-review", "Run a readiness review with HR", "practical", null),
  mod("mod-charter", "Write your team charter", "contribution", 90),
];

const stages = (first: string[], core: string[], own: string[]): TemplateStage[] => [
  { id: "foundations", name: "Foundations", weekStart: 1, weekEnd: 2, moduleIds: first },
  { id: "core", name: "Core knowledge", weekStart: 3, weekEnd: 6, moduleIds: core },
  { id: "ownership", name: "Ownership", weekStart: 7, weekEnd: 12, moduleIds: own },
];
const COMPANY = ["mod-welcome", "mod-security", "mod-customers", "mod-money", "mod-company-check"];
const STARTER_TEMPLATES: Array<
  Pick<TemplateData, "name" | "family" | "roles" | "teams" | "stages">
> = [
  {
    name: "Engineering · Individual contributor",
    family: "engineering",
    roles: ["Software engineer"],
    teams: ["Engineering"],
    stages: stages(
      [...COMPANY, "mod-dev-env", "mod-engineering"],
      ["mod-architecture", "mod-decisions", "mod-code-review", "mod-first-pr"],
      ["mod-on-call", "mod-incidents", "mod-release", "mod-runbook"],
    ),
  },
  {
    name: "Sales · Account executive",
    family: "sales",
    roles: ["Account executive"],
    teams: ["Sales"],
    stages: stages(
      [...COMPANY, "mod-tour"],
      ["mod-pricing", "mod-crm", "mod-discovery", "mod-demo"],
      ["mod-shadow-calls"],
    ),
  },
  {
    name: "Support · Specialist",
    family: "support",
    roles: ["Support specialist"],
    teams: ["Support"],
    stages: stages(
      [...COMPANY, "mod-tour", "mod-helpdesk"],
      ["mod-support-playbook", "mod-decisions"],
      ["mod-mentor-tickets", "mod-help-article"],
    ),
  },
  {
    name: "Design · Product designer",
    family: "design",
    roles: ["Product designer"],
    teams: ["Design"],
    stages: stages(
      [...COMPANY, "mod-tour"],
      ["mod-design-system", "mod-decisions", "mod-interviews"],
      ["mod-ship-design"],
    ),
  },
  {
    name: "Data · Analyst",
    family: "data",
    roles: ["Data analyst"],
    teams: ["Data"],
    stages: stages(
      [...COMPANY, "mod-tour"],
      ["mod-warehouse", "mod-decisions", "mod-dashboard"],
      ["mod-recurring-report"],
    ),
  },
  {
    name: "People manager",
    family: "manager",
    roles: ["Engineering manager", "Team lead"],
    teams: [],
    stages: stages(
      [...COMPANY, "mod-one-on-ones"],
      ["mod-probation", "mod-decisions", "mod-readiness-review"],
      ["mod-charter"],
    ),
  },
];

/* ---- Dates ---------------------------------------------------------------------------------- */

export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const daysFrom = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const RISKY = new Set<OnboardingStatus>(["at_risk", "blocked"]);
export const URGENCY: OnboardingStatus[] = [
  "blocked",
  "at_risk",
  "needs_setup",
  "not_started",
  "on_track",
  "ahead",
  "ready",
];

export function createOnboardingRecords(container: Container) {
  const { db, identity, audit } = container;
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);

  /* ---- People ---------------------------------------------------------------------------- */

  const activeMembers = (workspaceId: string) =>
    db
      .select({
        userId: memberships.userId,
        role: memberships.role,
        managerId: memberships.managerId,
        organization: memberships.organization,
        name: users.name,
        email: users.email,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.status, "active")))
      .all()
      .filter((row) => row.userId !== "system");

  /**
   * The manager's team: direct reports (`memberships.managerId`), or the whole reporting line when
   * the workspace turns on indirect reports (role access spec decision 8). Every team view uses this.
   */
  const reportsOf = (actor: Actor): string[] => {
    const members = activeMembers(actor.workspaceId);
    const direct = members.filter((row) => row.managerId === actor.id).map((row) => row.userId);
    if (!workspaceSettings(db, actor.workspaceId).includeIndirectReports) return direct;
    const all = new Set(direct);
    let frontier = direct;
    while (frontier.length) {
      const next = members
        .filter((row) => row.managerId && frontier.includes(row.managerId) && !all.has(row.userId))
        .map((row) => row.userId);
      for (const id of next) all.add(id);
      frontier = next;
    }
    return [...all];
  };

  const personRef =(workspaceId: string, userId: string | null): PersonRef | null => {
    if (!userId) return null;
    const user = db.select({ name: users.name }).from(users).where(eq(users.id, userId)).get();
    if (!user) return null;
    const membership = identity.requireMemberOptional(workspaceId, userId);
    const title = membership?.organization.jobTitle;
    return { id: userId, name: user.name, title: typeof title === "string" ? title : null };
  };
  const requirePerson = (workspaceId: string, userId: string, what: string) => {
    if (!identity.requireMemberOptional(workspaceId, userId))
      throw new BadRequestError(`${what} must be an active workspace member`);
  };

  /** The team (or department) on their membership, as onboarding records name it. */
  const teamName = (workspaceId: string, organization: Record<string, unknown>) => {
    const { teamId, departmentId } = organization;
    const team =
      typeof teamId === "string"
        ? db
            .select({ name: teams.name })
            .from(teams)
            .where(and(eq(teams.workspaceId, workspaceId), eq(teams.id, teamId)))
            .get()
        : undefined;
    const department =
      !team && typeof departmentId === "string"
        ? db
            .select({ name: departments.name })
            .from(departments)
            .where(and(eq(departments.workspaceId, workspaceId), eq(departments.id, departmentId)))
            .get()
        : undefined;
    return team?.name ?? department?.name ?? "Unassigned";
  };

  /* ---- Templates ------------------------------------------------------------------------- */

  const templateRows = (actor: Actor) => {
    const rows = store.listWhere(actor.workspaceId, TEMPLATE, {}, 500);
    if (rows.length) return rows.reverse();
    // First visit: start the workspace with the standard templates, published as v1.
    return STARTER_TEMPLATES.map((seed) =>
      store.create(
        actor,
        TEMPLATE,
        {
          ...seed,
          version: 1,
          status: "published",
          publishedVersion: 1,
          weeks: 12,
          passMark: 4,
          history: [{ version: 1, on: today(), note: "Standard template" }],
          updatedBy: "ContextOS",
        } satisfies TemplateData,
        { status: "published" },
      ),
    );
  };
  const templateData = (row: PlatformRecord) => row.data as unknown as TemplateData;
  const isArchived = (row: PlatformRecord) => Boolean(templateData(row).archivedAt);
  /** Templates that can be offered for a new onboarding: published and not archived. */
  const isAssignable = (row: PlatformRecord) =>
    templateData(row).publishedVersion !== null && !isArchived(row);
  const findTemplate = (workspaceId: string, id: string | null) =>
    id ? store.find(workspaceId, TEMPLATE, id) : undefined;

  /** Published learning paths can be added to templates as modules, next to the built-in ones. */
  const pathModules = (workspaceId: string): TemplateModule[] =>
    store.listWhere(workspaceId, "learning_path", { status: "published" }, 500).map((path) => {
      const items = (path.data.items as Array<{ estMinutes?: number }> | undefined) ?? [];
      const minutes = items.reduce((sum, item) => sum + Number(item.estMinutes ?? 0), 0);
      return {
        id: `path-${path.id}`,
        title: String(path.data.title),
        kind: "project",
        minutes: minutes || null,
        owner: personRef(workspaceId, path.ownerId)?.name ?? null,
      };
    });
  /** Published tutorials, so templates and "Assign learning" can use them (`tutorial-<id>`). */
  const tutorialModules = (workspaceId: string): TemplateModule[] =>
    store.listWhere(workspaceId, "tutorial", { status: "published" }, 500).flatMap((row) => {
      const content = row.data.content as
        | { title: string; kind: TemplateModule["kind"]; lessons: Array<{ minutes: number }> }
        | null
        | undefined;
      if (!content) return [];
      return [
        {
          id: `tutorial-${row.id}`,
          title: content.title,
          kind: content.kind,
          minutes: content.lessons.reduce((sum, lesson) => sum + lesson.minutes, 0) || null,
          owner: personRef(workspaceId, row.ownerId)?.name ?? null,
        },
      ];
    });
  const catalog = (workspaceId: string) =>
    new Map(
      [...BUILT_IN, ...pathModules(workspaceId), ...tutorialModules(workspaceId)].map((entry) => [
        entry.id,
        entry,
      ]),
    );

  const activeCount = (workspaceId: string, templateId: string) =>
    store
      .listWhere(workspaceId, ONBOARDING, { status: "active" }, 1000)
      .filter((row) => row.data.templateId === templateId).length;
  /** Every onboarding that was ever on the template, finished or not. */
  const totalUses = (workspaceId: string, templateId: string) =>
    store
      .listWhere(workspaceId, ONBOARDING, {}, 5000)
      .filter((row) => row.data.templateId === templateId).length;
  /** Why a template can't be deleted, or null when it can. */
  const deleteBlocker = (row: PlatformRecord): string | null => {
    const uses = totalUses(row.workspaceId, row.id);
    if (uses)
      return `${uses} ${uses === 1 ? "onboarding uses" : "onboardings use"} this template. Archive it instead.`;
    if (store.listWhere(row.workspaceId, TEMPLATE, {}, 500).length <= 1)
      return "A workspace needs at least one template.";
    return null;
  };

  const templateRef = (workspaceId: string, id: string | null) => {
    const row = findTemplate(workspaceId, id);
    if (!row) return null;
    const data = templateData(row);
    return { id: row.id, name: `${data.name} v${data.publishedVersion ?? data.version}` };
  };

  const templateDetail = (row: PlatformRecord) => {
    const data = templateData(row);
    const modules = catalog(row.workspaceId);
    return {
      id: row.id,
      name: data.name,
      family: data.family,
      version: `v${data.version}`,
      status: data.status,
      publishedVersion: data.publishedVersion === null ? null : `v${data.publishedVersion}`,
      activeCount: activeCount(row.workspaceId, row.id),
      archived: Boolean(data.archivedAt),
      deletable: deleteBlocker(row) === null,
      roles: data.roles,
      teams: data.teams,
      weeks: data.weeks,
      passMark: data.passMark,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: data.updatedBy,
      stages: data.stages.map(({ moduleIds, ...stage }) => ({
        ...stage,
        modules: moduleIds.flatMap((id) => modules.get(id) ?? []),
      })),
      history: data.history.map(({ snapshot, ...entry }) => ({
        ...entry,
        version: `v${entry.version}`,
        saved: Boolean(snapshot),
      })),
    };
  };
  const templateSummary = (row: PlatformRecord) => {
    const data = templateData(row);
    return {
      id: row.id,
      name: data.name,
      family: data.family,
      version: `v${data.version}`,
      activeCount: activeCount(row.workspaceId, row.id),
      archived: Boolean(data.archivedAt),
      updatedAt: row.updatedAt.toISOString(),
      status: data.status,
      roles: data.roles,
      weeks: data.weeks,
      stageCount: data.stages.length,
      moduleCount: data.stages.reduce((sum, stage) => sum + stage.moduleIds.length, 0),
      updatedBy: data.updatedBy,
    };
  };

  /** One published version as it was when published, or null when no copy was kept (older versions). */
  const templateVersion = (row: PlatformRecord, version: number) => {
    const entry = templateData(row).history.find((item) => item.version === version);
    if (!entry?.snapshot) return null;
    const modules = catalog(row.workspaceId);
    const { snapshot } = entry;
    return {
      id: row.id,
      version: `v${entry.version}`,
      publishedOn: entry.on,
      note: entry.note,
      name: snapshot.name,
      roles: snapshot.roles,
      teams: snapshot.teams,
      weeks: snapshot.weeks,
      passMark: snapshot.passMark,
      stages: snapshot.stages.map(({ moduleIds, ...stage }) => ({
        ...stage,
        modules: moduleIds.flatMap((id) => modules.get(id) ?? []),
      })),
    };
  };

  /** Applies the editor's module order. Unknown stages are ignored; unknown modules are rejected. */
  const applyStages = (
    workspaceId: string,
    data: TemplateData,
    input: TemplateDraftInput,
  ): TemplateData => {
    const modules = catalog(workspaceId);
    for (const stage of input.stages)
      for (const id of stage.moduleIds)
        if (!modules.has(id)) throw new BadRequestError(`Unknown module: ${id}`);
    return {
      ...data,
      roles: input.roles ?? data.roles,
      teams: input.teams ?? data.teams,
      stages: data.stages.map((stage) => {
        const next = input.stages.find((entry) => entry.id === stage.id);
        return next ? { ...stage, moduleIds: [...new Set(next.moduleIds)] } : stage;
      }),
    };
  };

  /* ---- Onboarding records ---------------------------------------------------------------- */

  const recordData = (row: PlatformRecord) => row.data as unknown as OnboardingData;
  const probationDays = (workspaceId: string) =>
    workspaceSettings(db, workspaceId).policies.probationDefaultDays;

  const newRecord = (
    workspaceId: string,
    input: Omit<OnboardingData, "probation" | "activity" | "invitationId" | "setup"> &
      Partial<Pick<OnboardingData, "setup" | "invitationId">>,
  ): OnboardingData => ({
    invitationId: null,
    setup: {},
    ...input,
    probation: {
      reviewOn: addDays(input.startDate, probationDays(workspaceId)),
      recommendation: null,
      recommendedOn: null,
      ratings: null,
      managerNote: null,
      decision: null,
    },
    activity: [],
  });

  /**
   * Links records to accounts by work email, and backfills records for people already onboarding
   * (a manager's onboarding plan, or a membership marked as a new hire by an accepted invitation).
   */
  const sync = (actor: Actor) => {
    const rows = store.listWhere(actor.workspaceId, ONBOARDING, {}, 1000);
    const members = activeMembers(actor.workspaceId);
    const linked = new Set(rows.map((row) => recordData(row).personId).filter(Boolean));
    for (const row of rows) {
      const data = recordData(row);
      if (data.personId || !data.email) continue;
      const member = members.find((entry) => entry.email?.toLowerCase() === data.email);
      if (!member || linked.has(member.userId)) continue;
      linked.add(member.userId);
      store.patch(row, {
        data: {
          ...data,
          personId: member.userId,
          setup: {
            ...data.setup,
            account: { at: new Date().toISOString(), by: "Account activated" },
          },
        },
      });
    }
    const backfill = (userId: string, input: Partial<OnboardingData> & { startDate: string }) => {
      const member = members.find((entry) => entry.userId === userId);
      if (!member || linked.has(userId)) return;
      linked.add(userId);
      const title = member.organization.jobTitle;
      store.insert({
        workspaceId: actor.workspaceId,
        ownerId: userId,
        kind: ONBOARDING,
        status: "active",
        data: newRecord(actor.workspaceId, {
          personId: userId,
          name: member.name,
          title: typeof title === "string" ? title : "",
          email: member.email?.toLowerCase() ?? null,
          team: teamName(actor.workspaceId, member.organization),
          managerId: member.managerId,
          buddyId: null,
          templateId: null,
          peoplePartnerId: null,
          ...input,
          setup: {
            account: { at: new Date().toISOString(), by: "Existing account" },
            ...input.setup,
          },
        }) as unknown as Record<string, unknown>,
      });
    };
    for (const plan of store.listWhere(actor.workspaceId, "onboarding_plan", {}, 1000))
      if (["active", "scheduled"].includes(plan.status))
        backfill(plan.ownerId, {
          startDate: String(plan.data.startDate),
          managerId: typeof plan.data.managerId === "string" ? plan.data.managerId : null,
          buddyId: typeof plan.data.mentorId === "string" ? plan.data.mentorId : null,
          ...(typeof plan.data.mentorId === "string"
            ? { setup: { buddy: { at: plan.createdAt.toISOString(), by: null } } }
            : {}),
        });
    for (const member of members) {
      const { isNewHire, startDate } = member.organization;
      if (isNewHire === true && typeof startDate === "string")
        backfill(member.userId, { startDate: startDate.slice(0, 10) });
    }
  };

  const loadRecords = (actor: Actor) => {
    sync(actor);
    return store.listWhere(actor.workspaceId, ONBOARDING, { status: "active" }, 1000);
  };
  const recordById = (actor: Actor, id: string) => {
    sync(actor);
    return store.get(actor, ONBOARDING, id);
  };

  const planFor = (workspaceId: string, userId: string | null) =>
    userId
      ? store
          .listWhere(workspaceId, "onboarding_plan", { ownerId: userId }, 20)
          .find((plan) => plan.status !== "cancelled")
      : undefined;

  /** Required path items done over required items, across their learning path assignments. */
  const learningProgress = (workspaceId: string, userId: string | null) => {
    if (!userId) return 0;
    let total = 0;
    let done = 0;
    for (const assignment of store.listWhere(
      workspaceId,
      "path_assignment",
      { ownerId: userId },
      100,
    )) {
      if (!["active", "completed"].includes(assignment.status)) continue;
      const version = assignment.parentId
        ? store.find(workspaceId, "path_version", assignment.parentId)
        : undefined;
      const items = (
        (version?.data.items as Array<{ id: string; required?: boolean }>) ?? []
      ).filter((item) => item.required !== false);
      if (!items.length) continue;
      const completed = new Set(
        store
          .listWhere(workspaceId, "item_progress", { parentId: assignment.id }, 1000)
          .filter((entry) => entry.status === "completed")
          .map((entry) => String(entry.data.itemId)),
      );
      total += items.length;
      done +=
        assignment.status === "completed"
          ? items.length
          : items.filter((item) => completed.has(item.id)).length;
    }
    return total ? done / total : 0;
  };

  /* ---- Roadmaps ------------------------------------------------------------------------- */

  /** Where a learning path stands for one person, from their assignment of it. */
  const pathStatus =
    (workspaceId: string, userId: string) =>
    (pathId: string): PathStatus | null => {
      const assignment = store
        .listWhere(workspaceId, "path_assignment", { ownerId: userId }, 100)
        .find((entry) => entry.data.pathId === pathId && entry.status !== "cancelled");
      if (!assignment) return null;
      if (assignment.status === "completed")
        return { status: "done", completedOn: assignment.updatedAt.toISOString().slice(0, 10) };
      const started = store
        .listWhere(workspaceId, "item_progress", { parentId: assignment.id }, 1000)
        .some((entry) => entry.status === "completed");
      return { status: started ? "active" : "todo", completedOn: null };
    };

  const roadmapRow = (workspaceId: string, userId: string) =>
    store.listWhere(workspaceId, ROADMAP, { ownerId: userId, status: "active" }, 5)[0];

  /** A roadmap built from a published template's current stages, from a start date. */
  const fromTemplate = (
    workspaceId: string,
    template: PlatformRecord,
    startDate: string,
    addOnIds: string[] = [],
  ): RoadmapData => {
    const data = templateData(template);
    const now = today();
    return buildRoadmap({
      templateId: template.id,
      templateVersion: data.publishedVersion ?? data.version,
      startDate,
      stages: data.stages,
      catalog: catalog(workspaceId),
      addOnIds,
      // Assigned after they started: what would already be due gets a week from today.
      notBefore: startDate < now ? addDays(now, 7) : undefined,
    });
  };

  /**
   * The person's roadmap, materialized from their record's template the first time it is needed,
   * and moved to another template when HR or their manager changes it (completed work is kept).
   */
  const roadmapFor = (row: PlatformRecord): PlatformRecord | undefined => {
    const data = recordData(row);
    if (!data.personId) return undefined;
    const ws = row.workspaceId;
    const existing = roadmapRow(ws, data.personId);
    const template = data.templateId ? findTemplate(ws, data.templateId) : undefined;
    if (!template) return existing;
    if (!existing)
      return store.insert({
        workspaceId: ws,
        ownerId: data.personId,
        kind: ROADMAP,
        status: "active",
        data: fromTemplate(ws, template, data.startDate) as unknown as Record<string, unknown>,
      });
    const current = roadmapData(existing);
    if (current.templateId === template.id) return existing;
    const switched = switchTemplate(
      current,
      fromTemplate(ws, template, data.startDate, current.addOnIds),
    );
    const name = templateData(template).name;
    try {
      store.patch(row, {
        data: {
          ...data,
          activity: [
            activity(`Roadmap moved to the ${name} template`, "started"),
            ...data.activity,
          ],
        },
      });
    } catch {
      // A concurrent write changed the record; the roadmap change below still applies.
    }
    return store.patch(existing, {
      data: {
        ...switched,
        history: [
          { on: today(), text: `Moved to the ${name} template`, by: null },
          ...switched.history,
        ],
      },
    });
  };

  /** The roadmap's modules as they stand today, or null when the person has no roadmap. */
  const roadmapModules = (row: PlatformRecord) => {
    const roadmap = roadmapFor(row);
    const personId = recordData(row).personId;
    if (!roadmap || !personId) return null;
    return {
      row: roadmap,
      data: roadmapData(roadmap),
      modules: currentModules(roadmapData(roadmap), pathStatus(row.workspaceId, personId)),
    };
  };

  /** Progress through the roadmap; without one, through their learning path assignments. */
  const progressFor = (row: PlatformRecord) => {
    const roadmap = roadmapModules(row);
    return roadmap
      ? roadmapProgress(roadmap.modules)
      : learningProgress(row.workspaceId, recordData(row).personId);
  };

  /* ---- Check-ins ------------------------------------------------------------------------- */

  /** Check-ins newest first: the manager's (on the record) and any on a legacy onboarding plan. */
  const checkinRows = (workspaceId: string, userId: string | null, recordId?: string) => {
    const plan = planFor(workspaceId, userId);
    const rows = [
      ...(recordId ? store.listWhere(workspaceId, "checkin", { parentId: recordId }, 500) : []),
      ...(plan ? store.listWhere(workspaceId, "checkin", { parentId: plan.id }, 500) : []),
    ];
    const at = (row: PlatformRecord) =>
      typeof row.data.publishedAt === "string" ? row.data.publishedAt : row.createdAt.toISOString();
    return rows.sort((a, b) => at(b).localeCompare(at(a))).map((row) => ({ row, at: at(row) }));
  };

  const checkinsFor = (workspaceId: string, userId: string | null, recordId?: string) => {
    const plan = planFor(workspaceId, userId);
    const rows = checkinRows(workspaceId, userId, recordId);
    return {
      plan,
      count: rows.length,
      last: rows[0]?.at ?? null,
      /** The latest check-in's pulse, when it recorded one. */
      pulse: typeof rows[0]?.row.data.pulse === "string" ? rows[0].row.data.pulse : null,
      /** What the latest check-in said is in the way (`access`, `workload`…). */
      blockers: Array.isArray(rows[0]?.row.data.blockers)
        ? (rows[0].row.data.blockers as string[])
        : [],
    };
  };

  /** Everything the HR screens derive from one record. */
  const evaluate = (row: PlatformRecord) => {
    const ws = row.workspaceId;
    const data = recordData(row);
    const now = today();
    const elapsed = daysFrom(data.startDate, now);
    const started = elapsed >= 0;
    const template = findTemplate(ws, data.templateId);
    const weeks = template ? templateData(template).weeks : Math.ceil(probationDays(ws) / 7);
    const progress = progressFor(row);
    const expected = started ? Math.min(1, elapsed / Math.max(1, weeks * 7)) : 0;
    const checkins = checkinsFor(ws, data.personId, row.id);
    const stage =
      started && template
        ? (templateData(template).stages.find(
            (entry) =>
              Math.floor(elapsed / 7) + 1 >= entry.weekStart &&
              Math.floor(elapsed / 7) + 1 <= entry.weekEnd,
          )?.name ??
          templateData(template).stages.at(-1)?.name ??
          null)
        : null;
    const setupDone = SETUP.filter((step) => data.setup[step.id]).length;
    const missingCheckins = started ? Math.max(0, Math.floor(elapsed / 30) - checkins.count) : 0;

    let status: OnboardingStatus;
    let note: string;
    const gap = expected - progress;
    if (!started) {
      const missing = SETUP.length - setupDone;
      status = missing ? "needs_setup" : "ready";
      note = missing
        ? `${missing} setup ${missing === 1 ? "step" : "steps"} left`
        : "Everything set up";
    } else if (!data.templateId && progress === 0) {
      status = elapsed <= 7 ? "not_started" : "at_risk";
      note = "No roadmap assigned";
    } else if (progress === 0 && elapsed <= 7) {
      status = "not_started";
      note = "Starting their roadmap";
    } else if (gap > 0.3) {
      status = "blocked";
      note = `${Math.round(gap * 100)} points behind plan`;
    } else if (gap > 0.15 || missingCheckins >= 2) {
      status = "at_risk";
      note = gap > 0.15 ? `${Math.round(gap * 100)} points behind plan` : "On plan";
    } else if (progress - expected > 0.1) {
      status = "ahead";
      note = "Ahead of plan";
    } else {
      status = "on_track";
      note = "On plan";
    }
    // What the roadmap and the manager's last check-in say overrides a good-looking pace: waiting on
    // access is blocked; off track, overdue modules or a failed check are at best at risk.
    const modules = started ? (roadmapModules(row)?.modules ?? []) : [];
    const overdue = modules.filter((entry) => entry.status !== "done" && entry.dueOn < now).length;
    const failed = modules.filter((entry) => entry.status !== "done" && entry.passed === false);
    const better = ["ahead", "on_track", "not_started"].includes(status);
    if (started && checkins.blockers.includes("access")) {
      status = "blocked";
      note = "Waiting on access";
    } else if (started && checkins.pulse === "off_track" && better) {
      status = "at_risk";
      note = "Off track at the last check-in";
    } else if (overdue && better) {
      status = "at_risk";
      note = `${overdue} overdue module${overdue === 1 ? "" : "s"}`;
    } else if (failed.length && better) {
      status = "at_risk";
      note = `Didn't pass “${failed[0]!.title}”`;
    }
    if (started && missingCheckins)
      note += ` · ${missingCheckins} check-in${missingCheckins === 1 ? "" : "s"} missing`;

    const probation = data.probation;
    const daysToReview = daysFrom(now, probation.reviewOn);
    const recommendationDueOn =
      probation.recommendation || probation.decision ? null : addDays(probation.reviewOn, -7);
    const recommendation =
      probation.recommendation ?? (daysToReview <= 30 ? "awaiting_manager" : "not_started");
    const reviewState = probation.decision
      ? "completed"
      : probation.recommendation === "confirm"
        ? "ready_for_approval"
        : probation.recommendation
          ? "needs_hr_review"
          : missingCheckins
            ? "checkins_missing"
            : "awaiting_manager";

    return {
      data,
      started,
      elapsed,
      progress,
      expected,
      stage,
      status,
      note,
      setupDone,
      checkins,
      missingCheckins,
      review: {
        recommendation,
        recommendationDueOn,
        state: reviewState,
        readiness: progress,
      } as const,
    };
  };

  /** Records the status change behind HR Home's "this week" figure. */
  const trackRisk = (row: PlatformRecord, status: OnboardingStatus) => {
    const data = recordData(row);
    if (data.risk?.status === status) return;
    try {
      store.patch(row, {
        data: {
          ...data,
          risk: { status, previous: data.risk?.status ?? null, at: new Date().toISOString() },
        },
      });
    } catch {
      // A concurrent write changed the record; the next read records the change.
    }
  };

  const person = (row: PlatformRecord): PersonRef => {
    const data = recordData(row);
    return (
      personRef(row.workspaceId, data.personId) ?? {
        id: row.id,
        name: data.name,
        title: data.title,
      }
    );
  };

  const summary = (row: PlatformRecord) => {
    const view = evaluate(row);
    trackRisk(row, view.status);
    return {
      id: row.id,
      person: person(row),
      team: view.data.team,
      manager: personRef(row.workspaceId, view.data.managerId),
      buddy: personRef(row.workspaceId, view.data.buddyId),
      startDate: view.data.startDate,
      template: templateRef(row.workspaceId, view.data.templateId),
      stage: view.stage,
      progress: view.progress,
      expected: view.expected,
      status: view.status,
      note: view.note,
      setup: { done: view.setupDone, total: SETUP.length },
    };
  };

  const recordDetail = (row: PlatformRecord) => {
    const view = evaluate(row);
    const now = today();
    const milestone = (title: string, on: string) => ({
      title,
      on,
      state:
        on < now
          ? ("done" as const)
          : daysFrom(now, on) <= 14
            ? ("soon" as const)
            : ("later" as const),
    });
    return {
      ...summary(row),
      peoplePartner: personRef(row.workspaceId, view.data.peoplePartnerId),
      setupSteps: SETUP.map((step) => ({
        ...step,
        done: Boolean(view.data.setup[step.id]),
        doneBy: view.data.setup[step.id]?.by ?? null,
      })),
      milestones: [
        milestone("30-day review", addDays(view.data.startDate, 30)),
        milestone("60-day readiness review", addDays(view.data.startDate, 60)),
        milestone("Probation review", view.data.probation.reviewOn),
      ],
      lastCheckin: view.checkins.last ? `Last check-in ${shortDate(view.checkins.last)}` : null,
      probationReviewId: view.started ? row.id : null,
    };
  };

  /* ---- Probation reviews ----------------------------------------------------------------- */

  const reviewSummary = (row: PlatformRecord) => {
    const view = evaluate(row);
    const decision = view.data.probation.decision;
    return {
      id: row.id,
      person: person(row),
      team: view.data.team,
      manager: personRef(row.workspaceId, view.data.managerId) ?? {
        id: "",
        name: "No manager",
        title: null,
      },
      reviewOn: view.data.probation.reviewOn,
      recommendation: view.review.recommendation,
      readiness: view.review.readiness,
      state: view.review.state,
      decision: decision
        ? {
            outcome: decision.outcome,
            extension: decision.extension,
            decidedOn: decision.decidedOn,
          }
        : null,
      recommendationDueOn: view.review.recommendationDueOn,
      missingCheckins: view.missingCheckins,
    };
  };

  const reviewDetail = (row: PlatformRecord) => {
    const view = evaluate(row);
    const { probation, startDate } = view.data;
    const plan = view.checkins.plan;
    const planMilestones =
      (plan?.data.milestones as
        Array<{ title: string; dueDate: string; status: string }> | undefined) ?? [];
    const now = today();
    const checkpoint = (title: string, day: number) => {
      const due = addDays(startDate, day);
      const done = view.checkins.count >= day / 30;
      return {
        title,
        detail: done
          ? "Check-in recorded"
          : due < now
            ? `Was due ${shortDate(due)}`
            : `Due ${shortDate(due)}`,
        state: done ? ("done" as const) : due < now ? ("overdue" as const) : ("active" as const),
      };
    };
    const milestones = [
      checkpoint("30-day check-in", 30),
      checkpoint("60-day readiness review", 60),
      {
        title: "Onboarding roadmap",
        detail: `${Math.round(view.progress * 100)}% complete · ${Math.round(view.expected * 100)}% expected`,
        state:
          view.progress >= 1
            ? ("done" as const)
            : view.expected - view.progress > 0.15
              ? ("overdue" as const)
              : ("active" as const),
      },
      ...planMilestones.map((entry) => ({
        title: entry.title,
        detail: entry.status === "done" ? "Verified" : `Due ${shortDate(entry.dueDate)}`,
        state:
          entry.status === "done"
            ? ("done" as const)
            : entry.dueDate < now
              ? ("overdue" as const)
              : ("active" as const),
      })),
    ];
    const decision = probation.decision;
    const started: Activity = {
      id: `${row.id}-started`,
      on: startDate,
      text: `Started as ${view.data.title || "a new hire"}`,
      kind: "started",
    };
    return {
      id: row.id,
      person: person(row),
      team: view.data.team,
      manager: reviewSummary(row).manager,
      startDate,
      reviewOn: probation.reviewOn,
      state: view.review.state,
      recommendation: view.review.recommendation,
      recommendedOn: probation.recommendedOn,
      recommendationDueOn: view.review.recommendationDueOn,
      readiness: view.review.readiness,
      ratings: probation.ratings,
      managerNote: probation.managerNote,
      milestones,
      checkinSummary: view.checkins.count
        ? `${view.checkins.count} check-in${view.checkins.count === 1 ? "" : "s"} · last on ${shortDate(view.checkins.last!)}`
        : "No check-ins recorded yet",
      missingCheckins: view.missingCheckins,
      activity: [...view.data.activity, ...(view.started ? [started] : [])].sort((a, b) =>
        b.on.localeCompare(a.on),
      ),
      decision: decision
        ? {
            outcome: decision.outcome,
            extension: decision.extension,
            decidedOn: decision.decidedOn,
            effectiveOn: decision.effectiveOn,
            decidedBy: personRef(row.workspaceId, decision.decidedById) ?? {
              id: decision.decidedById,
              name: "People Ops",
              title: null,
            },
            note: decision.note,
            notified: decision.notified,
          }
        : null,
    };
  };

  const activity = (text: string, kind: ActivityKind): Activity => ({
    id: randomUUID(),
    on: today(),
    text,
    kind,
  });

  /* ---- Overdue milestones ---------------------------------------------------------------- */

  const overdueFor = (row: PlatformRecord) => {
    const view = evaluate(row);
    if (!view.started || view.data.probation.decision) return [];
    const now = today();
    const items: Array<{ id: string; milestone: string; dueOn: string }> = [];
    for (const day of [30, 60]) {
      const due = addDays(view.data.startDate, day);
      if (view.elapsed > day + 7 && view.checkins.count < day / 30)
        items.push({ id: `${row.id}:checkin${day}`, milestone: `${day}-day check-in`, dueOn: due });
    }
    const plan = view.checkins.plan;
    for (const entry of (plan?.data.milestones as
      Array<{ key: string; title: string; dueDate: string; status: string }> | undefined) ?? [])
      if (entry.status !== "done" && entry.dueDate < now)
        items.push({ id: `${row.id}:${entry.key}`, milestone: entry.title, dueOn: entry.dueDate });
    const due = view.review.recommendationDueOn;
    if (due && due < now)
      items.push({
        id: `${row.id}:recommendation`,
        milestone: "Probation recommendation",
        dueOn: due,
      });
    return items;
  };

  /* ---- Options --------------------------------------------------------------------------- */

  const options = (actor: Actor) => {
    const members = activeMembers(actor.workspaceId);
    const ref = (userId: string) => personRef(actor.workspaceId, userId)!;
    const managerIds = new Set(members.flatMap((row) => (row.managerId ? [row.managerId] : [])));
    const teamNames = new Set(
      db
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.workspaceId, actor.workspaceId))
        .all()
        .map((row) => row.name),
    );
    for (const row of store.listWhere(actor.workspaceId, ONBOARDING, {}, 1000))
      teamNames.add(recordData(row).team);
    teamNames.delete("Unassigned");
    return {
      teams: teamNames.size
        ? [...teamNames].sort()
        : ["Engineering", "Product", "Design", "Data", "Sales", "Support", "Operations", "Finance"],
      managers: members
        .filter(
          (row) => ["owner", "admin", "manager"].includes(row.role) || managerIds.has(row.userId),
        )
        .map((row) => ref(row.userId)),
      buddies: members.filter((row) => row.role !== "guest").map((row) => ref(row.userId)),
      peoplePartners: members.filter((row) => row.role === "hr").map((row) => ref(row.userId)),
      templates: templateRows(actor)
        .filter(isAssignable)
        .flatMap((row) => templateRef(actor.workspaceId, row.id) ?? []),
    };
  };

  const requirePublishedTemplate = (actor: Actor, id: string) => {
    const row = findTemplate(actor.workspaceId, id);
    if (!row) throw new NotFoundError("Template");
    if (templateData(row).publishedVersion === null)
      throw new AppError(409, "CONFLICT", "Publish the template before assigning it");
    if (isArchived(row))
      throw new AppError(409, "CONFLICT", "This template is archived. Restore it to assign it");
    return row;
  };

  const notifyPerson = (
    workspaceId: string,
    userId: string | null,
    title: string,
    link: string,
    type: string,
  ) => {
    if (userId) notifier.notify(workspaceId, userId, { type, category: "onboarding", title, link });
  };

  const sendInvitation = async (
    actor: Actor,
    email: string,
    input: { managerId: string; startDate: string },
  ) => {
    const pending = store
      .listWhere(actor.workspaceId, "invitation", { status: "pending" }, 1000)
      .find((row) => row.data.email === email);
    if (pending) return pending.id;
    await sendInvitationEmail(container, actor, email);
    const row = store.create(
      actor,
      "invitation",
      {
        email,
        role: "member",
        managerId: input.managerId,
        startDate: input.startDate,
        isNewHire: true,
        expiresAt: new Date(Date.now() + INVITATION_DAYS * DAY).toISOString(),
      },
      { status: "pending" },
    );
    audit.record({ actor, action: "user.invite", targetType: "invitation", targetId: row.id });
    return row.id;
  };

  /** A person's active onboarding record, once their account is linked. */
  const recordFor = (actor: Actor, userId: string) => {
    sync(actor);
    return store
      .listWhere(actor.workspaceId, ONBOARDING, { status: "active" }, 1000)
      .find((entry) => recordData(entry).personId === userId);
  };

  /**
   * The manager's probation recommendation (a "Probation recommendation" check-in): it goes to HR as
   * ready for approval or needing review, and notifies their People partner (or every HR member).
   * The caller checks that `actor` manages the person.
   */
  const setRecommendation = (
    actor: Actor,
    row: PlatformRecord,
    input: ProbationRecommendationInput,
  ) => {
    const data = recordData(row);
    if (data.probation.decision)
      throw new AppError(409, "CONFLICT", "A decision is already recorded");
    const text = {
      confirm: "recommended confirming",
      extend: "recommended extending probation",
      discuss: "asked to discuss with HR",
    }[input.recommendation];
    const updated = store.patch(row, {
      data: {
        ...data,
        probation: {
          ...data.probation,
          recommendation: input.recommendation,
          recommendedOn: today(),
          ratings: input.ratings,
          managerNote: input.note || null,
        },
        activity: [
          activity(
            `${actor.name} ${text}`,
            input.recommendation === "confirm" ? "recommended_confirm" : "recommended_extend",
          ),
          ...data.activity,
        ],
      },
    });
    const partners = data.peoplePartnerId
      ? [data.peoplePartnerId]
      : activeMembers(actor.workspaceId)
          .filter((entry) => entry.role === "hr")
          .map((entry) => entry.userId);
    for (const partner of partners)
      notifier.notify(actor.workspaceId, partner, {
        type: "probation.recommendation",
        category: "onboarding",
        title:
          input.recommendation === "confirm"
            ? `${data.name}'s probation review is ready for approval`
            : `${data.name}'s probation review needs HR review`,
        link: `/probation/${row.id}`,
      });
    audit.record({
      actor,
      action: "probation.recommend",
      targetType: "onboarding_record",
      targetId: row.id,
      metadata: { recommendation: input.recommendation },
    });
    return updated;
  };

  return {
    store,
    activeMembers,
    reportsOf,
    personRef,
    requirePerson,
    teamName,
    templateRows,
    isArchived,
    isAssignable,
    deleteBlocker,
    templateVersion,
    templateData,
    findTemplate,
    pathModules,
    tutorialModules,
    catalog,
    activeCount,
    templateRef,
    templateDetail,
    templateSummary,
    applyStages,
    recordData,
    probationDays,
    newRecord,
    sync,
    loadRecords,
    recordById,
    recordFor,
    planFor,
    learningProgress,
    pathStatus,
    roadmapRow,
    fromTemplate,
    roadmapFor,
    roadmapModules,
    progressFor,
    checkinRows,
    checkinsFor,
    evaluate,
    trackRisk,
    person,
    summary,
    recordDetail,
    reviewSummary,
    reviewDetail,
    activity,
    overdueFor,
    options,
    requirePublishedTemplate,
    notifyPerson,
    sendInvitation,
    setRecommendation,
  };
}

export type OnboardingRecords = ReturnType<typeof createOnboardingRecords>;
