import type { LessonBlock } from "@contextos/shared";
import { cn } from "cn";
import { Fragment, useState, type ReactNode } from "react";
import { Markdown } from "@/components/markdown";
import { OriginIcon } from "@/components/origin-icon";
import { Button } from "@/components/ui/button";
import {
  ArrowForwardIcon,
  CancelFilledIcon,
  CheckCircleFilledIcon,
  CheckCircleIcon,
  OpenInNewIcon,
  PlayArrowIcon,
  QuizIcon,
} from "@/components/ui/icons";
import { ProgressSteps } from "@/components/ui/progress-steps";
import { SegmentedItemLead } from "@/components/ui/segmented-list";
import { StatusChip } from "@/components/ui/status-chip";
import { formatDate } from "@/lib/format";
import { KNOWLEDGE_ORIGIN_LABEL } from "@/lib/labels";

/** Lesson text: `**bold**` and `` `code` `` only. Everything else renders as plain text (never HTML). */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return (
            <strong key={index} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        if (part.startsWith("`") && part.endsWith("`"))
          return (
            <code
              key={index}
              className="rounded-[6px] bg-surface-container-high px-1.5 py-px font-mono text-[0.9em]"
            >
              {part.slice(1, -1)}
            </code>
          );
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

const joinNames = (names: string[]) =>
  names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

function Block({ block }: { block: LessonBlock }): ReactNode {
  switch (block.type) {
    case "markdown":
      return <Markdown text={block.text} className="mt-5" />;
    case "lede":
      return (
        <p className="mt-5 text-[19px] leading-[30px]">
          <RichText text={block.text} />
        </p>
      );
    case "heading":
      return (
        <h2 className="mt-9 mb-2.5 font-heading text-xl leading-7 font-medium text-balance">
          {block.text}
        </h2>
      );
    case "paragraph":
      return (
        <p className="my-3">
          <RichText text={block.text} />
        </p>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List
          className={cn(
            "my-3 flex flex-col gap-2 ps-5.5 marker:text-primary",
            block.ordered ? "list-decimal" : "list-disc",
          )}
        >
          {block.items.map((item) => (
            <li key={item}>
              <RichText text={item} />
            </li>
          ))}
        </List>
      );
    }
    case "flow":
      return (
        <figure className="my-5 flex flex-col gap-3.5 rounded-xl bg-card px-5 py-4.5">
          {block.rows.map((row) => (
            <div key={row.label} className="flex flex-wrap items-center gap-2">
              <span className="w-full text-xs font-medium text-on-surface-variant">
                {row.label}
              </span>
              {row.steps.map((step, index) => (
                <Fragment key={step.map((node) => node.title).join("+")}>
                  {index > 0 ? (
                    <ArrowForwardIcon className="size-4 text-outline" aria-hidden />
                  ) : null}
                  <span className="inline-flex flex-col gap-1">
                    {step.map((node) => (
                      <span
                        key={node.title}
                        className={cn(
                          "inline-flex flex-col rounded-md bg-pane px-3 py-2 text-sm leading-[18px] font-medium shadow-[inset_0_0_0_1px_var(--color-outline-variant)]",
                          node.tone === "warning" &&
                            "shadow-[inset_0_0_0_2px_var(--color-warning)]",
                          node.tone === "accent" &&
                            "bg-ai-container text-on-ai-container shadow-none",
                        )}
                      >
                        {node.title}
                        {node.note ? (
                          <small
                            className={cn(
                              "text-xs font-normal",
                              node.tone !== "accent" && "text-on-surface-variant",
                            )}
                          >
                            {node.note}
                          </small>
                        ) : null}
                      </span>
                    ))}
                  </span>
                </Fragment>
              ))}
            </div>
          ))}
          <figcaption className="text-xs text-on-surface-variant">{block.caption}</figcaption>
        </figure>
      );
    case "decision":
      return (
        <aside
          aria-label={`Decision record ${block.reference}`}
          className="my-6 flex flex-col items-start gap-2 rounded-xl bg-card px-5 py-4.5"
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <SegmentedItemLead tone="neutral" size="sm">
              <OriginIcon origin={block.origin} />
            </SegmentedItemLead>
            <span className="text-sm font-medium">Decision · {block.reference}</span>
            <StatusChip
              tone={block.status === "accepted" ? "success" : "neutral"}
              icon={<CheckCircleIcon />}
            >
              {block.status === "accepted"
                ? "Accepted"
                : block.status === "proposed"
                  ? "Proposed"
                  : "Superseded"}{" "}
              {formatDate(`${block.decidedOn}T12:00:00`)}
            </StatusChip>
          </div>
          <blockquote className="my-1 text-base leading-[26px] font-medium">
            <RichText text={block.statement} />
          </blockquote>
          <p className="text-xs text-on-surface-variant">
            Decided by {joinNames(block.decidedBy)}
            {block.location ? ` · ${block.location}` : ""}
          </p>
          {block.url ? (
            <Button
              variant="link"
              size="xs"
              nativeButton={false}
              render={<a href={block.url} target="_blank" rel="noreferrer" />}
            >
              <OpenInNewIcon aria-hidden /> Open the decision record
            </Button>
          ) : null}
        </aside>
      );
    case "milestones": {
      const current = block.items.findIndex((item) => item.state === "current");
      const firstTodo = block.items.findIndex((item) => item.state === "todo");
      return (
        <ProgressSteps
          aria-label={block.label}
          tone="success"
          steps={block.items.map((item) => ({ label: item.title, detail: item.detail }))}
          current={current >= 0 ? current : firstTodo >= 0 ? firstTodo : block.items.length}
          className="my-3 gap-2 text-xs @max-[640px]:grid-cols-2! @max-[640px]:gap-y-4"
        />
      );
    }
    case "media":
      return (
        <div className="my-5 flex flex-wrap items-center gap-3 rounded-xl bg-card p-4">
          <SegmentedItemLead tone="primary">
            <PlayArrowIcon aria-hidden />
          </SegmentedItemLead>
          <div className="flex min-w-0 flex-1 flex-col">
            <b className="text-sm font-medium">{block.title}</b>
            <span className="text-xs text-on-surface-variant">
              {block.kind === "video" ? "Video" : "Slides"} · {block.minutes} min ·{" "}
              {KNOWLEDGE_ORIGIN_LABEL[block.origin]}
            </span>
          </div>
          {block.url ? (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href={block.url} target="_blank" rel="noreferrer" />}
            >
              <OpenInNewIcon aria-hidden /> Open in {KNOWLEDGE_ORIGIN_LABEL[block.origin]}
            </Button>
          ) : null}
        </div>
      );
    case "check":
      return <InlineCheck block={block} />;
  }
}

/** "Check your understanding" (prototype `.check-inline`): practice only, answered in place. */
function InlineCheck({ block }: { block: Extract<LessonBlock, { type: "check" }> }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const questionId = `inline-${block.id}`;
  const right = chosen === block.correctOptionId;
  return (
    <section
      aria-labelledby={questionId}
      className="mt-8 mb-2 flex flex-col gap-2.5 rounded-2xl bg-primary-container/40 p-5"
    >
      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        <QuizIcon className="size-4" aria-hidden /> Check your understanding
      </p>
      <p id={questionId} className="text-base font-medium">
        {block.question}
      </p>
      <div role="group" aria-labelledby={questionId} className="flex flex-col gap-1">
        {block.options.map((option, index) => {
          const isRight = chosen !== null && option.id === block.correctOptionId;
          const isWrong = chosen === option.id && !isRight;
          return (
            <button
              key={option.id}
              type="button"
              disabled={chosen !== null}
              onClick={() => setChosen(option.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-[14px] bg-pane px-3.5 py-3 text-start text-base transition-colors enabled:hover:bg-[color-mix(in_srgb,var(--color-pane),var(--color-on-surface)_8%)] disabled:cursor-default",
                isRight && "bg-success-container text-on-success-container",
                isWrong && "bg-error-container text-on-error-container",
              )}
            >
              <span className="grid size-6.5 shrink-0 place-items-center rounded-full bg-surface-container-high text-xs font-medium text-on-surface-variant">
                {String.fromCharCode(65 + index)}
              </span>
              <span className="flex-1">{option.text}</span>
              {isRight ? <CheckCircleFilledIcon className="size-5" aria-label="Correct" /> : null}
              {isWrong ? <CancelFilledIcon className="size-5" aria-label="Incorrect" /> : null}
            </button>
          );
        })}
      </div>
      {chosen !== null ? (
        <p role="status" className={cn("mt-1 text-sm", right ? "text-success" : "text-error")}>
          {right ? "Right." : "Not quite."} {block.explanation}
        </p>
      ) : null}
    </section>
  );
}

/** A lesson's body, block by block. */
export function LessonBlocks({ blocks }: { blocks: LessonBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => (
        // Blocks are an ordered document with no ids of their own.
        <Fragment key={index}>
          <Block block={block} />
        </Fragment>
      ))}
    </>
  );
}
