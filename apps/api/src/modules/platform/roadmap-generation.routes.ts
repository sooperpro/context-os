import { RoadmapGenerateInputSchema, type ContextItem } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Container } from "../../container.js";
import { users, type JobRow } from "../../db/schema.js";
import type { PlatformRecord } from "./store.js";
import { AppError, BadRequestError, UpstreamServiceError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { JOB_PRIORITY } from "../jobs/jobs.queue.js";
import { createLearningContent } from "../learning/content.js";
import type { createTutorialRoutes } from "../learning/tutorials.routes.js";
import { createNotifier } from "./notify.js";
import {
  createOnboardingRecords,
  familyOf,
  TEMPLATE,
  topicsFor,
  type TemplateData,
  type TemplateStage,
} from "./onboarding-records.js";
import {
  checkPlan,
  planKnowledgeCheck,
  planPrompt,
  ROADMAP_PROMPT_VERSION,
  ROADMAP_SYSTEM_INSTRUCTION,
  RoadmapPlanSchema,
} from "./roadmap-ai.js";
import { isReviewer, REVIEWERS } from "./review.js";
import { workspaceSettings } from "./settings.js";

const NO_KNOWLEDGE =
  "There's no company knowledge to plan from yet. Connect Google Drive or add documents first.";

/**
 * "Generate with AI" in Templates (N-18): a template draft for a job title and team, planned from
 * the Hub in the background. Its new modules become company-wide tutorial drafts. Owner, Admin and
 * HR publish them; managers (for their own team) and path curators generate too, and submit the
 * draft for review.
 */
export function createRoadmapGeneration(
  container: Container,
  tutorials: Pick<ReturnType<typeof createTutorialRoutes>, "createDraft" | "runs">,
) {
  const { db, identity, audit, queue, services, gemini, repos } = container;
  const records = createOnboardingRecords(container);
  const learning = createLearningContent(container);
  const notifier = createNotifier(db);
  const { store, templateData, templateDetail, teamName } = records;
  const { runs } = tutorials;

  /** The team a template is for: a manager only drafts for their own team. */
  const teamFor = (actor: Actor, asked: string | null) => {
    if (isReviewer(actor) || actor.role !== "manager") return asked;
    const member = identity.requireMember(actor.workspaceId, actor.id);
    const own = teamName(actor.workspaceId, member.organization);
    if (own === "Unassigned") return asked;
    if (asked && asked.toLowerCase() !== own.toLowerCase())
      throw new AppError(403, "FORBIDDEN", `Managers draft templates for their own team (${own})`);
    return own;
  };

  /**
   * Start drafting a template for a job title and team, as `actor`: a click in Templates, or
   * (`automatic`) a new hire no template fits.
   */
  const start = (
    actor: Actor,
    input: { jobTitle: string; team: string | null; seniority: string | null },
    { automatic = false }: { automatic?: boolean } = {},
  ) => {
    // Jobs belong to a project: the plan runs under any project the person can read.
    const host = learning.readableProjects(actor)[0];
    if (!host) throw new BadRequestError(NO_KNOWLEDGE);
    runs.ensureAvailable(actor.workspaceId, "template");
    const { jobTitle, team } = input;
    const row = store.create(
      actor,
      TEMPLATE,
      {
        name: team ? `${jobTitle} · ${team}` : jobTitle,
        family: familyOf(`${jobTitle} ${team ?? ""}`),
        version: 1,
        status: "draft",
        publishedVersion: null,
        roles: [jobTitle],
        teams: team ? [team] : [],
        weeks: 12,
        passMark: 4,
        stages: [],
        history: [],
        updatedBy: actor.name,
        generation: { state: "running", error: null, at: new Date().toISOString() },
      } satisfies TemplateData,
      { status: "draft" },
    );
    const run = runs.start(actor, {
      kind: "template",
      purpose: "roadmap_plan",
      promptVersion: ROADMAP_PROMPT_VERSION,
      targetType: "onboarding_template",
      targetId: row.id,
      automatic,
    });
    queue.enqueue({
      projectId: host.id,
      type: "generate_template",
      payload: {
        templateId: row.id,
        requestedBy: actor.id,
        runId: run.id,
        seniority: input.seniority,
        automatic,
      },
      subject: `Roadmap: ${jobTitle}`,
      dedupe: true,
      priority: JOB_PRIORITY.interactive,
      concurrencyKey: `template:${row.id}`,
      maxAttempts: 2,
    });
    audit.record({
      actor,
      action: "template.generate",
      targetType: "onboarding_template",
      targetId: row.id,
      metadata: { jobTitle, team, automatic },
    });
    return row;
  };

  /**
   * A new hire's onboarding was made and no published template fits their job title or team: a
   * template is drafted for them, as the person who made the record. One draft per title and team;
   * later new hires with the same job wait for the same one.
   */
  const forNewHire = (actor: Actor, record: PlatformRecord) => {
    const data = records.recordData(record);
    const jobTitle = data.title.trim();
    if (!jobTitle || data.templateId || data.pendingTemplateId) return;
    const ws = record.workspaceId;
    if (records.fittingTemplate(ws, jobTitle, data.team)) return;
    const team = data.team && data.team !== "Unassigned" ? data.team : null;
    const same = (value: string | undefined, other: string | null) =>
      (value ?? "").toLowerCase() === (other ?? "").toLowerCase();
    let draft = store.listWhere(ws, TEMPLATE, {}, 500).find((row) => {
      const template = templateData(row);
      return (
        template.publishedVersion === null &&
        !template.archivedAt &&
        template.generation !== undefined &&
        template.generation.state !== "failed" &&
        same(template.roles[0], jobTitle) &&
        same(template.teams[0], team)
      );
    });
    let note: string;
    if (draft) note = `Waiting for the ${templateData(draft).name} template draft`;
    else
      try {
        draft = start(actor, { jobTitle, team, seniority: null }, { automatic: true });
        note = `No template fits ${jobTitle}: one is being drafted from company knowledge`;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        note = `No template fits ${jobTitle}, and one couldn't be drafted: ${error.message}`;
      }
    const latest = store.find(ws, record.kind, record.id) ?? record;
    store.patch(latest, {
      data: {
        ...latest.data,
        pendingTemplateId: draft?.id ?? null,
        activity: [records.activity(note, "started"), ...records.recordData(latest).activity],
      },
    });
  };

  const routes = new Hono<AppEnv>().post(
    "/roadmaps/generate",
    zValidator("json", RoadmapGenerateInputSchema, validationHook),
    (c) => {
      const actor = c.get("actor");
      if (!isReviewer(actor) && actor.role !== "manager" && !identity.curatesAny(actor))
        throw new AppError(403, "FORBIDDEN", "Templates are managed by People Ops");
      const input = c.req.valid("json");
      const row = start(actor, {
        jobTitle: input.jobTitle,
        team: teamFor(actor, input.team?.length ? input.team : null),
        seniority: input.seniority?.length ? input.seniority : null,
      });
      return c.json(templateDetail(row, actor), 202);
    },
  );

  /** Job handler (`generate_template`): plan as the person who asked, then queue module drafts. */
  async function generate(job: JobRow) {
    const host = repos.projects.findByIdUnscoped(job.projectId);
    if (!host) return;
    const ws = host.workspaceId;
    const id = String(job.payload.templateId);
    const row = store.find(ws, TEMPLATE, id);
    if (!row) return;
    const requesterId = String(job.payload.requestedBy);
    const member = identity.requireMember(ws, requesterId);
    const name = db.select({ name: users.name }).from(users).where(eq(users.id, requesterId)).get();
    const actor: Actor = {
      id: requesterId,
      name: name?.name ?? "People Ops",
      workspaceId: ws,
      role: member.role,
    };
    const runId = typeof job.payload.runId === "string" ? job.payload.runId : null;
    const seniority = typeof job.payload.seniority === "string" ? job.payload.seniority : null;
    const automatic = job.payload.automatic === true;
    const data = templateData(row);
    const jobTitle = data.roles[0] ?? data.name;
    const team = data.teams[0] ?? null;
    const save = (patch: Partial<TemplateData>) => {
      const latest = store.find(ws, TEMPLATE, id);
      if (latest) store.patch(latest, { data: { ...latest.data, ...patch } });
    };
    // A draft made for a new hire is for every reviewer; a click is for whoever clicked.
    const tell = (title: string) => {
      const input = {
        type: "template.ready",
        category: "system" as const,
        title,
        link: `/templates/${id}`,
      };
      if (automatic) notifier.notifyRoles(ws, REVIEWERS, input);
      else notifier.notify(ws, requesterId, input);
    };
    const fail = (error: string, skipped = false) => {
      runs.finish(ws, runId, error, skipped);
      save({ generation: { state: "failed", error, at: new Date().toISOString() } });
      tell(
        automatic
          ? `A template for ${jobTitle} couldn't be drafted for a new hire`
          : `The ${jobTitle} roadmap couldn't be drafted`,
      );
    };
    try {
      const items: ContextItem[] = [];
      const projects: Array<{ name: string; category: string; items: number }> = [];
      for (const project of learning.readableProjects(actor)) {
        const answerable = new Set(identity.answerableSourceIds(actor, project.id));
        const own = services.context
          .listItems(project, undefined, actor)
          .filter((item) => item.evidence.every((entry) => answerable.has(entry.sourceObjectId)));
        items.push(...own);
        projects.push({ name: project.name, category: project.category, items: own.length });
      }
      const thin = planKnowledgeCheck({ items, jobTitle });
      if (thin) return fail(thin, true);
      const tutorialList = [...records.catalog(ws).values()]
        .filter((entry) => entry.id.startsWith("tutorial-"))
        .map((entry) => ({ id: entry.id.slice("tutorial-".length), title: entry.title }));
      const { prompt } = planPrompt({
        jobTitle,
        team,
        seniority,
        defaultProbationDays: workspaceSettings(db, ws).policies.probationDefaultDays,
        projects,
        items,
        topics: topicsFor(data.family),
        tutorials: tutorialList,
      });
      const plan = checkPlan(
        await gemini.generateStructured({
          purpose: "roadmap_plan",
          schema: RoadmapPlanSchema,
          systemInstruction: ROADMAP_SYSTEM_INSTRUCTION,
          prompt,
          temperature: 0.3,
          onUsage: runs.usageRecorder(ws, runId),
        }),
        new Set(tutorialList.map((tutorial) => tutorial.id)),
      );
      if (!plan.stages.length)
        return fail(`The plan for ${jobTitle} came back without modules the Hub supports.`);
      const reasons: Record<string, string> = {};
      const gaps = [...plan.gaps];
      const stages: TemplateStage[] = plan.stages
        .map((stage, index) => ({
          id: `stage-${index + 1}`,
          name: stage.name,
          weekStart: stage.weekStart,
          weekEnd: stage.weekEnd,
          moduleIds: stage.modules.flatMap((module) => {
            let moduleId = module.tutorialId ? `tutorial-${module.tutorialId}` : null;
            if (!moduleId)
              try {
                const draft = tutorials.createDraft(
                  actor,
                  {
                    projectId: null,
                    audience: `New ${jobTitle} hires`,
                    focus: module.focus || module.title,
                    coversModule: null,
                    plannedTitle: module.title,
                    plannedKind: module.kind,
                  },
                  { generated: true, automatic },
                );
                moduleId = `tutorial-${draft.id}`;
              } catch (error) {
                if (!(error instanceof AppError && error.status === 429)) throw error;
                gaps.push(`${module.title}: not drafted, the daily AI limit was reached`);
                return [];
              }
            reasons[moduleId] = module.why;
            return [moduleId];
          }),
        }))
        .filter((stage) => stage.moduleIds.length);
      save({
        stages,
        weeks: stages.length ? Math.max(...stages.map((stage) => stage.weekEnd)) : 12,
        ...(plan.probationDays ? { probationDays: plan.probationDays } : {}),
        ...(plan.checkins.length ? { checkins: plan.checkins } : {}),
        generation: { state: "done", error: null, at: new Date().toISOString() },
        generated: { jobTitle, team, runId, policyNote: plan.policyNote, gaps, reasons },
      });
      runs.finish(ws, runId);
      tell(
        automatic
          ? `A template for ${jobTitle} is ready for review`
          : `Your ${jobTitle} roadmap draft is ready to review`,
      );
    } catch (error) {
      // A busy or failing model is retried; anything else (or the last try) shows on the template.
      if (error instanceof UpstreamServiceError && job.attempts < job.maxAttempts) throw error;
      fail(error instanceof Error ? error.message : "The roadmap could not be planned");
    }
  }

  return { routes, generate, forNewHire };
}
