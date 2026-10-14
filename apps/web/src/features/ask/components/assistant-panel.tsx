import type { Answer, AssistantAnswer } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAssistant } from "@/components/layout/assistant-context";
import { useDeclaredBotContext, type BotPageContext } from "@/components/layout/bot-context";
import { NAV_ITEMS } from "@/components/layout/navigation";
import { BotGlyph } from "@/components/ui/bot-glyph";
import { Button } from "@/components/ui/button";
import {
  AddTaskIcon,
  ArrowUpwardIcon,
  CheckCircleFilledIcon,
  CloseIcon,
  CloudOffIcon,
  EditSquareIcon,
  FilterAltIcon,
  FolderOpenFilledIcon,
  HomeIcon,
  PauseIcon,
  LockIcon,
  ManageSearchIcon,
  NorthEastIcon,
  OpenInFullIcon,
  RefreshIcon,
  SearchOffIcon,
} from "@/components/ui/icons";
import { Loader } from "@/components/ui/loader";
import { MetaChip } from "@/components/ui/meta-chip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SegmentedItem, SegmentedList } from "@/components/ui/segmented-list";
import { StatusChip } from "@/components/ui/status-chip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { meQuery } from "@/features/account/api/account.queries";
import { useAskWorkspace } from "@/features/ask/api/assistant.queries";
import {
  threadQuery,
  useCreateThread,
  useSendThreadMessage,
} from "@/features/ask/api/threads.queries";
import { DEFAULT_INTRO, DEFAULT_SCOPE, DEFAULT_SUGGESTIONS } from "@/features/ask/assistant-meta";
import { AnswerBody } from "@/features/ask/components/answer-card";
import { WorkspaceAnswer } from "@/features/ask/components/workspace-answer";
import { useCreateFlag } from "@/features/feedback/api/feedback.queries";
import { hubQuery } from "@/features/hub/api/hub.queries";
import { currentWorkspaceQuery } from "@/features/workspace/api/workspace.queries";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { ApiClientError } from "@/lib/api-client";
import { formatCount } from "@/lib/format";

/*
 * Context Bot, the assistant on every page (prototype bot.js). Inside a project it asks through the
 * Ask threads API, so every conversation here is also listed on the project's Ask page; "Expand"
 * opens it there. Elsewhere it answers about the workspace (`POST /v1/assistant/ask`). Answers come
 * only from sources the person can open, and say so when the evidence is thin. Pages tell it what
 * they show (`useBotContext`): chips, an intro and suggested questions, or a pause during checks.
 */

const PROJECT_PATH = /\/projects\/([^/?#]+)/;

const PROMPTS = (project: string) => [
  "What was decided most recently, and why?",
  "What is blocked or at risk right now?",
  `Who owns what in ${project}?`,
];

interface Failure {
  question: string;
  message: string;
}

export function AssistantPanel() {
  const { open, closeAssistant, subscribeToQueries } = useAssistant();
  const location = useLocation();
  const navigate = useNavigate();
  const projectId = PROJECT_PATH.exec(location.pathname)?.[1] ?? "";

  const me = useQuery(meQuery());
  const hub = useQuery({ ...hubQuery(projectId), enabled: projectId !== "" });
  const workspace = useQuery(currentWorkspaceQuery());
  // Until the role loads, the bot speaks as for everyone: an employee's defaults.
  const persona = useViewer().persona ?? "employee";
  const declared = useDeclaredBotContext();
  const askWorkspace = useAskWorkspace();
  const [workspaceThread, setWorkspaceThread] = useState<AssistantAnswer[]>([]);

  // One live conversation per project; "New conversation" forgets it (it stays on the Ask page).
  const [threadByProject, setThreadByProject] = useState<Record<string, string>>({});
  const threadId = threadByProject[projectId];
  const thread = useQuery({ ...threadQuery(threadId ?? ""), enabled: threadId !== undefined });
  const createThread = useCreateThread();
  const send = useSendThreadMessage(projectId);
  const createFlag = useCreateFlag();

  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [reported, setReported] = useState<Set<string>>(() => new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const projectName = hub.data?.project.name ?? "this project";
  const readySources = hub.data?.project.stats.readySources ?? 0;
  const messages = threadId ? (thread.data?.messages ?? []) : [];
  const busy = pending !== null;
  const inProject = projectId !== "";

  const ask = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (text.length < 3 || busy) return;
      setDraft("");
      setFailure(null);
      setPending(text);
      if (!projectId) {
        try {
          const answer = await askWorkspace.mutateAsync({
            question: text,
            page: location.pathname,
          });
          setWorkspaceThread((current) => [...current, answer]);
        } catch (error) {
          setFailure({
            question: text,
            message:
              error instanceof ApiClientError
                ? error.message
                : "The answer could not be read. Please try again.",
          });
        } finally {
          setPending(null);
        }
        return;
      }
      try {
        let id = threadByProject[projectId];
        if (!id) {
          const created = await createThread.mutateAsync({ projectId, title: text.slice(0, 80) });
          id = created.id;
          setThreadByProject((current) => ({ ...current, [projectId]: created.id }));
        }
        await send.mutateAsync({ threadId: id, question: text });
      } catch (error) {
        // Server messages are written for people; anything else (network, an unreadable response) is not.
        setFailure({
          question: text,
          message:
            error instanceof ApiClientError
              ? error.message
              : "The answer could not be read. Please try again.",
        });
      } finally {
        setPending(null);
      }
    },
    [projectId, busy, threadByProject, createThread, send, askWorkspace, location.pathname],
  );

  // Text handed over from the top-bar search: ask it in a project, otherwise prefill the box.
  useEffect(() => subscribeToQueries((query) => void ask(query)), [subscribeToQueries, ask]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, pending, failure]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  const startOver = () => {
    if (!projectId) setWorkspaceThread([]);
    setThreadByProject(({ [projectId]: _dropped, ...rest }) => rest);
    setFailure(null);
    inputRef.current?.focus();
  };

  const expand = () => {
    void navigate(`/projects/${projectId}/ask${threadId ? `?thread=${threadId}` : ""}`);
    closeAssistant();
  };

  const reportGap = (answer: Answer) =>
    createFlag.mutate(
      {
        projectId,
        targetType: "answer",
        targetId: answer.id,
        kind: "missing_context",
        comment: answer.question,
      },
      { onSuccess: () => setReported((current) => new Set(current).add(answer.id)) },
    );

  const navItem = NAV_ITEMS.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );
  // What the page told the bot, or the project, or the persona's defaults (prototype `ctxLabel`).
  const context: Required<Omit<BotPageContext, "paused">> & { paused: boolean } = {
    chips:
      declared?.chips ??
      (inProject
        ? [
            { icon: FolderOpenFilledIcon, label: projectName },
            { icon: FilterAltIcon, label: "Project sources" },
          ]
        : [
            { icon: navItem?.icon ?? HomeIcon, label: navItem?.label ?? "Home" },
            { icon: FilterAltIcon, label: DEFAULT_SCOPE[persona] },
          ]),
    suggestions:
      declared?.suggestions ?? (inProject ? PROMPTS(projectName) : DEFAULT_SUGGESTIONS[persona]),
    intro:
      declared?.intro ??
      (inProject
        ? `I can explain ${projectName}'s decisions, current state, people and terms, and point you to the sources.`
        : DEFAULT_INTRO[persona]),
    paused: declared?.paused ?? false,
  };
  const firstName = me.data?.name.split(/\s+/)[0];
  const conversationLength = inProject ? messages.length : workspaceThread.length;
  const showWelcome = conversationLength === 0 && !busy && !failure;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 pt-3.5 pr-3 pb-2 pl-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <BotGlyph size="sm" />
          <div className="min-w-0">
            <h2 className="font-heading text-base leading-6 font-medium">Context Bot</h2>
            <p className="truncate text-xs text-on-surface-variant">
              Answers from sources you can access
            </p>
          </div>
        </div>
        <div className="flex gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-on-surface-variant"
                  aria-label="New conversation"
                  disabled={(inProject ? !threadId : workspaceThread.length === 0) && !failure}
                  onClick={startOver}
                />
              }
            >
              <EditSquareIcon />
            </TooltipTrigger>
            <TooltipContent>New conversation</TooltipContent>
          </Tooltip>
          {projectId ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="hidden text-on-surface-variant medium:inline-flex"
                    aria-label="Expand to the Ask page"
                    onClick={expand}
                  />
                }
              >
                <OpenInFullIcon />
              </TooltipTrigger>
              <TooltipContent>Expand</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-on-surface-variant"
                  aria-label="Close Context Bot"
                  onClick={closeAssistant}
                />
              }
            >
              <CloseIcon />
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 pt-1 pb-3">
        <span className="text-xs font-medium tracking-wide text-on-surface-variant">Context</span>
        {context.chips.map((chip) => (
          <MetaChip key={chip.label} tone="filled">
            <chip.icon />
            <span className="max-w-48 truncate">{chip.label}</span>
          </MetaChip>
        ))}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 px-5 pt-1 pb-4" aria-live="polite">
          {showWelcome ? (
            <>
              <div className="flex flex-col items-center gap-2.5 px-2 pt-5 pb-2 text-center">
                <BotGlyph size="xl" spin className="mb-2" />
                <h3 className="font-heading text-2xl leading-8 font-semibold text-balance">
                  {firstName
                    ? `Hi ${firstName}, what would you like to understand?`
                    : "What would you like to understand?"}
                </h3>
                <p className="max-w-[40ch] text-sm text-on-surface-variant">{context.intro}</p>
              </div>
              {context.paused ? (
                <p className="flex items-center justify-center gap-1.5 rounded-lg bg-pane px-3 py-2.5 text-sm text-on-surface-variant [&_svg]:size-4">
                  <PauseIcon aria-hidden /> Paused while your knowledge check is open
                </p>
              ) : context.suggestions.length ? (
                <section className="flex flex-col gap-2.5">
                  <h4 className="text-sm font-medium text-on-surface-variant">Suggested for you</h4>
                  <SegmentedList>
                    {context.suggestions.map((prompt) => (
                      <SegmentedItem
                        key={prompt}
                        render={<button type="button" onClick={() => void ask(prompt)} />}
                        className="min-h-0 gap-3 bg-card py-3.5 text-start text-base hover:bg-ai/8 [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-ai"
                      >
                        <NorthEastIcon aria-hidden />
                        <span>{prompt}</span>
                      </SegmentedItem>
                    ))}
                  </SegmentedList>
                </section>
              ) : null}
              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-on-surface-variant [&_svg]:size-4">
                <LockIcon aria-hidden />
                Only sources you can access are searched. Restricted content is never shown.
              </p>
            </>
          ) : null}

          {messages.map((answer) => (
            <div key={answer.id} className="flex flex-col gap-5">
              <UserBubble text={answer.question} />
              <BotMessage>
                {answer.confidence === "insufficient" ? (
                  <NoAnswerCard
                    answer={answer}
                    projectName={projectName}
                    readySources={readySources}
                    reported={reported.has(answer.id)}
                    reporting={createFlag.isPending && createFlag.variables.targetId === answer.id}
                    onReport={() => reportGap(answer)}
                  />
                ) : (
                  <AnswerBody projectId={projectId} answer={answer} />
                )}
              </BotMessage>
            </div>
          ))}

          {inProject
            ? null
            : workspaceThread.map((answer, index) => (
                <div key={answer.id} className="flex flex-col gap-5">
                  <UserBubble text={answer.question} />
                  <BotMessage>
                    <WorkspaceAnswer
                      answer={answer}
                      last={index === workspaceThread.length - 1}
                      onAsk={(question) => void ask(question)}
                    />
                  </BotMessage>
                </div>
              ))}

          {pending ? (
            <div className="flex flex-col gap-5">
              <UserBubble text={pending} />
              <BotMessage>
                <div className="flex min-h-10 items-center gap-3" role="status">
                  <Loader size="sm" contained label="Context Bot is answering" />
                  <span className="text-sm text-on-surface-variant">
                    {inProject
                      ? `Searching ${formatCount(readySources, "source")} you can access…`
                      : "Searching the sources you can access…"}
                  </span>
                </div>
              </BotMessage>
            </div>
          ) : null}

          {failure ? (
            <div className="flex flex-col gap-5">
              <UserBubble text={failure.question} />
              <BotMessage>
                <div className="flex flex-col items-start gap-2.5 rounded-xl bg-card p-4">
                  <StatusChip tone="error" icon={<CloudOffIcon />}>
                    Couldn't get an answer
                  </StatusChip>
                  <p className="text-sm">
                    Something went wrong reaching ContextOS. Your question is saved.
                  </p>
                  <p className="text-xs text-on-surface-variant">{failure.message}</p>
                  <Button size="xs" variant="secondary" onClick={() => void ask(failure.question)}>
                    <RefreshIcon aria-hidden />
                    Try again
                  </Button>
                </div>
              </BotMessage>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <form onSubmit={onSubmit} className="shrink-0 px-4 pt-2 pb-3">
        <div className="flex items-end gap-1 rounded-2xl bg-field p-2 transition-[background-color,box-shadow] duration-[140ms] focus-within:bg-pane focus-within:shadow-[inset_0_0_0_2px_var(--color-ai)]">
          <label htmlFor="assistant-input" className="sr-only">
            Ask Context Bot
          </label>
          <textarea
            id="assistant-input"
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={context.paused}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void ask(draft);
              }
            }}
            placeholder={
              context.paused
                ? "Paused during your knowledge check"
                : inProject
                  ? `Ask about ${projectName}…`
                  : `Ask about ${workspace.data?.name ?? "your work"}…`
            }
            className="field-sizing-content max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-base text-on-surface outline-none placeholder:text-on-surface-variant disabled:opacity-60"
          />
          <Button
            type="submit"
            variant="ai"
            size="icon"
            className="mb-0.5 disabled:bg-on-surface/10 disabled:text-on-surface/38 disabled:opacity-100"
            aria-label="Send question"
            disabled={context.paused || draft.trim().length < 3 || busy}
          >
            <ArrowUpwardIcon />
          </Button>
        </div>
        <p className="pt-2 text-center text-xs text-on-surface-variant">
          Context Bot can make mistakes. Check the cited sources.
        </p>
      </form>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-xl rounded-br-xs bg-secondary-container px-4 py-2.5 text-base break-words text-on-secondary-container">
        {text}
      </p>
    </div>
  );
}

function BotMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-3">
      <BotGlyph size="xs" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

interface NoAnswerCardProps {
  answer: Answer;
  projectName: string;
  readySources: number;
  reported: boolean;
  reporting: boolean;
  onReport: () => void;
}

/** The prototype's honest "no reliable answer" state, with a way to route the gap to owners. */
function NoAnswerCard({
  answer,
  projectName,
  readySources,
  reported,
  reporting,
  onReport,
}: NoAnswerCardProps) {
  return (
    <div className="flex flex-col items-start gap-2.5 rounded-xl bg-card p-4">
      <StatusChip tone="warning" icon={<SearchOffIcon />}>
        No reliable answer found
      </StatusChip>
      <p className="text-[15px] leading-6">
        I couldn't find anything that answers this in sources you can access, so I won't guess.
      </p>
      {answer.answer ? <p className="text-sm text-on-surface-variant">{answer.answer}</p> : null}
      <p className="flex items-start gap-1.5 text-xs text-on-surface-variant [&_svg]:mt-px [&_svg]:size-4 [&_svg]:shrink-0">
        <ManageSearchIcon aria-hidden />
        Searched {formatCount(readySources, "source")} in {projectName}
      </p>
      {reported ? (
        <StatusChip tone="success" icon={<CheckCircleFilledIcon />}>
          Reported to this project's knowledge owners
        </StatusChip>
      ) : (
        <Button size="xs" variant="ai-tonal" disabled={reporting} onClick={onReport}>
          <AddTaskIcon aria-hidden />
          Report a knowledge gap
        </Button>
      )}
    </div>
  );
}
