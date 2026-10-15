import { randomUUID } from "node:crypto";
import {
  CheckinInputSchema,
  CheckinTypeSchema,
  LearningAssignmentInputSchema,
  RoadmapAssignmentInputSchema,
  RoadmapEditInputSchema,
  type AssignOptions,
  type AttentionItem,
  type CheckCell,
  type Checkin,
  type CheckinRecord,
  type CheckinType,
  type OnboardingStatus,
  type PersonRef,
  type TeamMemberDetail,
  type TemplateModule,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { assignments, teams } from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { createOnboardingRecords, shortDate } from "./onboarding-records.js";
import {
  addDays,
  ROADMAP,
  roadmapData,
  stageAt,
  today,
  type RoadmapData,
  type RoadmapModule,
} from "./onboarding-roadmap.js";
import { workspaceSettings } from "./settings.js";
import type { PlatformRecord } from "./store.js";

const DAY = 86_400_000;
const PrepQuery = z.object({ type: CheckinTypeSchema.default("weekly") });

const CHECKIN_TITLE: Record<CheckinType, string> = {
  weekly: "Weekly 1:1",
  day_30: "30-day review",
  readiness_60: "60-day readiness review",
  probation: "Probation recommendation",
};

/** The readiness areas; HR's probation review keys ratings by these ids. */
const AREAS: Array<{ id: string; label: string; kinds: string[]; noun: string }> = [
  {
    id: "products",
    label: "Knows our products and customers",
    kinds: ["company", "business", "product", "sales", "support"],
    noun: "company and product",
  },
  {
    id: "systems",
    label: "Understands the systems they work on",
    kinds: ["systems", "decisions", "data", "design", "project"],
    noun: "systems",
  },
  {
    id: "practices",
    label: "Works with team practices",
    kinds: ["process", "people"],
    noun: "team practice",
  },
  {
    id: "delivery",
    label: "Delivers independently",
    kinds: ["practical", "contribution", "task"],
    noun: "hands-on",
  },
];

const weekday = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;
const moduleKind = (kind: string): "module" | "practical" | "check" =>
  kind === "practical" ? "practical" : kind === "check" ? "check" : "module";

/**
 * The manager's side of onboarding (role access spec §4.2 Manager Home, §4.6; handoff §7.6): their
 * reports' progress, member pages, roadmap edits, check-ins and assigning. Scope is the caller's
 * direct reports (`memberships.managerId`), or the whole reporting line when the workspace turns on
 * indirect reports. People Ops may also read a member page. Admin rights grant nothing here: an
 * owner or admin sees only people they manage (PRD §6.4).
 */
export function createTeamRoutes(container: Container) {
  const { db, audit } = container;
  const records = createOnboardingRecords(container);
  const { store } = records;

  /* ---- Scope ----------------------------------------------------------------------------- */

  const reportsOf = (actor: Actor): string[] => {
    const members = records.activeMembers(actor.workspaceId);
    const direct = members.filter((row) => row.managerId === actor.id).map((row) => row.userId);
    if (!workspaceSettings(db, actor.workspaceId).includeIndirectReports) return direct;
    const all = new Set(direct);
    let frontier = direct;
    while (frontier.length) {
      const next = members
        .filter((row) => row.managerId && frontier.includes(row.managerId) && !all.has(row.userId))
        .map((row) => row.userId);
      for (const id of next) all.add(id);
      frontier = next;
    }
    return [...all];
  };
  /** Team views are for people who manage someone (the manager role, or anyone with reports). */
  const requireManager = (actor: Actor) => {
    const reports = reportsOf(actor);
    if (actor.role !== "manager" && !reports.length)
      throw new AppError(403, "FORBIDDEN", "Team views are for managers");
    return reports;
  };
  /** The report's onboarding record; 404 for anyone else (their existence isn't revealed). */
  const memberRecord = (actor: Actor, personId: string, options: { hrMayRead?: boolean } = {}) => {
    const mayRead =
      (options.hrMayRead === true && actor.role === "hr") || reportsOf(actor).includes(personId);
    const row = mayRead ? records.recordFor(actor, personId) : undefined;
    if (!row) throw new NotFoundError("Team member");
    return row;
  };
  const myTeam = (actor: Actor) => {
    const member = records.activeMembers(actor.workspaceId).find((row) => row.userId === actor.id);
    const teamId = member?.organization.teamId;
    const team =
      typeof teamId === "string"
        ? db
            .select({ id: teams.id, name: teams.name })
            .from(teams)
            .where(and(eq(teams.workspaceId, actor.workspaceId), eq(teams.id, teamId)))
            .get()
        : undefined;
    return team ?? { id: actor.id, name: `${firstName(actor.name)}'s team` };
  };
  /** Onboarding records of the caller's reports, still in their onboarding (no decision yet). */
  const teamRecords = (actor: Actor) => {
    const reports = new Set(requireManager(actor));
    return records
      .loadRecords(actor)
      .filter((row) => {
        const data = records.recordData(row);
        return data.personId && reports.has(data.personId) && !data.probation.decision;
      })
      .sort((a, b) =>
        records.recordData(a).startDate.localeCompare(records.recordData(b).startDate),
      );
  };

  /* ---- One person's state ---------------------------------------------------------------- */

  type ModuleState = TeamMemberDetail["modules"][number]["state"];
  const stateOf = (entry: RoadmapModule, now: string): ModuleState =>
    entry.status === "done"
      ? "done"
      : entry.dueOn < now
        ? "overdue"
        : entry.status === "active"
          ? "active"
          : "todo";

  /** Everything the manager's views derive from one record and its roadmap. */
  const look = (row: PlatformRecord) => {
    const view = records.evaluate(row);
    const roadmap = records.roadmapModules(row);
    const now = today();
    const person = records.person(row);
    const name = firstName(person.name);
    const modules = roadmap?.modules ?? [];
    const overdue = modules.filter((entry) => stateOf(entry, now) === "overdue");
    const failed = modules.filter((entry) => entry.kind === "check" && entry.passed === false);
    const checkins = records.checkinRows(row.workspaceId, view.data.personId, row.id);
    const lastBlockers = (checkins[0]?.row.data.blockers as string[] | undefined) ?? [];
    const recommendationDue =
      view.review.recommendationDueOn && view.started
        ? records.recordData(row).probation.reviewOn
        : null;
    const dueSoon =
      view.review.recommendationDueOn !== null &&
      Math.round((Date.parse(view.review.recommendationDueOn) - Date.parse(now)) / DAY) <= 14;

    const issues: string[] = [];
    if (!roadmap)
      issues.push(
        view.started
          ? "No roadmap assigned"
          : `Starts ${shortDate(view.data.startDate)} · no roadmap yet`,
      );
    if (lastBlockers.includes("access"))
      issues.push("Waiting on access (raised at the last check-in)");
    if (overdue.length)
      issues.push(
        `${plural(overdue.length, "module")} overdue: ${overdue
          .slice(0, 2)
          .map((entry) => entry.title)
          .join(", ")}`,
      );
    for (const entry of failed.slice(0, 2)) issues.push(`Failed “${entry.title}”`);
    if (!view.data.buddyId) issues.push("No onboarding buddy");
    if (view.missingCheckins) issues.push(`${plural(view.missingCheckins, "check-in")} missing`);
    if (recommendationDue && dueSoon)
      issues.push(`Probation recommendation due ${shortDate(view.review.recommendationDueOn!)}`);
    // The status note, unless an issue above already says it.
    const said =
      (view.note === "Waiting on access" && lastBlockers.includes("access")) ||
      (failed.length > 0 && view.note.startsWith("Didn't pass"));
    if (["at_risk", "blocked"].includes(view.status) && !overdue.length && view.note && !said)
      issues.push(view.note);

    const upcoming = [
      ...modules
        .filter((entry) => entry.status !== "done" && entry.dueOn >= now)
        .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
        .slice(0, 3)
        .map((entry) => ({ id: `module:${entry.id}`, title: entry.title, on: entry.dueOn })),
      { id: "review:30", title: "30-day review", on: addDays(view.data.startDate, 30) },
      { id: "review:60", title: "60-day readiness review", on: addDays(view.data.startDate, 60) },
      ...(view.review.recommendationDueOn
        ? [
            {
              id: "review:recommendation",
              title: "Probation recommendation due",
              on: view.review.recommendationDueOn,
            },
          ]
        : []),
      { id: "review:probation", title: "Probation review", on: view.data.probation.reviewOn },
    ]
      .filter((entry) => entry.on >= now)
      .sort((a, b) => a.on.localeCompare(b.on))
      .slice(0, 5);

    const insight: TeamMemberDetail["insight"] = !roadmap
      ? {
          text: `${name} has no roadmap yet. Assign one so their first weeks have a plan and a buddy.`,
          action: { kind: "assign_roadmap", label: "Assign roadmap" },
        }
      : recommendationDue && dueSoon
        ? {
            text: `${name}'s probation review is on ${shortDate(view.data.probation.reviewOn)}. People Ops needs your recommendation first.`,
            action: { kind: "start_recommendation", label: "Start recommendation" },
          }
        : lastBlockers.includes("access")
          ? {
              text: `${name} is waiting on access. Escalating it keeps their roadmap moving.`,
              action: { kind: "escalate", label: "Escalate access" },
            }
          : failed.length || overdue.length
            ? {
                text: failed.length
                  ? `${name} didn't pass “${failed[0]!.title}”. A focused module or a pairing session usually helps.`
                  : `${name} has ${plural(overdue.length, "overdue module")}. Something smaller this week can get them back on plan.`,
                action: { kind: "assign_learning", label: "Assign learning" },
              }
            : null;

    return { view, roadmap, person, modules, overdue, failed, checkins, issues, upcoming, insight };
  };

  const checkinRecord = (entry: { row: PlatformRecord; at: string }): CheckinRecord => {
    const data = entry.row.data;
    const type = CheckinTypeSchema.safeParse(data.type);
    const pulse = ["on_track", "concerns", "off_track"].includes(String(data.pulse))
      ? (data.pulse as CheckinRecord["pulse"])
      : "on_track";
    const note =
      typeof data.notes === "string" && data.notes.trim()
        ? data.notes.trim()
        : typeof data.wentWell === "string"
          ? data.wentWell
          : "No notes added.";
    return {
      id: entry.row.id,
      type: type.success ? type.data : "weekly",
      on: entry.at.slice(0, 10),
      pulse,
      note,
    };
  };

  const detail = (row: PlatformRecord): TeamMemberDetail => {
    const state = look(row);
    const { view, roadmap } = state;
    const now = today();
    const current = roadmap ? stageAt(roadmap.data.stages, view.elapsed) : null;
    return {
      person: state.person,
      startDate: view.data.startDate,
      stage: view.started ? (current?.name ?? view.stage) : null,
      status: view.status,
      progress: view.progress,
      expected: view.expected,
      buddy: records.personRef(row.workspaceId, view.data.buddyId),
      peoplePartner: records.personRef(row.workspaceId, view.data.peoplePartnerId),
      readinessReviewOn: addDays(view.data.startDate, 60),
      probationReviewOn: view.data.probation.reviewOn,
      issues: state.issues,
      insight: state.insight,
      modules: state.modules
        .filter((entry) => entry.kind !== "check" && entry.stageId === current?.id)
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          state: stateOf(entry, now),
          dueOn: entry.dueOn,
          completedOn: entry.completedOn,
          note: entry.note,
          postponed: entry.postponed,
        })),
      checks: state.modules
        .filter((entry) => entry.kind === "check")
        .map((entry) => ({
          id: entry.id,
          title: entry.title.replace(/^Knowledge check:\s*/i, ""),
          state: entry.passed === true ? "pass" : entry.passed === false ? "fail" : "todo",
          result:
            entry.result ?? (entry.status === "done" ? "Done" : `Due ${shortDate(entry.dueOn)}`),
          note: entry.attempts > 1 ? `${entry.attempts} attempts` : null,
        })),
      upcoming: state.upcoming,
      checkins: state.checkins.map(checkinRecord),
    };
  };

  /* ---- Roadmap writes -------------------------------------------------------------------- */

  /** The person's roadmap, created empty (no template) when a manager assigns before HR does. */
  const ensureRoadmap = (row: PlatformRecord): PlatformRecord => {
    const existing = records.roadmapFor(row);
    if (existing) return existing;
    const data = records.recordData(row);
    const empty: RoadmapData = {
      templateId: null,
      templateVersion: null,
      startDate: data.startDate,
      stages: [{ id: "assigned", name: "Assigned learning", weekStart: 1, weekEnd: 12 }],
      modules: [],
      addOnIds: [],
      history: [],
    };
    return store.insert({
      workspaceId: row.workspaceId,
      ownerId: data.personId!,
      kind: ROADMAP,
      status: "active",
      data: empty as unknown as Record<string, unknown>,
    });
  };

  const notifyPerson = (actor: Actor, row: PlatformRecord, title: string) =>
    records.notifyPerson(
      actor.workspaceId,
      records.recordData(row).personId,
      title,
      "/roadmap",
      "roadmap.updated",
    );

  /* ---- Catalog for the assign dialogs ------------------------------------------------------ */

  const kindLabel = (entry: TemplateModule) =>
    entry.kind === "practical"
      ? "Practical task"
      : entry.kind === "check"
        ? "Knowledge check"
        : "Module";
  const detailOf = (entry: TemplateModule) =>
    [
      kindLabel(entry),
      entry.minutes ? `${entry.minutes} min` : null,
      entry.owner ? `Owner ${entry.owner}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return new Hono<AppEnv>()
    .get("/team/onboarding", (c) => {
      const actor = c.get("actor");
      const people = teamRecords(actor).map((row) => {
        const state = look(row);
        const next = state.upcoming[0];
        return {
          person: state.person,
          startDate: state.view.data.startDate,
          stage: state.view.started ? state.view.stage : null,
          progress: state.view.progress,
          expected: state.view.expected,
          status: state.view.status,
          next: !state.roadmap
            ? "Assign a roadmap"
            : next
              ? `${next.title} · ${weekday(next.on)}`
              : null,
          issue: state.issues[0] ?? null,
        };
      });
      return c.json({ team: myTeam(actor), people });
    })
    .get("/team/check-matrix", (c) => {
      const actor = c.get("actor");
      const looks = teamRecords(actor)
        .map(look)
        .filter((state) => state.view.started && state.roadmap);
      const topics = [
        ...new Set(
          looks.flatMap((state) =>
            state.modules
              .filter((entry) => entry.kind === "check")
              .map((entry) => entry.title.replace(/^Knowledge check:\s*/i, "")),
          ),
        ),
      ];
      return c.json({
        topics,
        rows: looks.map((state) => ({
          person: state.person,
          cells: topics.map((topic): CheckCell => {
            const entry = state.modules.find(
              (candidate) =>
                candidate.kind === "check" &&
                candidate.title.replace(/^Knowledge check:\s*/i, "") === topic,
            );
            return !entry
              ? "na"
              : entry.passed === true
                ? "pass"
                : entry.passed === false
                  ? "fail"
                  : "todo";
          }),
        })),
      });
    })
    .get("/team/members/:id", (c) => {
      const actor = c.get("actor");
      return c.json(detail(memberRecord(actor, c.req.param("id"), { hrMayRead: true })));
    })
    .patch(
      "/team/members/:id/roadmap",
      zValidator("json", RoadmapEditInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const row = memberRecord(actor, c.req.param("id"));
        const roadmap = records.roadmapFor(row);
        if (!roadmap) throw new AppError(409, "CONFLICT", "Assign a roadmap first");
        const data = roadmapData(roadmap);
        const { changes } = c.req.valid("json");
        const byId = new Map(data.modules.map((entry) => [entry.id, entry]));
        for (const change of changes) {
          const entry = byId.get(change.moduleId);
          if (!entry) throw new BadRequestError(`Unknown module: ${change.moduleId}`);
          if (entry.status === "done")
            throw new AppError(409, "CONFLICT", `“${entry.title}” is done and can't change`);
        }
        const removed = new Set(
          changes.filter((change) => change.action === "remove").map((change) => change.moduleId),
        );
        const postponed = new Set(
          changes
            .filter((change) => change.action === "postpone_week")
            .map((change) => change.moduleId),
        );
        const modules = data.modules
          .filter((entry) => !removed.has(entry.id))
          .map((entry) =>
            postponed.has(entry.id)
              ? { ...entry, dueOn: addDays(entry.dueOn, 7), postponed: true }
              : entry,
          );
        store.patch(roadmap, {
          data: {
            ...data,
            modules,
            history: [
              {
                on: today(),
                text: `${actor.name} ${[
                  removed.size ? `removed ${plural(removed.size, "module")}` : null,
                  postponed.size ? `moved ${plural(postponed.size, "module")} a week` : null,
                ]
                  .filter(Boolean)
                  .join(" and ")}`,
                by: actor.id,
              },
              ...data.history,
            ],
          },
        });
        audit.record({
          actor,
          action: "roadmap.edit",
          targetType: "roadmap",
          targetId: roadmap.id,
          metadata: { removed: [...removed], postponed: [...postponed] },
        });
        notifyPerson(actor, row, `${actor.name} updated your onboarding roadmap`);
        return c.json(detail(row));
      },
    )
    .get("/team/members/:id/checkin-prep", zValidator("query", PrepQuery, validationHook), (c) => {
      const actor = c.get("actor");
      const row = memberRecord(actor, c.req.param("id"));
      const { type } = c.req.valid("query");
      const state = look(row);
      const name = firstName(state.person.name);
      const lastBlockers = (state.checkins[0]?.row.data.blockers as string[] | undefined) ?? [];
      const agenda =
        type === "weekly"
          ? [
              "Wins since the last check-in",
              ...(state.overdue.length
                ? [
                    `Overdue: ${state.overdue
                      .map((entry) => `“${entry.title}”`)
                      .slice(0, 2)
                      .join(", ")}. What's in the way?`,
                  ]
                : []),
              ...(lastBlockers.length
                ? [`Follow up on last time's blockers: ${lastBlockers.join(", ")}`]
                : []),
              "What's unclear so far",
              "Plan for next week",
            ]
          : type === "day_30"
            ? [
                `How ${name}'s first month has felt`,
                `Progress: ${Math.round(state.view.progress * 100)}% done, ${Math.round(state.view.expected * 100)}% expected by now`,
                "Review the four areas together",
                "Goals for days 31 to 60",
              ]
            : type === "readiness_60"
              ? [
                  "Review the four readiness areas together",
                  "What's left before the probation review",
                  "Support they need from you or the team",
                ]
              : [
                  "Review the four readiness areas together",
                  "Evidence from their modules, checks and check-ins",
                  "Share the recommendation you'll send to People Ops",
                ];
      const areas = AREAS.map((area) => {
        const covered = state.modules.filter((entry) => area.kinds.includes(entry.kind));
        const done = covered.filter((entry) => entry.status === "done").length;
        const checks = state.modules.filter(
          (entry) => entry.kind === "check" && entry.passed !== null && area.id === "products",
        );
        return {
          id: area.id,
          label: area.label,
          evidence: covered.length
            ? `${done} of ${plural(covered.length, `${area.noun} module`)} done${
                checks.length
                  ? `; ${checks.filter((entry) => entry.passed).length} of ${plural(checks.length, "check")} passed`
                  : ""
              }`
            : "Nothing on their roadmap covers this yet",
        };
      });
      return c.json({ agenda, areas });
    })
    .post(
      "/team/members/:id/checkins",
      zValidator("json", CheckinInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const row = memberRecord(actor, c.req.param("id"));
        const input = c.req.valid("json");
        const data = records.recordData(row);
        const at = new Date().toISOString();
        const saved = db.transaction(() => {
          const checkin = store.create(
            actor,
            "checkin",
            {
              ...input,
              authorId: actor.id,
              publishedAt: at,
              employeeResponse: null,
            },
            {
              ownerId: data.personId!,
              parentId: row.id,
              status: input.shareWithPerson ? "published" : "private",
            },
          );
          // A probation check-in carries the recommendation to People Ops.
          if (input.type === "probation" && input.recommendation)
            records.setRecommendation(actor, row, {
              recommendation: input.recommendation,
              ratings: Object.entries(input.ratings).map(([area, level]) => ({ area, level })),
              note: input.notes,
            });
          audit.record({
            actor,
            action: "checkin.create",
            targetType: "checkin",
            targetId: checkin.id,
            metadata: { type: input.type, pulse: input.pulse, shared: input.shareWithPerson },
          });
          return checkin;
        });
        if (input.shareWithPerson)
          records.notifyPerson(
            actor.workspaceId,
            data.personId,
            `${actor.name} shared notes from your ${CHECKIN_TITLE[input.type].toLowerCase()}`,
            "/roadmap",
            "checkin.published",
          );
        return c.json(checkinRecord({ row: saved, at }), 201);
      },
    )
    .get("/team/members/:id/assign-options", (c) => {
      const actor = c.get("actor");
      const row = memberRecord(actor, c.req.param("id"));
      const state = look(row);
      const catalog = records.catalog(actor.workspaceId);
      const onRoadmap = new Set(state.modules.map((entry) => entry.catalogId));
      const name = firstName(state.person.name);
      const focusKinds = new Set([...state.failed, ...state.overdue].map((entry) => entry.kind));
      const reason = state.failed.length
        ? `${name} didn't pass “${state.failed[0]!.title}”. These items cover the same ground.`
        : state.overdue.length
          ? `${name} has ${plural(state.overdue.length, "overdue module")}. These are short ways back on plan.`
          : null;
      const items = [...catalog.values()]
        .filter((entry) => !onRoadmap.has(entry.id) || entry.kind === "check")
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          kind: moduleKind(entry.kind),
          detail: detailOf(entry),
          suggested: focusKinds.has(entry.kind) && !onRoadmap.has(entry.id),
        }))
        .sort(
          (a, b) => Number(b.suggested) - Number(a.suggested) || a.title.localeCompare(b.title),
        );
      const data = state.view.data;
      const member = records
        .activeMembers(actor.workspaceId)
        .find((entry) => entry.userId === data.personId);
      const jobTitle =
        typeof member?.organization.jobTitle === "string"
          ? member.organization.jobTitle.toLowerCase()
          : "";
      const options = records.options(actor);
      const published = records
        .templateRows(actor)
        .filter((template) => records.templateData(template).publishedVersion !== null);
      const sameTeam = records
        .activeMembers(actor.workspaceId)
        .filter(
          (entry) =>
            entry.userId !== data.personId &&
            entry.role !== "guest" &&
            records.teamName(actor.workspaceId, entry.organization) === data.team,
        )
        .map((entry) => entry.userId);
      const buddies: PersonRef[] = [
        ...sameTeam.flatMap((id) => records.personRef(actor.workspaceId, id) ?? []),
        ...options.buddies.filter(
          (entry) => entry.id !== data.personId && !sameTeam.includes(entry.id),
        ),
      ].slice(0, 30);
      const result: AssignOptions = {
        learning: { reason, items },
        roadmap: {
          templates: published.map((template) => {
            const tdata = records.templateData(template);
            return {
              id: template.id,
              name: tdata.name,
              version: `v${tdata.publishedVersion ?? tdata.version}`,
              moduleCount: tdata.stages.reduce((sum, stage) => sum + stage.moduleIds.length, 0),
              weeks: tdata.weeks,
              matchesRole:
                tdata.teams.some((team) => team.toLowerCase() === data.team.toLowerCase()) ||
                tdata.roles.some((role) => jobTitle.includes(role.toLowerCase())),
            };
          }),
          addOns: [...catalog.values()]
            .filter(
              (entry) =>
                entry.id.startsWith("path-") || ["process", "practical"].includes(entry.kind),
            )
            .map((entry) => ({
              id: entry.id,
              label: entry.title,
              suggested: entry.id.startsWith("path-"),
            })),
          buddies,
        },
      };
      return c.json(result);
    })
    .post(
      "/team/members/:id/assignments",
      zValidator("json", LearningAssignmentInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const row = memberRecord(actor, c.req.param("id"));
        const input = c.req.valid("json");
        const entry = records.catalog(actor.workspaceId).get(input.itemId);
        if (!entry) throw new BadRequestError("Unknown learning item");
        if (input.dueOn < today()) throw new BadRequestError("Choose a due date from today");
        const roadmap = ensureRoadmap(row);
        const data = roadmapData(roadmap);
        const elapsed = Math.floor((Date.now() - Date.parse(`${data.startDate}T00:00:00Z`)) / DAY);
        const stage = stageAt(data.stages, elapsed);
        const task: RoadmapModule = {
          id: randomUUID(),
          catalogId: entry.id,
          title: entry.title,
          kind: entry.kind,
          stageId: stage?.id ?? data.stages[0]?.id ?? "assigned",
          dueOn: input.dueOn,
          status: "todo",
          completedOn: null,
          postponed: false,
          assignedBy: actor.id,
          note: input.note.trim() || null,
          passed: null,
          result: null,
          attempts: 0,
        };
        store.patch(roadmap, {
          data: {
            ...data,
            modules: [...data.modules, task],
            history: [
              { on: today(), text: `${actor.name} assigned “${entry.title}”`, by: actor.id },
              ...data.history,
            ],
          },
        });
        audit.record({
          actor,
          action: "roadmap.assign_learning",
          targetType: "roadmap",
          targetId: roadmap.id,
          metadata: { itemId: entry.id, dueOn: input.dueOn },
        });
        notifyPerson(
          actor,
          row,
          `${actor.name} assigned you “${entry.title}”, due ${shortDate(input.dueOn)}`,
        );
        return c.json({ id: task.id }, 201);
      },
    )
    .post(
      "/team/members/:id/roadmap",
      zValidator("json", RoadmapAssignmentInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const row = memberRecord(actor, c.req.param("id"));
        const input = c.req.valid("json");
        const data = records.recordData(row);
        if (data.templateId || records.roadmapRow(row.workspaceId, data.personId!)?.data.templateId)
          throw new AppError(409, "CONFLICT", "This person already has a roadmap");
        const template = records.requirePublishedTemplate(actor, input.templateId);
        const catalog = records.catalog(actor.workspaceId);
        const unknown = input.addOnIds.filter((id) => !catalog.has(id));
        if (unknown.length) throw new BadRequestError(`Unknown add-on: ${unknown[0]}`);
        if (input.buddyId === data.personId)
          throw new BadRequestError("Their buddy must be someone else");
        records.requirePerson(actor.workspaceId, input.buddyId, "The buddy");
        const built = records.fromTemplate(
          row.workspaceId,
          template,
          data.startDate,
          input.addOnIds,
        );
        const name = records.templateData(template).name;
        const existing = records.roadmapRow(row.workspaceId, data.personId!);
        const created = db.transaction(() => {
          // Learning the manager already assigned stays on the new roadmap.
          const kept = existing
            ? roadmapData(existing).modules.filter((entry) => entry.assignedBy)
            : [];
          const roadmapValue = {
            ...built,
            modules: [...built.modules, ...kept],
            history: [
              { on: today(), text: `${actor.name} assigned the ${name} roadmap`, by: actor.id },
            ],
          } as unknown as Record<string, unknown>;
          const roadmap = existing
            ? store.patch(existing, { data: roadmapValue })
            : store.insert({
                workspaceId: row.workspaceId,
                ownerId: data.personId!,
                kind: ROADMAP,
                status: "active",
                data: roadmapValue,
              });
          const now = new Date().toISOString();
          store.patch(row, {
            data: {
              ...data,
              templateId: template.id,
              buddyId: input.buddyId,
              setup: {
                ...data.setup,
                roadmap: { at: now, by: actor.name },
                buddy: { at: now, by: actor.name },
              },
              activity: [
                records.activity(`${actor.name} assigned the ${name} roadmap`, "started"),
                ...data.activity,
              ],
            },
          });
          // The buddy gets mentor access to follow their progress until the probation review.
          const hasMentor = db
            .select()
            .from(assignments)
            .where(
              and(
                eq(assignments.workspaceId, actor.workspaceId),
                eq(assignments.userId, input.buddyId),
                eq(assignments.type, "mentor"),
                eq(assignments.scopeId, data.personId!),
              ),
            )
            .get();
          if (!hasMentor)
            db.insert(assignments)
              .values({
                id: randomUUID(),
                workspaceId: actor.workspaceId,
                userId: input.buddyId,
                type: "mentor",
                scopeType: "user",
                scopeId: data.personId!,
                expiresAt: new Date(
                  Date.parse(`${addDays(data.probation.reviewOn, 14)}T00:00:00Z`),
                ),
              })
              .run();
          audit.record({
            actor,
            action: "roadmap.assign",
            targetType: "roadmap",
            targetId: roadmap.id,
            metadata: { templateId: template.id, addOnIds: input.addOnIds, buddyId: input.buddyId },
          });
          return roadmap;
        });
        notifyPerson(actor, row, "Your onboarding roadmap is ready");
        records.notifyPerson(
          actor.workspaceId,
          input.buddyId,
          `You're ${data.name}'s onboarding buddy`,
          `/people/${data.personId}`,
          "onboarding.buddy_assigned",
        );
        return c.json({ id: created.id }, 201);
      },
    )
    .post("/team/members/:id/escalations", (c) => {
      const actor = c.get("actor");
      const row = memberRecord(actor, c.req.param("id"));
      const state = look(row);
      const name = state.person.name;
      // Waiting on access goes to the workspace admins who grant it; anything else that has a new
      // hire stuck goes to People Ops. Once a day per person: a second press returns the first.
      const blockers = (state.checkins[0]?.row.data.blockers as string[] | undefined) ?? [];
      const to = blockers.includes("access") ? "admins" : "people_ops";
      const on = today();
      const existing = store
        .listChildren(actor, "escalation", row.id, 20)
        .find((entry) => entry.data.on === on);
      if (existing) return c.json({ id: existing.id, to: existing.data.to as string }, 200);
      const recipients = records
        .activeMembers(actor.workspaceId)
        .filter((member) =>
          to === "admins" ? ["owner", "admin"].includes(member.role) : member.role === "hr",
        )
        .map((member) => member.userId)
        .filter((id) => id !== actor.id);
      const escalation = store.create(
        actor,
        "escalation",
        { on, to, blockers, personId: state.person.id, recipients },
        { parentId: row.id, status: "open" },
      );
      const data = records.recordData(row);
      store.patch(row, {
        data: {
          ...data,
          activity: [
            records.activity(
              `${actor.name} escalated: ${to === "admins" ? "waiting on access" : "stuck"}`,
              "review",
            ),
            ...data.activity,
          ],
        },
      });
      for (const userId of recipients)
        records.notifyPerson(
          actor.workspaceId,
          userId,
          to === "admins"
            ? `${actor.name} escalated: ${name} is waiting on access`
            : `${actor.name} escalated: ${name} is stuck in onboarding`,
          to === "admins" ? "/access" : `/onboarding/${row.id}`,
          "onboarding.escalated",
        );
      audit.record({
        actor,
        action: "onboarding.escalate",
        targetType: "onboarding",
        targetId: row.id,
        metadata: { to, recipients: recipients.length },
      });
      return c.json({ id: escalation.id, to }, 201);
    })
    .get("/team/attention", (c) => {
      const actor = c.get("actor");
      const rank: Record<AttentionItem["severity"], number> = {
        error: 0,
        warning: 1,
        info: 2,
        neutral: 3,
      };
      const items: AttentionItem[] = [];
      for (const row of teamRecords(actor)) {
        const state = look(row);
        const { view, person } = state;
        const name = firstName(person.name);
        const detailText = state.issues[0] ?? view.note;
        const status: OnboardingStatus = view.status;
        if (status === "blocked")
          items.push({
            id: `${row.id}:blocked`,
            person,
            severity: "error",
            label: "Blocked",
            title: `${name} is stuck`,
            detail: detailText,
            actions: [
              { kind: "escalate", label: "Escalate" },
              { kind: "review_progress", label: "Review" },
            ],
          });
        else if (status === "at_risk")
          items.push({
            id: `${row.id}:at_risk`,
            person,
            severity: "warning",
            label: "At risk",
            title: `${name} is behind plan`,
            detail: detailText,
            actions: [
              { kind: "assign_learning", label: "Assign learning" },
              { kind: "review_progress", label: "Review" },
            ],
          });
        if (!state.roadmap)
          items.push({
            id: `${row.id}:roadmap`,
            person,
            severity: "info",
            label: view.started ? "No roadmap" : `Starts ${weekday(view.data.startDate)}`,
            title: `${name} needs a roadmap`,
            detail: view.started
              ? "Started without a plan or a buddy."
              : `Starts ${shortDate(view.data.startDate)}. Assign a roadmap and a buddy before then.`,
            actions: [{ kind: "assign_roadmap", label: "Assign roadmap" }],
          });
        const due = view.review.recommendationDueOn;
        if (due && view.started && Math.round((Date.parse(due) - Date.parse(today())) / DAY) <= 14)
          items.push({
            id: `${row.id}:recommendation`,
            person,
            severity: due < today() ? "warning" : "neutral",
            label: due < today() ? "Overdue" : `Due ${shortDate(due)}`,
            title: `Probation recommendation for ${name}`,
            detail: `Their probation review is on ${shortDate(view.data.probation.reviewOn)}. People Ops is waiting for your recommendation.`,
            actions: [{ kind: "start_recommendation", label: "Start recommendation" }],
          });
      }
      items.sort((a, b) => rank[a.severity] - rank[b.severity]);
      return c.json({ items });
    })
    .get("/team/checkins", (c) => {
      const actor = c.get("actor");
      const now = today();
      const items: Checkin[] = [];
      for (const row of teamRecords(actor)) {
        const state = look(row);
        const { view, person } = state;
        if (!view.started) continue;
        const done = new Set(
          state.checkins.map((entry) =>
            typeof entry.row.data.type === "string" ? entry.row.data.type : "weekly",
          ),
        );
        // A weekly 1:1 a week after the last one (or the start), rolled forward to today.
        const lastWeekly = state.checkins.find(
          (entry) => (entry.row.data.type ?? "weekly") === "weekly",
        )?.at;
        let next = addDays((lastWeekly ?? `${view.data.startDate}T00:00:00Z`).slice(0, 10), 7);
        while (next < now) next = addDays(next, 7);
        items.push({
          id: `${row.id}:weekly`,
          person,
          title: CHECKIN_TITLE.weekly,
          at: `${next}T09:00:00.000Z`,
          note: state.issues[0] ?? null,
        });
        const reviews: Array<[CheckinType, string]> = [
          ["day_30", addDays(view.data.startDate, 30)],
          ["readiness_60", addDays(view.data.startDate, 60)],
        ];
        for (const [type, on] of reviews)
          if (!done.has(type) && on >= addDays(now, -7))
            items.push({
              id: `${row.id}:${type}`,
              person,
              title: CHECKIN_TITLE[type],
              at: `${on < now ? now : on}T09:00:00.000Z`,
              note: on < now ? `Was due ${shortDate(on)}` : null,
            });
        const due = view.review.recommendationDueOn;
        if (due && !done.has("probation"))
          items.push({
            id: `${row.id}:probation`,
            person,
            title: CHECKIN_TITLE.probation,
            at: `${due < now ? now : due}T09:00:00.000Z`,
            note: due < now ? `Was due ${shortDate(due)}` : "People Ops needs it before the review",
          });
      }
      items.sort((a, b) => a.at.localeCompare(b.at));
      return c.json({ items: items.slice(0, 8) });
    });
}
