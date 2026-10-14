import type { Answer, FeedbackKind } from "@contextos/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  CheckIcon,
  ContentCopyIcon,
  ThumbDownFilledIcon,
  ThumbDownIcon,
  ThumbUpFilledIcon,
  ThumbUpIcon,
} from "@/components/ui/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCreateFeedback } from "@/features/feedback/api/feedback.queries";

/** The prototype's "What was wrong?" reasons, mapped to the feedback kinds the API records. */
const REASONS: Array<{ kind: FeedbackKind; label: string }> = [
  { kind: "incorrect", label: "Incorrect" },
  { kind: "outdated", label: "Out of date" },
  { kind: "missing_context", label: "Missing a source" },
  { kind: "conflicting", label: "Sources disagree" },
];

/** Plain text of an answer without its [n] citation markers. */
function plainText(answer: Answer): string {
  return answer.answer.replace(/\s?\[\d+\]/g, "");
}

/**
 * Answer tools from the prototype: helpful, not helpful (then a reason), copy. Feedback goes to the
 * project's knowledge owners through the feedback API.
 */
export function AnswerFeedback({ projectId, answer }: { projectId: string; answer: Answer }) {
  const feedback = useCreateFeedback(projectId);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [reason, setReason] = useState<FeedbackKind | null>(null);

  const send = (kind: FeedbackKind) =>
    feedback.mutate({ targetType: "answer", targetId: answer.id, kind });

  const copy = () => {
    void navigator.clipboard
      ?.writeText(plainText(answer))
      .then(() => toast.success("Answer copied"))
      .catch(() => toast.error("Could not copy to the clipboard"));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="-ml-1.5 flex items-center gap-0.5" role="group" aria-label="Answer feedback">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-on-surface-variant aria-pressed:text-ai"
                aria-label="Helpful"
                aria-pressed={vote === "up"}
                disabled={feedback.isPending || vote !== null}
                onClick={() => {
                  setVote("up");
                  send("correct");
                }}
              />
            }
          >
            {vote === "up" ? <ThumbUpFilledIcon /> : <ThumbUpIcon />}
          </TooltipTrigger>
          <TooltipContent>Helpful</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-on-surface-variant aria-pressed:text-ai"
                aria-label="Not helpful"
                aria-pressed={vote === "down"}
                disabled={feedback.isPending || vote !== null}
                onClick={() => setVote("down")}
              />
            }
          >
            {vote === "down" ? <ThumbDownFilledIcon /> : <ThumbDownIcon />}
          </TooltipTrigger>
          <TooltipContent>Not helpful</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon-sm" className="text-on-surface-variant" aria-label="Copy answer" onClick={copy} />}
          >
            <ContentCopyIcon />
          </TooltipTrigger>
          <TooltipContent>Copy</TooltipContent>
        </Tooltip>
        {vote === "up" ? <span className="ml-1 text-xs text-on-surface-variant">Thanks for the feedback.</span> : null}
      </div>
      {vote === "down" ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="What was wrong?">
          <span className="text-xs text-on-surface-variant">What was wrong?</span>
          {REASONS.map((option) => (
            <Chip
              key={option.kind}
              variant="filter"
              selected={reason === option.kind}
              disabled={reason !== null}
              onClick={() => {
                setReason(option.kind);
                send(option.kind);
              }}
            >
              {reason === option.kind ? <CheckIcon /> : null}
              {option.label}
            </Chip>
          ))}
          {reason ? <span className="text-xs text-on-surface-variant">Thanks. The project's knowledge owners will review this answer.</span> : null}
        </div>
      ) : null}
    </div>
  );
}
