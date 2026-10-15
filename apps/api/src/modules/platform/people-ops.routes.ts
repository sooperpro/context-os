import { zValidator } from "@hono/zod-validator";
import {
  NewOnboardingInputSchema,
  NewTemplateInputSchema,
  OnboardingAssignmentInputSchema,
  OnboardingFilterSchema,
  ProbationDecisionInputSchema,
  ProbationDiscussInputSchema,
  ProbationRecommendationInputSchema,
  ReminderInputSchema,
  SetupStepIdSchema,
  SetupStepInputSchema,
  TemplateDraftInputSchema,
  TemplatePublishInputSchema,
  type OnboardingFilter,
  type PersonRef,
} from "@contextos/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { memberships } from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { requireRole } from "../identity/identity.service.js";
import { createNotifier } from "./notify.js";
import {
  addDays,
  createOnboardingRecords,
  DAY,
  daysFrom,
  ONBOARDING,
  RISKY,
  shortDate,
  TEMPLATE,
  today,
  URGENCY,
  type Decision,
  type OnboardingData,
  type TemplateData,
} from "./onboarding-records.js";
import type { PlatformRecord } from "./store.js";

/*
 * People Ops (HR): onboarding records across the company, probation reviews and onboarding
 * templates (role access spec §4.2 HR Home, §4.7). Every `/people-ops` route is HR only: admins
 * govern the workspace but do not see onboarding records or check-in notes (spec §3, §6 rule 3).
 * The records themselves are in onboarding-records.ts, shared with the manager's team routes.
 */

export function createPeopleOpsRoutes(container: Container) {
  const { db, identity, audit } = container;
  const notifier = createNotifier(db);
  const hr = (actor: Actor) => requireRole(actor, "hr");
  const {
    store,
    activeMembers,
    personRef,
    requirePerson,
    templateRows,
    templateData,
    catalog,
    templateDetail,
    templateSummary,
    applyStages,
    recordData,
    newRecord,
    sync,
    loadRecords,
    recordById,
    recordFor,
    evaluate,
    trackRisk,
    person,
    summary,
    recordDetail,
    reviewSummary,
    reviewDetail,
    activity,
    overdueFor,
    options,
    requirePublishedTemplate,
    notifyPerson,
    sendInvitation,
    setRecommendation,
  } = createOnboardingRecords(container);

  const within = (fallback: number) =>
    z.object({ within: z.coerce.number().int().min(1).max(365).default(fallback) });

  /**
   * People Ops sets managers, but not themselves (they'd then recommend and decide the same
   * probation), and never in a loop (someone managing their own manager).
   */
  const checkManager = (actor: Actor, managerId: string, personId: string | null) => {
    if (managerId === actor.id)
      throw new BadRequestError("Choose the person's manager, not yourself");
    if (!personId) return;
    if (managerId === personId) throw new BadRequestError("Someone can't manage themselves");
    const seen = new Set<string>();
    for (let current: string | null = managerId; current && !seen.has(current);) {
      seen.add(current);
      if (current === personId)
        throw new BadRequestError("That would make them manage their own manager");
      current =
        db
          .select({ managerId: memberships.managerId })
          .from(memberships)
          .where(
            and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.userId, current)),
          )
          .get()?.managerId ?? null;
    }
  };

  return (
    new Hono<AppEnv>()
      .use("/people-ops/*", async (c, next) => {
        hr(c.get("actor"));
        await next();
      })

      /* ---- HR Home ------------------------------------------------------------------------ */

      .get("/people-ops/overview", (c) => {
        const actor = c.get("actor");
        const rows = loadRecords(actor);
        const views = rows.map((row) => ({ row, view: evaluate(row) }));
        for (const { row, view } of views) trackRisk(row, view.status);
        const now = today();
        const monthAgo = addDays(now, -30);
        const weekAgo = Date.now() - 7 * DAY;
        const active = views.filter(({ view }) => view.started);
        const activeMonthAgo = store
          .listWhere(actor.workspaceId, ONBOARDING, {}, 1000)
          .filter((row) => {
            const data = recordData(row);
            return (
              row.createdAt.getTime() <= Date.parse(`${monthAgo}T23:59:59Z`) &&
              data.startDate <= monthAgo &&
              (!data.probation.decision || data.probation.decision.decidedOn > monthAgo)
            );
          }).length;
        const risky = active.filter(({ view }) => RISKY.has(view.status));
        let riskChange = 0;
        for (const row of store.listWhere(
          actor.workspaceId,
          ONBOARDING,
          { status: "active" },
          1000,
        )) {
          const risk = recordData(row).risk;
          if (!risk || Date.parse(risk.at) < weekAgo) continue;
          const was = risk.previous !== null && RISKY.has(risk.previous);
          const is = RISKY.has(risk.status);
          if (is && !was) riskChange += 1;
          if (was && !is) riskChange -= 1;
        }
        const reviews = views.filter(({ view }) => {
          const days = daysFrom(now, view.data.probation.reviewOn);
          return view.started && days >= 0 && days <= 30 && view.review.state !== "completed";
        });
        const starting = views.filter(({ view }) => {
          const days = daysFrom(now, view.data.startDate);
          return days > 0 && days <= 14;
        });
        const byTeam = new Map<string, { onTrack: number; atRisk: number; blocked: number }>();
        for (const { view } of active) {
          const team = byTeam.get(view.data.team) ?? { onTrack: 0, atRisk: 0, blocked: 0 };
          if (view.status === "blocked") team.blocked += 1;
          else if (view.status === "at_risk") team.atRisk += 1;
          else team.onTrack += 1;
          byTeam.set(view.data.team, team);
        }
        return c.json({
          activeOnboardings: {
            count: active.length,
            changeVsLastMonth: active.length - activeMonthAgo,
          },
          atRiskOrBlocked: { count: risky.length, changeThisWeek: riskChange },
          reviewsNext30Days: {
            count: reviews.length,
            needAction: reviews.filter(({ view }) =>
              ["ready_for_approval", "needs_hr_review"].includes(view.review.state),
            ).length,
          },
          startingNext14Days: {
            count: starting.length,
            notReady: starting.filter(({ view }) => view.status !== "ready").length,
          },
          teams: [...byTeam.entries()]
            .map(([team, counts]) => ({ team, ...counts }))
            .sort((a, b) => b.onTrack + b.atRisk + b.blocked - (a.onTrack + a.atRisk + a.blocked)),
        });
      })
      .get(
        "/people-ops/probation-reviews",
        zValidator("query", within(30), validationHook),
        (c) => {
          const actor = c.get("actor");
          const { within: days } = c.req.valid("query");
          const now = today();
          sync(actor);
          const rows = store
            .listWhere(actor.workspaceId, ONBOARDING, {}, 1000)
            .filter((row) => daysFrom(recordData(row).startDate, now) >= 0);
          const reviewOn = (row: PlatformRecord) => recordData(row).probation.reviewOn;
          const upcoming = rows.filter((row) => {
            const data = recordData(row);
            const until = daysFrom(now, data.probation.reviewOn);
            return (
              row.status === "active" && until <= days && (until >= 0 || !data.probation.decision)
            );
          });
          const recent = rows.filter((row) => {
            const decision = recordData(row).probation.decision;
            return decision && !upcoming.includes(row) && daysFrom(decision.decidedOn, now) <= days;
          });
          return c.json({
            items: upcoming
              .sort((a, b) => reviewOn(a).localeCompare(reviewOn(b)))
              .map(reviewSummary),
            recentlyCompleted: recent
              .sort((a, b) => reviewOn(b).localeCompare(reviewOn(a)))
              .map(reviewSummary),
          });
        },
      )
      .get("/people-ops/starters", zValidator("query", within(14), validationHook), (c) => {
        const actor = c.get("actor");
        const { within: days } = c.req.valid("query");
        const now = today();
        const items = loadRecords(actor)
          .filter((row) => {
            const until = daysFrom(now, recordData(row).startDate);
            return until > 0 && until <= days;
          })
          .sort((a, b) => recordData(a).startDate.localeCompare(recordData(b).startDate))
          .map((row) => {
            const data = recordData(row);
            return {
              // The onboarding record's id, so Home can open it.
              id: row.id,
              person: person(row),
              team: data.team,
              startDate: data.startDate,
              accountsReady: Boolean(data.setup.account),
              buddyAssigned: data.buddyId !== null,
              roadmapAssigned: data.templateId !== null,
            };
          });
        return c.json({ items });
      })
      .get("/people-ops/overdue-milestones", (c) => {
        const actor = c.get("actor");
        const items = loadRecords(actor)
          .flatMap((row) =>
            overdueFor(row).map((item) => ({
              ...item,
              person: person(row),
              team: recordData(row).team,
            })),
          )
          .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
        return c.json({ items });
      })
      .get("/people-ops/templates", (c) =>
        c.json({ items: templateRows(c.get("actor")).map(templateSummary) }),
      )

      /* ---- Onboarding --------------------------------------------------------------------- */

      .get(
        "/people-ops/onboardings",
        zValidator(
          "query",
          z.object({
            q: z.string().trim().max(200).optional(),
            team: z.string().max(200).optional(),
            filter: OnboardingFilterSchema.default("all"),
          }),
          validationHook,
        ),
        (c) => {
          const actor = c.get("actor");
          const { q, team, filter } = c.req.valid("query");
          const now = today();
          const rows = loadRecords(actor).map((row) => ({ row, item: summary(row) }));
          const starting = (item: ReturnType<typeof summary>) => item.startDate > now;
          const filters: Record<OnboardingFilter, (item: ReturnType<typeof summary>) => boolean> = {
            all: () => true,
            attention: (item) => RISKY.has(item.status),
            starting,
            progress: (item) => !starting(item),
          };
          const needle = q?.toLowerCase();
          const items = rows
            .map(({ item }) => item)
            .filter(
              (item) =>
                filters[filter](item) &&
                (!team || item.team === team) &&
                (!needle ||
                  `${item.person.name} ${item.person.title ?? ""} ${item.team} ${item.manager?.name ?? ""}`
                    .toLowerCase()
                    .includes(needle)),
            )
            .sort(
              (a, b) =>
                URGENCY.indexOf(a.status) - URGENCY.indexOf(b.status) ||
                a.startDate.localeCompare(b.startDate),
            );
          const all = rows.map(({ item }) => item);
          return c.json({
            total: all.length,
            startingNext14Days: all.filter(
              (item) => starting(item) && daysFrom(now, item.startDate) <= 14,
            ).length,
            teams: [...new Set(all.map((item) => item.team))].sort(),
            counts: Object.fromEntries(
              OnboardingFilterSchema.options.map((key) => [key, all.filter(filters[key]).length]),
            ),
            items,
          });
        },
      )
      .get("/people-ops/onboarding-options", (c) => c.json(options(c.get("actor"))))
      .get("/people-ops/people/:userId/onboarding", (c) => {
        const actor = c.get("actor");
        const row = loadRecords(actor).find(
          (entry) => recordData(entry).personId === c.req.param("userId"),
        );
        if (!row) throw new NotFoundError("Onboarding record");
        return c.json(summary(row));
      })
      .get("/people-ops/onboardings/:id", (c) =>
        c.json(recordDetail(recordById(c.get("actor"), c.req.param("id")))),
      )
      .post(
        "/people-ops/onboardings",
        zValidator("json", NewOnboardingInputSchema, validationHook),
        async (c) => {
          const actor = c.get("actor");
          const input = c.req.valid("json");
          requirePerson(actor.workspaceId, input.managerId, "The manager");
          checkManager(actor, input.managerId, null);
          if (input.buddyId) requirePerson(actor.workspaceId, input.buddyId, "The buddy");
          if (input.templateId) requirePublishedTemplate(actor, input.templateId);
          const email = input.email?.toLowerCase() ?? null;
          sync(actor);
          const existing = store.listWhere(
            actor.workspaceId,
            ONBOARDING,
            { status: "active" },
            1000,
          );
          const member = email
            ? activeMembers(actor.workspaceId).find((row) => row.email?.toLowerCase() === email)
            : undefined;
          if (
            email &&
            existing.some(
              (row) =>
                recordData(row).email === email || recordData(row).personId === member?.userId,
            )
          )
            throw new AppError(409, "CONFLICT", "This person already has an onboarding record");
          const invitationId =
            email && !member
              ? await sendInvitation(actor, email, {
                  managerId: input.managerId,
                  startDate: input.startDate,
                })
              : null;
          const at = new Date().toISOString();
          const row = store.create(
            actor,
            ONBOARDING,
            newRecord(actor.workspaceId, {
              personId: member?.userId ?? null,
              name: input.name,
              title: input.title,
              email,
              team: input.team,
              managerId: input.managerId,
              buddyId: input.buddyId,
              templateId: input.templateId,
              peoplePartnerId: actor.id,
              startDate: input.startDate,
              invitationId,
              setup: {
                ...(member ? { account: { at, by: "Existing account" } } : {}),
                ...(input.templateId ? { roadmap: { at, by: null } } : {}),
                ...(input.buddyId ? { buddy: { at, by: null } } : {}),
              },
            }) as unknown as Record<string, unknown>,
            { status: "active" },
          );
          audit.record({
            actor,
            action: "onboarding.record.create",
            targetType: "onboarding_record",
            targetId: row.id,
            metadata: {
              team: input.team,
              startDate: input.startDate,
              templateId: input.templateId,
            },
          });
          notifyPerson(
            actor.workspaceId,
            input.managerId,
            `${input.name} joins your team on ${shortDate(input.startDate)}`,
            "/team",
            "onboarding.new_report",
          );
          if (input.buddyId)
            notifyPerson(
              actor.workspaceId,
              input.buddyId,
              `You are ${input.name}'s onboarding buddy`,
              `/people`,
              "onboarding.buddy_assigned",
            );
          return c.json(recordDetail(row), 201);
        },
      )
      .patch(
        "/people-ops/onboardings/:id",
        zValidator("json", OnboardingAssignmentInputSchema, validationHook),
        (c) => {
          const actor = c.get("actor");
          const row = recordById(actor, c.req.param("id"));
          if (row.status !== "active")
            throw new AppError(409, "CONFLICT", "The onboarding is closed");
          const input = c.req.valid("json");
          const data = recordData(row);
          const at = new Date().toISOString();
          const next: OnboardingData = { ...data, setup: { ...data.setup } };
          if (input.managerId) {
            requirePerson(actor.workspaceId, input.managerId, "The manager");
            checkManager(actor, input.managerId, data.personId);
            next.managerId = input.managerId;
            // The person's account follows: their manager is the new one.
            if (data.personId)
              db.update(memberships)
                .set({ managerId: input.managerId })
                .where(
                  and(
                    eq(memberships.workspaceId, actor.workspaceId),
                    eq(memberships.userId, data.personId),
                  ),
                )
                .run();
          }
          if (input.buddyId) {
            requirePerson(actor.workspaceId, input.buddyId, "The buddy");
            if (input.buddyId === data.personId)
              throw new BadRequestError("The buddy must be someone else");
            next.buddyId = input.buddyId;
            next.setup.buddy = { at, by: null };
          }
          if (input.templateId) {
            requirePublishedTemplate(actor, input.templateId);
            next.templateId = input.templateId;
            next.setup.roadmap = { at, by: null };
          }
          if (input.peoplePartnerId) {
            const partner = identity.requireMemberOptional(
              actor.workspaceId,
              input.peoplePartnerId,
            );
            if (partner?.role !== "hr")
              throw new BadRequestError("The People partner must have the HR role");
            next.peoplePartnerId = input.peoplePartnerId;
          }
          const updated = store.patch(row, { data: next as unknown as Record<string, unknown> });
          audit.record({
            actor,
            action: "onboarding.record.assign",
            targetType: "onboarding_record",
            targetId: row.id,
            metadata: {
              before: {
                managerId: data.managerId,
                buddyId: data.buddyId,
                templateId: data.templateId,
                peoplePartnerId: data.peoplePartnerId,
              },
              after: input,
            },
          });
          if (input.managerId && input.managerId !== data.managerId)
            notifyPerson(
              actor.workspaceId,
              input.managerId,
              `${data.name} is now on your team`,
              "/team",
              "onboarding.new_report",
            );
          if (input.buddyId && input.buddyId !== data.buddyId)
            notifyPerson(
              actor.workspaceId,
              input.buddyId,
              `You are ${data.name}'s onboarding buddy`,
              "/people",
              "onboarding.buddy_assigned",
            );
          return c.json(recordDetail(updated));
        },
      )
      .post(
        "/people-ops/onboardings/:id/setup/:step",
        zValidator("param", z.object({ id: z.string(), step: SetupStepIdSchema }), validationHook),
        zValidator("json", SetupStepInputSchema, validationHook),
        (c) => {
          const actor = c.get("actor");
          const { id, step } = c.req.valid("param");
          const row = recordById(actor, id);
          const data = recordData(row);
          if (data.setup[step]) return c.json(recordDetail(row));
          if (step === "roadmap" && !data.templateId)
            throw new AppError(409, "CONFLICT", "Assign a template first");
          if (step === "buddy" && !data.buddyId)
            throw new AppError(409, "CONFLICT", "Assign a buddy first");
          const updated = store.patch(row, {
            data: {
              ...data,
              setup: { ...data.setup, [step]: { at: new Date().toISOString(), by: null } },
            },
          });
          if (step === "welcome")
            notifyPerson(
              actor.workspaceId,
              data.personId,
              `Welcome to the team, ${data.name.split(" ")[0]}!`,
              "/welcome",
              "onboarding.welcome",
            );
          audit.record({
            actor,
            action: "onboarding.setup.complete",
            targetType: "onboarding_record",
            targetId: row.id,
            metadata: { step },
          });
          return c.json(recordDetail(updated));
        },
      )

      /* ---- Probation ---------------------------------------------------------------------- */

      .get("/people-ops/probation-reviews/:id", (c) => {
        const row = recordById(c.get("actor"), c.req.param("id"));
        if (!evaluate(row).started) throw new NotFoundError("Probation review");
        return c.json(reviewDetail(row));
      })
      .post(
        "/people-ops/probation-reviews/:id/decision",
        zValidator("json", ProbationDecisionInputSchema, validationHook),
        (c) => {
          const actor = c.get("actor");
          const row = recordById(actor, c.req.param("id"));
          const view = evaluate(row);
          if (!view.started) throw new NotFoundError("Probation review");
          if (!["ready_for_approval", "needs_hr_review"].includes(view.review.state))
            throw new AppError(
              409,
              "CONFLICT",
              view.review.state === "completed"
                ? "A decision is already recorded"
                : "The manager's recommendation is needed first",
            );
          const input = c.req.valid("json");
          const data = view.data;
          // The manager recommends, People Ops decides (Spec decision 2): never the same person.
          if (data.managerId === actor.id)
            throw new AppError(
              403,
              "FORBIDDEN",
              "You're this person's manager: another People Ops member records the decision",
            );
          const extension = input.outcome === "extend" ? `${input.extensionDays} days` : null;
          const decision: Decision = {
            outcome: input.outcome === "confirm" ? "confirmed" : "extended",
            extension,
            decidedOn: today(),
            effectiveOn: input.effectiveOn,
            decidedById: actor.id,
            note: input.note.trim(),
            notified: input.notify,
          };
          const updated = db.transaction(() => {
            const next = store.patch(row, {
              status: decision.outcome === "confirmed" ? "completed" : "active",
              data: {
                ...data,
                probation: { ...data.probation, decision },
                activity: [
                  activity(
                    `${actor.name} recorded: ${extension ? `extended ${extension}` : "confirmed"}`,
                    "decided",
                  ),
                  ...data.activity,
                ],
              },
            });
            // Keep the person's onboarding plan in step, as the employee and manager read it.
            const plan = view.checkins.plan;
            if (plan && ["active", "scheduled"].includes(plan.status))
              store.patch(plan, {
                status: decision.outcome === "confirmed" ? "closed" : "active",
                data: {
                  ...plan.data,
                  outcome: decision.outcome,
                  outcomeNote: decision.note || null,
                  outcomeAt: new Date().toISOString(),
                  endDate: input.extensionDays
                    ? addDays(String(plan.data.endDate), input.extensionDays)
                    : plan.data.endDate,
                },
              });
            audit.record({
              actor,
              action: "probation.decision",
              targetType: "onboarding_record",
              targetId: row.id,
              metadata: {
                outcome: decision.outcome,
                extensionDays: input.extensionDays,
                effectiveOn: input.effectiveOn,
                recommendation: data.probation.recommendation,
              },
            });
            return next;
          });
          if (input.notify) {
            const text =
              decision.outcome === "confirmed"
                ? "Your employment is confirmed"
                : `Your probation is extended by ${extension}`;
            notifyPerson(actor.workspaceId, data.personId, text, "/roadmap", "probation.outcome");
            notifyPerson(
              actor.workspaceId,
              data.managerId,
              `${data.name}: ${decision.outcome === "confirmed" ? "employment confirmed" : `probation extended by ${extension}`}`,
              data.personId ? `/team/${data.personId}` : "/team",
              "probation.outcome",
            );
          }
          return c.json(reviewDetail(updated));
        },
      )
      .post(
        "/people-ops/probation-reviews/:id/discuss",
        zValidator("json", ProbationDiscussInputSchema, validationHook),
        (c) => {
          const actor = c.get("actor");
          const row = recordById(actor, c.req.param("id"));
          const view = evaluate(row);
          if (!view.started) throw new NotFoundError("Probation review");
          if (view.review.state === "completed")
            throw new AppError(409, "CONFLICT", "A decision is already recorded");
          if (!view.data.managerId) throw new AppError(409, "CONFLICT", "Assign a manager first");
          const { note } = c.req.valid("json");
          const updated = store.patch(row, {
            data: {
              ...view.data,
              activity: [
                activity(
                  `${actor.name} asked ${personRef(actor.workspaceId, view.data.managerId)?.name ?? "the manager"} to discuss before deciding`,
                  "review",
                ),
                ...view.data.activity,
              ],
            },
          });
          notifier.notify(actor.workspaceId, view.data.managerId, {
            type: "probation.discuss",
            category: "onboarding",
            title: `${actor.name} wants to discuss ${view.data.name}'s probation`,
            ...(note ? { body: note } : {}),
            link: view.data.personId ? `/team/${view.data.personId}` : "/team",
          });
          audit.record({
            actor,
            action: "probation.discuss",
            targetType: "onboarding_record",
            targetId: row.id,
          });
          return c.json(reviewDetail(updated));
        },
      )
      .post(
        "/people-ops/reminders",
        zValidator("json", ReminderInputSchema, validationHook),
        (c) => {
          const actor = c.get("actor");
          const input = c.req.valid("json");
          const reminded = new Map<string, PersonRef>();
          for (const id of new Set(input.ids)) {
            const recordId = input.about === "milestone" ? id.split(":")[0]! : id;
            const row = recordById(actor, recordId);
            const data = recordData(row);
            const manager = personRef(actor.workspaceId, data.managerId);
            if (!manager) continue;
            const milestone =
              input.about === "milestone"
                ? overdueFor(row).find((item) => item.id === id)
                : undefined;
            if (input.about === "milestone" && !milestone) continue;
            notifier.notify(actor.workspaceId, manager.id, {
              type: "people_ops.reminder",
              category: "onboarding",
              title:
                input.about === "probation_review"
                  ? `Probation recommendation needed for ${data.name}`
                  : `${data.name}: ${milestone!.milestone} is overdue`,
              link: data.personId ? `/team/${data.personId}` : "/team",
              nudge: true,
            });
            reminded.set(manager.id, manager);
          }
          return c.json({ reminded: [...reminded.values()] });
        },
      )

      /* ---- Templates ---------------------------------------------------------------------- */

      .get("/people-ops/templates/:id", (c) => {
        const actor = c.get("actor");
        templateRows(actor);
        return c.json(templateDetail(store.get(actor, TEMPLATE, c.req.param("id"))));
      })
      .get("/people-ops/template-library", (c) => {
        const actor = c.get("actor");
        return c.json({ items: [...catalog(actor.workspaceId).values()] });
      })
      .post(
        "/people-ops/templates",
        zValidator("json", NewTemplateInputSchema, validationHook),
        (c) => {
          const actor = c.get("actor");
          const input = c.req.valid("json");
          templateRows(actor);
          const base = templateData(store.get(actor, TEMPLATE, input.baseId));
          const row = store.create(
            actor,
            TEMPLATE,
            {
              ...base,
              name: input.name || `${base.name} (copy)`,
              version: 1,
              status: "draft",
              publishedVersion: null,
              stages: base.stages.map((stage) => ({ ...stage, moduleIds: [...stage.moduleIds] })),
              history: [{ version: 1, on: today(), note: `Draft based on ${base.name}` }],
              updatedBy: actor.name,
            } satisfies TemplateData,
            { status: "draft" },
          );
          audit.record({
            actor,
            action: "onboarding.template.create",
            targetType: "onboarding_template",
            targetId: row.id,
            metadata: { baseId: input.baseId },
          });
          return c.json(templateDetail(row), 201);
        },
      )
      .post(
        "/people-ops/templates/:id/draft",
        zValidator("json", TemplateDraftInputSchema, validationHook),
        (c) => {
          const actor = c.get("actor");
          const row = store.get(actor, TEMPLATE, c.req.param("id"));
          const data = templateData(row);
          // Editing a published template starts the next version as a draft.
          const next = applyStages(actor.workspaceId, data, c.req.valid("json"));
          const updated = store.patch(row, {
            status: "draft",
            data: {
              ...next,
              version: data.status === "published" ? data.version + 1 : data.version,
              status: "draft",
              updatedBy: actor.name,
            } satisfies TemplateData,
          });
          return c.json(templateDetail(updated));
        },
      )
      .post(
        "/people-ops/templates/:id/publish",
        zValidator("json", TemplatePublishInputSchema, validationHook),
        (c) => {
          const actor = c.get("actor");
          const row = store.get(actor, TEMPLATE, c.req.param("id"));
          const input = c.req.valid("json");
          const data = templateData(row);
          const next = applyStages(actor.workspaceId, data, input);
          if (!next.stages.some((stage) => stage.moduleIds.length))
            throw new BadRequestError("Add at least one module before publishing");
          const version = data.status === "published" ? data.version + 1 : data.version;
          const updated = db.transaction(() => {
            const result = store.patch(row, {
              status: "published",
              data: {
                ...next,
                version,
                status: "published",
                publishedVersion: version,
                history: [
                  { version, on: today(), note: input.note.trim() || "Updated modules" },
                  ...data.history.filter((entry) => entry.version !== version),
                ],
                updatedBy: actor.name,
              } satisfies TemplateData,
            });
            audit.record({
              actor,
              action: "onboarding.template.publish",
              targetType: "onboarding_template",
              targetId: row.id,
              metadata: { version: `v${version}`, note: input.note.trim() },
            });
            return result;
          });
          return c.json(templateDetail(updated));
        },
      )

      /* ---- The manager's side: the probation recommendation ------------------------------- */

      .post(
        "/probation/employees/:userId/recommendation",
        zValidator("json", ProbationRecommendationInputSchema, validationHook),
        (c) => {
          const actor = c.get("actor");
          const userId = c.req.param("userId");
          const member = identity.requireMember(actor.workspaceId, userId);
          if (member.managerId !== actor.id)
            throw new AppError(
              403,
              "FORBIDDEN",
              "Only the person's manager can send a probation recommendation",
            );
          const row = recordFor(actor, userId);
          if (!row) throw new NotFoundError("Onboarding record");
          const input = c.req.valid("json");
          const updated = setRecommendation(actor, row, input);
          return c.json({
            id: updated.id,
            recommendation: input.recommendation,
            state: input.recommendation === "confirm" ? "ready_for_approval" : "needs_hr_review",
          });
        },
      )
  );
}
