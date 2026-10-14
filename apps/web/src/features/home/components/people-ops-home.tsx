import type { OnboardingTemplate, PeopleOpsOverview, ProbationReview } from "@contextos/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { cn } from "cn";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { SectionCard } from "@/components/section-card";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  ArrowForwardIcon,
  ArrowUpwardIcon,
  AssignmentLateIcon,
  CheckCircleFilledIcon,
  CodeIcon,
  ErrorIcon,
  HandshakeIcon,
  HourglassEmptyIcon,
  LibraryBooksIcon,
  MoreTimeIcon,
  PersonAddIcon,
  RadioButtonUncheckedIcon,
  SupervisorAccountIcon,
  SupportAgentIcon,
  ThumbUpIcon,
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
import { Shape, type ShapeKind } from "@/components/ui/shape";
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
import { comingSoon } from "@/lib/coming-soon";
import { daysFromToday, firstName, formatCount, formatDayDate, formatLongDate, formatPercent, formatShortDate, greetingFor } from "@/lib/format";
import { DotList } from "@/components/ui/dot-list";
import { DashboardGrid } from "./dashboard";
import { span } from "./dashboard-meta";

/** People Operations' Home (prototype `hrHome`): onboarding across teams, probation reviews, starters. */
export function PeopleOpsHome() {
  const me = useQuery(meQuery());
  const overview = useQuery(homeQuery("peopleOpsOverview"));
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
            <Button variant="outline" onClick={() => comingSoon("Templates")}>
              <LibraryBooksIcon aria-hidden /> Templates
            </Button>
            <Button onClick={() => comingSoon("New onboarding")}>
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

const RECOMMENDATION: Record<
  ProbationReview["recommendation"],
  { label: string; tone: "success" | "warning" | "neutral"; icon: ReactNode }
> = {
  confirm: { label: "Confirm", tone: "success", icon: <ThumbUpIcon /> },
  extend: { label: "Extend 30 days", tone: "warning", icon: <MoreTimeIcon /> },
  awaiting_manager: { label: "Awaiting manager", tone: "neutral", icon: <HourglassEmptyIcon /> },
  not_started: { label: "Not started", tone: "neutral", icon: <HourglassEmptyIcon /> },
};

function reviewState(review: ProbationReview): {
  text: string;
  className: string;
  action: string;
  primary: boolean;
} {
  switch (review.state) {
    case "ready_for_approval":
      return {
        text: "Ready for approval",
        className: "text-info",
        action: "Review & approve",
        primary: true,
      };
    case "needs_hr_review":
      return {
        text: "Needs HR review",
        className: "text-warning",
        action: "Review",
        primary: true,
      };
    case "checkins_missing":
      return {
        text: `${formatCount(review.missingCheckins, "check-in")} missing`,
        className: "text-error",
        action: "Follow up",
        primary: false,
      };
    case "awaiting_manager":
      return {
        text: review.recommendationDueOn
          ? `Due ${formatShortDate(review.recommendationDueOn)}`
          : "Awaiting manager",
        className: "text-on-surface-variant",
        action: "Send reminder",
        primary: false,
      };
  }
}

function ReviewsCard() {
  const query = useQuery(homeQuery("probationReviews", { within: 30 }));
  const items = query.data?.items ?? [];
  return (
    <SectionCard
      className={span(12)}
      title="Probation reviews · next 30 days"
      endpoint={E.probationReviews.path}
      status={query}
      action={
        <Button variant="ghost" onClick={() => comingSoon("Probation reviews")}>
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
                const recommendation = RECOMMENDATION[review.recommendation];
                const state = reviewState(review);
                return (
                  <TableRow key={review.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <PersonAvatar person={review.person} size="sm" />
                        <span className="flex min-w-0 flex-col">
                          <b className="text-sm font-medium">{review.person.name}</b>
                          <span className="text-xs whitespace-nowrap text-on-surface-variant">
                            <DotList parts={[review.person.title, review.team]} />
                          </span>
                        </span>
                      </div>
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
                      <StatusChip tone={recommendation.tone} icon={recommendation.icon}>
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
                      <Button
                        size="xs"
                        variant={state.primary ? "secondary" : "ghost"}
                        className="whitespace-nowrap"
                        onClick={() => comingSoon(state.action)}
                      >
                        {state.action}
                      </Button>
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
              <Button size="xs" variant="ghost" onClick={() => comingSoon("Follow-ups")}>
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

const TEMPLATE_LOOK: Record<OnboardingTemplate["family"], { shape: ShapeKind; icon: ReactNode }> = {
  engineering: { shape: "cookie6", icon: <CodeIcon /> },
  sales: { shape: "clover4", icon: <HandshakeIcon /> },
  support: { shape: "sunny", icon: <SupportAgentIcon /> },
  manager: { shape: "cookie4", icon: <SupervisorAccountIcon /> },
  other: { shape: "flower", icon: <LibraryBooksIcon /> },
};

function TemplatesCard() {
  const query = useQuery(homeQuery("templates"));
  const items = query.data?.items ?? [];
  return (
    <SectionCard
      className={span(7)}
      title="Onboarding templates"
      endpoint={E.templates.path}
      status={query}
      action={
        <Button variant="ghost" onClick={() => comingSoon("Templates")}>
          Manage templates <ArrowForwardIcon aria-hidden />
        </Button>
      }
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {items.map((template) => {
          const look = TEMPLATE_LOOK[template.family];
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => comingSoon("Templates")}
              className="relative isolate flex flex-col gap-2 rounded-xl bg-pane p-4 text-start transition-colors outline-none hover:bg-on-surface/8 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span
                aria-hidden
                className="relative mb-1 grid size-11 place-items-center text-on-primary-container"
              >
                <Shape
                  kind={look.shape}
                  className="absolute inset-0 size-full text-primary-container"
                />
                <span className="relative z-10 [&_svg]:size-5">{look.icon}</span>
              </span>
              <span className="text-sm font-medium">{template.name}</span>
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-on-surface-variant">
                <DotList
                  parts={[
                    template.version,
                    `${template.activeCount} active`,
                    `Updated ${formatShortDate(template.updatedAt)}`,
                  ]}
                />
              </span>
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}
