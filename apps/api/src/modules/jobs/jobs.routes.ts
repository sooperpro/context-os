import { IdSchema, ListJobsQuerySchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { ProjectEnv } from "../../types.js";
import type { AuditService } from "../audit/audit.service.js";
import { toJob, type JobQueue } from "./jobs.queue.js";
import type { IdentityService } from "../identity/identity.service.js";
import type { SourceRepository } from "../sources/sources.repository.js";
import type { JobRow } from "../../db/schema.js";
import type { Actor } from "../../types.js";

const JobParam = z.object({ jobId: IdSchema });

export function createJobRoutes(
  queue: JobQueue,
  audit: AuditService,
  identity: IdentityService,
  sources: SourceRepository,
) {
  const permitted = (actor: Actor, projectId: string, row: JobRow) => {
    const allowed = new Set(identity.visibleSourceIds(actor, projectId));
    return row.type === "process_source"
      ? typeof row.payload.sourceObjectId === "string" && allowed.has(row.payload.sourceObjectId)
      : sources.list(projectId).every((source) => allowed.has(source.id));
  };
  return new Hono<ProjectEnv>()
    .get("/", zValidator("query", ListJobsQuerySchema, validationHook), (c) => {
      const { status, limit } = c.req.valid("query");
      return c.json({
        items: queue
          .list(c.get("project").id, status, limit)
          .filter((row) => permitted(c.get("actor"), c.get("project").id, row))
          .map(toJob),
      });
    })
    .post("/:jobId/retry", zValidator("param", JobParam, validationHook), (c) => {
      const project = c.get("project");
      const { jobId } = c.req.valid("param");
      const candidate = queue.list(project.id, "failed", 200).find((row) => row.id === jobId);
      if (!candidate || !permitted(c.get("actor"), project.id, candidate))
        throw new NotFoundError("Failed job");
      const row = queue.retry(jobId, project.id);
      if (!row) throw new NotFoundError("Failed job", jobId);
      audit.record({
        actor: c.get("actor"),
        projectId: project.id,
        action: "job.retry",
        targetType: "job",
        targetId: jobId,
        metadata: { type: row.type },
      });
      return c.json(toJob(row), 202);
    });
}
