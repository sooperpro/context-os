import { randomUUID } from "node:crypto";
import type { Job, JobStatus, JobType, SyncStatus } from "@contextos/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  notInArray,
  or,
} from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { jobs, type JobRow } from "../../db/schema.js";

export interface EnqueueParams {
  projectId: string;
  type: JobType;
  payload: Record<string, unknown>;
  subject?: string | null;
  /**
   * Skip when an equivalent job is already queued: the same type and `concurrencyKey` when one is
   * given (an indexed lookup), otherwise the same type and payload for the project.
   */
  dedupe?: boolean;
  maxAttempts?: number;
  /** Delay execution until this time (defaults to now). */
  runAfter?: Date;
  /** Higher runs first (default 0). Bulk imports use negative values so one-off work isn't stuck. */
  priority?: number;
  /** Jobs with the same key never run at the same time, even with several workers. */
  concurrencyKey?: string;
}

/** Priorities used across the app: listing a folder is quick; bulk imports wait their turn. */
export const JOB_PRIORITY = { sync: 10, interactive: 0, bulk: -10 } as const;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toJob(row: JobRow): Job {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    lastError: row.lastError,
    subject: row.subject,
    runAfter: row.runAfter.toISOString(),
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Durable, retry-safe job queue on SQLite. One row per unit of background work. */
export function createJobQueue(db: Db) {
  return {
    enqueue(params: EnqueueParams): JobRow {
      if (params.dedupe && params.concurrencyKey) {
        const existing = db
          .select()
          .from(jobs)
          .where(
            and(
              eq(jobs.concurrencyKey, params.concurrencyKey),
              eq(jobs.status, "queued"),
              eq(jobs.type, params.type),
            ),
          )
          .get();
        if (existing) return existing;
      } else if (params.dedupe) {
        const existing = db
          .select()
          .from(jobs)
          .where(
            and(
              eq(jobs.projectId, params.projectId),
              eq(jobs.type, params.type),
              eq(jobs.status, "queued"),
            ),
          )
          .all()
          .find((row) => JSON.stringify(row.payload) === JSON.stringify(params.payload));
        if (existing) return existing;
      }
      return db
        .insert(jobs)
        .values({
          id: randomUUID(),
          projectId: params.projectId,
          type: params.type,
          payload: params.payload,
          subject: params.subject ?? null,
          status: "queued",
          attempts: 0,
          maxAttempts: params.maxAttempts ?? 3,
          runAfter: params.runAfter ?? new Date(),
          priority: params.priority ?? 0,
          concurrencyKey: params.concurrencyKey ?? null,
        })
        .returning()
        .get();
    },

    /**
     * Atomically claim the next runnable job (status queued → running): highest priority first, then
     * oldest, skipping any whose concurrency key is held by a running job.
     */
    claimNext(now = new Date()): JobRow | undefined {
      return db.transaction((tx) => {
        const busy = tx
          .select({ key: jobs.concurrencyKey })
          .from(jobs)
          .where(and(eq(jobs.status, "running"), isNotNull(jobs.concurrencyKey)));
        const next = tx
          .select()
          .from(jobs)
          .where(
            and(
              eq(jobs.status, "queued"),
              lte(jobs.runAfter, now),
              or(isNull(jobs.concurrencyKey), notInArray(jobs.concurrencyKey, busy)),
            ),
          )
          .orderBy(desc(jobs.priority), asc(jobs.createdAt))
          .limit(1)
          .get();
        if (!next) return undefined;
        return tx
          .update(jobs)
          .set({
            status: "running",
            lockedAt: now,
            startedAt: now,
            attempts: next.attempts + 1,
            updatedAt: now,
          })
          .where(and(eq(jobs.id, next.id), eq(jobs.status, "queued")))
          .returning()
          .get();
      });
    },

    complete(id: string): void {
      const now = new Date();
      db.update(jobs)
        .set({ status: "done", finishedAt: now, lockedAt: null, lastError: null, updatedAt: now })
        .where(eq(jobs.id, id))
        .run();
    },

    /** Record a failure; re-queue for `retryAt` when provided, otherwise fail permanently. */
    fail(id: string, error: string, retryAt: Date | null): void {
      const now = new Date();
      db.update(jobs)
        .set(
          retryAt
            ? {
                status: "queued",
                runAfter: retryAt,
                lockedAt: null,
                lastError: error,
                updatedAt: now,
              }
            : {
                status: "failed",
                finishedAt: now,
                lockedAt: null,
                lastError: error,
                updatedAt: now,
              },
        )
        .where(eq(jobs.id, id))
        .run();
    },

    retry(id: string, projectId: string): JobRow | undefined {
      const now = new Date();
      return db
        .update(jobs)
        .set({
          status: "queued",
          runAfter: now,
          attempts: 0,
          lastError: null,
          finishedAt: null,
          updatedAt: now,
        })
        .where(and(eq(jobs.id, id), eq(jobs.projectId, projectId), eq(jobs.status, "failed")))
        .returning()
        .get();
    },

    /** Jobs stuck in `running` (e.g. after a crash) go back to the queue. */
    requeueStale(olderThan: Date): number {
      const now = new Date();
      return db
        .update(jobs)
        .set({ status: "queued", lockedAt: null, runAfter: now, updatedAt: now })
        .where(and(eq(jobs.status, "running"), lt(jobs.lockedAt, olderThan)))
        .returning({ id: jobs.id })
        .all().length;
    },

    list(projectId: string, status: JobStatus | undefined, limit: number): JobRow[] {
      return db
        .select()
        .from(jobs)
        .where(
          status
            ? and(eq(jobs.projectId, projectId), eq(jobs.status, status))
            : eq(jobs.projectId, projectId),
        )
        .orderBy(desc(jobs.createdAt))
        .limit(limit)
        .all();
    },

    syncStatus(projectId: string): SyncStatus {
      const rows = db
        .select({ status: jobs.status, total: count() })
        .from(jobs)
        .where(eq(jobs.projectId, projectId))
        .groupBy(jobs.status)
        .all();
      const by = new Map(rows.map((r) => [r.status, r.total]));
      const last = db
        .select({ at: max(jobs.finishedAt) })
        .from(jobs)
        .where(and(eq(jobs.projectId, projectId), eq(jobs.status, "done")))
        .get();
      const queued = by.get("queued") ?? 0;
      const running = by.get("running") ?? 0;
      const failed = by.get("failed") ?? 0;
      return {
        state: failed > 0 ? "attention" : queued + running > 0 ? "processing" : "idle",
        queued,
        running,
        failed,
        lastCompletedAt: last?.at ? last.at.toISOString() : null,
      };
    },
  };
}

export type JobQueue = ReturnType<typeof createJobQueue>;
