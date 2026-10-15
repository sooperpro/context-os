import { buildApiUrl, throwApiError } from "@/lib/api-client";

export interface ServerEvent {
  event: string;
  data: string;
  id?: string;
}

/** Parse one `event:` / `data:` block of a text/event-stream body. Comment lines are ignored. */
export function parseServerEventBlock(block: string): ServerEvent | null {
  let event = "message";
  let id: string | undefined;
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    else if (field === "id") id = value;
  }
  if (data.length === 0) return null;
  return { event, data: data.join("\n"), id };
}

/** Split a stream of text chunks into server events, tolerating events that span chunk boundaries. */
export async function* parseServerEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const parsed = parseServerEventBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (parsed) yield parsed;
        boundary = buffer.indexOf("\n\n");
      }
    }
    const tail = parseServerEventBlock(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

interface StreamOptions {
  method?: "POST" | "GET";
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Open a server-sent event stream against the API with the same base URL and session cookie as
 * `apiRequest`. Non-2xx responses throw the server's error envelope before any event is read.
 */
export async function* streamServerEvents(
  path: string,
  { method = "POST", body, signal }: StreamOptions = {},
): AsyncGenerator<ServerEvent> {
  const response = await fetch(buildApiUrl(path), {
    method,
    headers: {
      Accept: "text/event-stream",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!response.ok) await throwApiError(response);
  if (!response.body) throw new Error("The server returned no event stream");
  yield* parseServerEvents(response.body);
}
