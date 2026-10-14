import type { AskThread } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { PageHeader } from "@/components/layout/page-header";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  AiSparkleIcon,
  ChatIcon,
  WarningIcon,
} from "@/components/ui/icons";
import {
  threadQuery,
  threadsQuery,
  useCreateThread,
  useDeleteThread,
  useSendThreadMessage,
} from "@/features/ask/api/threads.queries";
import { AnswerCard } from "@/features/ask/components/answer-card";
import { AskForm } from "@/features/ask/components/ask-form";
import { ThreadList } from "@/features/ask/components/thread-list";

const STATUS_COPY: Record<string, string> = {
  retrieving: "Searching this project's sources…",
};

/** Ask as private conversations: each thread keeps its cited answers; answers stream in as they are built. */
export function AskPage() {
  const { projectId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = searchParams.get("thread");

  const threads = useQuery(threadsQuery());
  const projectThreads = (threads.data ?? []).filter((thread) => thread.projectId === projectId);
  const activeThread = useQuery({ ...threadQuery(activeId ?? ""), enabled: activeId !== null });

  const createThread = useCreateThread();
  const deleteThread = useDeleteThread();
  const send = useSendThreadMessage(projectId);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AskThread | null>(null);

  const selectThread = (threadId: string | null) =>
    setSearchParams(threadId ? { thread: threadId } : {}, { replace: true });

  const ask = async (question: string) => {
    let threadId = activeId;
    if (threadId === null) {
      const thread = await createThread.mutateAsync({ projectId, title: question.slice(0, 80) });
      threadId = thread.id;
      selectThread(threadId);
    }
    try {
      await send.mutateAsync({ threadId, question, onStatus: setStatus });
    } finally {
      setStatus(null);
    }
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    deleteThread.mutate(id, {
      onSuccess: () => {
        if (id === activeId) selectThread(null);
      },
      onSettled: () => setPendingDelete(null),
    });
  };

  const busy = createThread.isPending || send.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        level={2}
        title="Ask ContextOS"
        description="Answers are built only from this project's sources and cite the passages they rest on. When the evidence is thin, it says so."
      />

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside aria-label="Conversations">
          {threads.isPending ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-10 rounded-full" />
              <Skeleton className="h-14 rounded-t-xl" />
              <Skeleton className="h-14 rounded-b-xl" />
            </div>
          ) : threads.isError ? (
            <Banner tone="error" icon={<WarningIcon />} title="Could not load conversations" description={threads.error.message} />
          ) : (
            <ThreadList threads={projectThreads} activeId={activeId} onSelect={selectThread} onDelete={setPendingDelete} />
          )}
        </aside>

        <section className="space-y-6" aria-live="polite">
          {activeId === null ? (
            <Empty className="border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <AiSparkleIcon />
                </EmptyMedia>
                <EmptyTitle>Start a conversation</EmptyTitle>
                <EmptyDescription>
                  Ask about decisions, current state, people or terms. The first question names the
                  conversation; follow-ups stay together with their evidence.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : activeThread.isPending ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : activeThread.isError ? (
            <Banner
              tone="error"
              icon={<WarningIcon />}
              title="Could not open this conversation"
              description={activeThread.error.message}
              actions={<Button variant="ghost" size="sm" onClick={() => selectThread(null)}>Start a new one</Button>}
            />
          ) : activeThread.data.messages.length === 0 && !busy ? (
            <Empty className="border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ChatIcon />
                </EmptyMedia>
                <EmptyTitle>{activeThread.data.title}</EmptyTitle>
                <EmptyDescription>No answers yet. Ask below.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-4">
              {activeThread.data.messages.map((answer) => (
                <AnswerCard key={answer.id} answer={answer} />
              ))}
            </div>
          )}

          {busy ? (
            <div className="flex items-center gap-3 rounded-xl bg-ai-container/40 px-4 py-3 text-sm" role="status">
              <Spinner className="text-ai" />
              {status ? (STATUS_COPY[status] ?? status) : "Starting the conversation…"}
            </div>
          ) : null}

          {send.isError ? (
            <Banner tone="error" icon={<WarningIcon />} title="Couldn't get an answer" description={send.error.message} />
          ) : null}

          <AskForm isPending={busy} onSubmit={(question) => void ask(question)} />
        </section>
      </div>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this conversation?</DialogTitle>
            <DialogDescription>
              "{pendingDelete?.title}" and its saved answers are removed for good. Sources and the
              project hub are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleteThread.isPending} onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
