import {
  AccessPolicyInputSchema,
  ResolveConflictInputSchema,
  type AccessConflict,
  type AccessPolicy,
  type AccessPolicyList,
  type AccessPreview,
  type PolicySource,
  type PolicySourceOption,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import type { Db } from "../../db/index.js";
import {
  connectorScopes,
  departments,
  memberships,
  platformRecords,
  projects,
  teams,
  users,
} from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import {
  memberGroups,
  policiesCovering,
  readAccessPolicies,
  requireRole,
  type AccessPolicyRecord,
} from "../identity/identity.service.js";
import { createPlatformStore } from "./store.js";

const KIND = "access_policy";
const MIRROR_ID = "mirror";
const PreviewQuery = z.object({ personId: z.string().min(1).max(200) });

const sourceKey = (source: PolicySource) => `${source.kind}:${source.id}`;

/** Team and department names a policy can name. */
export const groupNames = (db: Db, workspaceId: string) =>
  [
    ...new Set([
      ...db
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.workspaceId, workspaceId))
        .all()
        .map((row) => row.name),
      ...db
        .select({ name: departments.name })
        .from(departments)
        .where(eq(departments.workspaceId, workspaceId))
        .all()
        .map((row) => row.name),
    ]),
  ].sort((a, b) => a.localeCompare(b));

/** Every project and synced folder in the workspace, labelled for the page. */
export const sourceOptions = (db: Db, workspaceId: string): PolicySourceOption[] => {
  const projectRows = db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(projects.name)
    .all();
  const projectName = new Map(projectRows.map((row) => [row.id, row.name]));
  const folders = projectRows.length
    ? db
        .select({
          id: connectorScopes.id,
          name: connectorScopes.name,
          projectId: connectorScopes.projectId,
        })
        .from(connectorScopes)
        .where(
          and(
            eq(connectorScopes.workspaceId, workspaceId),
            inArray(
              connectorScopes.projectId,
              projectRows.map((row) => row.id),
            ),
          ),
        )
        .all()
    : [];
  return [
    ...projectRows.map((row) => ({
      kind: "project" as const,
      id: row.id,
      provider: "contextos",
      label: `${row.name} (project)`,
    })),
    ...folders.map((row) => ({
      kind: "folder" as const,
      id: row.id,
      provider: "google-drive",
      label: `${row.name} · ${projectName.get(row.projectId) ?? "Project"}`,
    })),
  ];
};

/** How many sources are named by more than one policy (open conflicts). */
export function policyConflictCount(db: Db, workspaceId: string): number {
  const counts = new Map<string, number>();
  for (const policy of readAccessPolicies(db, workspaceId))
    for (const source of policy.sources)
      counts.set(sourceKey(source), (counts.get(sourceKey(source)) ?? 0) + 1);
  return [...counts.values()].filter((total) => total > 1).length;
}

/** Sources exclude policies keep out of answers, for the AI settings page. */
export function excludedSources(db: Db, workspaceId: string) {
  const options = new Map(
    sourceOptions(db, workspaceId).map((option) => [sourceKey(option), option]),
  );
  return readAccessPolicies(db, workspaceId)
    .filter((policy) => policy.effect === "exclude")
    .flatMap((policy) =>
      policy.sources.map((source) => ({
        provider: options.get(sourceKey(source))?.provider ?? "contextos",
        label: options.get(sourceKey(source))?.label ?? "Removed source",
        reason: `Policy: ${policy.name} (${policy.groups.join(", ")} can still open it)`,
      })),
    );
}

/**
 * Access policies (role access spec §4.8): the locked "Mirror source permissions" default, plus
 * Restrict and Exclude policies by group (team or department) and source (project or synced folder).
 * They are enforced where source visibility is decided (identity.visibleSourceIds and
 * answerableSourceIds), so search, the Knowledge Hub and answers all follow them, admins included.
 */
export function createAccessPolicyRoutes(container: Container) {
  const { db, identity, audit } = container;
  const store = createPlatformStore(db);
  const admin = (actor: Actor) => requireRole(actor, "owner", "admin");

  /** Sources named by two or more policies. Until resolved, the more open rule applies. */
  const conflictsOf = (
    policies: AccessPolicyRecord[],
    options: Map<string, PolicySourceOption>,
  ): AccessConflict[] => {
    const bySource = new Map<string, AccessPolicyRecord[]>();
    for (const policy of policies)
      for (const source of policy.sources) {
        const key = sourceKey(source);
        bySource.set(key, [...(bySource.get(key) ?? []), policy]);
      }
    return [...bySource.entries()]
      .filter(([, covering]) => covering.length > 1)
      .map(([key, covering]) => {
        const label = options.get(key)?.label ?? "This source";
        return {
          id: key,
          title: `${covering.length} policies cover ${label}`,
          description: `${covering.map((policy) => `“${policy.name}”`).join(" and ")} both name it. Until you choose, the more open rule applies: anyone in either policy’s groups can open it.`,
          options: covering.map((policy) => ({
            id: policy.id,
            label: `Keep “${policy.name}”`,
            description: `Only ${policy.groups.join(", ")} decide access; ${label} is removed from the other ${covering.length === 2 ? "policy" : "policies"}.`,
          })),
        };
      });
  };

  const describe = (policy: AccessPolicyRecord) =>
    policy.effect === "exclude"
      ? `Never used in Context Bot answers. Only ${policy.groups.join(", ")} can open it.`
      : `Only ${policy.groups.join(", ")} can open it, in search, the Knowledge Hub and answers.`;

  const list = (actor: Actor): AccessPolicyList => {
    const policies = readAccessPolicies(db, actor.workspaceId);
    const optionList = sourceOptions(db, actor.workspaceId);
    const options = new Map(optionList.map((option) => [sourceKey(option), option]));
    const conflicts = conflictsOf(policies, options);
    const inConflict = new Set(
      conflicts.flatMap((conflict) => conflict.options.map((option) => option.id)),
    );
    const mirror: AccessPolicy = {
      id: MIRROR_ID,
      name: "Mirror source permissions",
      effect: "default",
      description:
        "Everyone sees only what they can open in the original source, or what an admin shared with the whole workspace. Always on.",
      groups: [],
      sources: [],
      locked: true,
      conflict: false,
      updatedAt: null,
    };
    const people = db
      .select({
        id: users.id,
        name: users.name,
        organization: memberships.organization,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.status, "active")))
      .orderBy(users.name)
      .limit(200)
      .all();
    return {
      total: policies.length + 1,
      items: [
        mirror,
        ...policies.map((policy): AccessPolicy => ({
          id: policy.id,
          name: policy.name,
          effect: policy.effect,
          description: describe(policy),
          groups: policy.groups,
          sources: policy.sources.map((source) => ({
            ...source,
            provider: options.get(sourceKey(source))?.provider ?? "contextos",
            label: options.get(sourceKey(source))?.label ?? "Removed source",
          })),
          locked: false,
          conflict: inConflict.has(policy.id),
          updatedAt: policy.updatedAt.toISOString(),
        })),
      ],
      conflicts,
      groups: groupNames(db, actor.workspaceId),
      previewPeople: people.map((person) => {
        const groups = memberGroups(db, actor.workspaceId, person.id);
        return {
          person: {
            id: person.id,
            name: person.name,
            title:
              typeof person.organization.jobTitle === "string"
                ? person.organization.jobTitle
                : null,
          },
          groups: groups.length ? groups.join(", ") : "No team",
        };
      }),
      sourceOptions: optionList,
    };
  };

  /** Validate a policy body against the workspace's real groups and sources. */
  const validate = (actor: Actor, input: z.infer<typeof AccessPolicyInputSchema>) => {
    const known = new Set(groupNames(db, actor.workspaceId));
    const unknownGroups = input.groups.filter((group) => !known.has(group));
    if (unknownGroups.length) throw new BadRequestError(`Unknown group: ${unknownGroups[0]}`);
    const options = new Set(sourceOptions(db, actor.workspaceId).map(sourceKey));
    if (input.sources.some((source) => !options.has(sourceKey(source))))
      throw new BadRequestError("Some of the chosen sources were not found");
    const seen = new Set<string>();
    return {
      name: input.name,
      effect: input.effect,
      groups: [...new Set(input.groups)],
      sources: input.sources.filter((source) => {
        const key = sourceKey(source);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    };
  };

  const record = (actor: Actor, id: string) => {
    if (id === MIRROR_ID)
      throw new AppError(409, "CONFLICT", "Mirror source permissions is always on");
    const row = store.find(actor.workspaceId, KIND, id);
    if (row?.status !== "active") throw new NotFoundError("Policy");
    return row;
  };

  return new Hono<AppEnv>()
    .get("/admin/access-policies", (c) => {
      const actor = c.get("actor");
      admin(actor);
      return c.json(list(actor));
    })
    .post(
      "/admin/access-policies",
      zValidator("json", AccessPolicyInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        admin(actor);
        const data = validate(actor, c.req.valid("json"));
        const row = store.create(actor, KIND, data, { status: "active" });
        audit.record({
          actor,
          action: "policy.create",
          targetType: "access_policy",
          targetId: row.id,
          metadata: { after: data },
        });
        return c.json(
          list(actor).items.find((item) => item.id === row.id)!,
          201,
        );
      },
    )
    .patch(
      "/admin/access-policies/:id",
      zValidator("json", AccessPolicyInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        admin(actor);
        const row = record(actor, c.req.param("id"));
        const data = validate(actor, c.req.valid("json"));
        store.patch(row, { data });
        audit.record({
          actor,
          action: "policy.update",
          targetType: "access_policy",
          targetId: row.id,
          metadata: { before: row.data, after: data },
        });
        return c.json(list(actor).items.find((item) => item.id === row.id)!);
      },
    )
    .delete("/admin/access-policies/:id", (c) => {
      const actor = c.get("actor");
      admin(actor);
      const row = record(actor, c.req.param("id"));
      db.delete(platformRecords).where(eq(platformRecords.id, row.id)).run();
      audit.record({
        actor,
        action: "policy.delete",
        targetType: "access_policy",
        targetId: row.id,
        metadata: { before: row.data },
      });
      return c.body(null, 204);
    })
    .post(
      "/admin/access-conflicts/:id/resolve",
      zValidator("json", ResolveConflictInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        admin(actor);
        const conflictId = c.req.param("id");
        const current = list(actor);
        const conflict = current.conflicts.find((entry) => entry.id === conflictId);
        if (!conflict) throw new NotFoundError("Conflict");
        const { optionId } = c.req.valid("json");
        if (!conflict.options.some((option) => option.id === optionId))
          throw new BadRequestError("Choose one of the conflict's options");
        db.transaction(() => {
          for (const option of conflict.options) {
            if (option.id === optionId) continue;
            const row = record(actor, option.id);
            const sources = (row.data.sources as PolicySource[]).filter(
              (source) => sourceKey(source) !== conflictId,
            );
            store.patch(row, { data: { ...row.data, sources } });
          }
          audit.record({
            actor,
            action: "policy.resolve_conflict",
            targetType: "access_policy",
            targetId: optionId,
            metadata: { source: conflictId, kept: optionId },
          });
        });
        return c.json(list(actor));
      },
    )
    .get("/admin/access-preview", zValidator("query", PreviewQuery, validationHook), (c) => {
      const actor = c.get("actor");
      admin(actor);
      const membership = identity.requireMember(actor.workspaceId, c.req.valid("query").personId);
      const person = db.select().from(users).where(eq(users.id, membership.userId)).get();
      if (!person) throw new NotFoundError("Member");
      // Evaluate exactly as the API does for them: their own role, grants and groups.
      const as: Actor = {
        id: person.id,
        name: person.name,
        workspaceId: actor.workspaceId,
        role: membership.role,
      };
      const policies = readAccessPolicies(db, actor.workspaceId);
      const groups = new Set(memberGroups(db, actor.workspaceId, person.id));
      const options = sourceOptions(db, actor.workspaceId);
      const items: AccessPreview["items"] = [];
      for (const option of options) {
        const covering = policiesCovering(
          policies,
          option.kind === "project" ? option.id : "",
          option.kind === "folder" ? option.id : undefined,
        );
        if (option.kind === "project") {
          let visible: string[];
          try {
            visible = identity.visibleSourceIds(as, option.id);
          } catch {
            items.push({
              provider: option.provider,
              label: option.label,
              allowed: false,
              reason: "Not a member of this project",
            });
            continue;
          }
          if (covering.length) {
            const decider = covering.find((policy) =>
              policy.groups.some((group) => groups.has(group)),
            );
            items.push({
              provider: option.provider,
              label: option.label,
              allowed: Boolean(decider),
              reason: decider
                ? `Allowed by “${decider.name}”${decider.effect === "exclude" ? ", never used in answers" : ""}`
                : `“${covering[0]!.name}” limits it to ${covering[0]!.groups.join(", ")}`,
            });
          } else
            items.push({
              provider: option.provider,
              label: option.label,
              allowed: visible.length > 0,
              reason: visible.length
                ? `Mirror source permissions: ${visible.length} source${visible.length === 1 ? "" : "s"} they can open`
                : "Mirror source permissions: nothing here they can open",
            });
          continue;
        }
        if (!covering.length) continue;
        const decider = covering.find((policy) => policy.groups.some((group) => groups.has(group)));
        items.push({
          provider: option.provider,
          label: option.label,
          allowed: Boolean(decider),
          reason: decider
            ? `Allowed by “${decider.name}”${decider.effect === "exclude" ? ", never used in answers" : ""}`
            : `“${covering[0]!.name}” limits it to ${covering[0]!.groups.join(", ")}`,
        });
      }
      return c.json({
        person: {
          id: person.id,
          name: person.name,
          title:
            typeof membership.organization.jobTitle === "string"
              ? membership.organization.jobTitle
              : null,
        },
        items,
      } satisfies AccessPreview);
    });
}
