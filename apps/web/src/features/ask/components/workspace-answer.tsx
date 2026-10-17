import type { AssistantAnswer, AssistantFeedbackInput } from "@contextos/shared";
import { cn } from "cn";
import { useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ConnectorLogo } from "@/components/connector-logo";
import { Markdown } from "@/components/markdown";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  AddTaskIcon,
  ChatIcon,
  CheckCircleFilledIcon,
  CheckIcon,
  ContentCopyIcon,
  ErrorIcon,
  HubIcon,
  InfoIcon,
  LockIcon,
  ManageSearchIcon,
  OpenInNewIcon,
  PersonIcon,
  GroupsIcon,
  SearchOffIcon,
  SubdirectoryArrowRightIcon,
  SyncProblemIcon,
  ThumbDownFilledIcon,
  ThumbDownIcon,
  ThumbUpFilledIcon,
  ThumbUpIcon,
  VerifiedFilledIcon,
} from "@/components/ui/icons";
import { StatusChip } from "@/components/ui/status-chip";
import { useAnswerFeedback, useReportKnowledgeGap } from "@/features/ask/api/assistant.queries";
import { CiteButton } from "@/features/ask/components/cite-button";
import { HIDDEN } from "@/lib/hidden";
import { stripCitations } from "@/lib/citations";
import { useMessageDialog } from "@/features/messages/hooks/use-message-dialog";

const REASONS: Array<[NonNullable<AssistantFeedbackInput["reason"]>, string]> = [
  ["incorrect", "Incorrect"],
  ["out_of_date", "Out of date"],
  ["missing_source", "Missing a source"],
  ["not_relevant", "Not relevant"],
];

/** Answer text as formatted Markdown, with its `[n]` markers as citation chips. */
function RichText({
  text,
  onCite,
  titles,
  className,
}: {
  text: string;
  onCite: (n: number) => void;
  titles: string[];
  className?: string;
}) {
  const linked = text.replace(/\[(\d+)\](?!\()/g, (marker, n: string) =>
    titles[Number(n) - 1] ? `[${n}](#cite-${n})` : marker,
  );
  return (
    <Markdown
      text={linked}
      className={className}
      overrides={{
        a: ({ href, children }) => {
          const n = href?.startsWith("#cite-") ? Number(href.slice("#cite-".length)) : 0;
          const title = titles[n - 1];
          if (!title)
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-primary underline underline-offset-2"
              >
                {children}
              </a>
            );
          return <CiteButton n={n} title={title} onClick={() => onCite(n)} />;
        },
      }}
    />
  );
}

function PersonRow({ person, why }: AssistantAnswer["people"][number]) {
  const { message, dialog } = useMessageDialog();
  return (
    <div className="flex items-center gap-3 rounded-lg bg-pane px-3 py-2.5">
      <PersonAvatar person={person} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="text-sm font-medium">{person.name}</b>
        <span className="text-xs text-on-surface-variant">{why}</span>
      </span>
      <Button
        size="xs"
        variant="outline"
        nativeButton={false}
        render={<Link to={`/people/${encodeURIComponent(person.id)}`} />}
      >
        Profile
      </Button>
      <Button
        size="icon-xs"
        variant="secondary"
        aria-label={`Message ${person.name}`}
        onClick={() => message(person)}
      >
        <ChatIcon aria-hidden />
      </Button>
      {dialog}
    </div>
  );
}

/** A workspace answer (prototype `.answer`): confidence, the answer with citations, sources, feedback. */
export function WorkspaceAnswer({
  answer,
  last,
  onAsk,
}: {
  answer: AssistantAnswer;
  /** Follow-up questions show under the latest answer only. */
  last: boolean;
  onAsk: (question: string) => void;
}) {
  if (answer.outcome === "restricted") return <RestrictedCard answer={answer} />;
  if (answer.outcome === "no_answer") return <NoAnswerCard answer={answer} />;
  return <AnsweredCard answer={answer} last={last} onAsk={onAsk} />;
}

function AnsweredCard({
  answer,
  last,
  onAsk,
}: {
  answer: AssistantAnswer;
  last: boolean;
  onAsk: (question: string) => void;
}) {
  const feedback = useAnswerFeedback();
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [reason, setReason] = useState<AssistantFeedbackInput["reason"]>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const sourcesRef = useRef<HTMLOListElement>(null);
  const titles = answer.sources.map((entry) => entry.title);
  const confidence = answer.confidence;

  const showSource = (n: number) => {
    sourcesRef.current?.children[n - 1]?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    setFlash(n);
    window.setTimeout(() => setFlash(null), 1200);
  };

  const rate = (next: "up" | "down") => {
    const value = rating === next ? null : next;
    setRating(value);
    setReason(null);
    if (value) feedback.mutate({ id: answer.id, helpful: value === "up", reason: null });
  };

  const copy = () => {
    const text = answer.blocks
      .map((block) =>
        block.type === "paragraph" ? block.text : block.items.map((item) => `- ${item}`).join("\n"),
      )
      .join("\n\n");
    void navigator.clipboard?.writeText(text.replace(/\*\*/g, "")).catch(() => undefined);
    toast.success("Answer copied with citations");
  };

  return (
    <div className="flex flex-col gap-3.5">
      {confidence ? (
        <StatusChip
          tone={confidence.level === "verified" ? "ai" : "warning"}
          icon={confidence.level === "verified" ? <VerifiedFilledIcon /> : <InfoIcon />}
          className="self-start"
        >
          {confidence.label}
        </StatusChip>
      ) : null}
      {answer.blocks.map((block, index) =>
        block.type === "paragraph" ? (
          <RichText
            key={index}
            text={block.text}
            titles={titles}
            onCite={showSource}
            className="text-[15px] leading-6"
          />
        ) : (
          <List
            key={index}
            ordered={block.ordered}
            className="flex flex-col gap-1.5 ps-5 text-[15px] leading-6"
          >
            {block.items.map((item) => (
              <li key={item}>
                <RichText text={item} titles={titles} onCite={showSource} />
              </li>
            ))}
          </List>
        ),
      )}
      {answer.people.map((entry) => (
        <PersonRow key={entry.person.id} {...entry} />
      ))}
      {answer.note ? (
        <div className="flex items-start gap-1.5 rounded-md bg-warning-container px-3 py-2 text-xs text-on-warning-container [&>svg]:mt-px [&>svg]:size-4 [&>svg]:shrink-0">
          <ErrorIcon aria-hidden />
          <RichText text={answer.note} titles={titles} onCite={showSource} />
        </div>
      ) : null}
      {answer.sources.length ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-medium text-on-surface-variant">Sources</h4>
          <ol ref={sourcesRef} className="flex flex-col gap-0.5">
            {answer.sources.map((entry, index) => (
              <li
                key={entry.title}
                className={cn(
                  "flex items-start gap-2.5 rounded-xs bg-pane px-3 py-2.5 text-xs transition-shadow first:rounded-t-lg last:rounded-b-lg",
                  flash === index + 1 && "shadow-[inset_0_0_0_2px_var(--color-ai)]",
                )}
              >
                <span
                  aria-hidden
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-xs bg-ai-container font-mono text-[11px] font-semibold text-on-ai-container"
                >
                  {index + 1}
                </span>
                {entry.provider ? (
                  <ConnectorLogo provider={entry.provider} size="sm" />
                ) : (
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-container-highest text-on-surface-variant [&_svg]:size-4"
                  >
                    {/* From the ContextOS directory: a person or the teams view. */}
                    {entry.to?.startsWith("/people/") ? (
                      <PersonIcon />
                    ) : entry.to?.startsWith("/people") ? (
                      <GroupsIcon />
                    ) : (
                      <HubIcon />
                    )}
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  {entry.to ? (
                    <Link
                      to={entry.to}
                      className="truncate text-sm font-medium text-on-surface no-underline hover:underline"
                    >
                      {entry.title}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-medium">{entry.title}</span>
                  )}
                  <span className="truncate text-on-surface-variant">
                    {entry.system} · {entry.detail}
                  </span>
                  {entry.stale ? (
                    <span className="mt-0.5 flex items-center gap-1 text-warning [&_svg]:size-3.5">
                      <SyncProblemIcon aria-hidden /> {entry.stale}
                    </span>
                  ) : null}
                </span>
                {entry.url ? (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Open ${entry.title} in ${entry.system}`}
                    nativeButton={false}
                    render={<a href={entry.url} target="_blank" rel="noopener noreferrer" />}
                  >
                    <OpenInNewIcon aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Helpful"
          aria-pressed={rating === "up"}
          onClick={() => rate("up")}
        >
          {rating === "up" ? <ThumbUpFilledIcon aria-hidden /> : <ThumbUpIcon aria-hidden />}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Not helpful"
          aria-pressed={rating === "down"}
          onClick={() => rate("down")}
        >
          {rating === "down" ? <ThumbDownFilledIcon aria-hidden /> : <ThumbDownIcon aria-hidden />}
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Copy answer" onClick={copy}>
          <ContentCopyIcon aria-hidden />
        </Button>
        {rating === "up" ? (
          <span className="text-xs text-on-surface-variant">Thanks for the feedback.</span>
        ) : null}
      </div>
      {rating === "down" ? (
        <div
          role="group"
          aria-label="What was wrong?"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-xs text-on-surface-variant">What was wrong?</span>
          {REASONS.map(([value, label]) => (
            <Chip
              key={value}
              variant="filter"
              selected={reason === value}
              onClick={() => {
                setReason(value);
                feedback.mutate({ id: answer.id, helpful: false, reason: value });
              }}
            >
              {reason === value ? <CheckIcon aria-hidden /> : null}
              {label}
            </Chip>
          ))}
          {reason ? (
            <span className="text-xs text-on-surface-variant">
              Thanks. The knowledge owner will review this answer.
            </span>
          ) : null}
        </div>
      ) : null}
      {answer.related.length ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-medium text-on-surface-variant">Related knowledge</h4>
          <div className="flex flex-wrap gap-2">
            {answer.related.map((entry) => (
              <Link
                key={`${entry.kind}-${entry.title}`}
                to={entry.to}
                className="flex flex-col rounded-md bg-pane px-3 py-2 text-on-surface no-underline transition-colors hover:bg-on-surface/8"
              >
                <span className="text-[11px] text-on-surface-variant">{entry.kind}</span>
                <span className="text-sm font-medium">{entry.title}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {last && answer.followups.length ? (
        <div className="flex flex-wrap gap-2">
          {answer.followups.map((question) => (
            <Chip
              key={question}
              variant="ai"
              className="h-auto min-h-8 max-w-full shrink py-1.5 text-start whitespace-normal"
              onClick={() => onAsk(question)}
            >
              <SubdirectoryArrowRightIcon aria-hidden />
              {question}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function List({
  ordered,
  className,
  children,
}: {
  ordered: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return ordered ? (
    <ol className={cn("list-decimal", className)}>{children}</ol>
  ) : (
    <ul className={cn("list-disc", className)}>{children}</ul>
  );
}

/** Nothing reliable in reach: say so, name who might know, and route the gap to its owners. */
function NoAnswerCard({ answer }: { answer: AssistantAnswer }) {
  const report = useReportKnowledgeGap();
  return (
    <div className="flex flex-col items-start gap-2.5 rounded-xl bg-card p-4">
      <StatusChip tone="warning" icon={<SearchOffIcon />}>
        No reliable answer found
      </StatusChip>
      {answer.blocks.map((block, index) =>
        block.type === "paragraph" ? (
          <Markdown
            key={index}
            text={stripCitations(block.text)}
            className="text-[15px] leading-6"
          />
        ) : null,
      )}
      {answer.searched.length ? (
        <p className="flex items-start gap-1.5 text-xs text-on-surface-variant [&_svg]:mt-px [&_svg]:size-4 [&_svg]:shrink-0">
          <ManageSearchIcon aria-hidden />
          Searched {answer.searched.join(", ")}
        </p>
      ) : null}
      {answer.people.length ? (
        <>
          <h4 className="text-sm font-medium">Ask someone who’s likely to know</h4>
          <div className="flex w-full flex-col gap-2">
            {answer.people.map((entry) => (
              <PersonRow key={entry.person.id} {...entry} />
            ))}
          </div>
        </>
      ) : null}
      {report.isSuccess ? (
        <StatusChip tone="success" icon={<CheckCircleFilledIcon />}>
          Reported. {report.data.notified} notified
        </StatusChip>
      ) : (
        <Button
          size="xs"
          variant="ai-tonal"
          disabled={report.isPending}
          onClick={() =>
            report.mutate(answer.question, {
              onSuccess: () =>
                toast.success(
                  HIDDEN.contributions
                    ? "Added to knowledge gaps."
                    : "Added to knowledge gaps. You can write the answer from Contributions.",
                ),
              onError: () => toast.error("The gap could not be reported. Please try again."),
            })
          }
        >
          <AddTaskIcon aria-hidden /> Report a knowledge gap
        </Button>
      )}
    </div>
  );
}

/** Pay, performance and disciplinary questions: never answered, and who to ask instead. */
function RestrictedCard({ answer }: { answer: AssistantAnswer }) {
  return (
    <div className="flex flex-col items-start gap-2.5 rounded-xl bg-card p-4">
      <StatusChip tone="neutral" icon={<LockIcon />}>
        Restricted information
      </StatusChip>
      {answer.blocks.map((block, index) =>
        block.type === "paragraph" ? (
          <p
            key={index}
            className={index === 0 ? "text-[15px] leading-6" : "text-sm text-on-surface-variant"}
          >
            {block.text}
          </p>
        ) : null,
      )}
      <div className="flex w-full flex-col gap-2">
        {answer.people.map((entry) => (
          <PersonRow key={entry.person.id} {...entry} />
        ))}
      </div>
    </div>
  );
}
