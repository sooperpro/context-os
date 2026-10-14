import { describe, expect, it } from "vitest";
import { parseServerEventBlock, parseServerEvents } from "@/lib/sse";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const events = [];
  for await (const event of parseServerEvents(stream)) events.push(event);
  return events;
}

describe("server-sent event parsing", () => {
  it("parses event, id and multi-line data, ignoring comments", () => {
    expect(parseServerEventBlock(": keep-alive\nevent: answer\nid: a1\ndata: {\"a\":1}\ndata: more")).toEqual({
      event: "answer",
      id: "a1",
      data: '{"a":1}\nmore',
    });
    expect(parseServerEventBlock(": only a comment")).toBeNull();
  });

  it("reassembles events split across chunks and handles CRLF", async () => {
    const events = await collect(
      streamOf(['event: status\ndata: {"state":"retr', 'ieving"}\n\nevent: ans', "wer\r\ndata: {}\r\n\r\nevent: done\ndata: {}\n\n"]),
    );
    expect(events.map((event) => event.event)).toEqual(["status", "answer", "done"]);
    expect(events[0]?.data).toBe('{"state":"retrieving"}');
  });

  it("flushes a final event without a trailing blank line", async () => {
    const events = await collect(streamOf(["event: done\ndata: {}"]));
    expect(events).toHaveLength(1);
  });
});
