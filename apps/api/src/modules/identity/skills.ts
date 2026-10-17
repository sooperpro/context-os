import { PROFILE_LIMITS, SkillSuggestQuerySchema, type SkillSuggestion } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { memberships, users } from "../../db/schema.js";
import type { Logger } from "../../lib/logger.js";
import { validationHook } from "../../middleware/validation.js";
import type { AppEnv } from "../../types.js";
import { personalProfileOf } from "./identity.service.js";

const EscoSuggestions = z.object({
  _embedded: z
    .object({ results: z.array(z.object({ uri: z.string(), title: z.string() })) })
    .default({ results: [] }),
});

const DAY_MS = 86_400_000;
const CACHE_SIZE = 500;

/**
 * Skill names from ESCO, the European Commission's free skills classification (N-10), through its
 * public API: one call per new text, remembered for a day. An empty base URL turns it off, and a
 * slow or failing ESCO just means no ESCO suggestions.
 */
export function createEscoSkills({
  baseUrl,
  logger,
  fetch = globalThis.fetch,
  ttlMs = DAY_MS,
}: {
  baseUrl: string;
  logger: Logger;
  fetch?: typeof globalThis.fetch;
  ttlMs?: number;
}) {
  const cache = new Map<string, { at: number; items: SkillSuggestion[] }>();
  return async (text: string): Promise<SkillSuggestion[]> => {
    if (!baseUrl) return [];
    const key = text.toLocaleLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.items;
    try {
      const query = new URLSearchParams({ text, type: "skill", language: "en", limit: "8" });
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/suggest2?${query}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error(`ESCO answered ${response.status}`);
      const items = EscoSuggestions.parse(await response.json())._embedded.results.map(
        (result): SkillSuggestion => ({
          label: result.title.slice(0, PROFILE_LIMITS.skill),
          id: result.uri,
          source: "esco",
        }),
      );
      if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), items });
      return items;
    } catch (error) {
      logger.warn({ err: error }, "ESCO skill lookup failed; suggesting workspace skills only");
      return [];
    }
  };
}
export type EscoSkills = ReturnType<typeof createEscoSkills>;

/** `GET /skills/suggest?q=`: what people here already list first, then ESCO's (N-10). */
export function createSkillRoutes(container: Container) {
  const { db, skills } = container;
  return new Hono<AppEnv>().get(
    "/skills/suggest",
    zValidator("query", SkillSuggestQuerySchema, validationHook),
    async (c) => {
      const actor = c.get("actor");
      const needle = c.req.valid("query").q.toLocaleLowerCase();
      // Guests can't read the directory, so they don't see what people here list either.
      const used = new Map<string, { label: string; count: number }>();
      if (actor.role !== "guest")
        for (const { preferences } of db
          .select({ preferences: users.preferences })
          .from(users)
          .innerJoin(memberships, eq(memberships.userId, users.id))
          .where(
            and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.status, "active")),
          )
          .all())
          for (const skill of personalProfileOf(preferences).skills) {
            const key = skill.toLocaleLowerCase();
            if (!key.includes(needle)) continue;
            used.set(key, {
              label: used.get(key)?.label ?? skill,
              count: (used.get(key)?.count ?? 0) + 1,
            });
          }
      const esco = needle.length >= 2 ? await skills(needle) : [];
      const escoIds = new Map(esco.map((item) => [item.label.toLocaleLowerCase(), item.id]));
      const workspace = [...used.values()]
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .slice(0, 5)
        .map(({ label }): SkillSuggestion => ({
          label,
          id: escoIds.get(label.toLocaleLowerCase()) ?? null,
          source: "workspace",
        }));
      const listed = new Set(workspace.map((item) => item.label.toLocaleLowerCase()));
      return c.json({
        items: [
          ...workspace,
          ...esco.filter((item) => !listed.has(item.label.toLocaleLowerCase())),
        ].slice(0, 10),
      });
    },
  );
}
