import { and, count, eq, gte, ne, sql } from "drizzle-orm";
import type { Container } from "../../container.js";
import { platformRecords } from "../../db/schema.js";
import { AppError } from "../../lib/errors.js";
import type { GenerationUsage } from "../../lib/gemini.js";
import type { Actor } from "../../types.js";
import { workspaceSettings } from "../platform/settings.js";
import { createPlatformStore, type PlatformRecord } from "../platform/store.js";

/*
 * The AI run log (PRD FR-CTX-013): one record per roadmap or module generation, with its model,
 * prompt version and tokens. It also holds the daily limits that keep ContextOS's AI costs down. A
 * run counts from the moment it is queued, so a bulk request can't get past the limit.
 */

export const GENERATION_RUN = "generation_run";
export type GenerationKind = "template" | "module";
/** Module updates drafted on their own after the Hub changed: they have their own daily share. */
export const AUTOMATIC_UPDATE = "tutorial_update";

export interface GenerationRunData {
  kind: GenerationKind;
  purpose: string;
  promptVersion: string;
  targetType: string;
  targetId: string | null;
  automatic: boolean;
  /** Paid for by the workspace's one-time setup allowance, not the daily limit. */
  setup?: boolean;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  error: string | null;
  finishedAt: string | null;
}

const startOfDay = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

export function createGenerationRuns(container: Container) {
  const { db, env, gemini } = container;
  const store = createPlatformStore(db);

  /** Today's limit: ContextOS's ceiling, or the Owner's lower one. */
  const limitOf = (workspaceId: string, kind: GenerationKind) => {
    const ceiling = kind === "template" ? env.AI_DAILY_TEMPLATE_LIMIT : env.AI_DAILY_MODULE_LIMIT;
    const { policies } = workspaceSettings(db, workspaceId);
    const own = kind === "template" ? policies.aiDailyTemplates : policies.aiDailyModules;
    return Math.min(ceiling, own ?? ceiling);
  };

  const usedToday = (workspaceId: string, kind: GenerationKind, automaticUpdates = false) =>
    db
      .select({ n: count() })
      .from(platformRecords)
      .where(
        and(
          eq(platformRecords.workspaceId, workspaceId),
          eq(platformRecords.kind, GENERATION_RUN),
          gte(platformRecords.createdAt, startOfDay()),
          // Skipped runs (too little knowledge) never reached the model.
          ne(platformRecords.status, "skipped"),
          sql`json_extract(${platformRecords.data}, '$.kind') = ${kind}`,
          // Setup runs come out of the one-time allowance.
          sql`coalesce(json_extract(${platformRecords.data}, '$.setup'), 0) = 0`,
          automaticUpdates
            ? and(
                sql`json_extract(${platformRecords.data}, '$.automatic') = 1`,
                sql`json_extract(${platformRecords.data}, '$.purpose') = ${AUTOMATIC_UPDATE}`,
              )
            : undefined,
        ),
      )
      .get()?.n ?? 0;

  /** The one-time allowance a workspace's setup may use to draft every role's template at once. */
  const setupAllowance = (kind: GenerationKind) =>
    kind === "template" ? env.AI_SETUP_TEMPLATE_ALLOWANCE : env.AI_SETUP_MODULE_ALLOWANCE;
  /** Setup runs ever made (all time: the allowance is used once, never renewed). */
  const setupUsed = (workspaceId: string, kind: GenerationKind) =>
    db
      .select({ n: count() })
      .from(platformRecords)
      .where(
        and(
          eq(platformRecords.workspaceId, workspaceId),
          eq(platformRecords.kind, GENERATION_RUN),
          ne(platformRecords.status, "skipped"),
          sql`json_extract(${platformRecords.data}, '$.kind') = ${kind}`,
          sql`json_extract(${platformRecords.data}, '$.setup') = 1`,
        ),
      )
      .get()?.n ?? 0;
  /** Whether a setup run would still come out of the allowance. */
  const setupLeft = (workspaceId: string, kind: GenerationKind) =>
    setupUsed(workspaceId, kind) < setupAllowance(kind);

  /**
   * Refuses with 429 when today's limit is used up. Module updates that start on their own also
   * have their own share, so they never use up what people need for their own drafts.
   */
  const ensureAvailable = (workspaceId: string, kind: GenerationKind, automaticUpdate = false) => {
    if (usedToday(workspaceId, kind) >= limitOf(workspaceId, kind))
      throw new AppError(
        429,
        "RATE_LIMITED",
        "Daily AI limit reached for this workspace. It resets at midnight UTC.",
      );
    if (automaticUpdate && usedToday(workspaceId, kind, true) >= env.AI_DAILY_AUTOMATIC_LIMIT)
      throw new AppError(
        429,
        "RATE_LIMITED",
        "Daily limit for automatic AI updates reached. It resets at midnight UTC.",
      );
  };

  /** Today's limit, or (setup) the one-time allowance while it lasts. */
  const ensureFor = (workspaceId: string, kind: GenerationKind, setup = false) => {
    if (setup && setupLeft(workspaceId, kind)) return;
    ensureAvailable(workspaceId, kind);
  };

  return {
    limitOf,
    usedToday,
    ensureAvailable,
    ensureFor,
    /** What is left of the one-time setup allowance. */
    allowance(workspaceId: string) {
      const of = (kind: GenerationKind) => ({
        used: Math.min(setupUsed(workspaceId, kind), setupAllowance(kind)),
        total: setupAllowance(kind),
      });
      return { templates: of("template"), modules: of("module") };
    },

    /**
     * Count a generation against today's limit (or, for workspace setup, the one-time allowance
     * while it lasts) and log it; the job finishes the record.
     */
    start(
      actor: Actor,
      input: Pick<GenerationRunData, "kind" | "purpose" | "promptVersion" | "targetType"> & {
        targetId?: string | null;
        automatic?: boolean;
        setup?: boolean;
      },
    ): PlatformRecord {
      const setup = input.setup === true && setupLeft(actor.workspaceId, input.kind);
      if (!setup)
        ensureAvailable(
          actor.workspaceId,
          input.kind,
          input.automatic === true && input.purpose === AUTOMATIC_UPDATE,
        );
      return store.create(
        actor,
        GENERATION_RUN,
        {
          kind: input.kind,
          purpose: input.purpose,
          promptVersion: input.promptVersion,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          automatic: input.automatic ?? false,
          setup,
          model: null,
          inputTokens: 0,
          outputTokens: 0,
          error: null,
          finishedAt: null,
        } satisfies GenerationRunData,
        { status: "queued" },
      );
    },

    /** Tokens from each AI call of the run (a retry adds to them). */
    usageRecorder(workspaceId: string, runId: string | null) {
      return (usage: GenerationUsage) => {
        const row = runId ? store.find(workspaceId, GENERATION_RUN, runId) : undefined;
        if (!row) return;
        const data = row.data as unknown as GenerationRunData;
        store.patch(row, {
          data: {
            ...data,
            model: gemini.model,
            inputTokens: data.inputTokens + usage.inputTokens,
            outputTokens: data.outputTokens + usage.outputTokens,
          },
        });
      };
    },

    /** Done, failed, or skipped when the knowledge was too thin to ask the model. */
    finish(
      workspaceId: string,
      runId: string | null,
      error: string | null = null,
      skipped = false,
    ) {
      const row = runId ? store.find(workspaceId, GENERATION_RUN, runId) : undefined;
      if (!row) return;
      store.patch(row, {
        status: skipped ? "skipped" : error ? "failed" : "done",
        data: { ...row.data, error, finishedAt: new Date().toISOString() },
      });
    },
  };
}
