import { IdSchema, ListJobsQuerySchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { ProjectEnv } from "../../types.js";
import type { AuditService } from "../audit/audit.service.js";
import { toJob, type JobQueue } from "./jobs.queue.js";

const JobParam = z.object({ jobId: IdSchema });

export function createJobRoutes(queue: JobQueue, audit: AuditService) {
  return new Hono<ProjectEnv>()
    .get("/", zValidator("query", ListJobsQuerySchema, validationHook), (c) => {
      const { status, limit } = c.req.valid("query");
      return c.json({ items: queue.list(c.get("project").id, status, limit).map(toJob) });
    })
    .post("/:jobId/retry", zValidator("param", JobParam, validationHook), (c) => {
      const project = c.get("project");
      const { jobId } = c.req.valid("param");
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
