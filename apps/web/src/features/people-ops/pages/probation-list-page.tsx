import type { ProbationReview } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { PersonCell } from "@/components/person-cell";
import { SectionCard } from "@/components/section-card";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip, ChipCount } from "@/components/ui/chip";
import { DotList } from "@/components/ui/dot-list";
import { EmptyMini } from "@/components/ui/empty-mini";
import {
  CelebrationFilledIcon,
  CheckIcon,
  EventAvailableIcon,
  FilterAltIcon,
  NotificationsIcon,
} from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import { ProgressSteps } from "@/components/ui/progress-steps";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HOME_ENDPOINTS } from "@/features/home/api/home.api";
import { homeQuery } from "@/features/home/api/home.queries";
import { useRemindManagers } from "@/features/people-ops/api/people-ops.queries";
import {
  REVIEW_STATE,
  REVIEW_TRACK,
  needsHr,
  outcomeChip,
  probationPath,
  recommendationChip,
} from "@/features/people-ops/people-ops-meta";
import {
  daysFromToday,
  formatCount,
  formatDayDate,
  formatList,
  formatPercent,
  formatShortDate,
} from "@/lib/format";

type ReviewFilter = "all" | "you" | "manager" | "risk" | "done";

const FILTERS: Array<[ReviewFilter, string, (review: ProbationReview) => boolean]> = [
  ["all", "All", () => true],
  ["you", "Needs you", (review) => needsHr(review.state)],
  ["manager", "Awaiting manager", (review) => review.state === "awaiting_manager"],
  ["risk", "At risk", (review) => review.state === "checkins_missing"],
  ["done", "Completed", (review) => review.state === "completed"],
];

/** The probation pipeline (prototype `#probation`): reviews in the next 30 days and their stage. */
export function ProbationListPage() {
  useBotContext(
    {
      chips: [
        { icon: EventAvailableIcon, label: "Probation reviews" },
        { icon: FilterAltIcon, label: "All teams" },
      ],
      suggestions: [
        "Which probation reviews need action this week?",
        "Which teams have overdue check-ins?",
      ],
    },
    "probation",
  );
  const query = useQuery(homeQuery("probationReviews", { within: 30 }));
  const remind = useRemindManagers();
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const items = query.data?.items ?? [];
  const needs = items.filter((review) => needsHr(review.state)).length;
  const active = FILTERS.find(([value]) => value === filter) ?? FILTERS[0]!;
  const rows = items.filter(active[2]);
  const waiting = items.filter(
    (review) => review.state === "awaiting_manager" || review.state === "checkins_missing",
  );
  const completed = [
    ...items.filter((review) => review.state === "completed"),
    ...(query.data?.recentlyCompleted ?? []),
  ];

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker="People Operations"
        title="Probation reviews"
        description={
          query.data ? (
            <>
              {formatCount(items.length, "review")} in the next 30 days.{" "}
              {needs ? (
                <b className="font-medium text-on-surface">{needs} need you this week.</b>
              ) : (
                "Nothing needs you right now."
              )}
            </>
          ) : undefined
        }
        actions={
          <Button
            variant="outline"
            disabled={!waiting.length || remind.isPending}
            onClick={() =>
              remind.mutate(
                { about: "probation_review", ids: waiting.map((review) => review.id) },
                {
                  onSuccess: (result) =>
                    toast.success(
                      `Reminders sent to ${formatList(result.reminded.map((person) => person.name))}`,
                    ),
                  onError: () => toast.error("The reminders could not be sent. Please try again."),
                },
              )
            }
          >
            <NotificationsIcon aria-hidden /> Remind managers
          </Button>
        }
      />
      <div role="group" aria-label="Filter reviews" className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([value, label, matches]) => (
          <Chip
            key={value}
            variant="filter"
            selected={filter === value}
            onClick={() => setFilter(value)}
          >
            {filter === value ? <CheckIcon aria-hidden /> : null}
            {label}
            {query.data ? <ChipCount>{items.filter(matches).length}</ChipCount> : null}
          </Chip>
        ))}
      </div>
      {query.isPending ? (
        <Skeleton className="h-96 rounded-card" />
      ) : (
        <SectionCard
          title={filter === "all" ? "Upcoming reviews" : active[1]}
          count={query.data ? rows.length : undefined}
          endpoint={HOME_ENDPOINTS.probationReviews.path}
          status={query}
        >
          {rows.length ? (
            <div className="-mx-6 overflow-x-auto px-6">
              <Table className="min-w-170 [&_td]:px-2.5 [&_th]:px-2.5">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Review</TableHead>
                    <TableHead>Manager recommendation</TableHead>
                    <TableHead>Readiness</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>
                      <span className="sr-only">Action</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((review) => (
                    <ReviewRow key={review.id} review={review} />
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyMini
              icon={<CelebrationFilledIcon />}
              shape="sunny"
              tone="celebrate"
              title="Nothing here"
              description="No reviews match this filter."
            />
          )}
        </SectionCard>
      )}
      <SectionCard title="Recently completed">
        {completed.length ? (
          <SegmentedList>
            {completed.map((review) => {
              const chip = review.decision ? outcomeChip(review.decision) : null;
              const decidedOn = review.decision?.decidedOn;
              return (
                <SegmentedItem key={review.id}>
                  <PersonAvatar person={review.person} size="sm" />
                  <SegmentedItemBody>
                    <SegmentedItemTitle>
                      <Link
                        to={probationPath(review.id)}
                        className="text-on-surface no-underline hover:underline"
                      >
                        {review.person.name}
                      </Link>
                    </SegmentedItemTitle>
                    <SegmentedItemMeta>
                      <DotList parts={[review.person.title, review.team]} />
                    </SegmentedItemMeta>
                  </SegmentedItemBody>
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    {decidedOn ? (
                      <span className="text-xs text-on-surface-variant">
                        {daysFromToday(decidedOn) === 0 ? "Today" : formatShortDate(decidedOn)}
                      </span>
                    ) : null}
                    {chip ? (
                      <StatusChip tone={chip.tone} icon={<chip.icon />}>
                        {chip.label}
                      </StatusChip>
                    ) : null}
                  </span>
                </SegmentedItem>
              );
            })}
          </SegmentedList>
        ) : (
          <p className="text-sm text-on-surface-variant">
            No reviews completed in the last 30 days.
          </p>
        )}
      </SectionCard>
    </div>
  );
}

function ReviewRow({ review }: { review: ProbationReview }) {
  const state = REVIEW_STATE[review.state];
  // The pipeline shows what the manager recommended; the outcome is on the track and below.
  const recommendation = recommendationChip({
    recommendation: review.recommendation,
    decision: null,
  });
  const days = daysFromToday(review.reviewOn);
  const action =
    review.state === "ready_for_approval"
      ? "Review & approve"
      : review.state === "needs_hr_review"
        ? "Review"
        : "Open";
  return (
    <TableRow>
      <TableCell>
        <PersonCell
          person={review.person}
          to={probationPath(review.id)}
          meta={<DotList parts={[review.person.title, review.team]} />}
        />
      </TableCell>
      <TableCell>
        <span className="text-sm whitespace-nowrap tabular-nums">
          {formatDayDate(review.reviewOn)}
        </span>
        <br />
        <span className="text-xs whitespace-nowrap text-on-surface-variant">
          {review.state === "completed" ? "Recorded" : `In ${formatCount(days, "day")}`} ·{" "}
          {review.manager.name}
        </span>
      </TableCell>
      <TableCell>
        <StatusChip tone={recommendation.tone} icon={<recommendation.icon />}>
          {recommendation.label}
        </StatusChip>
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-2.5">
          <Progress
            flat
            tone={review.readiness < 0.65 ? "warning" : "primary"}
            value={Math.round(review.readiness * 100)}
            aria-label={`${review.person.name} readiness`}
            className="w-16 flex-none"
          />
          <span className="text-xs tabular-nums">{formatPercent(review.readiness)}</span>
        </span>
      </TableCell>
      <TableCell>
        <ProgressSteps
          steps={REVIEW_TRACK}
          current={state.step}
          size="sm"
          aria-label={`${review.person.name}: ${state.label}`}
          className="w-28"
        />
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="xs"
          variant={needsHr(review.state) ? "secondary" : "ghost"}
          className="whitespace-nowrap"
          nativeButton={false}
          render={<Link to={probationPath(review.id)} />}
        >
          {action}
        </Button>
      </TableCell>
    </TableRow>
  );
}
