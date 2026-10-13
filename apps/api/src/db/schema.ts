import type {
  Answer,
  Confidence,
  ContextItemKind,
  FeedbackKind,
  FeedbackTarget,
  JobStatus,
  JobType,
  SourceConnector,
  SourceKind,
  SourceStatus,
  Verification,
} from "@contextos/shared";
import { blob, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// All tables live in one file so drizzle-kit can load the schema without resolving imports.
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = () => new Date();

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("projects_workspace_idx").on(t.workspaceId)],
);

/** Normalized source object: one document / thread / ticket / PR from any connector. */
export const sourceObjects = sqliteTable(
  "source_objects",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    connector: text("connector").$type<SourceConnector>().notNull(),
    kind: text("kind").$type<SourceKind>().notNull(),
    externalId: text("external_id"),
    title: text("title").notNull(),
    url: text("url"),
    author: text("author"),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    /** Source time: when the object was created/updated in its system of record. */
    sourceCreatedAt: ts("source_created_at"),
    sourceUpdatedAt: ts("source_updated_at"),
    /** Ingestion time: when ContextOS learned about it. */
    ingestedAt: ts("ingested_at").notNull().$defaultFn(now),
    processedAt: ts("processed_at"),
    status: text("status").$type<SourceStatus>().notNull().default("pending"),
    error: text("error"),
  },
  (t) => [index("source_objects_project_idx").on(t.projectId, t.ingestedAt)],
);

export const sourceChunks = sqliteTable(
  "source_chunks",
  {
    id: text("id").primaryKey(),
    sourceObjectId: text("source_object_id")
      .notNull()
      .references(() => sourceObjects.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    /** Float32 vector (little-endian) or null when embeddings were unavailable. */
    embedding: blob("embedding", { mode: "buffer" }),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("source_chunks_source_idx").on(t.sourceObjectId, t.ordinal),
    index("source_chunks_project_idx").on(t.projectId),
  ],
);

export const extractionRuns = sqliteTable(
  "extraction_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceObjectId: text("source_object_id")
      .notNull()
      .references(() => sourceObjects.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status").$type<"running" | "done" | "failed">().notNull(),
    startedAt: ts("started_at").notNull().$defaultFn(now),
    finishedAt: ts("finished_at"),
    error: text("error"),
    stats: text("stats", { mode: "json" }).$type<Record<string, number>>(),
  },
  (t) => [index("extraction_runs_source_idx").on(t.sourceObjectId)],
);

/** Derived, typed context (decisions, events, status claims, people, components, ...). */
export const contextItems = sqliteTable(
  "context_items",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ContextItemKind>().notNull(),
    /** `${kind}:${normalized title}`, used to merge the same subject across sources. */
    normalizedKey: text("normalized_key").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    /** Event time (when it happened), if known. */
    eventAt: ts("event_at"),
    /** The time a status claim refers to, if known. */
    asOf: ts("as_of"),
    verification: text("verification").$type<Verification>().notNull().default("inferred"),
    confidence: text("confidence").$type<Confidence>().notNull(),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("context_items_project_kind_idx").on(t.projectId, t.kind),
    index("context_items_project_key_idx").on(t.projectId, t.normalizedKey),
  ],
);

/** Verbatim quote linking a context item to a source object (and chunk when located). */
export const evidence = sqliteTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    contextItemId: text("context_item_id")
      .notNull()
      .references(() => contextItems.id, { onDelete: "cascade" }),
    sourceObjectId: text("source_object_id")
      .notNull()
      .references(() => sourceObjects.id, { onDelete: "cascade" }),
    chunkId: text("chunk_id").references(() => sourceChunks.id, { onDelete: "set null" }),
    extractionRunId: text("extraction_run_id").references(() => extractionRuns.id, {
      onDelete: "set null",
    }),
    quote: text("quote").notNull(),
    quoteVerified: integer("quote_verified", { mode: "boolean" }).notNull(),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("evidence_item_idx").on(t.contextItemId),
    index("evidence_source_idx").on(t.sourceObjectId),
  ],
);

/** Generated hub sections (currently: overview), versioned by model + prompt. */
export const hubSnapshots = sqliteTable(
  "hub_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    stale: integer("stale", { mode: "boolean" }).notNull().default(false),
    generatedAt: ts("generated_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("hub_snapshots_project_section_uq").on(t.projectId, t.section)],
);

export const questions = sqliteTable(
  "questions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer", { mode: "json" }).$type<Answer>().notNull(),
    model: text("model").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("questions_project_idx").on(t.projectId, t.createdAt)],
);

export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    targetType: text("target_type").$type<FeedbackTarget>().notNull(),
    targetId: text("target_id").notNull(),
    kind: text("kind").$type<FeedbackKind>().notNull(),
    note: text("note"),
    actorId: text("actor_id").notNull(),
    actorName: text("actor_name").notNull(),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("feedback_project_idx").on(t.projectId, t.createdAt)],
);

/** Durable job queue for ingestion/extraction/synthesis work. */
export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").$type<JobType>().notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    subject: text("subject"),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: ts("run_after").notNull(),
    lockedAt: ts("locked_at"),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    lastError: text("last_error"),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("jobs_status_run_after_idx").on(t.status, t.runAfter),
    index("jobs_project_status_idx").on(t.projectId, t.status),
  ],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    projectId: text("project_id"),
    actorId: text("actor_id").notNull(),
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("audit_log_project_idx").on(t.projectId, t.createdAt)],
);

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type SourceObjectRow = typeof sourceObjects.$inferSelect;
export type NewSourceObjectRow = typeof sourceObjects.$inferInsert;
export type SourceChunkRow = typeof sourceChunks.$inferSelect;
export type ExtractionRunRow = typeof extractionRuns.$inferSelect;
export type ContextItemRow = typeof contextItems.$inferSelect;
export type NewContextItemRow = typeof contextItems.$inferInsert;
export type EvidenceRow = typeof evidence.$inferSelect;
export type NewEvidenceRow = typeof evidence.$inferInsert;
export type HubSnapshotRow = typeof hubSnapshots.$inferSelect;
export type QuestionRow = typeof questions.$inferSelect;
export type FeedbackRow = typeof feedback.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
