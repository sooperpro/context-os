import type { PeopleOpsOverview, ProbationReview } from "@contextos/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { cn } from "cn";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { PersonCell } from "@/components/person-cell";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { SectionCard } from "@/components/section-card";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DotList } from "@/components/ui/dot-list";
import {
  ArrowForwardIcon,
  ArrowUpwardIcon,
  AssignmentLateIcon,
  CheckCircleFilledIcon,
  ErrorIcon,
  LibraryBooksIcon,
  PersonAddIcon,
  RadioButtonUncheckedIcon,
} from "@/components/ui/icons";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Progress } from "@/components/ui/progress";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
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
import { meQuery } from "@/features/account/api/account.queries";
import { HOME_ENDPOINTS as E } from "@/features/home/api/home.api";
import { homeQuery } from "@/features/home/api/home.queries";
import { useRemindManagers } from "@/features/people-ops/api/people-ops.queries";
import { NewOnboardingDialog } from "@/features/people-ops/components/onboarding-dialogs";
import { TemplateTile } from "@/features/people-ops/components/template-parts";
import {
  PROBATION_PATH,
  TEMPLATES_PATH,
  needsHr,
  probationPath,
  recommendationChip,
  templatePath,
} from "@/features/people-ops/people-ops-meta";
import {
  daysFromToday,
  firstName,
  formatCount,
  formatDayDate,
  formatLongDate,
  formatPercent,
  formatShortDate,
  greetingFor,
} from "@/lib/format";
import { DashboardGrid } from "./dashboard";
import { span } from "./dashboard-meta";

/** People Operations' Home (prototype `hrHome`): onboarding across teams, probation reviews, starters. */
export function PeopleOpsHome() {
  const me = useQuery(meQuery());
  const overview = useQuery(homeQuery("peopleOpsOverview"));
  const [creating, setCreating] = useState(false);
  const data = overview.data;

  return (
    <div className="mx-auto flex max-w-360 flex-col">
      <PageHeader
        kicker={formatLongDate()}
        title={`${greetingFor()}${me.data ? `, ${firstName(me.data.name)}` : ""}`}
        description={
          data ? (
            <>
              People Operations · Onboarding across {formatCount(data.teams.length, "team")}.
              {data.reviewsNext30Days.needAction ? (
                <>
                  {" "}
                  <b className="font-medium text-on-surface">
                    {formatCount(data.reviewsNext30Days.needAction, "probation review")}
                  </b>{" "}
                  {data.reviewsNext30Days.needAction === 1 ? "needs" : "need"} you.
                </>
              ) : null}
            </>
          ) : undefined
        }
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link to={TEMPLATES_PATH} />}>
              <LibraryBooksIcon aria-hidden /> Templates
            </Button>
            <Button onClick={() => setCreating(true)}>
              <PersonAddIcon aria-hidden /> New onboarding
            </Button>
          </>
        }
      />
      <div className="mb-3 flex items-center justify-end empty:hidden medium:mb-4">
        <PreviewDataChip endpoint={E.peopleOpsOverview.path} />
      </div>
      <div className="mb-3 grid grid-cols-1 gap-3 medium:mb-4 medium:gap-4 @min-[420px]:grid-cols-2 @min-[940px]:grid-cols-4">
        {data ? (
          <>
            <KpiTile
              label="Active onboardings"
              value={data.activeOnboardings.count}
              delta={
                <Change value={data.activeOnboardings.changeVsLastMonth} suffix="vs. last month" />
              }
            />
            <KpiTile
              label="At risk or blocked"
              value={data.atRiskOrBlocked.count}
              deltaTone={data.atRiskOrBlocked.changeThisWeek > 0 ? "bad" : "neutral"}
              delta={<Change value={data.atRiskOrBlocked.changeThisWeek} suffix="this week" />}
            />
            <KpiTile
              label="Probation reviews in 30 days"
              value={data.reviewsNext30Days.count}
              delta={`${data.reviewsNext30Days.needAction} need action`}
            />
            <KpiTile
              label="Starting in next 14 days"
              value={data.startingNext14Days.count}
              delta={`${data.startingNext14Days.notReady} not ready`}
            />
          </>
        ) : (
          [0, 1, 2, 3].map((tile) => <Skeleton key={tile} className="h-36 rounded-2xl" />)
        )}
      </div>
      <DashboardGrid>
        <ReviewsCard />
        <TeamBarsCard query={overview} />
        <StartersCard />
        <OverdueCard />
        <TemplatesCard />
      </DashboardGrid>
      <NewOnboardingDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function Change({ value, suffix }: { value: number; suffix: string }) {
  return (
    <>
      {value > 0 ? <ArrowUpwardIcon aria-hidden /> : null}
      {value > 0 ? `+${value}` : value} {suffix}
    </>
  );
}

/* ---- Probation reviews -------------------------------------------------------------------- */

/** The state column and the row's action (prototype `reviewRows`). */
function reviewState(review: ProbationReview): {
  text: string;
  className: string;
  action: string;
  kind: "open" | "remind";
} {
  switch (review.state) {
    case "ready_for_approval":
      return {
        text: "Ready for approval",
        className: "text-info",
        action: "Review & approve",
        kind: "open",
      };
    case "needs_hr_review":
      return { text: "Needs HR review", className: "text-warning", action: "Review", kind: "open" };
    case "completed":
      return { text: "Completed", className: "text-success", action: "View", kind: "open" };
    case "checkins_missing":
      return {
        text: `${formatCount(review.missingCheckins, "check-in")} missing`,
        className: "text-error",
        action: "Follow up",
        kind: "remind",
      };
    case "awaiting_manager":
      return {
        text: review.recommendationDueOn
          ? `Due ${formatShortDate(review.recommendationDueOn)}`
          : "Awaiting manager",
        className: "text-on-surface-variant",
        action: "Send reminder",
        kind: "remind",
      };
  }
}

function ReviewsCard() {
  const query = useQuery(homeQuery("probationReviews", { within: 30 }));
  const remind = useRemindManagers();
  const items = query.data?.items ?? [];
  const sendReminder = (review: ProbationReview, action: string) =>
    remind.mutate(
      { about: "probation_review", ids: [review.id] },
      {
        onSuccess: () =>
          toast.success(
            `${action === "Follow up" ? "Follow-up" : "Reminder"} sent to ${review.manager.name}`,
          ),
        onError: () => toast.error("The reminder could not be sent. Please try again."),
      },
    );
  return (
    <SectionCard
      className={span(12)}
      title="Probation reviews · next 30 days"
      endpoint={E.probationReviews.path}
      status={query}
      action={
        <Button variant="ghost" nativeButton={false} render={<Link to={PROBATION_PATH} />}>
          All reviews <ArrowForwardIcon aria-hidden />
        </Button>
      }
    >
      {items.length ? (
        <div className="-mx-6 overflow-x-auto px-6">
          <Table className="min-w-200">
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Manager recommendation</TableHead>
                <TableHead>Readiness</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Action</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((review) => {
                const recommendation = recommendationChip(review);
                const state = reviewState(review);
                return (
                  <TableRow key={review.id}>
                    <TableCell>
                      <PersonCell
                        person={review.person}
                        to={probationPath(review.id)}
                        meta={
                          <span className="whitespace-nowrap">
                            <DotList parts={[review.person.title, review.team]} />
                          </span>
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm whitespace-nowrap tabular-nums">
                        {formatDayDate(review.reviewOn)}
                      </span>
                      <br />
                      <span className="text-xs whitespace-nowrap text-on-surface-variant">
                        Manager: {review.manager.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusChip tone={recommendation.tone} icon={<recommendation.icon />}>
                        {recommendation.label}
                      </StatusChip>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-35 items-center gap-2.5">
                        <Progress
                          flat
                          tone={review.readiness < 0.65 ? "warning" : "primary"}
                          value={Math.round(review.readiness * 100)}
                          aria-label={`${review.person.name} readiness`}
                          className="flex-1"
                        />
                        <span className="text-xs tabular-nums">
                          {formatPercent(review.readiness)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs whitespace-nowrap",
                          state.className,
                        )}
                      >
                        {review.state === "checkins_missing" ? (
                          <ErrorIcon className="size-4" aria-hidden />
                        ) : null}
                        {state.text}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {state.kind === "open" ? (
                        <Button
                          size="xs"
                          variant={needsHr(review.state) ? "secondary" : "ghost"}
                          className="whitespace-nowrap"
                          nativeButton={false}
                          render={<Link to={probationPath(review.id)} />}
                        >
                          {state.action}
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          variant="ghost"
                          className="whitespace-nowrap"
                          disabled={remind.isPending}
                          onClick={() => sendReminder(review, state.action)}
                        >
                          {state.action}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">No probation reviews in the next 30 days.</p>
      )}
    </SectionCard>
  );
}

/* ---- Onboarding by team ------------------------------------------------------------------- */

const BAR = {
  onTrack: { label: "On track", className: "bg-secondary-strong/50" },
  atRisk: { label: "At risk", className: "bg-warning" },
  blocked: { label: "Blocked", className: "bg-error" },
} as const;

function TeamBarsCard({ query }: { query: UseQueryResult<PeopleOpsOverview> }) {
  const teams = query.data?.teams ?? [];
  const totals = teams.map((team) => team.onTrack + team.atRisk + team.blocked);
  const max = Math.max(1, ...totals);
  const people = totals.reduce((sum, total) => sum + total, 0);
  return (
    <SectionCard
      className={span(7)}
      title="Onboarding by team"
      count={query.data ? formatCount(people, "person", "people") : undefined}
      endpoint={E.peopleOpsOverview.path}
      status={query}
    >
      <div aria-hidden className="flex flex-wrap gap-4 text-xs font-medium text-on-surface-variant">
        {Object.values(BAR).map((bar) => (
          <span key={bar.label} className="inline-flex items-center gap-1.5">
            <i className={cn("size-3 rounded-[3px]", bar.className)} />
            {bar.label}
          </span>
        ))}
      </div>
      <ul className="flex flex-col gap-3 py-1">
        {teams.map((team, index) => {
          const total = totals[index] ?? 0;
          const notes = [
            team.atRisk ? `${team.atRisk} at risk` : null,
            team.blocked ? `${team.blocked} blocked` : null,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <li
              key={team.team}
              className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 @min-[520px]:grid-cols-[96px_minmax(0,1fr)_minmax(0,150px)]"
            >
              <span className="truncate text-sm">{team.team}</span>
              <span
                className="flex h-5 gap-0.5 [&>*:last-child]:rounded-r-xs"
                style={{ width: `${(total / max) * 100}%` }}
                role="img"
                aria-label={`${team.team}: ${team.onTrack} on track, ${team.atRisk} at risk, ${team.blocked} blocked`}
              >
                {(["onTrack", "atRisk", "blocked"] as const).map((key) =>
                  team[key] ? (
                    <span
                      key={key}
                      title={`${team.team} · ${BAR[key].label}: ${team[key]}`}
                      className={cn("h-full", BAR[key].className)}
                      style={{ flex: team[key] }}
                    />
                  ) : null,
                )}
              </span>
              <span className="col-start-2 truncate text-xs tabular-nums @min-[520px]:col-start-3">
                <b className="font-medium">{total}</b>
                {notes ? <span className="text-on-surface-variant"> · {notes}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

/* ---- Starting soon ------------------------------------------------------------------------ */

function StartersCard() {
  const query = useQuery(homeQuery("starters", { within: 14 }));
  const items = query.data?.items ?? [];
  return (
    <SectionCard
      className={span(5)}
      title="Starting soon"
      count={query.data ? items.length : undefined}
      endpoint={E.starters.path}
      status={query}
    >
      {items.length ? (
        <SegmentedList>
          {items.map((starter) => {
            const checks = [
              ["Accounts", starter.accountsReady],
              ["Buddy", starter.buddyAssigned],
              ["Roadmap", starter.roadmapAssigned],
            ] as const;
            const ready = checks.every(([, done]) => done);
            return (
              <SegmentedItem key={starter.id} className="items-start">
                <PersonAvatar person={starter.person} size="sm" />
                <SegmentedItemBody>
                  <SegmentedItemTitle>{starter.person.name}</SegmentedItemTitle>
                  <SegmentedItemMeta>
                    <DotList
                      parts={[starter.person.title, starter.team, formatDayDate(starter.startDate)]}
                    />
                  </SegmentedItemMeta>
                  <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {checks.map(([label, done]) => (
                      <span
                        key={label}
                        className={cn(
                          "inline-flex items-center gap-0.5 text-xs font-medium [&_svg]:size-4",
                          done ? "text-success" : "text-on-surface-variant",
                        )}
                      >
                        {done ? (
                          <CheckCircleFilledIcon aria-hidden />
                        ) : (
                          <RadioButtonUncheckedIcon aria-hidden />
                        )}
                        {label}
                        <span className="sr-only">{done ? " ready" : " missing"}</span>
                      </span>
                    ))}
                  </span>
                </SegmentedItemBody>
                {ready ? null : (
                  <StatusChip tone="warning" icon={<ErrorIcon />}>
                    Not ready
                  </StatusChip>
                )}
              </SegmentedItem>
            );
          })}
        </SegmentedList>
      ) : (
        <p className="text-sm text-on-surface-variant">Nobody starts in the next two weeks.</p>
      )}
    </SectionCard>
  );
}

/* ---- Overdue milestones ------------------------------------------------------------------- */

function OverdueCard() {
  const query = useQuery(homeQuery("overdueMilestones"));
  const remind = useRemindManagers();
  const items = query.data?.items ?? [];
  return (
    <SectionCard
      className={span(5)}
      title="Overdue milestones"
      count={query.data ? items.length : undefined}
      endpoint={E.overdueMilestones.path}
      status={query}
    >
      {items.length ? (
        <SegmentedList>
          {items.map((item) => (
            <SegmentedItem key={item.id}>
              <SegmentedItemLead tone="warning">
                <AssignmentLateIcon aria-hidden />
              </SegmentedItemLead>
              <SegmentedItemBody>
                <SegmentedItemTitle className="whitespace-normal">
                  {item.person.name} · {item.milestone}
                </SegmentedItemTitle>
                <SegmentedItemMeta>
                  <DotList
                    parts={[item.team, `${formatCount(-daysFromToday(item.dueOn), "day")} overdue`]}
                  />
                </SegmentedItemMeta>
              </SegmentedItemBody>
              <Button
                size="xs"
                variant="ghost"
                disabled={remind.isPending}
                onClick={() =>
                  remind.mutate(
                    { about: "milestone", ids: [item.id] },
                    {
                      onSuccess: () =>
                        toast.success(`Follow-up sent to ${item.person.name}’s manager`),
                      onError: () =>
                        toast.error("The follow-up could not be sent. Please try again."),
                    },
                  )
                }
              >
                Follow up
              </Button>
            </SegmentedItem>
          ))}
        </SegmentedList>
      ) : (
        <p className="text-sm text-on-surface-variant">No overdue milestones.</p>
      )}
    </SectionCard>
  );
}

/* ---- Onboarding templates ----------------------------------------------------------------- */

function TemplatesCard() {
  const query = useQuery(homeQuery("templates"));
  // The most used templates; the rest are on the Templates page.
  const items = (query.data?.items ?? []).slice(0, 4);
  return (
    <SectionCard
      className={span(7)}
      title="Onboarding templates"
      endpoint={E.templates.path}
      status={query}
      action={
        <Button variant="ghost" nativeButton={false} render={<Link to={TEMPLATES_PATH} />}>
          Manage templates <ArrowForwardIcon aria-hidden />
        </Button>
      }
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {items.map((template) => (
          <Link
            key={template.id}
            to={templatePath(template.id)}
            className="relative isolate flex flex-col gap-2 rounded-xl bg-pane p-4 text-start text-on-surface no-underline transition-colors outline-none hover:bg-on-surface/8 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="mb-1">
              <TemplateTile family={template.family} />
            </span>
            <span className="text-sm font-medium">{template.name}</span>
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-on-surface-variant">
              <DotList
                parts={[
                  template.status === "draft" ? `Draft ${template.version}` : template.version,
                  `${template.activeCount} active`,
                  `Updated ${formatShortDate(template.updatedAt)}`,
                ]}
              />
            </span>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}
