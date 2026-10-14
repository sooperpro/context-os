import { afterEach, describe, expect, it, vi } from "vitest";
import { sendThreadMessage } from "@/features/ask/api/threads.api";
import { ApiClientError } from "@/lib/api-client";

const answer = {
  id: "55555555-5555-4555-8555-555555555555",
  projectId: "11111111-1111-4111-8111-111111111111",
  question: "Why events?",
  answer: "Because nightly exports were too slow.",
  confidence: "high",
  rationale: null,
  currentState: null,
  timelineContext: null,
  uncertainties: [],
  citations: [],
  relatedItems: [],
  model: "gemini",
  createdAt: "2026-10-14T00:00:00.000Z",
};

function sse(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("sendThreadMessage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports status events and resolves with the streamed answer", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sse(`event: status\ndata: {"state":"retrieving"}\n\nevent: answer\nid: a\ndata: ${JSON.stringify(answer)}\n\nevent: done\ndata: {}\n\n`),
    );
    const onStatus = vi.fn();
    const result = await sendThreadMessage("t1", "Why events?", { onStatus });
    expect(onStatus).toHaveBeenCalledWith("retrieving");
    expect(result.answer).toBe("Because nightly exports were too slow.");
  });

  it("rejects with the server's error event", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sse(`event: status\ndata: {"state":"retrieving"}\n\nevent: error\ndata: {"code":"ANSWER_UNAVAILABLE","message":"The answer could not be generated. Please try again."}\n\n`),
    );
    await expect(sendThreadMessage("t1", "Why?")).rejects.toMatchObject({ code: "ANSWER_UNAVAILABLE" });
  });

  it("rejects with the error envelope when the request itself fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Conversation not found" } }), { status: 404 }),
    );
    await expect(sendThreadMessage("missing", "Why?")).rejects.toBeInstanceOf(ApiClientError);
  });
});
