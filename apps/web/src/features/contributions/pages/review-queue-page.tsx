import type { ReviewItem } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useId, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DotList } from "@/components/ui/dot-list";
import { CelebrationFilledIcon, CheckCircleIcon, CheckIcon, EditNoteIcon, LinkIcon } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { TypeChip } from "@/components/ui/meta-chip";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { Shape } from "@/components/ui/shape";
import { Textarea } from "@/components/ui/textarea";
import { CONTRIBUTION_ENDPOINTS as E } from "@/features/contributions/api/contributions.api";
import { reviewQueueQuery, useDecideReview } from "@/features/contributions/api/contributions.queries";
import { CONTRIBUTION_KIND_ICON } from "@/features/contributions/contribution-meta";
import { firstName, formatCount, formatShortDate } from "@/lib/format";
import { CONTRIBUTION_KIND_LABEL, SECTION_LABEL } from "@/lib/labels";

/** Review queue (prototype `reviewPage`): your team's contributions, approve or send back. */
export function ReviewQueuePage() {
  const query = useQuery(reviewQueueQuery());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = query.data?.items ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  return (
    <div className="mx-auto flex max-w-360 flex-col">
      <PageHeader
        kicker="Your team’s knowledge"
        title="Review queue"
        description={
          query.data
            ? `${formatCount(items.length, "contribution")} ${items.length === 1 ? "is" : "are"} waiting for you. Approved pages are cited by Context Bot right away.`
            : undefined
        }
      />
      <div className="grid grid-cols-1 items-start gap-3 medium:gap-4 @min-[860px]:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)]">
        <SectionCard title="Waiting" count={query.data ? items.length : undefined} endpoint={E.reviews.path} status={query}>
          {items.length ? (
            <SegmentedList aria-label="Waiting for review">
              {items.map((item) => {
                const isSelected = item.id === selected?.id;
                return (
                  <SegmentedItem
                    key={item.id}
                    render={<button type="button" />}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedId(item.id)}
                    className={cn("gap-3", isSelected && "bg-secondary-container text-on-secondary-container hover:bg-secondary-container")}
                  >
                    <PersonAvatar person={item.author} size="sm" />
                    <SegmentedItemBody>
                      <SegmentedItemTitle className={cn("whitespace-normal", isSelected && "text-current")}>{item.title}</SegmentedItemTitle>
                      <SegmentedItemMeta className={cn(isSelected && "text-current")}>
                        <DotList parts={[CONTRIBUTION_KIND_LABEL[item.kind], item.author.name, formatShortDate(item.submittedAt)]} />
                      </SegmentedItemMeta>
                    </SegmentedItemBody>
                  </SegmentedItem>
                );
              })}
            </SegmentedList>
          ) : (
            <div className="flex items-center gap-4 rounded-xl bg-pane p-5">
              <span aria-hidden className="relative grid size-14 shrink-0 place-items-center text-on-success-container">
                <Shape kind="sunny" className="absolute inset-0 size-full text-success-container" />
                <CelebrationFilledIcon className="relative z-10 size-6" />
              </span>
              <div>
                <b className="text-sm font-medium">All caught up</b>
                <p className="text-xs text-on-surface-variant">New contributions from your team will show up here.</p>
              </div>
            </div>
          )}
          {query.data?.reviewedRecently ? (
            <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
              <CheckCircleIcon className="size-4" aria-hidden /> {query.data.reviewedRecently} reviewed recently
            </p>
          ) : null}
        </SectionCard>
        {selected ? <ReviewDetail key={selected.id} item={selected} /> : null}
      </div>
    </div>
  );
}

function ReviewDetail({ item }: { item: ReviewItem }) {
  const commentId = useId();
  const [comment, setComment] = useState("");
  const decide = useDecideReview();
  const Icon = CONTRIBUTION_KIND_ICON[item.kind];
  const author = firstName(item.author.name);

  const send = (decision: "approve" | "request_changes") =>
    decide.mutate(
      { id: item.id, input: { decision, comment } },
      {
        onSuccess: () =>
          toast.success(
            decision === "approve"
              ? `Published “${item.title}”. ${author} has been notified.`
              : `Changes requested from ${author}`,
          ),
        onError: () => toast.error("Your review could not be saved. Please try again."),
      },
    );

  return (
    <Card className="gap-4 px-6" role="region" aria-labelledby="review-title">
      <div className="flex flex-wrap items-center gap-2">
        <TypeChip>
          {Icon}
          {CONTRIBUTION_KIND_LABEL[item.kind]}
        </TypeChip>
        <span className="text-xs text-on-surface-variant">
          {SECTION_LABEL[item.section]} · submitted {formatShortDate(item.submittedAt)} by {item.author.name}
        </span>
      </div>
      <h2 id="review-title" className="font-heading text-2xl leading-8 font-semibold">
        {item.title}
      </h2>
      <div className={cn("grid gap-2", item.before && "@min-[640px]:grid-cols-2")}>
        {item.before ? (
          <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-pane p-3">
            <span className="mb-1 text-xs font-medium text-on-surface-variant">Current</span>
            {item.before.map((line) => (
              <p
                key={line}
                className={cn(
                  "rounded-[6px] px-2 py-1 font-mono text-[13px] leading-5 [overflow-wrap:anywhere]",
                  !item.after.includes(line) && "bg-error-container text-on-error-container line-through",
                )}
              >
                {line}
              </p>
            ))}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-pane p-3">
          {item.before ? <span className="mb-1 text-xs font-medium text-on-surface-variant">Suggested</span> : null}
          {item.after.map((line) => (
            <p
              key={line}
              className={cn(
                "rounded-[6px] px-2 py-1 font-mono text-[13px] leading-5 [overflow-wrap:anywhere]",
                !item.before?.includes(line) && "bg-success-container text-on-success-container",
              )}
            >
              {line}
            </p>
          ))}
        </div>
      </div>
      <div>
        <span className="text-sm font-medium">Sources</span>
        <ul className="mt-1.5 flex flex-col gap-1">
          {item.sources.map((source) => (
            <li key={source} className="flex items-center gap-1.5 text-sm">
              <LinkIcon className="size-4 text-on-surface-variant" aria-hidden /> {source}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={commentId}>Comment (optional)</Label>
        <Textarea
          id={commentId}
          rows={2}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Say what to change, or thank them"
        />
      </div>
      <div className="flex flex-wrap gap-2 [&>*]:flex-[1_1_auto]">
        <Button variant="outline" disabled={decide.isPending} onClick={() => send("request_changes")}>
          <EditNoteIcon aria-hidden /> Request changes
        </Button>
        <Button disabled={decide.isPending} onClick={() => send("approve")}>
          <CheckIcon aria-hidden /> Approve and publish
        </Button>
      </div>
    </Card>
  );
}
