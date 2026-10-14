import type { OnboardingStatus, TeamMemberProgress } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { OnboardingStatusChip } from "@/components/onboarding-status-chip";
import { PageHeader } from "@/components/layout/page-header";
import { PlanProgress } from "@/components/plan-progress";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { SectionCard } from "@/components/section-card";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AssignmentAddIcon,
  BlockIcon,
  CheckCircleFilledIcon,
  EditNoteIcon,
  ErrorFilledIcon,
  EventIcon,
  InfoIcon,
} from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HOME_ENDPOINTS } from "@/features/home/api/home.api";
import { homeQuery } from "@/features/home/api/home.queries";
import { TEAM_ENDPOINTS as E } from "@/features/team/api/team.api";
import { checkMatrixQuery } from "@/features/team/api/team.queries";
import { AssignLearningDialog } from "@/features/team/components/assign-dialogs";
import { CheckMark } from "@/features/team/components/check-mark";
import { CHECK_CELL_LABEL, checkinPath, memberPath } from "@/features/team/team-meta";
import { daysFromToday, formatCount, formatShortDate } from "@/lib/format";

/** Who needs the manager most comes first. */
const PRIORITY: Record<OnboardingStatus, number> = {
  blocked: 0,
  at_risk: 1,
  needs_setup: 2,
  not_started: 3,
  on_track: 4,
  ahead: 5,
};

const STRIP: Array<{ statuses: OnboardingStatus[]; label: string; icon: ReactNode; tone: string }> = [
  { statuses: ["blocked"], label: "Blocked", icon: <BlockIcon />, tone: "text-error" },
  { statuses: ["at_risk"], label: "At risk", icon: <ErrorFilledIcon />, tone: "text-warning" },
  { statuses: ["needs_setup", "not_started"], label: "Needs setup", icon: <InfoIcon />, tone: "text-primary" },
  { statuses: ["on_track", "ahead"], label: "On track", icon: <CheckCircleFilledIcon />, tone: "text-success" },
];

/** Team onboarding (prototype `teamPage`): everyone onboarding, sorted by who needs you most. */
export function TeamPage() {
  const roster = useQuery(homeQuery("teamOnboarding"));
  const [assigning, setAssigning] = useState<{ id: string; name: string } | null>(null);
  const people = [...(roster.data?.people ?? [])].sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status]);
  const first = people[0];

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker={roster.data ? `${roster.data.team.name} team` : undefined}
        title="Team onboarding"
        description={
          roster.data ? `${formatCount(people.length, "person", "people")} onboarding. Sorted by who needs you most.` : undefined
        }
        actions={
          first ? (
            <>
              <Button variant="outline" onClick={() => setAssigning({ id: first.person.id, name: first.person.name })}>
                <AssignmentAddIcon aria-hidden /> Assign learning
              </Button>
              <Button nativeButton={false} render={<Link to={checkinPath(first.person.id)} />}>
                <EditNoteIcon aria-hidden /> Record check-in
              </Button>
            </>
          ) : undefined
        }
      />
      {roster.isPending ? (
        <Skeleton className="h-64 rounded-card" />
      ) : roster.isError ? (
        <SectionCard title="Team onboarding" endpoint={HOME_ENDPOINTS.teamOnboarding.path} status={roster} />
      ) : (
        <>
          <div className="flex items-center justify-end empty:hidden">
            <PreviewDataChip endpoint={HOME_ENDPOINTS.teamOnboarding.path} />
          </div>
          <div role="group" aria-label="Team status" className="grid grid-cols-2 gap-3 @min-[640px]:grid-cols-4">
            {STRIP.map((tile) => (
              <div
                key={tile.label}
                className="grid grid-cols-[auto_1fr] items-center gap-x-3 rounded-xl bg-card px-4.5 py-3.5 [&>svg]:row-span-2 [&>svg]:size-7"
              >
                <span className={cn("row-span-2 [&_svg]:size-7", tile.tone)} aria-hidden>
                  {tile.icon}
                </span>
                <span className="font-heading text-[28px] leading-8 font-semibold tabular-nums">
                  {people.filter((person) => tile.statuses.includes(person.status)).length}
                </span>
                <span className="text-sm font-medium">{tile.label}</span>
              </div>
            ))}
          </div>
          <ul aria-label="People onboarding" className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {people.map((person) => (
              <li key={person.person.id} className="flex">
                <MemberCard row={person} />
              </li>
            ))}
          </ul>
        </>
      )}
      <CheckMatrixCard />
      <AssignLearningDialog person={assigning} onOpenChange={(open) => (open ? null : setAssigning(null))} />
    </div>
  );
}

function MemberCard({ row }: { row: TeamMemberProgress }) {
  const days = daysFromToday(row.startDate);
  const started = days <= 0;
  const flagged = row.status === "blocked" || row.status === "at_risk";
  return (
    <Link
      to={memberPath(row.person.id)}
      className={cn(
        "flex w-full flex-col gap-3 rounded-card bg-card p-4.5 text-on-surface no-underline transition-[border-radius,box-shadow] duration-[350ms] ease-spring-fast-spatial outline-none hover:rounded-3xl hover:shadow-elevation-1 focus-visible:ring-3 focus-visible:ring-ring/50",
        row.status === "blocked" && "shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--color-error)_60%,transparent)]",
        row.status === "at_risk" && "shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--color-warning)_60%,transparent)]",
      )}
    >
      <span className="flex items-start gap-3">
        <PersonAvatar person={row.person} size="md" />
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="text-base font-medium">{row.person.name}</b>
          <span className="text-xs text-on-surface-variant">{row.person.title}</span>
        </span>
        <OnboardingStatusChip status={row.status} />
      </span>
      <span className="flex justify-between gap-2 text-xs font-medium">
        <span className="text-on-surface-variant">{started ? `Day ${1 - days} of 90` : `Starts ${formatShortDate(row.startDate)}`}</span>
        <span>{row.stage ?? "Pre-boarding"}</span>
      </span>
      {started ? (
        <PlanProgress progress={row.progress} expected={row.expected} status={row.status} label={`${row.person.name} progress`} />
      ) : (
        <span className="text-xs text-on-surface-variant">No roadmap yet</span>
      )}
      <span className="flex items-start gap-1.5 rounded-md bg-pane px-2.5 py-2 text-xs [&_svg]:mt-px [&_svg]:size-4 [&_svg]:shrink-0">
        {row.issue && flagged ? (
          <>
            <ErrorFilledIcon aria-hidden className={row.status === "blocked" ? "text-error" : "text-warning"} />
            {row.issue}
          </>
        ) : row.issue && row.status !== "on_track" ? (
          <>
            <InfoIcon aria-hidden className="text-primary" />
            {row.issue}
          </>
        ) : (
          <>
            <EventIcon aria-hidden className="text-primary" />
            {row.next ? `Next: ${row.next}` : "Nothing scheduled"}
          </>
        )}
      </span>
    </Link>
  );
}

function CheckMatrixCard() {
  const query = useQuery(checkMatrixQuery());
  const matrix = query.data;
  return (
    <SectionCard
      title="Knowledge checks by topic"
      endpoint={E.matrix.path}
      status={query}
      action={<span className="text-xs text-on-surface-variant">Spot topics the team finds hard</span>}
    >
      {matrix ? (
        <>
          <div className="-mx-6 overflow-x-auto px-6">
            <Table className="min-w-140">
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  {matrix.topics.map((topic) => (
                    <TableHead key={topic} className="text-center">
                      {topic}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.rows.map((row) => (
                  <TableRow key={row.person.id}>
                    <TableCell>
                      <Link to={memberPath(row.person.id)} className="flex items-center gap-2 text-on-surface no-underline hover:underline">
                        <PersonAvatar person={row.person} size="xs" />
                        <b className="text-sm font-medium">{row.person.name}</b>
                      </Link>
                    </TableCell>
                    {row.cells.map((cell, index) => (
                      <TableCell key={matrix.topics[index]} className="text-center">
                        <CheckMark state={cell} label={matrix.topics[index]} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div aria-hidden className="flex flex-wrap gap-4 text-xs font-medium text-on-surface-variant">
            {(["pass", "fail", "todo", "na"] as const).map((state) => (
              <span key={state} className="inline-flex items-center gap-1">
                <CheckMark state={state} size="sm" />
                {CHECK_CELL_LABEL[state]}
              </span>
            ))}
          </div>
        </>
      ) : null}
    </SectionCard>
  );
}
