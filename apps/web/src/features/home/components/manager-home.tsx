import type { AttentionItem, KnowledgeGap, TeamKnowledge, TeamOnboarding } from "@contextos/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useAssistant } from "@/components/layout/assistant-context";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { PersonAvatar } from "@/components/ui/avatar";
import { BotGlyph } from "@/components/ui/bot-glyph";
import { Button } from "@/components/ui/button";
import {
  ArrowForwardIcon,
  AssignmentAddIcon,
  BlockIcon,
  CheckCircleIcon,
  EditNoteIcon,
  ErrorIcon,
  HelpIcon,
  HubIcon,
  InfoIcon,
  MoreVertIcon,
  ScheduleIcon,
} from "@/components/ui/icons";
import { MiniTile } from "@/components/ui/kpi-tile";
import { Progress } from "@/components/ui/progress";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedItemTrail,
  SegmentedList,
} from "@/components/ui/segmented-list";
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
import {
  daysFromToday,
  formatCount,
  formatLongDate,
  formatPercent,
  formatShortDate,
  formatTime,
  formatWeekday,
  greetingFor,
} from "@/lib/format";
import { DotList } from "@/components/ui/dot-list";
import { DashboardGrid } from "./dashboard";
import { ONBOARDING_PROGRESS_TONE, ONBOARDING_STATUS, firstName, span } from "./dashboard-meta";

/** The manager's Home (prototype `managerHome`): who needs attention, upcoming check-ins, the team's plan. */
export function ManagerHome() {
  const me = useQuery(meQuery());
  const team = useQuery(homeQuery("teamOnboarding"));
  const attention = useQuery(homeQuery("attention"));
  const people = team.data?.people ?? [];

  return (
    <div className="mx-auto flex max-w-360 flex-col">
      <PageHeader
        kicker={formatLongDate()}
        title={`${greetingFor()}${me.data ? `, ${firstName(me.data.name)}` : ""}`}
        description={
          team.data ? (
            <>
              {formatCount(people.length, "person", "people")} on the {team.data.team.name} team{" "}
              {people.length === 1 ? "is" : "are"} onboarding.
              {attention.data?.items.length ? (
                <>
                  {" "}
                  <b className="font-medium text-on-surface">
                    {attention.data.items.length}{" "}
                    {attention.data.items.length === 1 ? "needs" : "need"} your attention
                  </b>{" "}
                  today.
                </>
              ) : null}
            </>
          ) : undefined
        }
        actions={
          <>
            <Button variant="outline" onClick={() => comingSoon("Assigning learning")}>
              <AssignmentAddIcon aria-hidden /> Assign learning
            </Button>
            <Button onClick={() => comingSoon("Recording check-ins")}>
              <EditNoteIcon aria-hidden /> Record check-in
            </Button>
          </>
        }
      />
      <DashboardGrid>
        <AttentionCard query={attention} />
        <CheckinsCard />
        <RosterCard query={team} />
        <KnowledgeGapsCard />
        <TeamKnowledgeCard />
      </DashboardGrid>
    </div>
  );
}

/* ---- Needs your attention ----------------------------------------------------------------- */

const SEVERITY: Record<
  AttentionItem["severity"],
  { tone: "error" | "warning" | "info" | "neutral"; icon: ReactNode }
> = {
  error: { tone: "error", icon: <BlockIcon /> },
  warning: { tone: "warning", icon: <ErrorIcon /> },
  info: { tone: "info", icon: <InfoIcon /> },
  neutral: { tone: "neutral", icon: <ScheduleIcon /> },
};

function AttentionCard({ query }: { query: UseQueryResult<{ items: AttentionItem[] }> }) {
  const items = query.data?.items ?? [];
  return (
    <SectionCard
      className={span(8)}
      title="Needs your attention"
      count={query.data ? items.length : undefined}
      endpoint={E.attention.path}
      status={query}
    >
      {items.length ? (
        <SegmentedList>
          {items.map((item) => {
            const severity = SEVERITY[item.severity];
            return (
              <SegmentedItem key={item.id} className="items-start p-4">
                <PersonAvatar person={item.person} size="md" />
                <SegmentedItemBody>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <b className="text-sm font-medium">{item.person.name}</b>
                    {item.person.title ? (
                      <span className="text-xs text-on-surface-variant">{item.person.title}</span>
                    ) : null}
                    <StatusChip tone={severity.tone} icon={severity.icon} className="ms-auto">
                      {item.label}
                    </StatusChip>
                  </div>
                  <span className="mt-1.5 text-base font-medium text-on-surface">{item.title}</span>
                  <span className="text-sm text-on-surface-variant">{item.detail}</span>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {item.actions.map((action, index) => (
                      <Button
                        key={action.kind}
                        size="xs"
                        variant={index === 0 ? "secondary" : "ghost"}
                        onClick={() => comingSoon(action.label)}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </SegmentedItemBody>
              </SegmentedItem>
            );
          })}
        </SegmentedList>
      ) : (
        <p className="text-sm text-on-surface-variant">
          Everyone is on track. Nothing needs you today.
        </p>
      )}
    </SectionCard>
  );
}

/* ---- Upcoming check-ins ------------------------------------------------------------------- */

function CheckinsCard() {
  const query = useQuery(homeQuery("checkins"));
  const { openAssistant } = useAssistant();
  const items = query.data?.items ?? [];
  const next = items[0];
  return (
    <SectionCard
      className={span(4)}
      title="Upcoming check-ins"
      endpoint={E.checkins.path}
      status={query}
    >
      {items.length ? (
        <ol className="flex flex-col gap-0.5">
          {items.map((checkin) => (
            <li
              key={checkin.id}
              className="flex items-center gap-3 rounded-xs bg-pane p-2.5 first:rounded-t-xl last:rounded-b-xl"
            >
              <div className="flex h-13 w-12 shrink-0 flex-col items-center justify-center rounded-[14px] bg-secondary-container text-on-secondary-container">
                <span className="text-[11px] font-medium tracking-[0.8px] uppercase">
                  {formatWeekday(checkin.at)}
                </span>
                <span className="text-base font-medium tabular-nums">
                  {new Date(checkin.at).getDate()}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <b className="text-sm font-medium">{checkin.title}</b>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-on-surface-variant">
                  <DotList parts={[checkin.person.name, formatTime(checkin.at)]} />
                </span>
                {checkin.note ? <span className="text-xs text-ai">{checkin.note}</span> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-on-surface-variant">No check-ins scheduled.</p>
      )}
      {next ? (
        <div className="mt-auto flex flex-col items-start gap-2.5 rounded-xl bg-ai-container/42 p-4 text-on-ai-container">
          <div className="flex items-center gap-2.5">
            <BotGlyph size="sm" />
            <b className="text-sm font-medium text-on-surface">
              Prepare for {formatWeekday(next.at)}
            </b>
          </div>
          <p className="text-sm">
            Context Bot can summarize {firstName(next.person.name)}’s progress and suggest an agenda
            for your 1:1.
          </p>
          <Button
            size="xs"
            variant="ai"
            onClick={() => openAssistant(`Summarize ${next.person.name}’s onboarding progress`)}
          >
            <HubIcon aria-hidden /> Summarize {firstName(next.person.name)}’s progress
          </Button>
        </div>
      ) : null}
    </SectionCard>
  );
}

/* ---- Team onboarding (roster) ------------------------------------------------------------- */

function RosterCard({ query }: { query: UseQueryResult<TeamOnboarding> }) {
  const people = query.data?.people ?? [];
  return (
    <SectionCard
      className={span(12)}
      title="Team onboarding"
      count={query.data ? formatCount(people.length, "person", "people") : undefined}
      endpoint={E.teamOnboarding.path}
      status={query}
      action={
        <Button variant="ghost" onClick={() => comingSoon("The team view")}>
          Open team view <ArrowForwardIcon aria-hidden />
        </Button>
      }
    >
      {people.length ? (
        <>
          <div className="-mx-6 overflow-x-auto px-6">
            <Table className="min-w-190">
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Progress vs. plan</TableHead>
                  <TableHead>Next</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((row) => {
                  const status = ONBOARDING_STATUS[row.status];
                  const days = daysFromToday(row.startDate);
                  const started = days <= 0;
                  return (
                    <TableRow key={row.person.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <PersonAvatar person={row.person} size="sm" />
                          <span className="flex min-w-0 flex-col">
                            <b className="text-sm font-medium">{row.person.name}</b>
                            <span className="text-xs whitespace-nowrap text-on-surface-variant">
                              <DotList
                                parts={[
                                  row.person.title,
                                  started
                                    ? `Day ${1 - days}`
                                    : `Starts ${formatShortDate(row.startDate)}`,
                                ]}
                              />
                            </span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.stage ?? "Pre-boarding"}
                      </TableCell>
                      <TableCell>
                        {started && (row.progress > 0 || row.expected > 0) ? (
                          <div className="flex min-w-57 items-center gap-3">
                            <div className="relative min-w-37 flex-1">
                              <Progress
                                flat
                                tone={ONBOARDING_PROGRESS_TONE[row.status]}
                                value={Math.round(row.progress * 100)}
                                aria-label={`${row.person.name} progress`}
                              />
                              <span
                                aria-hidden
                                title={`Plan: ${formatPercent(row.expected)}`}
                                className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-on-surface/75"
                                style={{ left: `calc(${row.expected} * (100% - 4px))` }}
                              />
                            </div>
                            <span className="text-xs whitespace-nowrap tabular-nums">
                              <b className="font-medium">{formatPercent(row.progress)}</b>{" "}
                              <span className="text-on-surface-variant">
                                / plan {formatPercent(row.expected)}
                              </span>
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-on-surface-variant">Not started</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{row.next ?? "—"}</TableCell>
                      <TableCell>
                        <StatusChip tone={status.tone} icon={status.icon}>
                          {status.label}
                        </StatusChip>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`More actions for ${row.person.name}`}
                          onClick={() => comingSoon("Onboarding actions")}
                        >
                          <MoreVertIcon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="flex items-center gap-2 text-xs text-on-surface-variant">
            <span aria-hidden className="h-3.5 w-0.5 rounded-full bg-on-surface/75" />
            The tick shows where each person is expected to be today.
          </p>
        </>
      ) : (
        <p className="text-sm text-on-surface-variant">
          Nobody on your team is onboarding right now.
        </p>
      )}
    </SectionCard>
  );
}

/* ---- Knowledge gaps ------------------------------------------------------------------------ */

const GAP_REASON: Record<
  KnowledgeGap["reason"],
  { tone: "error" | "warning"; icon: ReactNode; action: string }
> = {
  no_answer: { tone: "error", icon: <HelpIcon />, action: "Create article" },
  conflict: { tone: "warning", icon: <ErrorIcon />, action: "Review sources" },
  stale: { tone: "warning", icon: <ScheduleIcon />, action: "Request update" },
};

function KnowledgeGapsCard() {
  const query = useQuery(homeQuery("knowledgeGaps"));
  const items = query.data?.items ?? [];
  return (
    <SectionCard
      className={span(7)}
      title="Knowledge gaps on your team"
      endpoint={E.knowledgeGaps.path}
      status={query}
      action={
        <StatusChip tone="ai" icon={<HubIcon />}>
          From Context Bot
        </StatusChip>
      }
    >
      {items.length ? (
        <SegmentedList>
          {items.map((gap) => {
            const reason = GAP_REASON[gap.reason];
            return (
              <SegmentedItem key={gap.id} className="flex-wrap @min-[640px]:flex-nowrap">
                <SegmentedItemLead tone="ai">
                  <HelpIcon aria-hidden />
                </SegmentedItemLead>
                <SegmentedItemBody>
                  <SegmentedItemTitle className="whitespace-normal">
                    “{gap.question}”
                  </SegmentedItemTitle>
                  <SegmentedItemMeta>
                    <span>Asked {gap.askedCount}× this month</span>
                    <StatusChip tone={reason.tone} icon={reason.icon}>
                      {gap.detail}
                    </StatusChip>
                  </SegmentedItemMeta>
                </SegmentedItemBody>
                <SegmentedItemTrail className="ps-14 @min-[640px]:ps-0">
                  {gap.reason === "no_answer" ? (
                    // Writing the missing page opens the editor with the question, as in the prototype.
                    <Button
                      size="xs"
                      variant="secondary"
                      nativeButton={false}
                      render={
                        <Link
                          to={`/contributions/new?question=${encodeURIComponent(gap.question)}`}
                        />
                      }
                    >
                      {reason.action}
                    </Button>
                  ) : (
                    <Button size="xs" variant="outline" onClick={() => comingSoon(reason.action)}>
                      {reason.action}
                    </Button>
                  )}
                </SegmentedItemTrail>
              </SegmentedItem>
            );
          })}
        </SegmentedList>
      ) : (
        <p className="text-sm text-on-surface-variant">
          Context Bot answered your team’s questions well this month.
        </p>
      )}
    </SectionCard>
  );
}

/* ---- Team knowledge ------------------------------------------------------------------------ */

const QUEUE_KIND: Record<TeamKnowledge["queue"][number]["kind"], string> = {
  glossary_term: "Glossary term",
  edit: "Suggested edit",
  article: "New article",
};

function TeamKnowledgeCard() {
  const query = useQuery(homeQuery("teamKnowledge"));
  const data = query.data;
  return (
    <SectionCard
      className={span(5)}
      title="Team knowledge"
      endpoint={E.teamKnowledge.path}
      status={query}
    >
      {data ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <MiniTile label="Articles owned" value={data.owned} />
            <MiniTile
              tone="warning"
              label={
                <>
                  <ErrorIcon aria-hidden /> Need review
                </>
              }
              value={data.needsReview}
            />
            <MiniTile
              tone="info"
              label={
                <>
                  <CheckCircleIcon aria-hidden /> Awaiting you
                </>
              }
              value={data.awaitingYou}
            />
          </div>
          {data.queue.length ? (
            <SegmentedList>
              {data.queue.map((entry) => (
                <SegmentedItem key={entry.id} className="min-h-0 gap-3 px-3 py-2.5">
                  <PersonAvatar person={entry.author} size="sm" />
                  <SegmentedItemBody>
                    <SegmentedItemTitle>{entry.title}</SegmentedItemTitle>
                    <SegmentedItemMeta>
                      <DotList
                        parts={[
                          QUEUE_KIND[entry.kind],
                          entry.author.name,
                          formatShortDate(entry.submittedAt),
                        ]}
                      />
                    </SegmentedItemMeta>
                  </SegmentedItemBody>
                  <Button size="xs" variant="ghost" onClick={() => comingSoon("The review queue")}>
                    Review
                  </Button>
                </SegmentedItem>
              ))}
            </SegmentedList>
          ) : null}
        </>
      ) : null}
    </SectionCard>
  );
}
