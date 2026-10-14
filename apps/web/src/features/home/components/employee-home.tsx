import type {
  Contribution,
  KnowledgeOrigin,
  Milestone,
  MyOnboarding,
  MyPerson,
  MyTask,
  MyTasks,
  NextUp,
  TeamActivity,
} from "@contextos/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { cn } from "cn";
import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { AskBand } from "@/components/ask-band";
import { useAssistant } from "@/components/layout/assistant-context";
import { PageHeader } from "@/components/layout/page-header";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { SectionCard } from "@/components/section-card";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConnectedButton, ConnectedButtonGroup } from "@/components/ui/connected-button-group";
import {
  AddIcon,
  ArrowForwardIcon,
  ArticleIcon,
  CancelIcon,
  CelebrationFilledIcon,
  ChatIcon,
  CheckCircleFilledIcon,
  CheckCircleIcon,
  CheckIcon,
  CodeIcon,
  ConfirmationNumberIcon,
  CoPresentIcon,
  ConstructionIcon,
  DescriptionIcon,
  DoneAllIcon,
  EditDocumentIcon,
  EventAvailableIcon,
  EventIcon,
  EventRepeatIcon,
  FactCheckIcon,
  FlagIcon,
  ForumIcon,
  HubIcon,
  LockIcon,
  MenuBookIcon,
  MyLocationIcon,
  PendingIcon,
  PlayArrowFilledIcon,
  PlayCircleFilledIcon,
  QuizIcon,
  RocketLaunchIcon,
  RouteIcon,
  ScheduleIcon,
  SchoolFilledIcon,
  TagIcon,
  UpdateIcon,
  VerifiedIcon,
  WavingHandIcon,
} from "@/components/ui/icons";
import { TypeChip } from "@/components/ui/meta-chip";
import { Progress } from "@/components/ui/progress";
import { ProgressRing } from "@/components/ui/progress-ring";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedItemTrail,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { Shape } from "@/components/ui/shape";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { meQuery } from "@/features/account/api/account.queries";
import { HOME_ENDPOINTS as E } from "@/features/home/api/home.api";
import { homeQuery } from "@/features/home/api/home.queries";
import { comingSoon } from "@/lib/coming-soon";
import {
  daysFromToday,
  formatCount,
  formatDayDate,
  formatDayDistance,
  formatLongDate,
  formatPercent,
  formatRelativeTime,
  formatShortDate,
  formatWeekday,
  greetingFor,
  parseDateOnly,
} from "@/lib/format";
import { DotList } from "./dashboard";
import { ONBOARDING_STATUS, firstName, formatDateRange } from "./dashboard-meta";

/** The employee's Home (prototype `employeeHome`): what to do next, how onboarding is going, who to ask. */
export function EmployeeHome() {
  const me = useQuery(meQuery());
  const onboarding = useQuery(homeQuery("myOnboarding"));
  const nextUp = useQuery(homeQuery("nextUp"));
  const tasks = useQuery(homeQuery("myTasks"));

  const plan = onboarding.data;
  const day = plan ? 1 - daysFromToday(plan.startDate) : null;
  const stage = plan?.stages.find((entry) => entry.state === "current");
  const dueThisWeek = tasks.data?.items.filter((task) => task.state === "open").length;
  const pace = plan
    ? plan.progress > plan.expected + 0.02
      ? "slightly ahead of plan"
      : plan.progress < plan.expected - 0.02
        ? "a little behind plan"
        : "on plan"
    : null;
  const prompts = [
    nextUp.data?.item?.suggestedQuestion,
    "What does my team own?",
    "What changed in the Knowledge Hub this week?",
    "Who are the experts on my team?",
  ].filter((prompt): prompt is string => Boolean(prompt));

  return (
    <div className="mx-auto flex max-w-360 flex-col">
      <PageHeader
        kicker={formatLongDate()}
        title={`${greetingFor()}${me.data ? `, ${firstName(me.data.name)}` : ""}`}
        description={
          day !== null && stage && pace ? (
            <>
              Week {Math.max(1, Math.ceil(day / 7))} of your onboarding. You're {pace} in{" "}
              <b className="font-medium text-on-surface">{stage.name}</b>
              {dueThisWeek ? `, with ${formatCount(dueThisWeek, "thing")} due this week.` : "."}
            </>
          ) : undefined
        }
        actions={
          <Button variant="outline" onClick={() => comingSoon("My roadmap")}>
            <RouteIcon aria-hidden /> View roadmap
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-3 [grid-template-areas:'hero'_'prog'_'week'_'miles'_'ask'_'news'_'side'] medium:gap-4 @min-[640px]:grid-cols-2 @min-[640px]:[grid-template-areas:'hero_hero'_'prog_miles'_'week_week'_'ask_ask'_'news_news'_'side_side'] @min-[940px]:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] @min-[940px]:[grid-template-areas:'hero_prog'_'week_miles'_'ask_ask'_'news_side']">
        <NextUpCard query={nextUp} />
        <OnboardingCard query={onboarding} day={day} />
        <WeekCard query={tasks} stageName={stage?.name} />
        <MilestonesCard />
        <AskBand className="[grid-area:ask]" prompts={prompts} />
        <div className="grid gap-3 [grid-area:news] medium:gap-4 @min-[640px]:grid-cols-2 @min-[940px]:grid-cols-1">
          <KnowledgeUpdatesCard />
          <TeamActivityCard />
        </div>
        <div className="grid gap-3 [grid-area:side] medium:gap-4 @min-[640px]:grid-cols-2 @min-[940px]:grid-cols-1">
          <MyPeopleCard />
          <ContributionsCard />
        </div>
      </div>
    </div>
  );
}

/* ---- Up next (hero) ------------------------------------------------------------------------ */

function NextUpCard({ query }: { query: UseQueryResult<{ item: NextUp | null }> }) {
  const headingId = useId();
  const item = query.data?.item;
  return (
    <Card
      tone="primary"
      role="region"
      aria-labelledby={headingId}
      className="flex-row gap-4 rounded-2xl px-6 py-6 [grid-area:hero] medium:rounded-3xl medium:py-7 medium:pr-7 medium:pl-8"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex h-7 items-center gap-1 rounded-full bg-primary pr-3 pl-2 text-sm font-medium text-primary-foreground [&_svg]:size-4.5">
            <PlayCircleFilledIcon aria-hidden />
            Up next
          </span>
          {item ? (
            <span className="text-sm font-medium">
              {item.stageName} · Module {item.moduleIndex} of {item.moduleCount}
            </span>
          ) : null}
          <PreviewDataChip endpoint={E.nextUp.path} />
        </div>
        {query.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-10 w-3/4 bg-primary/15" />
            <Skeleton className="h-5 w-2/3 bg-primary/15" />
            <Skeleton className="h-8 w-full bg-primary/15" />
          </div>
        ) : query.isError ? (
          <>
            <h2 id={headingId} className="font-heading text-2xl leading-8 font-semibold">
              Your next module could not be loaded.
            </h2>
            <div>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Retry
              </Button>
            </div>
          </>
        ) : !item ? (
          <>
            <h2
              id={headingId}
              className="font-heading text-[28px] leading-9 font-semibold tracking-tight text-balance"
            >
              Nothing assigned yet
            </h2>
            <p className="max-w-[52ch] text-base">
              Your manager assigns a learning roadmap when you start. Until then, explore the
              Knowledge Hub or ask Context Bot anything.
            </p>
          </>
        ) : (
          <NextUpBody item={item} headingId={headingId} />
        )}
      </div>
      <div
        aria-hidden
        className="relative hidden min-h-50 w-[clamp(150px,26%,250px)] shrink-0 self-stretch @min-[640px]:block"
      >
        <Shape
          kind="cookie9"
          className="absolute top-1/2 right-[6%] aspect-square h-auto w-[82%] -translate-y-1/2 text-primary motion-safe:animate-[spin_48s_linear_infinite]"
        />
        <span className="absolute top-1/2 right-[6%] grid aspect-square w-[82%] -translate-y-1/2 place-items-center text-primary-foreground">
          <SchoolFilledIcon className="size-[clamp(44px,5vw,72px)]" />
        </span>
        <Shape
          kind="clover4"
          className="absolute top-[4%] left-0 aspect-square h-auto w-[30%] text-ai-container motion-safe:animate-[spin_30s_linear_infinite_reverse]"
        />
        <span className="absolute right-0 bottom-[8%] aspect-[2.6] w-[40%] -rotate-24 rounded-full bg-surface-container-lowest" />
        <Shape
          kind="sunny"
          className="absolute bottom-[10%] left-[12%] aspect-square h-auto w-[18%] text-primary/55 motion-safe:animate-[spin_22s_linear_infinite]"
        />
      </div>
    </Card>
  );
}

function NextUpBody({ item, headingId }: { item: NextUp; headingId: string }) {
  const { openAssistant } = useAssistant();
  return (
    <>
      <h2
        id={headingId}
        className="font-heading text-[28px] leading-9 font-semibold tracking-tight text-balance medium:text-[32px] medium:leading-10"
      >
        {item.title}
      </h2>
      <p className="max-w-[52ch] text-base">{item.summary}</p>
      <ol aria-label="Lessons" className="flex flex-wrap gap-1.5">
        {item.lessons.map((lesson) => (
          <li
            key={lesson.id}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-full bg-surface-container-lowest/50 pr-3 pl-1.5 text-sm font-medium",
              lesson.state === "current" && "bg-pane text-on-surface",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-5 place-items-center rounded-full shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--color-on-primary-container)_45%,transparent)] [&_svg]:size-3.5",
                lesson.state === "done" && "bg-primary text-primary-foreground shadow-none",
                lesson.state === "current" && "shadow-[inset_0_0_0_6px_var(--color-primary)]",
              )}
            >
              {lesson.state === "done" ? <CheckIcon /> : null}
            </span>
            {lesson.title}
            {lesson.state !== "todo" ? <span className="sr-only">({lesson.state})</span> : null}
          </li>
        ))}
      </ol>
      <div className="flex max-w-140 items-center gap-4">
        <Progress
          value={Math.round(item.progress * 100)}
          aria-label="Module progress"
          className="flex-1 [--progress-track:color-mix(in_srgb,var(--color-primary)_22%,transparent)]"
        />
        <span className="text-sm font-medium whitespace-nowrap">{item.minutesLeft} min left</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-3">
        <Button size="md" onClick={() => comingSoon("Lessons")}>
          <PlayArrowFilledIcon aria-hidden /> Resume module
        </Button>
        {item.suggestedQuestion ? (
          <Button
            size="md"
            variant="ai-tonal"
            onClick={() => openAssistant(item.suggestedQuestion ?? undefined)}
          >
            <HubIcon aria-hidden /> Ask about this lesson
          </Button>
        ) : null}
      </div>
      <p className="flex flex-wrap items-center gap-1.5 text-xs">
        <VerifiedIcon className="size-4" aria-hidden />
        {[
          item.owner ? `Owned by ${item.owner.name}` : null,
          `Updated ${formatShortDate(item.updatedAt)}`,
          `Based on ${formatCount(item.sourceCount, "source")}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </>
  );
}

/* ---- Your onboarding --------------------------------------------------------------------- */

function OnboardingCard({
  query,
  day,
}: {
  query: UseQueryResult<MyOnboarding>;
  day: number | null;
}) {
  const plan = query.data;
  const status = plan ? ONBOARDING_STATUS[plan.status] : null;
  return (
    <SectionCard
      className="[grid-area:prog]"
      title="Your onboarding"
      endpoint={E.myOnboarding.path}
      status={query}
      action={
        status ? (
          <StatusChip tone={status.tone} icon={status.icon}>
            {status.label}
          </StatusChip>
        ) : undefined
      }
    >
      {plan ? (
        <>
          <div className="flex flex-wrap items-center gap-5">
            <ProgressRing
              value={plan.progress}
              role="img"
              aria-label={`Onboarding ${formatPercent(plan.progress)} complete, day ${day ?? 1} of ${plan.totalDays}`}
            >
              <span className="font-heading text-[32px] leading-9 font-semibold tracking-tight">
                {formatPercent(plan.progress)}
              </span>
              <span className="text-xs font-medium text-on-surface-variant">
                Day {Math.max(1, day ?? 1)} of {plan.totalDays}
              </span>
            </ProgressRing>
            <dl className="flex min-w-27 flex-1 flex-col gap-2.5">
              {(
                [
                  ["Modules", plan.modules],
                  ["Checks passed", plan.checks],
                  ["Tasks done", plan.tasks],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium text-on-surface-variant">{label}</dt>
                  <dd>
                    <span className="font-heading text-[22px] leading-7 font-semibold tabular-nums">
                      {value.done}
                    </span>
                    <span className="text-xs text-on-surface-variant"> / {value.total}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <ol aria-label="Onboarding stages" className="flex flex-col gap-0.5">
            {plan.stages.map((stage) => (
              <li
                key={stage.id}
                className="flex items-start gap-3 rounded-xs bg-pane px-3 py-2.5 first:rounded-t-lg last:rounded-b-lg"
              >
                <StageMark state={stage.state} />
                <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <b
                      className={cn(
                        "text-sm font-medium",
                        stage.state === "later" && "text-on-surface-variant",
                      )}
                    >
                      {stage.name}
                    </b>
                    <span className="text-xs text-on-surface-variant">
                      Weeks {stage.weekStart}–{stage.weekEnd}
                    </span>
                  </div>
                  {stage.state === "current" ? (
                    <div className="flex items-center gap-2.5">
                      <Progress
                        value={Math.round(stage.progress * 100)}
                        aria-label={`${stage.name} progress`}
                        className="flex-1"
                      />
                      <span className="text-xs whitespace-nowrap text-on-surface-variant">
                        {stage.modules.done} of {stage.modules.total} modules
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-on-surface-variant">
                      {stage.state === "done"
                        ? "Done"
                        : `Starts ${formatShortDate(stage.startsOn)}`}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </SectionCard>
  );
}

function StageMark({ state }: { state: "done" | "current" | "next" | "later" }) {
  if (state === "current") {
    return (
      <span
        aria-hidden
        className="relative grid size-7 shrink-0 place-items-center text-primary-foreground"
      >
        <Shape kind="cookie7" className="absolute inset-0 size-full text-primary" />
        <SchoolFilledIcon className="relative z-10 size-4" />
      </span>
    );
  }
  return (
    <span aria-hidden className="grid size-7 shrink-0 place-items-center">
      {state === "done" ? (
        <CheckCircleFilledIcon className="size-5 text-success" />
      ) : state === "next" ? (
        <span className="size-3 rounded-full shadow-[inset_0_0_0_2px_var(--color-outline)]" />
      ) : (
        <span className="size-2 rounded-full bg-outline-variant" />
      )}
    </span>
  );
}

/* ---- This week --------------------------------------------------------------------------- */

const TASK_ICON: Record<MyTask["kind"], ReactNode> = {
  check: <QuizIcon />,
  practical: <ConstructionIcon />,
  reading: <ArticleIcon />,
  meeting: <EventIcon />,
};
const TASK_ACTION: Record<MyTask["kind"], string> = {
  check: "Start",
  practical: "Continue",
  reading: "Read",
  meeting: "Add topics",
};
const TASK_LEAD: Record<MyTask["kind"], "primary" | "secondary" | "neutral"> = {
  check: "primary",
  practical: "secondary",
  reading: "neutral",
  meeting: "neutral",
};

type TaskFilter = "open" | "overdue" | "done";

function WeekCard({
  query,
  stageName,
}: {
  query: UseQueryResult<MyTasks>;
  stageName: string | undefined;
}) {
  const [filter, setFilter] = useState<TaskFilter>("open");
  // Read the clock once per mount: rendering must not depend on when it happens.
  const [now] = useState(() => Date.now());
  const items = query.data?.items ?? [];
  const isOverdue = (task: MyTask) =>
    task.state === "open" && task.dueAt !== null && Date.parse(task.dueAt) < now;
  const groups: Record<TaskFilter, MyTask[]> = {
    open: items.filter((task) => task.state === "open" && !isOverdue(task)),
    overdue: items.filter(isOverdue),
    done: items.filter((task) => task.state === "done"),
  };
  const shown = groups[filter];
  const range = query.data
    ? formatDateRange(parseDateOnly(query.data.from), parseDateOnly(query.data.to))
    : undefined;

  return (
    <SectionCard
      className="[grid-area:week]"
      title="This week"
      count={range}
      endpoint={E.myTasks.path}
      status={query}
      action={
        <ConnectedButtonGroup size="sm" aria-label="Filter tasks">
          {(
            [
              ["open", "To do"],
              ["overdue", "Overdue"],
              ["done", "Done"],
            ] as const
          ).map(([value, label]) => (
            <ConnectedButton
              key={value}
              pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label} <span className="tabular-nums">{groups[value].length}</span>
            </ConnectedButton>
          ))}
        </ConnectedButtonGroup>
      }
    >
      {shown.length === 0 ? (
        <div className="flex items-center gap-4 rounded-xl bg-pane p-5">
          <span
            aria-hidden
            className="relative grid size-14 shrink-0 place-items-center text-on-success-container"
          >
            <Shape kind="sunny" className="absolute inset-0 size-full text-success-container" />
            <CelebrationFilledIcon className="relative z-10 size-6" />
          </span>
          <div>
            <b className="text-sm font-medium">
              {filter === "overdue"
                ? "Nothing overdue"
                : filter === "done"
                  ? "Nothing finished yet"
                  : "Nothing else due"}
            </b>
            <p className="text-xs text-on-surface-variant">
              {filter === "overdue"
                ? `You're on schedule.${stageName ? ` Keep going with ${stageName}.` : ""}`
                : filter === "done"
                  ? "Finished tasks from this week show up here."
                  : "You're clear for the rest of the week."}
            </p>
          </div>
        </div>
      ) : (
        <SegmentedList>
          {shown.map((task) => (
            <TaskRow key={task.id} task={task} overdue={filter === "overdue"} />
          ))}
        </SegmentedList>
      )}
    </SectionCard>
  );
}

function TaskRow({ task, overdue }: { task: MyTask; overdue: boolean }) {
  const done = task.state === "done";
  const due = task.dueAt
    ? task.kind === "meeting"
      ? formatDayDistance(task.dueAt)
      : `Due ${formatDayDate(task.dueAt)}`
    : null;
  return (
    <SegmentedItem className="flex-wrap @min-[640px]:flex-nowrap">
      <SegmentedItemLead tone={done ? "success" : TASK_LEAD[task.kind]}>
        {done ? <CheckCircleFilledIcon aria-hidden /> : TASK_ICON[task.kind]}
      </SegmentedItemLead>
      <SegmentedItemBody>
        <SegmentedItemTitle className={cn("whitespace-normal", done && "text-on-surface-variant")}>
          {task.title}
        </SegmentedItemTitle>
        <SegmentedItemMeta>
          <DotList
            parts={[
              ...task.details,
              done && task.completedAt ? `Completed ${formatDayDate(task.completedAt)}` : null,
              task.inProgress ? (
                <span className="font-medium text-primary">In progress</span>
              ) : null,
            ]}
          />
        </SegmentedItemMeta>
      </SegmentedItemBody>
      {!done ? (
        <SegmentedItemTrail className="w-full justify-between ps-14 @min-[640px]:w-auto @min-[640px]:ps-0">
          {due ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-on-surface-variant",
                task.kind === "check" && "text-primary",
                overdue && "text-error",
              )}
            >
              <ScheduleIcon className="size-4" aria-hidden />
              {due}
            </span>
          ) : null}
          <Button
            size="xs"
            variant={task.kind === "check" ? "default" : "outline"}
            onClick={() =>
              comingSoon(task.kind === "meeting" ? "Check-in agendas" : "Learning tasks")
            }
          >
            {TASK_ACTION[task.kind]}
          </Button>
        </SegmentedItemTrail>
      ) : null}
    </SegmentedItem>
  );
}

/* ---- Milestones -------------------------------------------------------------------------- */

const MILESTONE_ICON: Record<Milestone["kind"], ReactNode> = {
  checkin: <ForumIcon />,
  stage: <FlagIcon />,
  review: <EventAvailableIcon />,
  readiness: <FactCheckIcon />,
  probation: <VerifiedIcon />,
};

function MilestonesCard() {
  const query = useQuery(homeQuery("milestones"));
  return (
    <SectionCard
      className="[grid-area:miles]"
      title="Milestones"
      endpoint={E.milestones.path}
      status={query}
      action={
        <Button
          variant="ghost"
          size="icon"
          aria-label="See all milestones"
          onClick={() => comingSoon("My roadmap")}
        >
          <ArrowForwardIcon />
        </Button>
      }
    >
      {query.data && query.data.items.length > 0 ? (
        <Timeline>
          {query.data.items.map((milestone) => (
            <TimelineItem
              key={milestone.id}
              dateLabel={formatWeekday(milestone.dueOn)}
              date={formatShortDate(milestone.dueOn)}
              icon={MILESTONE_ICON[milestone.kind]}
              state={milestone.state}
              title={milestone.title}
              detail={milestone.detail}
            />
          ))}
        </Timeline>
      ) : (
        <p className="text-sm text-on-surface-variant">No milestones yet.</p>
      )}
    </SectionCard>
  );
}

/* ---- Knowledge updates for you ------------------------------------------------------------ */

const ORIGIN: Record<KnowledgeOrigin, { label: string; icon: ReactNode }> = {
  google_drive: { label: "Google Drive", icon: <DescriptionIcon /> },
  github: { label: "GitHub", icon: <CodeIcon /> },
  slack: { label: "Slack", icon: <TagIcon /> },
  jira: { label: "Jira", icon: <ConfirmationNumberIcon /> },
  confluence: { label: "Confluence", icon: <ArticleIcon /> },
  knowledge_hub: { label: "Knowledge Hub", icon: <HubIcon /> },
};

function ArrowLink({ to, label }: { to: string; label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      nativeButton={false}
      render={<Link to={to} />}
      aria-label={label}
    >
      <ArrowForwardIcon />
    </Button>
  );
}

function KnowledgeUpdatesCard() {
  const query = useQuery(homeQuery("knowledgeUpdates"));
  return (
    <SectionCard
      title="Knowledge updates for you"
      endpoint={E.knowledgeUpdates.path}
      status={query}
      action={<ArrowLink to="/knowledge" label="Open Knowledge Hub" />}
    >
      {query.data?.items.length ? (
        <SegmentedList>
          {query.data.items.map((update) => {
            const origin = ORIGIN[update.origin];
            const body = (
              <>
                <SegmentedItemLead tone="neutral">{origin.icon}</SegmentedItemLead>
                <SegmentedItemBody>
                  <SegmentedItemTitle className="whitespace-normal">
                    {update.title}
                  </SegmentedItemTitle>
                  <SegmentedItemMeta>
                    <DotList
                      parts={[
                        origin.label,
                        update.author,
                        formatRelativeTime(update.updatedAt),
                        update.restrictedTo ? (
                          <span className="inline-flex items-center gap-1">
                            <LockIcon className="size-3.5" aria-hidden />
                            {update.restrictedTo}
                          </span>
                        ) : null,
                      ]}
                    />
                  </SegmentedItemMeta>
                  {update.reason ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-ai">
                      <MyLocationIcon className="size-3.5" aria-hidden />
                      {update.reason}
                    </span>
                  ) : null}
                </SegmentedItemBody>
                <SegmentedItemTrail className="hidden @min-[640px]:flex">
                  <TypeChip>{update.tag}</TypeChip>
                </SegmentedItemTrail>
              </>
            );
            return update.projectId ? (
              <SegmentedItem key={update.id} render={<Link to={`/projects/${update.projectId}`} />}>
                {body}
              </SegmentedItem>
            ) : (
              <SegmentedItem key={update.id}>{body}</SegmentedItem>
            );
          })}
        </SegmentedList>
      ) : (
        <p className="text-sm text-on-surface-variant">
          Nothing new for you since your last visit.
        </p>
      )}
    </SectionCard>
  );
}

/* ---- Team activity ------------------------------------------------------------------------ */

const ACTIVITY_ICON: Record<TeamActivity["kind"], ReactNode> = {
  release: <RocketLaunchIcon />,
  schedule: <EventRepeatIcon />,
  joiner: <WavingHandIcon />,
  event: <CoPresentIcon />,
  update: <UpdateIcon />,
};

function TeamActivityCard() {
  const query = useQuery(homeQuery("teamActivity"));
  const team = query.data?.team;
  return (
    <SectionCard
      title={team ? `${team.name} team` : "Your team"}
      endpoint={E.teamActivity.path}
      status={query}
      action={<ArrowLink to="/members" label="Open People" />}
    >
      {query.data?.items.length ? (
        <SegmentedList>
          {query.data.items.map((activity) => (
            <SegmentedItem key={activity.id}>
              {activity.actor ? (
                <PersonAvatar person={activity.actor} />
              ) : (
                <SegmentedItemLead tone="neutral">{ACTIVITY_ICON[activity.kind]}</SegmentedItemLead>
              )}
              <SegmentedItemBody>
                <span className="text-sm text-on-surface">{activity.text}</span>
                <SegmentedItemMeta>
                  <DotList
                    parts={[
                      activity.actor?.name ?? (team ? `${team.name} team` : null),
                      activity.where,
                      formatRelativeTime(activity.at),
                    ]}
                  />
                </SegmentedItemMeta>
              </SegmentedItemBody>
            </SegmentedItem>
          ))}
        </SegmentedList>
      ) : (
        <p className="text-sm text-on-surface-variant">No team news yet.</p>
      )}
    </SectionCard>
  );
}

/* ---- Your people ---------------------------------------------------------------------------- */

function relationLabel(entry: MyPerson): string {
  switch (entry.relation) {
    case "manager":
      return "Your manager";
    case "buddy":
      return "Onboarding buddy";
    case "mentor":
      return "Mentor";
    case "people_partner":
      return "People partner";
    case "expert":
      return entry.note ? `Expert · ${entry.note}` : "Expert";
  }
}

function MyPeopleCard() {
  const query = useQuery(homeQuery("myPeople"));
  return (
    <SectionCard
      title="Your people"
      endpoint={E.myPeople.path}
      status={query}
      action={<ArrowLink to="/members" label="Open People" />}
    >
      {query.data?.items.length ? (
        <SegmentedList>
          {query.data.items.map((entry) => (
            <SegmentedItem key={entry.person.id} className="min-h-0 gap-3 py-2 pr-2 pl-2.5">
              <PersonAvatar person={entry.person} size="md" />
              <SegmentedItemBody>
                <SegmentedItemTitle>{entry.person.name}</SegmentedItemTitle>
                <span className="truncate text-xs text-on-surface-variant">
                  {relationLabel(entry)}
                </span>
              </SegmentedItemBody>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Message ${entry.person.name}`}
                onClick={() => comingSoon("Messages")}
              >
                <ChatIcon />
              </Button>
            </SegmentedItem>
          ))}
        </SegmentedList>
      ) : (
        <p className="text-sm text-on-surface-variant">
          Your manager and buddy appear here once they are assigned.
        </p>
      )}
    </SectionCard>
  );
}

/* ---- Your contributions ---------------------------------------------------------------------- */

const CONTRIBUTION_KIND: Record<Contribution["kind"], { label: string; icon: ReactNode }> = {
  glossary_term: { label: "New glossary term", icon: <MenuBookIcon /> },
  edit: { label: "Suggested edit", icon: <EditDocumentIcon /> },
  flag: { label: "Flagged as outdated", icon: <FlagIcon /> },
  article: { label: "New article", icon: <ArticleIcon /> },
};

const CONTRIBUTION_STATUS: Record<
  Contribution["status"],
  { label: string; tone: "info" | "success" | "neutral" | "error"; icon: ReactNode }
> = {
  in_review: { label: "In review", tone: "info", icon: <PendingIcon /> },
  published: { label: "Published", tone: "success", icon: <CheckCircleIcon /> },
  resolved: { label: "Resolved", tone: "neutral", icon: <DoneAllIcon /> },
  rejected: { label: "Not accepted", tone: "error", icon: <CancelIcon /> },
};

function ContributionsCard() {
  const query = useQuery(homeQuery("contributions"));
  const items = query.data?.items ?? [];
  const inReview = items.filter((item) => item.status === "in_review").length;
  return (
    <SectionCard
      title="Your contributions"
      count={query.data ? `${items.length} · ${inReview} in review` : undefined}
      endpoint={E.contributions.path}
      status={query}
      footer={
        <Button variant="secondary" onClick={() => comingSoon("Contributing knowledge")}>
          <AddIcon aria-hidden /> Contribute knowledge
        </Button>
      }
    >
      {items.length ? (
        <SegmentedList>
          {items.map((item) => {
            const kind = CONTRIBUTION_KIND[item.kind];
            const status = CONTRIBUTION_STATUS[item.status];
            return (
              <SegmentedItem key={item.id} className="min-h-0 items-start gap-3 px-3 py-2.5">
                <SegmentedItemLead tone="neutral" size="sm">
                  {kind.icon}
                </SegmentedItemLead>
                <SegmentedItemBody>
                  <SegmentedItemTitle className="whitespace-normal">
                    {item.title}
                  </SegmentedItemTitle>
                  <SegmentedItemMeta>
                    <DotList parts={[kind.label, item.detail]} />
                  </SegmentedItemMeta>
                  <span className="mt-1.5">
                    <StatusChip tone={status.tone} icon={status.icon}>
                      {status.label}
                    </StatusChip>
                  </span>
                </SegmentedItemBody>
              </SegmentedItem>
            );
          })}
        </SegmentedList>
      ) : (
        <p className="text-sm text-on-surface-variant">
          Suggest an edit or flag something outdated, and it shows up here.
        </p>
      )}
    </SectionCard>
  );
}
