import { describe, expect, it } from "vitest";
import { sectionsOf } from "../context/extraction.js";
import {
  addSource,
  createFakeGemini,
  createProject,
  createTestApp,
  fakeVector,
} from "../../test/helpers.js";
import { createVectorIndex } from "./vector-index.js";

describe("large documents and fast retrieval", () => {
  it("reads a long source in sections and combines what each section found", async () => {
    const paragraph = "A paragraph about the billing ledger and its owners.\n\n";
    const text = paragraph.repeat(6_000); // ~330k characters
    const sections = sectionsOf(text);
    expect(sections.length).toBe(3);
    expect(sections.join("")).toBe(text);
    expect(sections.every((section) => section.length <= 120_000)).toBe(true);
    // Cuts fall on paragraph breaks.
    expect(sections[0]!.endsWith("owners.")).toBe(true);

    const gemini = createFakeGemini();
    const t = createTestApp({ gemini, env: { EXTRACTION_MAX_WINDOWS: "2" } });
    const project = await createProject(t.app);
    // Past the 200k-character limit for pasted sources, as a Drive import may be.
    t.container.services.sources.create(
      t.container.devActor,
      t.container.repos.projects.findByIdUnscoped(project.id)!,
      { kind: "document", title: "Ledger handbook", content: text },
    );
    await t.drain();
    const calls = gemini.calls.filter((call) => call.purpose === "extract_context");
    // Two of the three sections (the setting caps it); the rest stays searchable in chat.
    expect(calls).toHaveLength(2);
    expect(calls[0]!.prompt).toContain("part 1 of 2");
    t.close();
  });

  it("scores questions from memory and reloads when the project's documents change", async () => {
    const t = createTestApp();
    const project = await createProject(t.app);
    await addSource(t.app, project.id, {
      kind: "document",
      content: "Kafka carries billing events.",
      title: "A",
    });
    await addSource(t.app, project.id, {
      kind: "document",
      content: "The ledger stores invoices.",
      title: "B",
    });
    await t.drain();
    const index = createVectorIndex(t.container.repos.sources);
    const query = fakeVector("The ledger stores invoices.");
    const fromDb = t.container.repos.sources.listEmbeddedChunks(project.id).map((row) => row.id);
    const hits = index.search(project.id, query, 1)!;
    expect(hits).toHaveLength(1);
    expect(fromDb).toContain(hits[0]);
    const chunk = t.container.repos.sources.getChunksWithSources(hits)[0]!;
    expect(chunk.source.title).toBe("B");
    // Only sources the asker may read.
    const onlyA = new Set([
      t.container.repos.sources.list(project.id).find((row) => row.title === "A")!.id,
    ]);
    const restricted = index.search(project.id, query, 1, onlyA)!;
    expect(t.container.repos.sources.getChunksWithSources(restricted)[0]!.source.title).toBe("A");
    // A new document is picked up on the next question.
    await addSource(t.app, project.id, {
      kind: "document",
      content: "Invoices are stored by the ledger.",
      title: "C",
    });
    await t.drain();
    expect(index.search(project.id, query, 10)).toHaveLength(3);
    t.close();
  });
});
