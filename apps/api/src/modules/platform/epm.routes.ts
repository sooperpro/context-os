import {
  BragDocGenerateSchema,
  BragDocShareSchema,
  BragDocUpdateSchema,
  FootprintAnnotateSchema,
  FootprintQuerySchema,
  PeerRequestSchema,
  ReviewAcknowledgeSchema,
  ReviewCycleInputSchema,
  ReviewSubmitSchema,
  VersionSchema,
  type ReviewCyclePhase,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { users } from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { BRAG_DOC_PROMPT_VERSION, generateBragDoc } from "./brag-doc.js";
import { buildFootprint, recencyBias } from "./epm.footprint.js";
import { createNotifier } from "./notify.js";
import { workspaceSettings } from "./settings.js";
import { createPlatformStore, type PlatformRecord } from "./store.js";
import { manages } from "./reports.js";

const PHASES: ReviewCyclePhase[] = [
  "draft",
  "scheduled",
  "self_review",
  "peer_input",
  "manager_review",
  "calibration",
  "sharing",
  "acknowledgement",
  "closed",
];

/** Evidence-backed performance management (PRD §7.13, §8.10). Phase 2 add-on, gated by settings. */
export function createEpmRoutes(container: Container) {
  const { db, identity, audit, gemini } = container;
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);
  const requireEpm = (actor: Actor) => {
    const settings = workspaceSettings(db, actor.workspaceId);
    if (!settings.epm.enabled)
      throw new AppError(403, "FORBIDDEN", "The EPM add-on is not enabled");
    const member = identity.requireMember(actor.workspaceId, actor.id);
    const location =
      typeof member.organization.location === "string" ? member.organization.location : null;
    if (location && settings.epm.disabledLocations.includes(location))
      throw new AppError(403, "FORBIDDEN", "EPM is disabled for your location");
    if (actor.role === "guest")
      throw new AppError(403, "FORBIDDEN", "Guests do not have EPM access");
    return settings;
  };
  const directManager = (actor: Actor, userId: string) =>
    Boolean(identity.requireMember(actor.workspaceId, userId)) && manages(db, actor, userId);
  const parseRange = (from?: string, to?: string) => {
    const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
    const start = from ? new Date(`${from}T00:00:00Z`) : new Date(end.getTime() - 90 * 86400000);
    if (start > end) throw new BadRequestError("from must be before to");
    return { from: start, to: end };
  };
  const annotations = (actor: Actor, userId: string) =>
    new Map(
      store
        .listWhere(actor.workspaceId, "footprint_annotation", { ownerId: userId }, 1000)
        .map((row) => [String(row.data.itemId), row]),
    );
  const footprintFor = (
    actor: Actor,
    userId: string,
    range: { from: Date; to: Date },
    forShare: boolean,
  ) => {
    const notes = annotations(actor, userId);
    return (
      buildFootprint(db, identity, actor, userId, range)
        .map((item) => {
          const note = notes.get(item.id);
          return {
            ...item,
            annotation: note
              ? {
                  note: note.data.note ?? null,
                  hiddenInShare: note.data.hiddenInShare === true,
                  highlighted: note.data.highlighted === true,
                  dispute: note.data.dispute ?? null,
                }
              : null,
          };
        })
        // Hidden items stay in the employee's private view only (FR-EPM-004).
        .filter((item) => !forShare || item.annotation?.hiddenInShare !== true)
    );
  };
  const cycleFor = (actor: Actor, id: string) => store.get(actor, "review_cycle", id);
  const isCycleAdmin = (actor: Actor) =>
    actor.role === "owner" ||
    identity.hasAssignment(actor, "review_cycle_admin", actor.workspaceId);
  const reviewsFor = (actor: Actor, cycleId: string) =>
    store.listChildren(actor, "review", cycleId);
  const reviewVisible = (actor: Actor, review: PlatformRecord, cycle: PlatformRecord) => {
    if (review.data.reviewerId === actor.id) return true;
    if (review.ownerId === actor.id)
      return (
        review.data.type === "self" ||
        ["sharing", "acknowledgement", "closed"].includes(cycle.status)
      );
    if (directManager(actor, review.ownerId) && review.data.type === "self")
      return review.status === "submitted";
    return false;
  };

  return new Hono<AppEnv>()
    .get("/epm/footprint", zValidator("query", FootprintQuerySchema, validationHook), (c) => {
      const actor = c.get("actor");
      requireEpm(actor);
      const query = c.req.valid("query");
      const userId = query.userId ?? actor.id;
      const managerView = userId !== actor.id;
      if (managerView && !directManager(actor, userId)) throw new NotFoundError("Footprint");
      const range = parseRange(query.from, query.to);
      const items = footprintFor(actor, userId, range, managerView);
      const themes = Object.fromEntries(
        [
          "delivery",
          "decisions_direction",
          "knowledge_enablement",
          "collaboration",
          "quality_reliability",
          "customer_impact",
        ].map((theme) => [theme, items.filter((item) => item.theme === theme).length]),
      );
      return c.json({
        userId,
        from: range.from.toISOString().slice(0, 10),
        to: range.to.toISOString().slice(0, 10),
        viewer: managerView ? "manager" : "self",
        themes,
        recencyBias: recencyBias(items, range),
        items,
        note: "Evidence only. ContextOS never rates, ranks or scores people (EP-1).",
      });
    })
    .post(
      "/epm/footprint/items/:id/annotate",
      zValidator("param", z.object({ id: z.string().min(1).max(200) }), validationHook),
      zValidator("json", FootprintAnnotateSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireEpm(actor);
        const itemId = c.req.valid("param").id;
        const input = c.req.valid("json");
        const existing = annotations(actor, actor.id).get(itemId);
        const data = { itemId, ...(existing?.data ?? {}), ...input };
        const row = existing
          ? store.patch(existing, { data })
          : store.create(actor, "footprint_annotation", data, { status: "active" });
        audit.record({
          actor,
          action: "epm.annotate",
          targetType: "footprint_item",
          targetId: itemId,
        });
        return c.json(row, existing ? 200 : 201);
      },
    )
    .post(
      "/epm/brag-docs/generate",
      zValidator("json", BragDocGenerateSchema, validationHook),
      async (c) => {
        const actor = c.get("actor");
        requireEpm(actor);
        const input = c.req.valid("json");
        const range = parseRange(input.from, input.to);
        const items = footprintFor(actor, actor.id, range, false);
        const output = await generateBragDoc(gemini, {
          userName: actor.name,
          from: input.from,
          to: input.to,
          items,
        });
        const row = store.create(
          actor,
          "brag_doc",
          {
            title: input.title ?? `Brag document ${input.from} to ${input.to}`,
            from: input.from,
            to: input.to,
            narrative: output.narrative,
            highlights: output.highlights,
            itemSelection: items.map((item) => item.id),
            items,
            recencyBias: recencyBias(items, range),
            generationRun: {
              model: gemini.model,
              promptVersion: BRAG_DOC_PROMPT_VERSION,
              generatedAt: new Date().toISOString(),
            },
          },
          { status: "draft" },
        );
        audit.record({
          actor,
          action: "epm.brag_doc.generate",
          targetType: "brag_doc",
          targetId: row.id,
        });
        return c.json(row, 201);
      },
    )
    .get(
      "/epm/brag-docs",
      zValidator("query", z.object({ shared: z.coerce.boolean().optional() }), validationHook),
      (c) => {
        const actor = c.get("actor");
        requireEpm(actor);
        if (c.req.valid("query").shared)
          return c.json({
            items: store
              .listWhere(actor.workspaceId, "brag_share", {}, 500)
              .filter((row) => row.data.sharedWithUserId === actor.id),
          });
        return c.json({ items: store.listOwned(actor, "brag_doc") });
      },
    )
    .get("/epm/brag-docs/:id", (c) => {
      const actor = c.get("actor");
      requireEpm(actor);
      const row = store.get(actor, "brag_doc", c.req.param("id"));
      if (row.ownerId !== actor.id) throw new NotFoundError("Brag document");
      return c.json({ ...row, shares: store.listChildren(actor, "brag_share", row.id) });
    })
    .patch("/epm/brag-docs/:id", zValidator("json", BragDocUpdateSchema, validationHook), (c) => {
      const actor = c.get("actor");
      requireEpm(actor);
      const row = store.get(actor, "brag_doc", c.req.param("id"));
      if (row.ownerId !== actor.id) throw new NotFoundError("Brag document");
      const { version, ...patch } = c.req.valid("json");
      return c.json(
        store.update(actor, row, version, {
          data: { ...row.data, ...patch, editedAt: new Date().toISOString() },
        }),
      );
    })
    .post(
      "/epm/brag-docs/:id/share",
      zValidator("json", BragDocShareSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireEpm(actor);
        const row = store.get(actor, "brag_doc", c.req.param("id"));
        if (row.ownerId !== actor.id) throw new NotFoundError("Brag document");
        const input = c.req.valid("json");
        let recipient = input.withUserId ?? null;
        let reviewId: string | null = null;
        if (input.reviewId) {
          const review = store.get(actor, "review", input.reviewId);
          if (review.ownerId !== actor.id || review.data.type !== "manager")
            throw new BadRequestError("Share with the manager review of your own cycle");
          recipient = String(review.data.reviewerId);
          reviewId = review.id;
        }
        if (!recipient) throw new BadRequestError("Provide withUserId or reviewId");
        if (
          recipient !== identity.requireMember(actor.workspaceId, actor.id).managerId &&
          !reviewId
        )
          throw new AppError(
            403,
            "FORBIDDEN",
            "Brag documents can be shared with your manager or a reviewer",
          );
        const selected = new Set(
          Array.isArray(row.data.itemSelection) ? row.data.itemSelection : [],
        );
        const hidden = new Set(
          [...annotations(actor, actor.id).values()]
            .filter((note) => note.data.hiddenInShare === true)
            .map((note) => String(note.data.itemId)),
        );
        const snapshot = {
          title: row.data.title,
          from: row.data.from,
          to: row.data.to,
          narrative: row.data.narrative,
          highlights: row.data.highlights,
          items: (Array.isArray(row.data.items) ? row.data.items : []).filter((item) => {
            const id = (item as { id: string }).id;
            return selected.has(id) && !hidden.has(id);
          }),
          recencyBias: row.data.recencyBias,
        };
        const share = store.create(
          actor,
          "brag_share",
          {
            bragDocId: row.id,
            sharedWithUserId: recipient,
            reviewId,
            snapshot,
            sharedAt: new Date().toISOString(),
          },
          { parentId: row.id, status: "shared" },
        );
        store.update(actor, row, input.version, { status: "shared" });
        notifier.notify(actor.workspaceId, recipient, {
          type: "brag_doc.shared",
          category: "system",
          title: `${actor.name} shared a brag document with you`,
          link: `/epm/shared/${share.id}`,
        });
        audit.record({
          actor,
          action: "epm.brag_doc.share",
          targetType: "brag_doc",
          targetId: row.id,
          metadata: { recipient },
        });
        return c.json(share, 201);
      },
    )
    .get("/epm/review-cycles", (c) => {
      const actor = c.get("actor");
      requireEpm(actor);
      const cycles = store.listWhere(actor.workspaceId, "review_cycle", {}, 200);
      const admin = isCycleAdmin(actor);
      return c.json({
        items: cycles
          .filter(
            (cycle) =>
              admin ||
              (cycle.data.participantIds as string[]).includes(actor.id) ||
              cycle.ownerId === actor.id,
          )
          .map((cycle) => {
            const reviews = reviewsFor(actor, cycle.id);
            // Review Cycle Admins see completion status only (EP-9).
            return {
              ...cycle,
              completion: {
                total: reviews.length,
                submitted: reviews.filter((review) => review.status === "submitted").length,
              },
            };
          }),
      });
    })
    .post("/epm/review-cycles", zValidator("json", ReviewCycleInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      requireEpm(actor);
      if (!isCycleAdmin(actor))
        throw new AppError(403, "FORBIDDEN", "A review cycle admin assignment is required");
      const input = c.req.valid("json");
      if (input.periodEnd < input.periodStart)
        throw new BadRequestError("periodEnd must be after periodStart");
      for (const userId of input.participantIds) identity.requireMember(actor.workspaceId, userId);
      const row = store.create(
        actor,
        "review_cycle",
        { ...input, phaseHistory: [] },
        { status: "draft" },
      );
      audit.record({
        actor,
        action: "epm.cycle.create",
        targetType: "review_cycle",
        targetId: row.id,
      });
      return c.json(row, 201);
    })
    .post(
      "/epm/review-cycles/:id/advance",
      zValidator("json", VersionSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireEpm(actor);
        if (!isCycleAdmin(actor))
          throw new AppError(403, "FORBIDDEN", "A review cycle admin assignment is required");
        const cycle = cycleFor(actor, c.req.param("id"));
        const index = PHASES.indexOf(cycle.status as ReviewCyclePhase);
        let next = PHASES[index + 1];
        if (!next) throw new AppError(409, "CONFLICT", "The cycle is closed");
        if (next === "calibration" && cycle.data.calibrationEnabled !== true) next = "sharing";
        const updated = db.transaction(() => {
          const row = store.update(actor, cycle, c.req.valid("json").version, {
            status: next,
            data: {
              ...cycle.data,
              phaseHistory: [
                ...(Array.isArray(cycle.data.phaseHistory)
                  ? (cycle.data.phaseHistory as unknown[])
                  : []),
                { phase: next, at: new Date().toISOString(), by: actor.id },
              ],
            },
          });
          if (next === "self_review")
            for (const participant of cycle.data.participantIds as string[]) {
              const member = identity.requireMember(actor.workspaceId, participant);
              const questions = cycle.data.questions as string[];
              store.insert({
                workspaceId: actor.workspaceId,
                ownerId: participant,
                kind: "review",
                parentId: cycle.id,
                status: "pending",
                data: {
                  type: "self",
                  reviewerId: participant,
                  questions,
                  answers: {},
                  rating: null,
                },
              });
              if (member.managerId)
                store.insert({
                  workspaceId: actor.workspaceId,
                  ownerId: participant,
                  kind: "review",
                  parentId: cycle.id,
                  status: "pending",
                  data: {
                    type: "manager",
                    reviewerId: member.managerId,
                    questions,
                    answers: {},
                    rating: null,
                  },
                });
              notifier.notify(actor.workspaceId, participant, {
                type: "review_cycle.phase",
                category: "system",
                title: `Self-review opened for "${String(cycle.data.name)}"`,
                link: `/epm/cycles/${cycle.id}`,
              });
            }
          return row;
        });
        audit.record({
          actor,
          action: "epm.cycle.advance",
          targetType: "review_cycle",
          targetId: cycle.id,
          metadata: { phase: next },
        });
        return c.json(updated);
      },
    )
    .get(
      "/epm/reviews",
      zValidator("query", z.object({ cycleId: z.uuid().optional() }), validationHook),
      (c) => {
        const actor = c.get("actor");
        requireEpm(actor);
        const { cycleId } = c.req.valid("query");
        const reviews = store
          .listWhere(actor.workspaceId, "review", cycleId ? { parentId: cycleId } : {}, 1000)
          .filter(
            (review) =>
              review.ownerId === actor.id ||
              review.data.reviewerId === actor.id ||
              directManager(actor, review.ownerId),
          );
        const cycles = new Map(
          store
            .listWhere(actor.workspaceId, "review_cycle", {}, 200)
            .map((cycle) => [cycle.id, cycle]),
        );
        return c.json({
          items: reviews
            .map((review) => ({ review, cycle: cycles.get(review.parentId!) }))
            .filter(({ review, cycle }) => cycle && reviewVisible(actor, review, cycle))
            .map(({ review, cycle }) => ({ ...review, cyclePhase: cycle!.status })),
        });
      },
    )
    .post("/epm/reviews/:id/peers", zValidator("json", PeerRequestSchema, validationHook), (c) => {
      const actor = c.get("actor");
      requireEpm(actor);
      const review = store.get(actor, "review", c.req.param("id"));
      const cycle = cycleFor(actor, review.parentId!);
      if (review.ownerId !== actor.id && !directManager(actor, review.ownerId))
        throw new AppError(403, "FORBIDDEN", "The employee or their manager requests peer input");
      if (!["self_review", "peer_input"].includes(cycle.status))
        throw new AppError(
          409,
          "CONFLICT",
          "Peer input can be requested until the manager review starts",
        );
      const input = c.req.valid("json");
      const created = input.peerIds
        .filter((peerId) => peerId !== review.ownerId)
        .map((peerId) => {
          identity.requireMember(actor.workspaceId, peerId);
          const peer = store.insert({
            workspaceId: actor.workspaceId,
            ownerId: review.ownerId,
            kind: "review",
            parentId: cycle.id,
            status: "pending",
            data: {
              type: "peer",
              reviewerId: peerId,
              questions: cycle.data.questions,
              answers: {},
              rating: null,
              requestedBy: actor.id,
            },
          });
          notifier.notify(actor.workspaceId, peerId, {
            type: "review.peer_requested",
            category: "system",
            title: "Peer input requested",
            link: `/epm/reviews/${peer.id}`,
          });
          return peer;
        });
      store.update(actor, review, input.version, {
        data: { ...review.data, peerIds: created.map((peer) => String(peer.data.reviewerId)) },
      });
      return c.json({ items: created }, 201);
    })
    .post(
      "/epm/reviews/:id/submit",
      zValidator("json", ReviewSubmitSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireEpm(actor);
        const review = store.get(actor, "review", c.req.param("id"));
        const cycle = cycleFor(actor, review.parentId!);
        if (review.data.reviewerId !== actor.id)
          throw new AppError(403, "FORBIDDEN", "Only the assigned reviewer can submit");
        const expectedPhase: Record<string, string> = {
          self: "self_review",
          peer: "peer_input",
          manager: "manager_review",
        };
        if (cycle.status !== expectedPhase[String(review.data.type)])
          throw new AppError(
            409,
            "CONFLICT",
            `This ${String(review.data.type)} review is not open in the ${cycle.status} phase`,
          );
        if (review.status === "submitted") throw new AppError(409, "CONFLICT", "Already submitted");
        const input = c.req.valid("json");
        const updated = store.update(actor, review, input.version, {
          status: "submitted",
          data: {
            ...review.data,
            answers: input.answers,
            rating: input.rating ?? null,
            submittedAt: new Date().toISOString(),
          },
        });
        audit.record({
          actor,
          action: "epm.review.submit",
          targetType: "review",
          targetId: review.id,
          metadata: { type: review.data.type },
        });
        return c.json(updated);
      },
    )
    .post(
      "/epm/reviews/:id/acknowledge",
      zValidator("json", ReviewAcknowledgeSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireEpm(actor);
        const review = store.get(actor, "review", c.req.param("id"));
        const cycle = cycleFor(actor, review.parentId!);
        if (review.ownerId !== actor.id || review.data.type !== "manager")
          throw new AppError(
            403,
            "FORBIDDEN",
            "Only the reviewee acknowledges their manager review",
          );
        if (cycle.status !== "acknowledgement")
          throw new AppError(409, "CONFLICT", "The cycle is not in the acknowledgement phase");
        const input = c.req.valid("json");
        return c.json(
          store.update(actor, review, input.version, {
            status: "acknowledged",
            data: {
              ...review.data,
              employeeComment: input.comment,
              acknowledgedAt: new Date().toISOString(),
            },
          }),
        );
      },
    )
    .get("/epm/shared/:id", (c) => {
      const actor = c.get("actor");
      requireEpm(actor);
      const share = store.get(actor, "brag_share", c.req.param("id"));
      const owner = db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, share.ownerId))
        .get();
      if (share.data.sharedWithUserId !== actor.id && share.ownerId !== actor.id)
        throw new NotFoundError("Shared brag document");
      return c.json({ ...share, ownerName: owner?.name ?? share.ownerId });
    });
}
