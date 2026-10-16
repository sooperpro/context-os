import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ContextItemSchema } from "./context.js";
import { CreateProjectInputSchema } from "./project.js";
import { CreateSourceInputSchema, SOURCE_CONTENT_MAX_LENGTH } from "./source.js";

describe("CreateProjectInputSchema", () => {
  it("trims and validates", () => {
    expect(CreateProjectInputSchema.parse({ name: "  Atlas  " })).toEqual({ name: "Atlas" });
    expect(CreateProjectInputSchema.safeParse({ name: " " }).success).toBe(false);
  });
});

describe("CreateSourceInputSchema", () => {
  it("accepts a normalized manual source", () => {
    const parsed = CreateSourceInputSchema.parse({
      kind: "document",
      title: "ADR-0001",
      content: "We chose SQLite.",
      url: "https://example.com/adr-1",
      sourceCreatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(parsed.kind).toBe("document");
  });

  it("rejects oversized content and bad urls", () => {
    expect(
      CreateSourceInputSchema.safeParse({
        kind: "note",
        title: "x",
        content: "y".repeat(SOURCE_CONTENT_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      CreateSourceInputSchema.safeParse({ kind: "note", title: "x", content: "y", url: "nope" })
        .success,
    ).toBe(false);
  });
});

describe("ContextItemSchema", () => {
  it("discriminates on kind", () => {
    const common = {
      id: "4fd5c1b6-3f9a-4a2b-9c6e-2e0b1f1a9c11",
      projectId: "4fd5c1b6-3f9a-4a2b-9c6e-2e0b1f1a9c12",
      title: "Use SQLite",
      summary: "The team chose SQLite for the pilot.",
      eventAt: null,
      asOf: null,
      verification: "inferred",
      confidence: "high",
      conflictsWith: [],
      evidence: [],
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    const decision = ContextItemSchema.parse({
      ...common,
      kind: "decision",
      data: {
        rationale: "Simplicity",
        alternatives: ["Postgres"],
        participants: [],
        consequences: null,
        decisionStatus: "decided",
      },
    });
    expect(decision.kind).toBe("decision");
    expect(ContextItemSchema.safeParse({ ...common, kind: "decision", data: {} }).success).toBe(
      false,
    );
    const json = z.toJSONSchema(ContextItemSchema);
    expect(json.anyOf ?? json.oneOf).toHaveLength(11);
  });
});
