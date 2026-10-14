import type { Contribution } from "@contextos/shared";
import { cn } from "cn";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DotList } from "@/components/ui/dot-list";
import { VisibilityIcon } from "@/components/ui/icons";
import { ProgressSteps } from "@/components/ui/progress-steps";
import { SegmentedItemLead } from "@/components/ui/segmented-list";
import { StatusChip } from "@/components/ui/status-chip";
import { useResubmitContribution } from "@/features/contributions/api/contributions.queries";
import {
  CONTRIBUTION_KIND_ICON,
  CONTRIBUTION_STATUS,
  CONTRIBUTION_STEPS,
  contributionStep,
  isInReview,
} from "@/features/contributions/contribution-meta";
import { formatRelativeTime, formatShortDate } from "@/lib/format";
import { CONTRIBUTION_KIND_LABEL, SECTION_LABEL } from "@/lib/labels";

/**
 * One contribution in "Your contributions" (prototype `.ct-item`): what it is, the review track,
 * the reviewer, what happened after publishing, and the reviewer's comments with a resubmit action.
 */
export function ContributionItem({
  item,
  highlighted = false,
}: {
  item: Contribution;
  highlighted?: boolean;
}) {
  const resubmit = useResubmitContribution();
  const status = CONTRIBUTION_STATUS[item.status];
  const reviewing = isInReview(item.status);

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-xs bg-pane p-4 first:rounded-t-xl last:rounded-b-xl",
        highlighted && "shadow-[inset_0_0_0_2px_var(--color-primary)]",
      )}
    >
      <div className="flex items-start gap-3">
        <SegmentedItemLead tone="neutral" size="sm">
          {CONTRIBUTION_KIND_ICON[item.kind]}
        </SegmentedItemLead>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">{item.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-on-surface-variant">
            <DotList
              parts={[
                CONTRIBUTION_KIND_LABEL[item.kind],
                SECTION_LABEL[item.section],
                item.submittedAt
                  ? `Submitted ${formatShortDate(item.submittedAt)}`
                  : "Not submitted",
              ]}
            />
          </span>
        </div>
        <StatusChip tone={status.tone} icon={status.icon}>
          {status.label}
        </StatusChip>
      </div>
      <ProgressSteps
        steps={CONTRIBUTION_STEPS}
        current={contributionStep(item.status)}
        aria-label="Review status"
        className="@min-[640px]:ps-11"
      />
      {(reviewing && item.reviewer) ||
      item.impact ||
      item.comments.length ||
      item.status === "changes_requested" ? (
        <div className="flex flex-col items-start gap-2 @min-[640px]:ps-11">
          {reviewing && item.reviewer ? (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <PersonAvatar person={item.reviewer} size="xs" />
              Reviewer: <b className="font-medium">{item.reviewer.name}</b>
              {item.reviewNote ? ` · ${item.reviewNote}` : null}
            </span>
          ) : null}
          {item.impact ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
              <VisibilityIcon className="size-4" aria-hidden />
              {item.impact}
            </span>
          ) : null}
          {item.comments.map((comment) => (
            <div
              key={comment.id}
              className="flex items-start gap-2.5 rounded-[4px_16px_16px_16px] bg-surface-container-high px-3 py-2.5"
            >
              <PersonAvatar person={comment.author} size="xs" />
              <div>
                <span className="text-xs font-medium">
                  {comment.author.name} · {formatRelativeTime(comment.at)}
                </span>
                <p className="mt-0.5 text-sm">{comment.text}</p>
              </div>
            </div>
          ))}
          {item.status === "changes_requested" ? (
            <Button
              size="xs"
              variant="secondary"
              disabled={resubmit.isPending}
              onClick={() =>
                resubmit.mutate(item.id, {
                  onSuccess: (updated) =>
                    toast.success(
                      `Updated and resubmitted to ${updated.reviewer?.name ?? "the reviewer"}`,
                    ),
                  onError: () => toast.error("It could not be resubmitted. Please try again."),
                })
              }
            >
              Edit and resubmit
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
