import type { CourseDetail } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { DotList } from "@/components/ui/dot-list";
import {
  CheckCircleIcon,
  LockIcon,
  PendingIcon,
  ScheduleIcon,
  SkipNextIcon,
} from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedItemTrail,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { StatusChip } from "@/components/ui/status-chip";
import { LEARNING_ENDPOINTS as E, type CourseStep } from "@/features/learning/api/learning.api";
import { courseQuery, useCourseStep } from "@/features/learning/api/learning.queries";

type Item = CourseDetail["items"][number];

const STATE: Record<
  Item["state"],
  { label: string; icon: ReactNode; tone: "neutral" | "info" | "success" } | null
> = {
  not_started: null,
  in_progress: { label: "In progress", icon: <ScheduleIcon />, tone: "info" },
  awaiting_signoff: { label: "Waiting for sign-off", icon: <PendingIcon />, tone: "neutral" },
  done: { label: "Done", icon: <CheckCircleIcon />, tone: "success" },
  skipped: { label: "Skipped", icon: <SkipNextIcon />, tone: "neutral" },
};
const LOCKED = {
  label: "Finish the earlier lessons first",
  icon: <LockIcon />,
  tone: "neutral" as const,
};

const HOW: Record<Item["verification"], string> = {
  self: "Mark it done",
  engagement: "Counts after a minute on it",
  signoff: "Needs sign-off",
  event: "Completes from a connected tool, or by sign-off",
  quiz: "Quiz",
};

/** The next thing the learner can do on an item, by how it completes. */
function nextStep(item: Item): { step: CourseStep; label: string } | null {
  if (item.locked || !["not_started", "in_progress"].includes(item.state)) return null;
  if (item.state === "not_started") return { step: "start", label: "Start" };
  if (item.verification === "signoff" || item.verification === "event")
    return { step: "signoff/request", label: "Request sign-off" };
  if (item.verification === "self") return { step: "attest", label: "Mark done" };
  return null;
}

/** An assigned course from My learning (role access spec §4.3): its items and the next step on each. */
export function CoursePage() {
  const { courseId = "" } = useParams();
  const query = useQuery(courseQuery(courseId));
  const step = useCourseStep();
  const data = query.data;
  const run = (item: Item, next: CourseStep) =>
    data &&
    step.mutate(
      { assignmentId: data.assignmentId, itemId: item.id, step: next, version: item.version },
      { onError: (error) => toast.error(error.message) },
    );

  // Reading time counts only while the page is open: a heartbeat every 15 seconds.
  const reading = data?.items.find(
    (item) => item.state === "in_progress" && item.verification === "engagement",
  );
  const assignmentId = data?.assignmentId;
  const readingId = reading?.id;
  const readingVersion = reading?.version ?? null;
  const { mutate } = step;
  useEffect(() => {
    if (!assignmentId || !readingId || readingVersion === null) return;
    const timer = window.setTimeout(
      () => mutate({ assignmentId, itemId: readingId, step: "dwell", version: readingVersion }),
      15_000,
    );
    return () => window.clearTimeout(timer);
  }, [assignmentId, readingId, readingVersion, mutate]);

  return (
    <div className="mx-auto flex max-w-360 flex-col">
      <PageHeader
        kicker="My learning"
        title={data?.title ?? "Course"}
        description={data ? `${data.percent}% done · ${data.remainingMinutes} min left` : undefined}
        actions={
          <Button variant="outline" nativeButton={false} render={<Link to="/learning" />}>
            All my learning
          </Button>
        }
      />
      <SectionCard
        title="Lessons"
        count={data?.items.length}
        endpoint={E.course.path}
        status={query}
      >
        {data ? (
          <Progress value={data.percent} aria-label="Course progress" className="mb-3 max-w-60" />
        ) : null}
        <SegmentedList>
          {(data?.items ?? []).map((item) => {
            const next = nextStep(item);
            const state = item.locked ? LOCKED : STATE[item.state];
            return (
              <SegmentedItem key={item.id} className="flex-wrap @min-[640px]:flex-nowrap">
                <SegmentedItemBody>
                  <SegmentedItemTitle className="whitespace-normal">
                    {item.title}
                  </SegmentedItemTitle>
                  <span className="text-sm text-on-surface-variant">{item.objective}</span>
                  <SegmentedItemMeta>
                    <DotList
                      parts={[
                        `${item.minutes} min`,
                        item.required ? null : "Optional",
                        HOW[item.verification],
                      ]}
                    />
                  </SegmentedItemMeta>
                </SegmentedItemBody>
                <SegmentedItemTrail className="flex flex-wrap items-center gap-2">
                  {state ? (
                    <StatusChip tone={state.tone} icon={state.icon}>
                      {state.label}
                    </StatusChip>
                  ) : null}
                  {item.url ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      nativeButton={false}
                      render={<a href={item.url} target="_blank" rel="noreferrer" />}
                    >
                      Open
                    </Button>
                  ) : null}
                  {!item.required && item.state === "in_progress" ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={step.isPending}
                      onClick={() => run(item, "skip")}
                    >
                      Skip
                    </Button>
                  ) : null}
                  {next ? (
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={step.isPending}
                      onClick={() => run(item, next.step)}
                    >
                      {next.label}
                    </Button>
                  ) : null}
                </SegmentedItemTrail>
              </SegmentedItem>
            );
          })}
        </SegmentedList>
      </SectionCard>
    </div>
  );
}
