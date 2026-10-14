import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Container } from "../../container.js";
import {
  auditLog,
  departments,
  memberships,
  pointsLedger,
  teams,
  users,
  workspaces,
} from "../../db/schema.js";
import type { AppEnv } from "../../types.js";
import { requireRole } from "../identity/identity.service.js";
import { createPlatformStore } from "./store.js";

/** Workspace data export (FR-ADM-008). Permission parity applies: no admin bypass (PP-10). */
export function createAdminRoutes(container: Container) {
  const { db, identity, services, repos, audit } = container;
  const store = createPlatformStore(db);
  return new Hono<AppEnv>().get("/admin/export", (c) => {
    const actor = c.get("actor");
    requireRole(actor, "owner", "admin");
    const workspace = db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, actor.workspaceId))
      .get();
    const projects = services.projects.list(actor).map((project) => {
      const row = repos.projects.findById(project.id, actor.workspaceId)!;
      const allowed = new Set(identity.visibleSourceIds(actor, project.id));
      return {
        ...project,
        sources: services.sources.list(row).filter((source) => allowed.has(source.id)),
        contextItems: services.context.listItems(row, undefined, actor),
        conflicts: services.conflicts.list(
          row,
          services.context.listItems(row, undefined, actor),
          true,
        ),
      };
    });
    const members = db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
        status: memberships.status,
        managerId: memberships.managerId,
        organization: memberships.organization,
      })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(eq(memberships.workspaceId, actor.workspaceId))
      .all();
    const kinds = [
      "flag",
      "correction",
      "bounty",
      "learning_path",
      "path_version",
      "path_assignment",
      "onboarding_plan",
      "checkin",
      "reward_item",
      "redemption",
      "kudos",
      "badge",
      "invitation",
      "continuity_checklist",
    ];
    const records = Object.fromEntries(
      kinds.map((kind) => [kind, store.listWhere(actor.workspaceId, kind, {}, 5000)]),
    );
    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: actor.id,
      workspace,
      members,
      departments: db
        .select()
        .from(departments)
        .where(eq(departments.workspaceId, actor.workspaceId))
        .all(),
      teams: db.select().from(teams).where(eq(teams.workspaceId, actor.workspaceId)).all(),
      projects,
      records,
      pointsLedger: db
        .select()
        .from(pointsLedger)
        .where(eq(pointsLedger.workspaceId, actor.workspaceId))
        .all(),
      auditLog: db.select().from(auditLog).where(eq(auditLog.workspaceId, actor.workspaceId)).all(),
      note: "Ask conversations are private to each asker and are not included (decision D1). Encrypted shipping and provider credentials are never exported.",
    };
    audit.record({
      actor,
      action: "workspace.export",
      targetType: "workspace",
      targetId: actor.workspaceId,
    });
    return c.json(payload, 200, {
      "Content-Disposition": `attachment; filename="contextos-${workspace?.slug ?? "workspace"}-export.json"`,
    });
  });
}
