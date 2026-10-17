import {
  SetupGenerateInputSchema,
  SetupRolesInputSchema,
  type SetupRole,
  type SetupRoles,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Container } from "../../container.js";
import { departments, memberships, teams } from "../../db/schema.js";
import { AppError, BadRequestError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { requireRole } from "../identity/identity.service.js";
import { createGenerationRuns } from "../learning/generation-runs.js";
import { createOnboardingRecords, ONBOARDING, roleKey } from "./onboarding-records.js";

/** The roles added in workspace setup before anyone is hired into them (one record). */
const SETUP_ROLES = "setup_roles";

/*
 * Workspace setup's "Onboarding templates" step (N-18): every role in the company (job title and
 * department) gets a template drafted from the Hub at once. The roles come from people's job
 * titles, pending invitations and onboardings, plus roles the admin adds before hiring. Drafting
 * them all uses a one-time allowance; People Ops then review and publish each template.
 */
export function createSetupTemplates(container: Container) {
  const { db, audit } = container;
  const records = createOnboardingRecords(container);
  const runs = createGenerationRuns(container);
  const { store } = records;

  const structure = (workspaceId: string) => {
    const departmentRows = db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(eq(departments.workspaceId, workspaceId))
      .all()
      .sort((a, b) => a.name.localeCompare(b.name));
    const teamRows = db
      .select({ id: teams.id, name: teams.name, departmentId: teams.departmentId })
      .from(teams)
      .where(eq(teams.workspaceId, workspaceId))
      .all();
    return { departmentRows, teamRows };
  };

  const plannedRow = (workspaceId: string) => store.listWhere(workspaceId, SETUP_ROLES, {}, 1)[0];
  const plannedRoles = (workspaceId: string) =>
    ((plannedRow(workspaceId)?.data.roles as SetupRole[] | undefined) ?? []).filter((role) =>
      role.title.trim(),
    );

  /** Every role in the company, one per job title (seniority aside) and department. */
  const roles = (actor: Actor): SetupRoles["roles"] => {
    const ws = actor.workspaceId;
    const { departmentRows, teamRows } = structure(ws);
    const teamOf = (id: string | null) => teamRows.find((team) => team.id === id);
    const found = new Map<string, SetupRole & { people: number; planned: boolean }>();
    const add = (
      title: unknown,
      place: { departmentId?: unknown; teamId?: unknown; team?: unknown },
      { people = 1, planned = false }: { people?: number; planned?: boolean } = {},
    ) => {
      if (typeof title !== "string" || !roleKey(title)) return;
      const teamId =
        typeof place.teamId === "string"
          ? place.teamId
          : typeof place.team === "string"
            ? (teamRows.find((team) => team.name === place.team)?.id ?? null)
            : null;
      const departmentId =
        (typeof place.departmentId === "string" ? place.departmentId : null) ??
        records.departmentFor(ws, {
          teamId,
          team: typeof place.team === "string" ? place.team : null,
        });
      const key = `${roleKey(title)}|${departmentId ?? ""}`;
      const existing = found.get(key);
      if (existing) {
        existing.people += people;
        existing.teamId ??= teamId;
        existing.planned &&= planned;
        return;
      }
      found.set(key, { title: title.trim(), departmentId, teamId, people, planned });
    };
    for (const role of plannedRoles(ws)) add(role.title, role, { people: 0, planned: true });
    for (const member of db
      .select({ role: memberships.role, organization: memberships.organization })
      .from(memberships)
      .where(and(eq(memberships.workspaceId, ws), eq(memberships.status, "active")))
      .all())
      if (member.role !== "guest") add(member.organization.jobTitle, member.organization);
    for (const invitation of store.listWhere(ws, "invitation", { status: "pending" }, 1000))
      add(invitation.data.jobTitle, invitation.data);
    for (const record of store.listWhere(ws, ONBOARDING, { status: "active" }, 1000))
      if (!record.data.personId) add(record.data.title, record.data);
    return [...found.values()]
      .map((role) => {
        const template = records.bestTemplate(ws, {
          title: role.title,
          teamId: role.teamId,
          team: teamOf(role.teamId)?.name ?? null,
          departmentId: role.departmentId,
        });
        const data = template ? records.templateData(template) : null;
        return {
          title: role.title,
          departmentId: role.departmentId,
          departmentName:
            departmentRows.find((department) => department.id === role.departmentId)?.name ?? null,
          teamId: role.teamId,
          teamName: teamOf(role.teamId)?.name ?? null,
          people: role.people,
          planned: role.planned,
          template:
            template && data
              ? {
                  id: template.id,
                  name: data.name,
                  status:
                    data.publishedVersion === null ? ("draft" as const) : ("published" as const),
                  generating: data.generation?.state === "running",
                  failed: data.publishedVersion === null && data.generation?.state === "failed",
                }
              : null,
        };
      })
      .sort(
        (a, b) =>
          (a.departmentName ?? "~").localeCompare(b.departmentName ?? "~") ||
          a.title.localeCompare(b.title),
      );
  };

  const view = (actor: Actor): SetupRoles => {
    const { departmentRows, teamRows } = structure(actor.workspaceId);
    return {
      departments: departmentRows.map((department) => ({
        ...department,
        teams: teamRows
          .filter((team) => team.departmentId === department.id)
          .map(({ id, name }) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      })),
      roles: roles(actor),
      allowance: runs.allowance(actor.workspaceId),
    };
  };

  const checkPlace = (actor: Actor, role: SetupRole) => {
    const { departmentRows, teamRows } = structure(actor.workspaceId);
    if (role.departmentId && !departmentRows.some((row) => row.id === role.departmentId))
      throw new BadRequestError("That department does not exist");
    const team = role.teamId ? teamRows.find((row) => row.id === role.teamId) : undefined;
    if (role.teamId && !team) throw new BadRequestError("That team does not exist");
    if (team && role.departmentId && team.departmentId !== role.departmentId)
      throw new BadRequestError("That team is not in the chosen department");
    return { ...role, departmentId: role.departmentId ?? team?.departmentId ?? null };
  };

  const routes = new Hono<AppEnv>()
    .get("/workspaces/current/setup/roles", (c) => {
      const actor = c.get("actor");
      requireRole(actor, "owner", "admin");
      return c.json(view(actor));
    })
    .put(
      "/workspaces/current/setup/roles",
      zValidator("json", SetupRolesInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireRole(actor, "owner", "admin");
        const planned = c.req.valid("json").roles.map((role) => checkPlace(actor, role));
        const row = plannedRow(actor.workspaceId);
        if (row) store.patch(row, { data: { roles: planned } });
        else store.create(actor, SETUP_ROLES, { roles: planned }, { status: "active" });
        audit.record({
          actor,
          action: "workspace.setup.roles",
          targetType: "workspace",
          targetId: actor.workspaceId,
          metadata: { roles: planned.length },
        });
        return c.json(view(actor));
      },
    )
    .post(
      "/workspaces/current/setup/roles/generate",
      zValidator("json", SetupGenerateInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireRole(actor, "owner", "admin");
        const draft = container.connectors.templateForRole;
        if (!draft) throw new AppError(503, "NOT_CONFIGURED", "Template drafting isn't available");
        const asked = c.req.valid("json").roles.map((role) => checkPlace(actor, role));
        const { teamRows } = structure(actor.workspaceId);
        let started = 0;
        let stopped: string | null = null;
        for (const role of asked) {
          try {
            // Roles that already have a template (or a draft) keep it.
            if (
              draft(
                actor,
                {
                  title: role.title,
                  teamId: role.teamId,
                  team: teamRows.find((team) => team.id === role.teamId)?.name ?? null,
                  departmentId: role.departmentId,
                },
                { setup: true },
              ).started
            )
              started += 1;
          } catch (error) {
            // The allowance and today's limit are used up: the rest wait for another day.
            if (!(error instanceof AppError) || error.status !== 429) throw error;
            stopped = error.message;
            break;
          }
        }
        audit.record({
          actor,
          action: "workspace.setup.templates",
          targetType: "workspace",
          targetId: actor.workspaceId,
          metadata: { asked: asked.length, started, stopped },
        });
        return c.json({ ...view(actor), started, stopped }, 202);
      },
    );

  /** The setup step is done when the company has roles and every one of them has a template. */
  const covered = (actor: Actor) => {
    const list = roles(actor);
    return list.length > 0 && list.every((role) => role.template && !role.template.failed);
  };

  return { routes, roles, covered };
}
