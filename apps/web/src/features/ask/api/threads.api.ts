import {
  AnswerSchema,
  AskThreadDetailSchema,
  AskThreadListSchema,
  AskThreadSchema,
  ThreadErrorEventSchema,
  ThreadStatusEventSchema,
  type Answer,
  type AskThread,
  type AskThreadDetail,
} from "@contextos/shared";
import { z } from "zod";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { streamServerEvents } from "@/lib/sse";

export interface CreateThreadInput {
  projectId: string;
  title: string;
  sourceId?: string;
}

export const createThread = (input: CreateThreadInput): Promise<AskThread> =>
  apiRequest("/v1/ask/threads", { method: "POST", body: input, schema: AskThreadSchema });

export const listThreads = async (signal?: AbortSignal): Promise<AskThread[]> =>
  (await apiRequest("/v1/ask/threads", { schema: AskThreadListSchema, signal })).items;

export const getThread = (threadId: string, signal?: AbortSignal): Promise<AskThreadDetail> =>
  apiRequest(`/v1/ask/threads/${threadId}`, { schema: AskThreadDetailSchema, signal });

export const deleteThread = (threadId: string): Promise<void> =>
  apiRequest(`/v1/ask/threads/${threadId}`, { method: "DELETE", schema: z.undefined() });

export interface SendMessageOptions {
  signal?: AbortSignal;
  /** Called for each `status` event while the answer is being built. */
  onStatus?: (state: string) => void;
}

/**
 * Ask in a thread. The API streams `status` events, then one `answer` (the full cited answer) and
 * `done`, or an `error`. Resolves with the answer; rejects with the server's error message.
 */
export async function sendThreadMessage(
  threadId: string,
  question: string,
  { signal, onStatus }: SendMessageOptions = {},
): Promise<Answer> {
  for await (const event of streamServerEvents(`/v1/ask/threads/${threadId}/messages`, {
    body: { question },
    signal,
  })) {
    if (event.event === "status") {
      onStatus?.(ThreadStatusEventSchema.parse(JSON.parse(event.data)).state);
    } else if (event.event === "answer") {
      return AnswerSchema.parse(JSON.parse(event.data));
    } else if (event.event === "error") {
      const error = ThreadErrorEventSchema.parse(JSON.parse(event.data));
      throw new ApiClientError(502, error.code, error.message);
    }
  }
  throw new ApiClientError(502, "STREAM_ENDED", "The answer stream ended without an answer");
}
