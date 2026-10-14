import type { AskThread, AskThreadDetail } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectKeys } from "@/features/projects/api/keys";
import {
  createThread,
  deleteThread,
  getThread,
  listThreads,
  sendThreadMessage,
  type CreateThreadInput,
  type SendMessageOptions,
} from "./threads.api";

/** Threads are private to the caller and span projects, so they live outside the project keys. */
export const threadKeys = {
  all: ["ask", "threads"] as const,
  list: () => [...threadKeys.all, "list"] as const,
  detail: (threadId: string) => [...threadKeys.all, "detail", threadId] as const,
};

export const threadsQuery = () =>
  queryOptions({ queryKey: threadKeys.list(), queryFn: ({ signal }) => listThreads(signal) });

export const threadQuery = (threadId: string) =>
  queryOptions({
    queryKey: threadKeys.detail(threadId),
    queryFn: ({ signal }) => getThread(threadId, signal),
  });

export function useCreateThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateThreadInput) => createThread(input),
    onSuccess: (thread) => {
      queryClient.setQueryData<AskThread[]>(threadKeys.list(), (current) => [thread, ...(current ?? [])]);
      queryClient.setQueryData<AskThreadDetail>(threadKeys.detail(thread.id), { ...thread, messages: [] });
    },
  });
}

export function useDeleteThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => deleteThread(threadId),
    onSuccess: (_result, threadId) => {
      queryClient.setQueryData<AskThread[]>(threadKeys.list(), (current) =>
        (current ?? []).filter((thread) => thread.id !== threadId),
      );
      queryClient.removeQueries({ queryKey: threadKeys.detail(threadId) });
    },
  });
}

/** Streams an answer into the thread; the thread cache and the project hub refresh on success. */
export function useSendThreadMessage(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, question, ...options }: { threadId: string; question: string } & SendMessageOptions) =>
      sendThreadMessage(threadId, question, options),
    onSuccess: async (answer, { threadId }) => {
      const key = threadKeys.detail(threadId);
      // A fetch started before the answer was saved would land later and drop it: cancel it first,
      // show the answer immediately, then confirm against the server (which has saved it by now).
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<AskThreadDetail>(key, (current) =>
        current && !current.messages.some((message) => message.id === answer.id)
          ? { ...current, messages: [...current.messages, answer] }
          : current,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: projectKeys.hub(projectId) }),
      ]);
    },
  });
}
