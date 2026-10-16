import { randomUUID } from "node:crypto";
import {
  MemberOrganizationSchema,
  PageQuerySchema,
  WorkspaceCreateSchema,
  WorkspaceSettingsSchema,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, count, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import {
  auditLog,
  connectorConnections,
  departments,
  memberships,
  platformRecords,
  projects,
  sourceObjects,
  teams,
  workspaces,
} from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { requireRole } from "../identity/identity.service.js";
import { createNotifier } from "../platform/notify.js";
import { mergeSettings, resolveSettings } from "../platform/settings.js";
import { createPlatformStore } from "../platform/store.js";

const NameSchema = z.object({ name: z.string().trim().min(1).max(200) }).strict();
const TeamSchema = NameSchema.extend({
  departmentId: z.uuid(),
  parentId: z.uuid().nullable().default(null),
});
const TeamUpdateSchema = NameSchema.partial()
  .extend({ parentId: z.uuid().nullable().optional() })
  .strict();
const SetupStep = z.enum([
  "connect_source",
  "select_scopes",
  "create_project",
  "invite_team",
  "assign_new_hire",
]);
const SetupUpdate = z
  .object({
    version: z.number().int().positive(),
    step: SetupStep,
    status: z.enum(["pending", "completed", "skipped"]),
  })
  .strict();
const DeletionRequest = z.object({ confirm: z.string().min(1).max(200) }).strict();
const DELETION_GRACE_DAYS = 7;
type SettingsInput = z.infer<typeof WorkspaceSettingsSchema>;

export function createWorkspaceRoutes(container: Container) {
  const { db, identity, audit } = container;
  const store = createPlatformStore(db);
  const admin = (actor: Actor) => requireRole(actor, "owner", "admin");
  const notifier = createNotifier(db);
  /** Owner/admin settings update with optimistic locking; sections merge deeply (§7.17). */
  const updateSettings = (actor: Actor, input: SettingsInput) => {
    admin(actor);
    const { version, name, ...patch } = input;
    return db.transaction(() => {
      const row = db.select().from(workspaces).where(eq(workspaces.id, actor.workspaceId)).get();
      if (!row) throw new NotFoundError("Workspace");
      const settings = mergeSettings(row.settings, patch);
      // Validate the merged result so defaults and ranges hold after partial updates.
      resolveSettings(settings);
      const next = db
        .update(workspaces)
        .set({ name: name ?? row.name, settings, version: version + 1 })
        .where(and(eq(workspaces.id, actor.workspaceId), eq(workspaces.version, version)))
        .returning()
        .get();
      if (!next) throw new AppError(409, "CONFLICT", "Workspace changed; reload and retry");
      audit.record({
        actor,
        action: "workspace.update",
        targetType: "workspace",
        targetId: row.id,
        metadata: { version: next.version, sections: Object.keys(patch) },
      });
      return { ...next, settings: resolveSettings(next.settings) };
    });
  };
  const department = (actor: Actor, id: string) => {
    const row = db
      .select()
      .from(departments)
      .where(and(eq(departments.workspaceId, actor.workspaceId), eq(departments.id, id)))
      .get();
    if (!row) throw new NotFoundError("Department");
    return row;
  };
  const team = (actor: Actor, id: string) => {
    const row = db
      .select()
      .from(teams)
      .where(and(eq(teams.workspaceId, actor.workspaceId), eq(teams.id, id)))
      .get();
    if (!row) throw new NotFoundError("Team");
    return row;
  };
  // Validate the resulting tree, including descendants when reparenting a team.
  const validateTree = (
    actor: Actor,
    candidate: { id: string; departmentId: string; parentId: string | null },
  ) => {
    const rows = db.select().from(teams).where(eq(teams.workspaceId, actor.workspaceId)).all();
    const nodes = new Map(
      rows.map((row) => [
        row.id,
        { id: row.id, departmentId: row.departmentId, parentId: row.parentId },
      ]),
    );
    nodes.set(candidate.id, candidate);
    for (const node of nodes.values()) {
      const seen = new Set([node.id]);
      let current = node;
      let depth = 1;
      while (current.parentId) {
        const parent = nodes.get(current.parentId);
        if (!parent) throw new NotFoundError("Parent team");
        if (parent.departmentId !== node.departmentId)
          throw new BadRequestError("Nested teams must belong to the same department");
        if (seen.has(parent.id)) throw new BadRequestError("Team nesting cannot contain cycles");
        if (++depth > 3) throw new BadRequestError("Teams can be nested at most three levels");
        seen.add(parent.id);
        current = parent;
      }
    }
  };
  const setup = (actor: Actor) =>
    db.transaction(() => {
      const existing = store.list(actor, "workspace_setup", 1)[0];
      return (
        existing ?? store.create(actor, "workspace_setup", { steps: {} }, { status: "in_progress" })
      );
    });
  const setupEvidence = (actor: Actor) => {
    const connected = db
      .select({ total: count() })
      .from(connectorConnections)
      .where(
        and(
          eq(connectorConnections.workspaceId, actor.workspaceId),
          eq(connectorConnections.userId, actor.id),
          eq(connectorConnections.status, "connected"),
        ),
      )
      .get()!.total;
    const projectRows = db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, actor.workspaceId))
      .all();
    const sourceRows = projectRows.flatMap((project) => {
      const allowed = new Set(identity.visibleSourceIds(actor, project.id));
      return db
        .select()
        .from(sourceObjects)
        .where(eq(sourceObjects.projectId, project.id))
        .all()
        .filter((source) => allowed.has(source.id));
    });
    const memberCount = db
      .select({ total: count() })
      .from(memberships)
      .where(and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.status, "active")))
      .get()!.total;
    const invite = db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.workspaceId, actor.workspaceId), eq(auditLog.action, "user.invite")))
      .limit(1)
      .get();
    const assignment = db
      .select({ id: platformRecords.id })
      .from(platformRecords)
      .where(
        and(
          eq(platformRecords.workspaceId, actor.workspaceId),
          inArray(platformRecords.kind, ["path_assignment", "hr_onboarding"]),
        ),
      )
      .limit(1)
      .get();
    return {
      completed: {
        connect_source: connected > 0,
        select_scopes: sourceRows.some((row) => !!row.connectionId),
        create_project: projectRows.length > 0,
        invite_team: memberCount > 1 || !!invite,
        assign_new_hire: !!assignment,
      },
      sync: {
        sources: sourceRows.length,
        ready: sourceRows.filter((row) => row.status === "ready").length,
        pending: sourceRows.filter((row) => row.status === "pending" || row.status === "processing")
          .length,
        failed: sourceRows.filter((row) => row.status === "failed").length,
      },
    };
  };

  return (
    new Hono<AppEnv>()
      .post("/workspaces", zValidator("json", WorkspaceCreateSchema, validationHook), (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        // Selecting a region is not a claim that this single-region server can host it.
        if (input.region !== "us-east-1")
          throw new AppError(
            503,
            "NOT_CONFIGURED",
            "A region-specific deployment is required for this region",
          );
        if (
          db
            .select({ id: workspaces.id })
            .from(workspaces)
            .where(eq(workspaces.slug, input.slug))
            .get()
        )
          throw new AppError(409, "CONFLICT", "Workspace slug is already taken");
        const row = db.transaction(() => {
          const created = db
            .insert(workspaces)
            .values({ id: randomUUID(), ...input })
            .returning()
            .get();
          db.insert(memberships)
            .values({ workspaceId: created.id, userId: actor.id, role: "owner" })
            .run();
          audit.record({
            actor: { ...actor, workspaceId: created.id, role: "owner" },
            action: "workspace.create",
            targetType: "workspace",
            targetId: created.id,
          });
          return created;
        });
        // The creator continues in the new workspace.
        if (actor.sessionId) identity.setActiveWorkspace(actor.sessionId, row.id);
        return c.json(
          {
            ...row,
            primaryDomainVerified: false,
            authentication: container.env.AUTH_MODE,
          },
          201,
        );
      })
      .patch(
        "/workspaces/current",
        zValidator("json", WorkspaceSettingsSchema, validationHook),
        (c) => c.json(updateSettings(c.get("actor"), c.req.valid("json"))),
      )
      // PRD §20 path; same handler as PATCH /workspaces/current.
      .patch(
        "/workspaces/current/settings",
        zValidator("json", WorkspaceSettingsSchema, validationHook),
        (c) => c.json(updateSettings(c.get("actor"), c.req.valid("json"))),
      )
      .post(
        "/workspaces/current/deletion",
        zValidator("json", DeletionRequest, validationHook),
        (c) => {
          // FR-ADM-008: owner-only, 7-day grace, then the maintenance sweep hard-deletes.
          const actor = c.get("actor");
          requireRole(actor, "owner");
          const row = db
            .select()
            .from(workspaces)
            .where(eq(workspaces.id, actor.workspaceId))
            .get();
          if (!row) throw new NotFoundError("Workspace");
          if ((row.slug ?? row.name) !== c.req.valid("json").confirm)
            throw new BadRequestError(
              "Type the workspace slug (or name when no slug is set) to confirm",
            );
          const settings = resolveSettings(row.settings);
          if (settings.deletion)
            throw new AppError(409, "CONFLICT", "Deletion is already scheduled");
          const deletion = {
            scheduledAt: new Date(Date.now() + DELETION_GRACE_DAYS * 86400000).toISOString(),
            requestedBy: actor.id,
            requestedAt: new Date().toISOString(),
          };
          db.update(workspaces)
            .set({ settings: { ...row.settings, deletion }, version: row.version + 1 })
            .where(eq(workspaces.id, row.id))
            .run();
          audit.record({
            actor,
            action: "workspace.deletion.schedule",
            targetType: "workspace",
            targetId: row.id,
            metadata: deletion,
          });
          notifier.notifyAdmins(actor.workspaceId, {
            type: "security.workspace_deletion",
            category: "security",
            title: `Workspace deletion scheduled for ${deletion.scheduledAt.slice(0, 10)}`,
            link: "/workspace",
          });
          return c.json({ deletion }, 202);
        },
      )
      .delete("/workspaces/current/deletion", (c) => {
        const actor = c.get("actor");
        requireRole(actor, "owner");
        const row = db.select().from(workspaces).where(eq(workspaces.id, actor.workspaceId)).get();
        if (!row) throw new NotFoundError("Workspace");
        if (!resolveSettings(row.settings).deletion) throw new NotFoundError("Scheduled deletion");
        const { deletion: _removed, ...rest } = row.settings;
        db.update(workspaces)
          .set({ settings: rest, version: row.version + 1 })
          .where(eq(workspaces.id, row.id))
          .run();
        audit.record({
          actor,
          action: "workspace.deletion.cancel",
          targetType: "workspace",
          targetId: row.id,
        });
        return c.body(null, 204);
      })
      .get("/workspaces/current/setup", (c) => {
        const actor = c.get("actor");
        admin(actor);
        return c.json({ ...setup(actor), evidence: setupEvidence(actor) });
      })
      .patch("/workspaces/current/setup", zValidator("json", SetupUpdate, validationHook), (c) => {
        const actor = c.get("actor");
        admin(actor);
        const input = c.req.valid("json");
        const row = setup(actor);
        if (input.status === "completed" && !setupEvidence(actor).completed[input.step])
          throw new AppError(
            409,
            "CONFLICT",
            "Complete the actual workflow before marking this step completed",
          );
        const steps = { ...(row.data.steps as Record<string, string>), [input.step]: input.status };
        return c.json(
          db.transaction(() => {
            const updated = store.update(actor, row, input.version, {
              data: { steps },
              status: SetupStep.options.every(
                (step) => steps[step] === "completed" || steps[step] === "skipped",
              )
                ? "completed"
                : "in_progress",
            });
            audit.record({
              actor,
              action: "workspace.setup",
              targetType: "workspace",
              targetId: actor.workspaceId,
              metadata: { step: input.step, status: input.status },
            });
            return updated;
          }),
        );
      })
      .get("/org/departments", zValidator("query", PageQuerySchema, validationHook), (c) => {
        requireRole(c.get("actor"), "owner", "admin", "manager", "hr", "member");
        const { limit, offset } = c.req.valid("query");
        return c.json({
          items: db
            .select()
            .from(departments)
            .where(eq(departments.workspaceId, c.get("actor").workspaceId))
            .orderBy(departments.name)
            .limit(limit)
            .offset(offset)
            .all(),
        });
      })
      .post("/org/departments", zValidator("json", NameSchema, validationHook), (c) => {
        const actor = c.get("actor");
        admin(actor);
        const row = db.transaction(() => {
          const created = db
            .insert(departments)
            .values({ id: randomUUID(), workspaceId: actor.workspaceId, ...c.req.valid("json") })
            .returning()
            .get();
          audit.record({
            actor,
            action: "department.create",
            targetType: "department",
            targetId: created.id,
          });
          return created;
        });
        return c.json(row, 201);
      })
      .patch("/org/departments/:id", zValidator("json", NameSchema, validationHook), (c) => {
        const actor = c.get("actor");
        admin(actor);
        const row = department(actor, c.req.param("id"));
        return c.json(
          db.transaction(() => {
            const updated = db
              .update(departments)
              .set(c.req.valid("json"))
              .where(eq(departments.id, row.id))
              .returning()
              .get();
            audit.record({
              actor,
              action: "department.update",
              targetType: "department",
              targetId: row.id,
            });
            return updated;
          }),
        );
      })
      .delete("/org/departments/:id", (c) => {
        const actor = c.get("actor");
        admin(actor);
        const row = department(actor, c.req.param("id"));
        const assigned = db
          .select()
          .from(memberships)
          .where(eq(memberships.workspaceId, actor.workspaceId))
          .all()
          .some((member) => member.organization.departmentId === row.id);
        if (
          assigned ||
          db
            .select({ id: teams.id })
            .from(teams)
            .where(eq(teams.departmentId, row.id))
            .limit(1)
            .get()
        )
          throw new AppError(
            409,
            "CONFLICT",
            "Reassign members and remove teams before deleting this department",
          );
        db.transaction(() => {
          db.delete(departments).where(eq(departments.id, row.id)).run();
          audit.record({
            actor,
            action: "department.delete",
            targetType: "department",
            targetId: row.id,
          });
        });
        return c.body(null, 204);
      })
      .get(
        "/org/teams",
        zValidator(
          "query",
          PageQuerySchema.extend({ departmentId: z.uuid().optional() }),
          validationHook,
        ),
        (c) => {
          const actor = c.get("actor");
          requireRole(actor, "owner", "admin", "manager", "hr", "member");
          const { limit, offset, departmentId } = c.req.valid("query");
          if (departmentId) department(actor, departmentId);
          return c.json({
            items: db
              .select()
              .from(teams)
              .where(
                and(
                  eq(teams.workspaceId, actor.workspaceId),
                  departmentId ? eq(teams.departmentId, departmentId) : undefined,
                ),
              )
              .orderBy(teams.name)
              .limit(limit)
              .offset(offset)
              .all(),
          });
        },
      )
      .post("/org/teams", zValidator("json", TeamSchema, validationHook), (c) => {
        const actor = c.get("actor");
        admin(actor);
        const input = c.req.valid("json");
        department(actor, input.departmentId);
        const id = randomUUID();
        validateTree(actor, { id, ...input });
        const row = db.transaction(() => {
          const created = db
            .insert(teams)
            .values({ id, workspaceId: actor.workspaceId, ...input })
            .returning()
            .get();
          audit.record({ actor, action: "team.create", targetType: "team", targetId: id });
          return created;
        });
        return c.json(row, 201);
      })
      .patch("/org/teams/:id", zValidator("json", TeamUpdateSchema, validationHook), (c) => {
        const actor = c.get("actor");
        admin(actor);
        const row = team(actor, c.req.param("id"));
        const input = c.req.valid("json");
        validateTree(actor, { ...row, ...input });
        return c.json(
          db.transaction(() => {
            const updated = db
              .update(teams)
              .set(input)
              .where(eq(teams.id, row.id))
              .returning()
              .get();
            audit.record({ actor, action: "team.update", targetType: "team", targetId: row.id });
            return updated;
          }),
        );
      })
      .delete("/org/teams/:id", (c) => {
        const actor = c.get("actor");
        admin(actor);
        const row = team(actor, c.req.param("id"));
        const assigned = db
          .select()
          .from(memberships)
          .where(eq(memberships.workspaceId, actor.workspaceId))
          .all()
          .some((member) => member.organization.teamId === row.id);
        if (
          assigned ||
          db.select({ id: teams.id }).from(teams).where(eq(teams.parentId, row.id)).limit(1).get()
        )
          throw new AppError(
            409,
            "CONFLICT",
            "Reassign members and remove child teams before deleting this team",
          );
        db.transaction(() => {
          db.delete(teams).where(eq(teams.id, row.id)).run();
          audit.record({ actor, action: "team.delete", targetType: "team", targetId: row.id });
        });
        return c.body(null, 204);
      })
      .get("/users/:id/organization", (c) => {
        const actor = c.get("actor");
        const member = identity.requireMember(actor.workspaceId, c.req.param("id"));
        if (
          actor.id !== member.userId &&
          actor.id !== member.managerId &&
          actor.role !== "owner" &&
          actor.role !== "admin"
        )
          throw new NotFoundError("Member organization profile");
        return c.json({
          userId: member.userId,
          managerId: member.managerId,
          organization: member.organization,
        });
      })
      .patch(
        "/users/:id/organization",
        zValidator("json", MemberOrganizationSchema, validationHook),
        (c) => {
          const actor = c.get("actor");
          admin(actor);
          const member = identity.requireMember(actor.workspaceId, c.req.param("id"));
          const organization = { ...member.organization, ...c.req.valid("json") };
          if (typeof organization.departmentId === "string")
            department(actor, organization.departmentId);
          if (typeof organization.teamId === "string") {
            const row = team(actor, organization.teamId);
            if (organization.departmentId !== row.departmentId)
              throw new BadRequestError("Team must belong to the assigned department");
          }
          return c.json(
            db.transaction(() => {
              const updated = db
                .update(memberships)
                .set({ organization })
                .where(
                  and(
                    eq(memberships.workspaceId, actor.workspaceId),
                    eq(memberships.userId, member.userId),
                  ),
                )
                .returning()
                .get();
              audit.record({
                actor,
                action: "user.organization.update",
                targetType: "user",
                targetId: member.userId,
              });
              return updated;
            }),
          );
        },
      )
  );
}
