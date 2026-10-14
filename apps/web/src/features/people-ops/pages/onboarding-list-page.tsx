import type { OnboardingFilter, OnboardingRecordSummary } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "@/components/layout/page-header";
import { OnboardingStatusChip } from "@/components/onboarding-status-chip";
import { PersonCell } from "@/components/person-cell";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip, ChipCount } from "@/components/ui/chip";
import { DotList } from "@/components/ui/dot-list";
import { EmptyMini } from "@/components/ui/empty-mini";
import {
  CheckIcon,
  ChevronRightIcon,
  FilterAltIcon,
  HowToRegIcon,
  PersonAddIcon,
  PersonSearchIcon,
} from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import { SearchField } from "@/components/ui/search-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PEOPLE_OPS_ENDPOINTS as E } from "@/features/people-ops/api/people-ops.api";
import { onboardingsQuery } from "@/features/people-ops/api/people-ops.queries";
import { NewOnboardingDialog } from "@/features/people-ops/components/onboarding-dialogs";
import { onboardingPath } from "@/features/people-ops/people-ops-meta";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { daysFromToday, formatCount, formatPercent, formatShortDate } from "@/lib/format";

const FILTERS: Array<[OnboardingFilter, string]> = [
  ["all", "All"],
  ["attention", "Needs attention"],
  ["starting", "Starting soon"],
  ["progress", "In progress"],
];

const ALL_TEAMS = "all";

/** Onboarding records across the company (prototype `#onboarding`): search, filter, start a new one. */
export function OnboardingListPage() {
  useBotContext(
    {
      chips: [
        { icon: HowToRegIcon, label: "Onboarding" },
        { icon: FilterAltIcon, label: "All teams" },
      ],
      suggestions: [
        "Which teams have overdue check-ins?",
        "Which probation reviews need action this week?",
        "What changed in the Engineering template v4?",
      ],
    },
    "onboarding",
  );
  const [text, setText] = useState("");
  const q = useDebouncedValue(text.trim(), 200);
  const [team, setTeam] = useState(ALL_TEAMS);
  const [filter, setFilter] = useState<OnboardingFilter>("all");
  const [creating, setCreating] = useState(false);
  const query = useQuery(onboardingsQuery(q, team === ALL_TEAMS ? "" : team, filter));
  const data = query.data;
  const teams = data?.teams ?? [];

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker="People Operations"
        title="Onboarding"
        description={
          data
            ? `${formatCount(data.total - data.startingNext14Days, "person", "people")} onboarding and ${data.startingNext14Days} starting in the next 14 days. ${data.counts.attention} need attention.`
            : undefined
        }
        actions={
          <Button onClick={() => setCreating(true)}>
            <PersonAddIcon aria-hidden /> New onboarding
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          label="Search onboarding records"
          value={text}
          onValueChange={setText}
          placeholder="Search by name, role, team or manager"
          className="flex-[1_1_320px]"
        />
        <Select
          items={{
            [ALL_TEAMS]: "All teams",
            ...Object.fromEntries(teams.map((entry) => [entry, entry])),
          }}
          value={team}
          onValueChange={(value) => setTeam(String(value))}
        >
          <SelectTrigger
            aria-label="Team"
            className="h-13 flex-[0_1_220px] rounded-full bg-card px-4.5 shadow-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TEAMS}>All teams</SelectItem>
            {teams.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {entry}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div
        role="group"
        aria-label="Filter onboarding"
        className="flex flex-wrap items-center gap-2"
      >
        {FILTERS.map(([value, label]) => (
          <Chip
            key={value}
            variant="filter"
            selected={filter === value}
            onClick={() => setFilter(value)}
          >
            {filter === value ? <CheckIcon aria-hidden /> : null}
            {label}
            {data ? <ChipCount>{data.counts[value]}</ChipCount> : null}
          </Chip>
        ))}
        <PreviewDataChip endpoint={E.onboardings.path} />
      </div>
      {query.isPending ? (
        <Skeleton className="h-96 rounded-card" />
      ) : !data ? (
        <SectionCard title="Onboarding records" endpoint={E.onboardings.path} status={query} />
      ) : (
        <Card role="region" aria-label="Onboarding records" className="gap-4 px-6">
          <div className="-mx-6 overflow-x-auto px-6">
            <Table className="min-w-215">
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Manager and buddy</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.length ? (
                  data.items.map((record) => <RecordRow key={record.id} record={record} />)
                ) : (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyMini
                        icon={<PersonSearchIcon />}
                        title="No one matches"
                        description="Try another filter or name."
                        className="py-2"
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-on-surface-variant">
            Showing {data.counts.all} of {data.total} records. The rest are on track with nothing
            due this week.
          </p>
        </Card>
      )}
      <NewOnboardingDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function RecordRow({ record }: { record: OnboardingRecordSummary }) {
  const days = daysFromToday(record.startDate);
  const starting = days > 0;
  const tone =
    record.status === "blocked" ? "error" : record.status === "at_risk" ? "warning" : "primary";
  return (
    <TableRow className="[&>td]:pt-3.5 [&>td]:align-top">
      <TableCell>
        <PersonCell
          person={record.person}
          to={onboardingPath(record.id)}
          meta={<DotList parts={[record.person.title, record.team]} />}
        />
      </TableCell>
      <TableCell>
        {starting ? (
          <>
            <span className="text-sm whitespace-nowrap">
              Starts {formatShortDate(record.startDate)}
            </span>
            <br />
            <span className="text-xs text-on-surface-variant">in {formatCount(days, "day")}</span>
          </>
        ) : (
          <>
            <span className="text-sm whitespace-nowrap tabular-nums">Day {1 - days} of 90</span>
            <br />
            <span className="text-xs whitespace-nowrap text-on-surface-variant">
              Started {formatShortDate(record.startDate)}
            </span>
          </>
        )}
      </TableCell>
      <TableCell>
        <span className="text-sm whitespace-nowrap">{record.manager?.name ?? "No manager"}</span>
        <br />
        {record.buddy ? (
          <span className="text-xs whitespace-nowrap text-on-surface-variant">
            Buddy: {record.buddy.name}
          </span>
        ) : (
          <span className="text-xs whitespace-nowrap text-warning">No buddy yet</span>
        )}
      </TableCell>
      <TableCell>
        {record.template ? (
          <span className="text-xs">{record.template.name}</span>
        ) : (
          <span className="text-xs text-warning">Not assigned</span>
        )}
      </TableCell>
      <TableCell>
        {starting ? (
          <span className="text-xs whitespace-nowrap text-on-surface-variant">
            Setup {record.setup.done} of {record.setup.total}
          </span>
        ) : (
          <>
            <span className="flex items-center gap-2.5">
              <Progress
                flat
                tone={tone}
                value={Math.round(record.progress * 100)}
                aria-label={`${record.person.name} progress`}
                className="w-18 flex-none"
              />
              <span className="text-xs tabular-nums">{formatPercent(record.progress)}</span>
            </span>
            <span className="text-xs text-on-surface-variant">{record.stage}</span>
          </>
        )}
      </TableCell>
      <TableCell>
        <OnboardingStatusChip status={record.status} />
        <br />
        <span className="text-xs text-on-surface-variant">{record.note}</span>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link to={onboardingPath(record.id)} />}
          aria-label={`Open ${record.person.name}’s onboarding`}
        >
          <ChevronRightIcon aria-hidden />
        </Button>
      </TableCell>
    </TableRow>
  );
}
