import { SearchQuerySchema, SearchTypeSchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Container } from "../../container.js";
import { memberships, users } from "../../db/schema.js";
import { buildFtsQuery } from "../../lib/retrieval.js";
import { validationHook } from "../../middleware/validation.js";
import type { AppEnv } from "../../types.js";
import { createPlatformStore } from "../platform/store.js";

interface SearchResult {
  type: string;
  id: string;
  projectId: string | null;
  title: string;
  snippet: string;
  kind?: string;
  link: string;
}

/** Global, permission-filtered search with type facets (FR-SRCH-002). */
export function createSearchRoutes(container: Container) {
  const { db, identity, services, repos } = container;
  const store = createPlatformStore(db);
  return new Hono<AppEnv>().get(
    "/search",
    zValidator("query", SearchQuerySchema, validationHook),
    (c) => {
      const actor = c.get("actor");
      const { q, projectId, limit, offset, types } = c.req.valid("query");
      const facets = new Set(
        (types ? types.split(",") : SearchTypeSchema.options)
          .map((value) => value.trim())
          .filter((value): value is (typeof SearchTypeSchema.options)[number] =>
            SearchTypeSchema.options.includes(value as (typeof SearchTypeSchema.options)[number]),
          ),
      );
      const needle = q.toLocaleLowerCase();
      const matches = (...parts: Array<string | null | undefined>) =>
        parts.some((part) => part?.toLocaleLowerCase().includes(needle));
      const projects = services.projects
        .list(actor)
        .filter((project) => !projectId || project.id === projectId);
      const results: SearchResult[] = [];
      for (const project of projects) {
        const ref = project.slug ?? project.id;
        if (facets.has("project") && matches(project.name, project.description))
          results.push({
            type: "project",
            id: project.id,
            projectId: project.id,
            title: project.name,
            snippet: project.description ?? "",
            link: `/projects/${ref}`,
          });
        const row = repos.projects.findById(project.id, actor.workspaceId)!;
        if (facets.has("context_item"))
          for (const item of services.context.listItems(row, undefined, actor))
            if (matches(item.title, item.summary))
              results.push({
                type: "context_item",
                kind: item.kind,
                id: item.id,
                projectId: project.id,
                title: item.title,
                snippet: item.summary,
                link: `/projects/${ref}/items/${item.id}`,
              });
        if (facets.has("source")) {
          const allowed = identity.visibleSourceIds(actor, project.id);
          const match = buildFtsQuery(q);
          const hits = match ? repos.sources.searchChunks(project.id, match, 10, allowed) : [];
          const chunks = repos.sources.getChunksWithSources(hits.map((hit) => hit.chunkId));
          const seen = new Set<string>();
          for (const { chunk, source } of chunks) {
            if (seen.has(source.id)) continue;
            seen.add(source.id);
            results.push({
              type: "source",
              kind: source.kind,
              id: source.id,
              projectId: project.id,
              title: source.title,
              snippet: chunk.content.slice(0, 240),
              link: `/projects/${ref}/sources/${source.id}`,
            });
          }
          for (const source of services.sources.list(row))
            if (allowed.includes(source.id) && !seen.has(source.id) && matches(source.title))
              results.push({
                type: "source",
                kind: source.kind,
                id: source.id,
                projectId: project.id,
                title: source.title,
                snippet: "",
                link: `/projects/${ref}/sources/${source.id}`,
              });
        }
      }
      const accessible = new Set(projects.map((project) => project.id));
      if (facets.has("path"))
        for (const path of store.listWhere(
          actor.workspaceId,
          "learning_path",
          { status: "published" },
          500,
        ))
          if (
            path.projectId &&
            accessible.has(path.projectId) &&
            matches(String(path.data.title), String(path.data.roleFamily))
          )
            results.push({
              type: "path",
              id: path.id,
              projectId: path.projectId,
              title: String(path.data.title),
              snippet: `Role family: ${String(path.data.roleFamily)}`,
              link: `/learning/paths/${path.id}`,
            });
      if (facets.has("bounty") && actor.role !== "guest")
        for (const bounty of store.listWhere(actor.workspaceId, "bounty", { status: "open" }, 500))
          if (
            bounty.projectId &&
            accessible.has(bounty.projectId) &&
            matches(String(bounty.data.title), String(bounty.data.description))
          )
            results.push({
              type: "bounty",
              id: bounty.id,
              projectId: bounty.projectId,
              title: String(bounty.data.title),
              snippet: String(bounty.data.description).slice(0, 240),
              link: `/bounties/${bounty.id}`,
            });
      if (facets.has("person") && actor.role !== "guest")
        for (const person of db
          .select({ id: users.id, name: users.name, organization: memberships.organization })
          .from(users)
          .innerJoin(memberships, eq(memberships.userId, users.id))
          .where(
            and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.status, "active")),
          )
          .all()) {
          const jobTitle =
            typeof person.organization.jobTitle === "string" ? person.organization.jobTitle : "";
          if (matches(person.name, jobTitle))
            results.push({
              type: "person",
              id: person.id,
              projectId: null,
              title: person.name,
              snippet: jobTitle,
              link: `/people/${person.id}`,
            });
        }
      const facetCounts = Object.fromEntries(
        SearchTypeSchema.options.map((type) => [
          type,
          results.filter((result) => result.type === type).length,
        ]),
      );
      return c.json({
        total: results.length,
        facets: facetCounts,
        items: results.slice(offset, offset + limit),
      });
    },
  );
}
