import type {
  Answer,
  AnswerFeedback,
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
  SystemRole,
  AssignmentType,
  ConflictStatus,
  IdentityLinkStatus,
  IdentityProvider,
  LedgerCurrency,
  LedgerStatus,
  ScopeType,
  TopicType,
} from "@contextos/shared";
import { blob, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// All tables live in one file so drizzle-kit can load the schema without resolving imports.
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = () => new Date();

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  primaryDomain: text("primary_domain"),
  region: text("region").notNull().default("us-east-1"),
  settings: text("settings", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  version: integer("version").notNull().default(1),
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
    /** URL slug, unique per workspace; null only for legacy rows before backfill. */
    slug: text("slug"),
    description: text("description"),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("projects_workspace_idx").on(t.workspaceId),
    uniqueIndex("projects_workspace_slug_uq").on(t.workspaceId, t.slug),
  ],
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
    visibility: text("visibility")
      .$type<"workspace" | "restricted">()
      .notNull()
      .default("workspace"),
    connectionId: text("connection_id"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
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
    sourceIds: text("source_ids", { mode: "json" }).$type<string[]>(),
    /** Asker rating with reason (FR-ASK-008); only the asker can set it. */
    feedback: text("feedback", { mode: "json" }).$type<AnswerFeedback>(),
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
    previousHash: text("previous_hash"),
    entryHash: text("entry_hash"),
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

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  preferences: text("preferences", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});
export const memberships = sqliteTable(
  "memberships",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<SystemRole>().notNull(),
    status: text("status")
      .$type<"active" | "suspended" | "offboarded">()
      .notNull()
      .default("active"),
    managerId: text("manager_id"),
    guestExpiresAt: ts("guest_expires_at"),
    organization: text("organization", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
  },
  (t) => [uniqueIndex("memberships_workspace_user_uq").on(t.workspaceId, t.userId)],
);
export const departments = sqliteTable(
  "departments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("departments_workspace_name_uq").on(t.workspaceId, t.name)],
);
export const teams = sqliteTable(
  "teams",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("teams_workspace_department_name_uq").on(t.workspaceId, t.departmentId, t.name),
  ],
);
export const organizationLinks = sqliteTable("organization_links", {
  organizationId: text("organization_id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
});
export const assignments = sqliteTable(
  "assignments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AssignmentType>().notNull(),
    scopeType: text("scope_type").$type<"project" | "user" | "workspace" | "section">().notNull(),
    scopeId: text("scope_id").notNull(),
    expiresAt: ts("expires_at"),
  },
  (t) => [index("assignments_user_scope_idx").on(t.workspaceId, t.userId, t.scopeId)],
);
export const projectMemberships = sqliteTable(
  "project_memberships",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("project_memberships_uq").on(t.projectId, t.userId)],
);
export const sourceAccess = sqliteTable(
  "source_access",
  {
    sourceId: text("source_id")
      .notNull()
      .references(() => sourceObjects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at"),
  },
  (t) => [uniqueIndex("source_access_uq").on(t.sourceId, t.userId)],
);
export const connectorConnections = sqliteTable(
  "connector_connections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("connected"),
    credentials: text("credentials").notNull(),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    accountId: text("account_id").notNull(),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("connections_workspace_user_idx").on(t.workspaceId, t.userId)],
);
export const oauthStates = sqliteTable("oauth_states", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: ts("expires_at").notNull(),
});
export const askThreads = sqliteTable("ask_threads", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sourceId: text("source_id").references(() => sourceObjects.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});
export const threadMessages = sqliteTable("thread_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => askThreads.id, { onDelete: "cascade" }),
  questionId: text("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
});

/** Versioned documents for domain aggregates; only typed domain services expose these. */
export const platformRecords = sqliteTable(
  "platform_records",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    parentId: text("parent_id"),
    status: text("status").notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    version: integer("version").notNull().default(1),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("records_kind_scope_idx").on(t.workspaceId, t.kind, t.projectId),
    index("records_owner_idx").on(t.workspaceId, t.ownerId),
  ],
);
export const pointsLedger = sqliteTable(
  "points_ledger",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    amount: integer("amount").notNull(),
    /** Reputation (rp, non-spendable) or Kudos Credits (kc, spendable). */
    currency: text("currency").$type<LedgerCurrency>().notNull().default("rp"),
    action: text("action").notNull(),
    sourceId: text("source_id").notNull(),
    reason: text("reason").notNull(),
    status: text("status").$type<LedgerStatus>().notNull().default("posted"),
    actorId: text("actor_id"),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("points_action_source_user_uq").on(
      t.workspaceId,
      t.userId,
      t.currency,
      t.action,
      t.sourceId,
    ),
    index("points_user_created_idx").on(t.workspaceId, t.userId, t.createdAt),
  ],
);
export const domainEvents = sqliteTable("domain_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  createdAt: ts("created_at").notNull().$defaultFn(now),
  processedAt: ts("processed_at"),
});

/** Identity links across connected sources (PRD §6.6). */
export const identityLinks = sqliteTable(
  "identity_links",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").$type<IdentityProvider>().notNull(),
    externalId: text("external_id").notNull(),
    externalLogin: text("external_login"),
    email: text("email"),
    status: text("status").$type<IdentityLinkStatus>().notNull().default("suggested"),
    /** oauth | admin | user | auto_match */
    source: text("source").notNull().default("user"),
    linkedAt: ts("linked_at"),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("identity_links_user_provider_uq").on(t.workspaceId, t.userId, t.provider),
    index("identity_links_external_idx").on(t.provider, t.externalId),
  ],
);

/** Selected source scopes per connection and project (PRD §16.3 source_scopes, §8.1.8). */
export const connectorScopes = sqliteTable(
  "connector_scopes",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connectorConnections.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").$type<ScopeType>().notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    isExcluded: integer("is_excluded", { mode: "boolean" }).notNull().default(false),
    backfillFrom: ts("backfill_from"),
    cursor: text("cursor", { mode: "json" }).$type<Record<string, unknown>>(),
    status: text("status").notNull().default("selected"),
    lastSyncRequestedAt: ts("last_sync_requested_at"),
    lastSyncedAt: ts("last_synced_at"),
    itemCount: integer("item_count").notNull().default(0),
    lastError: text("last_error"),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("connector_scopes_uq").on(t.connectionId, t.projectId, t.externalId),
    index("connector_scopes_project_idx").on(t.projectId),
  ],
);

/** Materialised conflicts between incompatible claims (PRD §8.1.4, §8.6). */
export const conflicts = sqliteTable(
  "conflicts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Normalised subject key shared by the conflicting items. */
    subjectKey: text("subject_key").notNull(),
    topicType: text("topic_type").$type<TopicType>().notNull().default("delivery_status"),
    status: text("status").$type<ConflictStatus>().notNull().default("open"),
    memberIds: text("member_ids", { mode: "json" }).$type<string[]>().notNull(),
    canonicalItemId: text("canonical_item_id"),
    rationale: text("rationale"),
    /** Label of the authority rule when auto-resolved, e.g. "canonical source". */
    autoRule: text("auto_rule"),
    resolvedBy: text("resolved_by"),
    resolvedAt: ts("resolved_at"),
    bountyId: text("bounty_id"),
    version: integer("version").notNull().default(1),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("conflicts_project_subject_uq").on(t.projectId, t.subjectKey),
    index("conflicts_project_status_idx").on(t.projectId, t.status),
  ],
);

export type IdentityLinkRow = typeof identityLinks.$inferSelect;
export type ConnectorScopeRow = typeof connectorScopes.$inferSelect;
export type ConflictRow = typeof conflicts.$inferSelect;
export type PointsLedgerRow = typeof pointsLedger.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type UserRow = typeof users.$inferSelect;
