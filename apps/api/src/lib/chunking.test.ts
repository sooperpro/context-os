import { describe, expect, it } from "vitest";
import { chunkText } from "./chunking.js";

describe("chunkText", () => {
  it("packs paragraphs without crossing boundaries", () => {
    const text = ["Para one.", "Para two.", "Para three."].join("\n\n");
    const chunks = chunkText(text, { maxChars: 22 });
    expect(chunks.map((c) => c.content)).toEqual(["Para one.\n\nPara two.", "Para three."]);
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1]);
  });

  it("splits oversized paragraphs on sentences", () => {
    const text = "First sentence here. Second sentence here. Third sentence here.";
    const chunks = chunkText(text, { maxChars: 45 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.content).join(" ")).toBe(text);
  });

  it("returns no chunks for blank input", () => {
    expect(chunkText("  \n\n ")).toEqual([]);
  });
});
