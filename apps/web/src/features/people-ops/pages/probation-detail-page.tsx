import type { ProbationDetail } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useId, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { AskCard } from "@/components/ask-card";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { ProfileHero } from "@/components/profile-hero";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DotList } from "@/components/ui/dot-list";
import { EmptyMini } from "@/components/ui/empty-mini";
import {
  BadgeIcon,
  CheckCircleIcon,
  ErrorIcon,
  EventAvailableIcon,
  EventIcon,
  FactCheckIcon,
  HourglassEmptyIcon,
  HowToRegIcon,
  LockIcon,
  MoreTimeIcon,
  NotificationsIcon,
  PendingIcon,
  ShieldPersonIcon,
  ThumbUpIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
import { OptionList, OptionTile } from "@/components/ui/option-tile";
import { ProgressSteps } from "@/components/ui/progress-steps";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedList,
} from "@/components/ui/segmented-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { PEOPLE_OPS_ENDPOINTS as E } from "@/features/people-ops/api/people-ops.api";
import {
  probationQuery,
  useDecideProbation,
  useRemindManagers,
} from "@/features/people-ops/api/people-ops.queries";
import { LevelScale } from "@/features/people-ops/components/level-scale";
import {
  PROBATION_PATH,
  REVIEW_STATE,
  REVIEW_TRACK,
  needsHr,
  outcomeChip,
  recommendationChip,
} from "@/features/people-ops/people-ops-meta";
import { comingSoon } from "@/lib/coming-soon";
import {
  daysFromToday,
  firstName,
  formatCount,
  formatDate,
  formatDayDate,
  formatPercent,
  formatShortDate,
} from "@/lib/format";

/** A probation review (prototype `#probation-<id>`): the evidence, the manager's view and the decision. */
export function ProbationDetailPage() {
  const { reviewId = "" } = useParams();
  const query = useQuery(probationQuery(reviewId));
  if (query.isPending) {
    return (
      <div className="grid min-h-80 place-items-center">
        <Loader label="Loading the probation review" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-360">
        <SectionCard
          title="This probation review could not be loaded"
          endpoint={E.probation.path}
          status={query}
        />
      </div>
    );
  }
  return <ReviewView review={query.data} />;
}

const MILESTONE: Record<
  ProbationDetail["milestones"][number]["state"],
  { tone: "success" | "neutral" | "warning"; icon: ReactNode }
> = {
  done: { tone: "success", icon: <CheckCircleIcon /> },
  active: { tone: "neutral", icon: <PendingIcon /> },
  overdue: { tone: "warning", icon: <ErrorIcon /> },
};

const ACTIVITY_ICON: Record<ProbationDetail["activity"][number]["kind"], ReactNode> = {
  started: <BadgeIcon />,
  review: <FactCheckIcon />,
  recommended_confirm: <ThumbUpIcon />,
  recommended_extend: <MoreTimeIcon />,
  missed: <ErrorIcon />,
  decided: <HowToRegIcon />,
};

function ReviewView({ review }: { review: ProbationDetail }) {
  const remind = useRemindManagers();
  const first = firstName(review.person.name);
  useBotContext(
    {
      chips: [
        { icon: EventAvailableIcon, label: `Probation: ${review.person.name}` },
        { icon: LockIcon, label: "People Ops" },
      ],
      suggestions: [
        `Summarize ${first}’s probation evidence`,
        "Which probation reviews need action this week?",
      ],
      intro: `I can summarize ${first}’s milestones, check-ins and manager feedback.`,
    },
    `probation:${review.id}`,
  );
  const state = REVIEW_STATE[review.state];
  const stateChip = review.decision ? outcomeChip(review.decision) : state;
  const recommendation = recommendationChip({
    recommendation: review.recommendation,
    decision: null,
  });
  const days = daysFromToday(review.reviewOn);
  const missing = review.state === "checkins_missing";

  const sendReminder = () =>
    remind.mutate(
      { about: "probation_review", ids: [review.id] },
      {
        onSuccess: () =>
          toast.success(`${missing ? "Follow-up" : "Reminder"} sent to ${review.manager.name}`),
        onError: () => toast.error("The reminder could not be sent. Please try again."),
      },
    );

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to={PROBATION_PATH} />}>Probation reviews</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{review.person.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <ProfileHero
        person={review.person}
        chips={
          <>
            <StatusChip tone={stateChip.tone} icon={<stateChip.icon />}>
              {stateChip.label}
            </StatusChip>
            <Badge variant="neutral">
              Review {formatDayDate(review.reviewOn)}
              {review.state === "completed" || days < 0 ? "" : ` · in ${formatCount(days, "day")}`}
            </Badge>
            <PreviewDataChip endpoint={E.probation.path} />
          </>
        }
        subtitle={
          <DotList
            parts={[
              review.person.title,
              review.team,
              `started ${formatShortDate(review.startDate)}`,
              `manager ${review.manager.name}`,
            ]}
          />
        }
      >
        <ProgressSteps
          steps={REVIEW_TRACK}
          current={state.step}
          aria-label="Review progress"
          className="mt-2 max-w-130"
        />
      </ProfileHero>

      <PageColumns>
        <PageMain>
          <SectionCard
            title="Manager recommendation"
            action={
              review.recommendedOn ? (
                <span className="text-xs text-on-surface-variant">
                  {review.manager.name} · {formatShortDate(review.recommendedOn)}
                </span>
              ) : undefined
            }
          >
            {review.ratings ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusChip tone={recommendation.tone} icon={<recommendation.icon />}>
                    {recommendation.label}
                  </StatusChip>
                  <span className="text-xs text-on-surface-variant">
                    Readiness {formatPercent(review.readiness)}
                  </span>
                </div>
                <SegmentedList aria-label="Ratings">
                  {review.ratings.map((rating) => (
                    <SegmentedItem
                      key={rating.area}
                      className="flex-wrap justify-between gap-x-4 gap-y-2 px-3.5 py-3"
                    >
                      <span className="text-sm">{rating.area}</span>
                      <LevelScale area={rating.area} level={rating.level} />
                    </SegmentedItem>
                  ))}
                </SegmentedList>
                {review.managerNote ? (
                  <blockquote className="rounded-[4px_20px_20px_20px] bg-surface-container-high px-4 py-3.5 text-base">
                    {review.managerNote}
                  </blockquote>
                ) : null}
              </>
            ) : (
              <EmptyMini
                icon={<HourglassEmptyIcon />}
                title={missing ? "Not started yet" : `Waiting for ${review.manager.name}`}
                description={
                  missing
                    ? `${first} has 2 missing check-ins. Ask ${review.manager.name} to record them first.`
                    : review.recommendationDueOn
                      ? `The recommendation is due ${formatShortDate(review.recommendationDueOn)}.`
                      : undefined
                }
                action={
                  <Button
                    size="xs"
                    variant="secondary"
                    disabled={remind.isPending}
                    onClick={sendReminder}
                  >
                    {missing ? "Follow up" : "Send reminder"}
                  </Button>
                }
              />
            )}
          </SectionCard>
          <SectionCard
            title="Onboarding milestones"
            action={
              <span className="text-xs text-on-surface-variant">{review.checkinSummary}</span>
            }
          >
            <SegmentedList>
              {review.milestones.map((milestone) => {
                const look = MILESTONE[milestone.state];
                return (
                  <SegmentedItem key={milestone.title}>
                    <SegmentedItemLead tone={look.tone} size="sm">
                      {look.icon}
                    </SegmentedItemLead>
                    <SegmentedItemBody>
                      <SegmentedItemTitle>{milestone.title}</SegmentedItemTitle>
                      <SegmentedItemMeta
                        className={milestone.state === "overdue" ? "text-error" : undefined}
                      >
                        {milestone.detail}
                      </SegmentedItemMeta>
                    </SegmentedItemBody>
                  </SegmentedItem>
                );
              })}
            </SegmentedList>
          </SectionCard>
          <SectionCard title="Activity">
            <Timeline>
              {review.activity.map((entry, index) => (
                <TimelineItem
                  key={entry.id}
                  date={formatShortDate(entry.on)}
                  state={index === 0 ? "soon" : "later"}
                  icon={ACTIVITY_ICON[entry.kind]}
                  title={<span className="font-normal">{entry.text}</span>}
                />
              ))}
            </Timeline>
          </SectionCard>
        </PageMain>
        <PageSide>
          <SectionCard
            title="Employment status"
            className={cn(
              needsHr(review.state) &&
                "shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--color-primary)_30%,transparent)]",
            )}
            action={
              <StatusChip icon={<ShieldPersonIcon />} tone="neutral">
                People Ops only
              </StatusChip>
            }
          >
            {review.decision ? (
              <Decided review={review} />
            ) : needsHr(review.state) ? (
              <DecisionForm review={review} />
            ) : (
              <p className="text-sm text-on-surface-variant">
                You can record a decision once {review.manager.name} submits a recommendation.
              </p>
            )}
            <p className="flex items-start gap-1.5 text-xs text-on-surface-variant">
              <LockIcon className="mt-px size-4 shrink-0" aria-hidden />
              Visible to People Ops and {first}’s manager. Compensation and disciplinary records
              aren’t stored in ContextOS.
            </p>
          </SectionCard>
          <AskCard
            title="Ask about this review"
            prompts={[
              `Summarize ${first}’s probation evidence`,
              "Which probation reviews need action this week?",
            ]}
          />
        </PageSide>
      </PageColumns>
    </div>
  );
}

function Decided({ review }: { review: ProbationDetail }) {
  const decision = review.decision!;
  const chip = outcomeChip(decision);
  const today = daysFromToday(decision.decidedOn) === 0;
  return (
    <div className="flex flex-col items-start gap-2">
      <StatusChip tone={chip.tone} icon={<chip.icon />}>
        {chip.label}
      </StatusChip>
      <p className="text-sm">
        Recorded by {decision.decidedBy.name}{" "}
        {today ? "today" : `on ${formatShortDate(decision.decidedOn)}`}. Effective{" "}
        {formatDate(`${decision.effectiveOn}T12:00:00`)}.
      </p>
      {decision.note ? <p className="text-xs text-on-surface-variant">{decision.note}</p> : null}
      <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
        <NotificationsIcon className="size-4" aria-hidden />
        {decision.notified
          ? `${firstName(review.person.name)} and ${review.manager.name} were notified.`
          : "No one was notified."}
      </p>
    </div>
  );
}

type Outcome = "confirm" | "extend" | "discuss";
const EXTENSIONS = { "30": "30 days", "60": "60 days", "90": "90 days" } as const;
type Extension = keyof typeof EXTENSIONS;

const OUTCOME: Record<Outcome, { title: string; description: string }> = {
  confirm: { title: "Confirm employment", description: "Probation ends on the review date" },
  extend: { title: "Extend probation", description: "Set a new review date" },
  discuss: {
    title: "Discuss with manager first",
    description: "Hold the decision and book a call",
  },
};

/** Confirm, extend or hold (prototype `.decision-form`), then a confirmation before it is recorded. */
function DecisionForm({ review }: { review: ProbationDetail }) {
  const decide = useDecideProbation(review.id);
  const ids = { extension: useId(), effective: useId(), note: useId(), notify: useId() };
  const [outcome, setOutcome] = useState<Outcome>(
    review.state === "needs_hr_review" ? "extend" : "confirm",
  );
  const [extension, setExtension] = useState<Extension>("30");
  const [effective, setEffective] = useState(review.reviewOn);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const first = firstName(review.person.name);
  const managerFirst = firstName(review.manager.name);
  const managerChoice: Outcome | null =
    review.recommendation === "confirm"
      ? "confirm"
      : review.recommendation === "extend"
        ? "extend"
        : null;
  const effectiveLabel = effective ? formatDate(`${effective}T12:00:00`) : "";

  const record = () =>
    decide.mutate(
      {
        outcome: outcome === "extend" ? "extend" : "confirm",
        extensionDays: outcome === "extend" ? (Number(extension) as 30 | 60 | 90) : null,
        effectiveOn: effective,
        note,
        notify,
      },
      {
        onSuccess: () => {
          setConfirming(false);
          toast.success(
            outcome === "extend"
              ? `Probation extended ${EXTENSIONS[extension]} for ${review.person.name}`
              : `Employment confirmed for ${review.person.name}`,
          );
        },
        onError: () => toast.error("The decision could not be recorded. Please try again."),
      },
    );

  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (outcome === "discuss") {
          comingSoon(`Booking a call with ${managerFirst}`);
          return;
        }
        if (effective) setConfirming(true);
      }}
    >
      <OptionList aria-label="Decision">
        {(Object.keys(OUTCOME) as Outcome[]).map((value) => (
          <OptionTile
            key={value}
            input={
              <input
                type="radio"
                name="outcome"
                value={value}
                checked={outcome === value}
                onChange={() => setOutcome(value)}
              />
            }
            title={OUTCOME[value].title}
            description={OUTCOME[value].description}
            trailing={
              managerChoice === value ? <Badge variant="info">Manager’s choice</Badge> : null
            }
          />
        ))}
      </OptionList>
      {outcome === "extend" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.extension}>Extend by</Label>
          <Select
            items={EXTENSIONS}
            value={extension}
            onValueChange={(value) => setExtension(String(value) as Extension)}
          >
            <SelectTrigger id={ids.extension} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(EXTENSIONS) as Extension[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {EXTENSIONS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.effective}>Effective date</Label>
        <Input
          id={ids.effective}
          type="date"
          value={effective}
          onChange={(event) => setEffective(event.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.note}>Note for the record</Label>
        <Textarea
          id={ids.note}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={
            outcome === "extend" ? "e.g. Pair with a mentor; review again in 30 days" : "Optional"
          }
        />
      </div>
      <label
        htmlFor={ids.notify}
        className="flex items-center justify-between gap-3 rounded-md bg-pane px-3.5 py-3"
      >
        <span className="text-sm font-medium">
          Notify {first} and {review.manager.name}
        </span>
        <Switch id={ids.notify} checked={notify} onCheckedChange={setNotify} />
      </label>
      <Button type="submit" className="w-full">
        {outcome === "discuss" ? (
          <>
            <EventIcon aria-hidden /> Book a call with {managerFirst}
          </>
        ) : (
          <>
            <HowToRegIcon aria-hidden /> Record decision
          </>
        )}
      </Button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {outcome === "extend"
                ? `Extend ${first}’s probation?`
                : `Confirm ${first}’s employment?`}
            </DialogTitle>
            <DialogDescription>
              {outcome === "extend" ? (
                <>
                  This extends {review.person.name}’s probation by{" "}
                  <b className="font-medium">{EXTENSIONS[extension]}</b> from{" "}
                  <b className="font-medium">{effectiveLabel}</b>.
                </>
              ) : (
                <>
                  This confirms {review.person.name}’s employment and ends the probation period,
                  effective <b className="font-medium">{effectiveLabel}</b>.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-on-surface-variant">
            {notify
              ? `${first} and ${review.manager.name} will be notified.`
              : "No one will be notified."}{" "}
            The change is added to the audit log.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={decide.isPending} onClick={record}>
              {outcome === "extend" ? "Extend probation" : "Confirm employment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
