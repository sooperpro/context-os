import type { Answer, AnswerConfidence } from "@contextos/shared";
import { AlertTriangleIcon, ArrowUpRightIcon, CheckIcon, HelpCircleIcon, InfoIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useMatch } from "react-router";
import { useAssistant } from "@/components/layout/assistant-context";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { AiSparkleIcon, CloseIcon, HubFilledIcon, SendIcon } from "@/components/ui/icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip } from "@/components/ui/status-chip";
import { useAskQuestion } from "@/features/ask/api/ask.queries";

const SUGGESTIONS = [
  "What was decided most recently, and why?",
  "What is blocked right now?",
  "Who owns this, and what is still an open question?",
];

const CONFIDENCE: Record<
  AnswerConfidence,
  { label: string; tone: "success" | "info" | "warning"; icon: React.ReactNode }
> = {
  high: { label: "Verified · sources agree", tone: "success", icon: <CheckIcon /> },
  medium: { label: "Partly verified", tone: "info", icon: <InfoIcon /> },
  low: { label: "Low confidence", tone: "warning", icon: <AlertTriangleIcon /> },
  insufficient: { label: "Not enough evidence", tone: "warning", icon: <HelpCircleIcon /> },
};

/**
 * Context Bot, the assistant on every page. Answers only from the current project's sources,
 * through the same Ask API as the Ask page, and keeps every citation. Outside a project it says so
 * instead of guessing.
 */
export function AssistantPanel() {
  const { open, closeAssistant, subscribeToQueries } = useAssistant();
  const match = useMatch("/projects/:projectId/*");
  const projectId = match?.params.projectId ?? "";
  const ask = useAskQuestion(projectId);

  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState<Answer[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { mutate, isPending } = ask;
  const submit = useCallback(
    (question: string) => {
      const text = question.trim();
      if (text.length < 3 || !projectId || isPending) return;
      mutate(
        { question: text },
        { onSuccess: (answer) => setThread((current) => [answer, ...current]) },
      );
      setDraft("");
    },
    [projectId, isPending, mutate],
  );

  // Text handed over from the top-bar search: ask it in a project, otherwise prefill the box.
  useEffect(
    () => subscribeToQueries((query) => (projectId ? submit(query) : setDraft(query))),
    [subscribeToQueries, projectId, submit],
  );

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(draft);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-18 shrink-0 items-center gap-3 px-5">
        <span
          aria-hidden
          className="grid size-9 place-items-center rounded-[30%] bg-ai-container text-on-ai-container"
        >
          <HubFilledIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-base font-semibold">Context Bot</h2>
          <p className="truncate text-xs text-on-surface-variant">
            {projectId ? "Answers from this project's sources" : "Open a project to ask"}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close Context Bot" onClick={closeAssistant}>
          <CloseIcon />
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1 px-5">
        <div className="flex flex-col gap-4 pb-4" aria-live="polite">
          {ask.isPending ? (
            <div className="flex items-center gap-3 rounded-xl bg-ai-container/40 px-4 py-3 text-sm">
              <Spinner className="text-ai" />
              Searching this project's sources…
            </div>
          ) : null}
          {ask.isError ? (
            <Banner
              tone="error"
              icon={<CloseIcon />}
              title="Couldn't get an answer"
              description={ask.error.message}
              actions={
                <Button variant="ghost" size="sm" onClick={() => submit(ask.variables.question)}>
                  Retry
                </Button>
              }
            />
          ) : null}

          {thread.map((answer) => (
            <AssistantAnswer key={answer.id} answer={answer} />
          ))}

          {thread.length === 0 && !ask.isPending ? (
            <div className="flex flex-col gap-3 pt-2">
              <p className="text-sm text-on-surface">
                {projectId
                  ? "Ask about decisions, current state, people or terms. Every answer cites the passages it rests on, and says when the evidence is thin."
                  : "Context Bot answers only from a project's sources, so it needs a project open. Pick one from Projects, then ask here."}
              </p>
              {projectId ? (
                <div className="flex flex-col items-start gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <Chip key={suggestion} variant="ai" onClick={() => submit(suggestion)}>
                      <AiSparkleIcon />
                      {suggestion}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <form onSubmit={onSubmit} className="shrink-0 border-t border-outline-variant/60 p-4">
        <label htmlFor="assistant-input" className="sr-only">
          Ask Context Bot
        </label>
        <div className="flex items-end gap-2 rounded-2xl bg-field px-4 py-2 focus-within:ring-3 focus-within:ring-ring/50">
          <textarea
            id="assistant-input"
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={!projectId}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit(draft);
              }
            }}
            placeholder={projectId ? "Ask about this project…" : "Open a project first"}
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-on-surface-variant disabled:opacity-60"
          />
          <Button
            type="submit"
            variant="ai"
            size="icon-sm"
            aria-label="Send"
            disabled={!projectId || draft.trim().length < 3 || ask.isPending}
          >
            <SendIcon />
          </Button>
        </div>
        <p className="mt-2 text-xs text-on-surface-variant">
          Enter to send · Shift+Enter for a new line · ⌘J toggles Context Bot
        </p>
      </form>
    </div>
  );
}

function AssistantAnswer({ answer }: { answer: Answer }) {
  const confidence = CONFIDENCE[answer.confidence];
  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-card p-4 text-sm">
      <p className="font-medium text-on-surface">{answer.question}</p>
      <StatusChip tone={confidence.tone} icon={confidence.icon} className="self-start">
        {confidence.label}
      </StatusChip>
      <p className="whitespace-pre-wrap text-on-surface">{answer.answer}</p>
      {answer.uncertainties.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-xs text-on-surface-variant">
          {answer.uncertainties.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {answer.citations.length > 0 ? (
        <ol className="flex flex-col gap-1 text-xs text-on-surface-variant">
          {answer.citations.map((citation) => (
            <li key={citation.ref} className="flex gap-2">
              <span className="font-mono">[{citation.ref}]</span>
              <span className="truncate">{citation.sourceTitle}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <Link
        to={`/projects/${answer.projectId}/ask`}
        className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
      >
        Open in Ask with full evidence <ArrowUpRightIcon className="size-3.5" aria-hidden />
      </Link>
    </article>
  );
}
