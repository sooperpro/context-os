import type { TutorialDraft } from "../modules/learning/tutorial-ai.js";
import { fileURLToPath } from "node:url";
import {
  ProjectWithStatsSchema,
  SourceObjectSchema,
  type CreateSourceInput,
  type ProjectWithStats,
  type SourceObject,
} from "@contextos/shared";
import type { z } from "zod";
import { createApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import { createContainer } from "../container.js";
import { createDb } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";
import type { GeminiClient, StructuredGenerationRequest } from "../lib/gemini.js";
import { logger } from "../lib/logger.js";
import type { Mailer } from "../lib/mailer.js";
import type { AnswerOutput } from "../modules/ask/answer.schema.js";
import type { ExtractionOutput } from "../modules/context/extraction.schema.js";
import type { OverviewOutput } from "../modules/hub/overview.js";
import type { BragDocOutput } from "../modules/platform/brag-doc.js";

export const SAMPLE_SOURCE = {
  kind: "document",
  title: "ADR-0007: Move billing to the ledger service",
  author: "Priya Shah",
  url: "https://wiki.example.com/adr-7",
  sourceCreatedAt: "2026-03-04T10:00:00.000Z",
  content: `# ADR-0007: Move billing to the ledger service

Status: Accepted on 2026-03-04.

## Context

Billing logic currently lives inside the monolith and shares a database with checkout. Priya Shah owns the billing area. The checkout service depends on billing for invoice totals.

## Decision

We will move billing into a dedicated ledger service backed by Postgres. We considered keeping billing in the monolith and using a third-party billing SaaS, but rejected both because of audit requirements.

## Consequences

Checkout must call the ledger API instead of reading the shared table. Migration of historical invoices is planned for Q2 2026 and is currently blocked on the data retention review.`,
} satisfies CreateSourceInput;

export const SAMPLE_EXTRACTION: ExtractionOutput = {
  decisions: [
    {
      title: "Move billing into a dedicated ledger service",
      summary: "Billing moves out of the monolith into a ledger service backed by Postgres.",
      rationale: "Audit requirements ruled out the alternatives.",
      alternatives: ["Keep billing in the monolith", "Third-party billing SaaS"],
      participants: ["Priya Shah"],
      decisionStatus: "decided",
      decidedAt: "2026-03-04",
      evidenceQuote: "We will move billing into a dedicated ledger service backed by Postgres.",
      confidence: "high",
    },
  ],
  events: [
    {
      title: "ADR-0007 accepted",
      summary: "The decision record was accepted.",
      category: "milestone",
      occurredAt: "2026-03-04",
      evidenceQuote: "Status: Accepted on 2026-03-04.",
      confidence: "high",
    },
  ],
  statusClaims: [
    {
      title: "Historical invoice migration",
      summary: "Migration of historical invoices is blocked on the data retention review.",
      state: "blocked",
      asOf: "2026-03-04",
      evidenceQuote: "is currently blocked on the data retention review",
      confidence: "high",
    },
  ],
  people: [
    {
      name: "Priya Shah",
      role: "Billing owner",
      owns: ["billing"],
      evidenceQuote: "Priya Shah owns the billing area.",
      confidence: "high",
    },
  ],
  components: [
    {
      name: "Ledger service",
      summary: "Dedicated billing service backed by Postgres.",
      componentType: "service",
      evidenceQuote: "a dedicated ledger service backed by Postgres",
      confidence: "high",
    },
  ],
  dependencies: [
    {
      from: "Checkout service",
      to: "Billing",
      relation: "depends_on",
      summary: "Checkout depends on billing for invoice totals.",
      evidenceQuote: "The checkout service depends on billing for invoice totals.",
      confidence: "high",
    },
  ],
  terms: [
    {
      term: "Ledger service",
      definition: "The dedicated service that owns billing records.",
      evidenceQuote: "dedicated ledger service",
      confidence: "medium",
    },
  ],
};

export const EMPTY_EXTRACTION: ExtractionOutput = {
  decisions: [],
  events: [],
  statusClaims: [],
  people: [],
  components: [],
  dependencies: [],
  terms: [],
};

export const SAMPLE_OVERVIEW: OverviewOutput = {
  whatItIs: { text: "A billing system being split out of the monolith.", refs: [1] },
  problem: { text: "Audit requirements need a dedicated ledger.", refs: [1] },
  users: { text: "The sources do not establish who the users are.", refs: [] },
  howItWorks: { text: "Checkout calls the ledger service.", refs: [1] },
  currentFocus: { text: "Invoice migration is blocked on the retention review.", refs: [2] },
  keyUnknowns: ["Who the end users are"],
};

export const SAMPLE_ANSWER: AnswerOutput = {
  answer: "Billing is moving into a dedicated ledger service backed by Postgres [1].",
  confidence: "high",
  rationale: "The ADR states the decision explicitly.",
  timelineContext: "Accepted on 2026-03-04.",
  currentState: { statement: "Invoice migration is blocked.", asOf: "2026-03-04" },
  uncertainties: [],
  citations: [{ ref: 1, claim: "Billing moves into a ledger service" }],
  relatedItemRefs: [1, 2, 42],
};

/** A tutorial draft as the model would return it (sources cited by number). */
export const SAMPLE_TUTORIAL: TutorialDraft = {
  title: "How billing moves to Kafka",
  summary:
    "Billing events are moving from the batch job to **Kafka**. This explains why and what changes for you.",
  objectives: ["Explain why billing moved to Kafka", "Name who owns the billing service"],
  lessons: [
    {
      title: "Why we changed",
      minutes: 5,
      body: "## Why we changed\n\nThe nightly batch job was **too slow** for real-time invoices.\n\n### Key points\n\n- Kafka carries billing events\n- Invoices update in minutes",
      sources: [1],
    },
    {
      title: "Who owns what",
      minutes: 4,
      body: "## Owners\n\n| Area | Owner |\n| --- | --- |\n| Billing service | Platform team |",
      sources: [1],
    },
  ],
  questions: [
    {
      prompt: "Why did billing move to Kafka?",
      options: [
        "The batch job was too slow",
        "Kafka is cheaper",
        "Legal asked for it",
        "No reason",
      ],
      correctIndex: 0,
      explanation: "The batch job couldn't produce real-time invoices.",
      source: 1,
    },
    {
      prompt: "What carries billing events now?",
      options: ["A cron job", "Kafka", "Email", "Spreadsheets"],
      correctIndex: 1,
      explanation: "Billing events are published to Kafka.",
      source: 1,
    },
  ],
};

export const SAMPLE_BRAG_DOC: BragDocOutput = {
  narrative: "During this period I resolved knowledge flags and verified corrections [F1].",
  highlights: ["Verified correction accepted [F1]"],
};

export interface FakeGeminiOptions {
  bragDoc?: BragDocOutput;
  extraction?:
    ExtractionOutput | ((request: StructuredGenerationRequest<z.ZodType>) => ExtractionOutput);
  overview?: OverviewOutput;
  answer?: AnswerOutput;
  tutorial?: TutorialDraft;
  /** When set, every generateStructured call rejects with this error. */
  failWith?: Error;
  /** When set, embed() rejects with this error (retrieval must degrade gracefully). */
  embedFailWith?: Error;
}

export interface FakeGemini extends GeminiClient {
  calls: Array<StructuredGenerationRequest<z.ZodType>>;
  readonly embedCalls: number;
}

/** Deterministic 8-dim vector from character statistics, so equal texts match exactly. */
export function fakeVector(text: string): number[] {
  const vector = new Array<number>(8).fill(0);
  for (let i = 0; i < text.length; i++) {
    const idx = i % 8;
    vector[idx] = (vector[idx] ?? 0) + text.charCodeAt(i) / 1000;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

/** Stand-in for Gemini: canned structured outputs by purpose, validated against the schema. */
export function createFakeGemini(options: FakeGeminiOptions = {}): FakeGemini {
  const calls: Array<StructuredGenerationRequest<z.ZodType>> = [];
  let embedCalls = 0;
  return {
    model: "fake-model",
    embeddingModel: "fake-embedding",
    calls,
    get embedCalls() {
      return embedCalls;
    },
    generateStructured(request) {
      calls.push(request);
      if (options.failWith) return Promise.reject(options.failWith);
      let output: unknown;
      switch (request.purpose) {
        case "extract_context":
          output =
            typeof options.extraction === "function"
              ? options.extraction(request)
              : (options.extraction ?? SAMPLE_EXTRACTION);
          break;
        case "hub_overview":
          output = options.overview ?? SAMPLE_OVERVIEW;
          break;
        case "ask":
          output = options.answer ?? SAMPLE_ANSWER;
          break;
        case "tutorial":
          output = options.tutorial ?? SAMPLE_TUTORIAL;
          break;
        case "brag_doc":
          output = options.bragDoc ?? SAMPLE_BRAG_DOC;
          break;
        default:
          return Promise.reject(
            new Error(`Fake Gemini: unexpected purpose ${String(request.purpose)}`),
          );
      }
      return Promise.resolve(request.schema.parse(output));
    },
    embed(texts) {
      embedCalls += 1;
      if (options.embedFailWith) return Promise.reject(options.embedFailWith);
      return Promise.resolve(texts.map(fakeVector));
    },
  };
}

const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));

/** Fully wired app + container on an in-memory SQLite database; worker is not started. */
export function createTestApp<G extends GeminiClient = FakeGemini>(
  options: { gemini?: G; env?: NodeJS.ProcessEnv; mailer?: Mailer } = {},
) {
  const env = loadEnv({
    ...process.env,
    AUTH_SECRET: undefined,
    SMTP_URL: undefined,
    MICROSOFT_CLIENT_ID: undefined,
    MICROSOFT_CLIENT_SECRET: undefined,
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    CONNECTOR_TOKEN_ENCRYPTION_KEY: undefined,
    ...options.env,
    NODE_ENV: "test",
    AUTH_MODE: options.env?.AUTH_MODE ?? "development",
    DATABASE_URL: ":memory:",
  });
  const database = createDb(env.DATABASE_URL);
  runMigrations(database.db, MIGRATIONS_DIR);
  const gemini = (options.gemini ?? createFakeGemini()) as G;
  const container = createContainer({
    env,
    db: database.db,
    gemini,
    logger,
    mailer: options.mailer,
  });
  const app = createApp({ env, container });
  return {
    app,
    container,
    gemini,
    env,
    /** Run queued jobs to completion (synchronously in-process). */
    drain: () => container.worker.drain(),
    close: database.close,
  };
}

export type TestApp = ReturnType<typeof createTestApp<FakeGemini>>;

export function jsonRequest(body: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function createProject(
  app: TestApp["app"],
  name = "Atlas",
): Promise<ProjectWithStats> {
  const res = await app.request(
    "/api/v1/projects",
    jsonRequest({ name, description: "Pilot project" }),
  );
  if (res.status !== 201)
    throw new Error(`createProject failed: ${res.status} ${await res.text()}`);
  return ProjectWithStatsSchema.parse(await res.json());
}

export async function addSource(
  app: TestApp["app"],
  projectId: string,
  input: CreateSourceInput = SAMPLE_SOURCE,
): Promise<SourceObject> {
  const res = await app.request(`/api/v1/projects/${projectId}/sources`, jsonRequest(input));
  if (res.status !== 201) throw new Error(`addSource failed: ${res.status} ${await res.text()}`);
  return SourceObjectSchema.parse(await res.json());
}
