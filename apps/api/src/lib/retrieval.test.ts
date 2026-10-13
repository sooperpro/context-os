import { describe, expect, it } from "vitest";
import {
  bufferToFloat32,
  buildFtsQuery,
  cosineSimilarity,
  float32ToBuffer,
  reciprocalRankFusion,
} from "./retrieval.js";

describe("retrieval helpers", () => {
  it("round-trips vectors through buffers", () => {
    const vector = [0.1, 0.2, -0.3];
    const back = bufferToFloat32(float32ToBuffer(vector));
    expect([...back].map((v) => Number(v.toFixed(5)))).toEqual(vector);
    expect(cosineSimilarity(back, back)).toBeCloseTo(1, 5);
  });

  it("fuses rankings so ids in both lists win", () => {
    expect(
      reciprocalRankFusion([
        ["a", "b", "c"],
        ["c", "a", "d"],
      ]),
    ).toEqual(["a", "c", "b", "d"]);
  });

  it("builds a safe FTS5 query", () => {
    expect(buildFtsQuery('Why did we choose the "ledger" service?')).toBe(
      '"choose" OR "ledger" OR "service"',
    );
    expect(buildFtsQuery("the a of")).toBeNull();
  });
});
