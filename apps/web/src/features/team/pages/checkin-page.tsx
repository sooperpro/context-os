import { useBotContext } from "@/components/layout/bot-context";
import {
  BlockerSchema,
  CheckinInputSchema,
  CheckinTypeSchema,
  PulseSchema,
  type Blocker,
  type CheckinType,
  type Pulse,
  type TeamMemberDetail,
} from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { OnboardingStatusChip } from "@/components/onboarding-status-chip";
import { PlanProgress } from "@/components/plan-progress";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { SectionCard } from "@/components/section-card";
import { PersonAvatar } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ConnectedButton, ConnectedButtonGroup } from "@/components/ui/connected-button-group";
import { AddIcon, CheckIcon, EditNoteIcon, LinkIcon, SmartToyIcon } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
import { OptionList, OptionTile } from "@/components/ui/option-tile";
import {
  SegmentedItem,
  SegmentedItemBody,
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
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { homeQuery } from "@/features/home/api/home.queries";
import { TEAM_ENDPOINTS as E } from "@/features/team/api/team.api";
import {
  checkinPrepQuery,
  teamMemberQuery,
  useSaveCheckin,
} from "@/features/team/api/team.queries";
import { CheckMark } from "@/features/team/components/check-mark";
import {
  BLOCKER_LABEL,
  CHECKIN_TYPE_LABEL,
  PULSE,
  READINESS_LEVELS,
  TEAM_PATH,
  checkinPath,
  memberPath,
} from "@/features/team/team-meta";
import { daysFromToday, firstName, formatShortDate } from "@/lib/format";

const RECOMMENDATIONS = [
  { value: "confirm", title: "Confirm", description: "Ready to pass probation" },
  { value: "extend", title: "Extend 30 days", description: "Needs more time" },
  { value: "discuss", title: "Discuss with HR", description: "Concerns to talk through" },
] as const;

/** Record a check-in (prototype `checkinPage`): agenda, pulse, readiness, blockers, notes, next steps. */
export function CheckinPage() {
  const { personId = "" } = useParams();
  const [params] = useSearchParams();
  const member = useQuery(teamMemberQuery(personId));
  const requested = CheckinTypeSchema.safeParse(params.get("type"));

  if (member.isPending) {
    return (
      <div className="grid min-h-80 place-items-center">
        <Loader label="Loading the check-in" />
      </div>
    );
  }
  if (member.isError) {
    return (
      <div className="mx-auto max-w-360">
        <SectionCard
          title="This check-in could not be loaded"
          endpoint={E.member.path}
          status={member}
        />
      </div>
    );
  }
  // Remount per person and type so the form starts fresh.
  const type = requested.success ? requested.data : "weekly";
  return <CheckinForm key={`${personId}:${type}`} member={member.data} initialType={type} />;
}

function CheckinForm({
  member,
  initialType,
}: {
  member: TeamMemberDetail;
  initialType: CheckinType;
}) {
  useBotContext(
    {
      chips: [{ icon: EditNoteIcon, label: `Check-in: ${member.person.name}` }],
      suggestions:
        member.person.id === "p-leah"
          ? ["Summarize Leah’s onboarding progress", "Draft an agenda for Maya’s week 2 check-in"]
          : ["Draft an agenda for Maya’s week 2 check-in"],
    },
    `checkin:${member.person.id}`,
  );
  const navigate = useNavigate();
  const ids = { person: useId(), notes: useId(), next: useId(), share: useId() };
  const first = firstName(member.person.name);
  const roster = useQuery(homeQuery("teamOnboarding"));
  const [type, setType] = useState<CheckinType>(initialType);
  const prep = useQuery(checkinPrepQuery(member.person.id, type));
  const [pulse, setPulse] = useState<Pulse>(
    member.status === "on_track" || member.status === "ahead" ? "on_track" : "concerns",
  );
  const [covered, setCovered] = useState<Set<string>>(new Set());
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [blockers, setBlockers] = useState<Set<Blocker>>(
    new Set(member.status === "blocked" ? ["access"] : []),
  );
  const [notes, setNotes] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [recommendation, setRecommendation] = useState<"confirm" | "extend" | "discuss">("confirm");
  const [share, setShare] = useState(true);
  const save = useSaveCheckin(member.person.id);
  const readiness = type !== "weekly";
  const days = daysFromToday(member.startDate);
  const people = (roster.data?.people ?? []).filter((row) => daysFromToday(row.startDate) <= 0);
  const peopleItems = Object.fromEntries(people.map((row) => [row.person.id, row.person.name]));

  const submit = () => {
    const parsed = CheckinInputSchema.safeParse({
      type,
      pulse,
      agendaCovered: [...covered],
      ratings: readiness ? ratings : {},
      blockers: [...blockers],
      notes,
      nextSteps,
      recommendation: type === "probation" ? recommendation : null,
      shareWithPerson: share,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(
          type === "probation"
            ? `Recommendation “${RECOMMENDATIONS.find((entry) => entry.value === recommendation)?.title}” sent to People Ops`
            : `Check-in saved for ${member.person.name}`,
        );
        void navigate(memberPath(member.person.id));
      },
      onError: () => toast.error("The check-in could not be saved. Please try again."),
    });
  };

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to={TEAM_PATH} />}>Team onboarding</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to={memberPath(member.person.id)} />}>
              {member.person.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Check-in</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <PersonAvatar person={member.person} size="md" />
          <div>
            <h1 className="font-heading text-[28px] leading-9 font-semibold tracking-tight">
              Check-in with {first}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
              {days <= 0 ? `Day ${1 - days}` : `Starts ${formatShortDate(member.startDate)}`} ·{" "}
              {member.stage ?? "Pre-boarding"}
              <OnboardingStatusChip status={member.status} />
            </p>
          </div>
        </div>
        {people.length > 1 ? (
          <div className="min-w-55">
            <label htmlFor={ids.person} className="sr-only">
              Person
            </label>
            <Select
              items={peopleItems}
              value={member.person.id}
              onValueChange={(value) =>
                void navigate(checkinPath(String(value), type === "probation" ? undefined : type))
              }
            >
              <SelectTrigger id={ids.person} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {people.map((row) => (
                  <SelectItem key={row.person.id} value={row.person.id}>
                    {row.person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <PageColumns>
        <PageMain>
          <form
            className="contents"
            aria-label={`Check-in with ${first}`}
            onSubmit={(event) => event.preventDefault()}
          >
            <Card className="gap-5 px-6">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Type</legend>
                <ConnectedButtonGroup aria-label="Check-in type" className="flex-wrap">
                  {CheckinTypeSchema.options.map((value) => (
                    <ConnectedButton
                      key={value}
                      pressed={type === value}
                      onClick={() => setType(value)}
                    >
                      {CHECKIN_TYPE_LABEL[value]}
                    </ConnectedButton>
                  ))}
                </ConnectedButtonGroup>
              </fieldset>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Agenda</span>
                  <span className="flex items-center gap-2">
                    <PreviewDataChip endpoint={E.checkinPrep.path} />
                    <StatusChip tone="ai" icon={<SmartToyIcon />}>
                      Suggested from {first}’s progress
                    </StatusChip>
                  </span>
                </div>
                {prep.data ? (
                  <ul className="flex flex-col gap-0.5" aria-label="Agenda">
                    {prep.data.agenda.map((item) => (
                      <li key={item}>
                        <label className="flex cursor-pointer items-start gap-3 rounded-md bg-pane px-3.5 py-2.5 text-sm has-checked:text-on-surface-variant has-checked:line-through">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4.5 shrink-0 accent-primary"
                            checked={covered.has(item)}
                            onChange={() =>
                              setCovered((current) => {
                                const next = new Set(current);
                                if (next.has(item)) next.delete(item);
                                else next.add(item);
                                return next;
                              })
                            }
                          />
                          {item}
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Skeleton className="h-32 rounded-md" />
                )}
              </div>
            </Card>
            <Card className="gap-5 px-6">
              <fieldset>
                <legend className="mb-2 text-sm font-medium">How is onboarding going?</legend>
                <ConnectedButtonGroup aria-label="Overall pulse" className="flex-wrap">
                  {PulseSchema.options.map((value) => (
                    <ConnectedButton
                      key={value}
                      pressed={pulse === value}
                      onClick={() => setPulse(value)}
                    >
                      {PULSE[value].label}
                    </ConnectedButton>
                  ))}
                </ConnectedButtonGroup>
              </fieldset>
              {readiness && prep.data ? (
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Readiness</legend>
                  <div className="flex flex-col gap-0.5">
                    {prep.data.areas.map((area) => (
                      <div
                        key={area.id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xs bg-pane px-3.5 py-3 first:rounded-t-lg last:rounded-b-lg"
                      >
                        <div className="flex min-w-0 flex-[1_1_240px] flex-col">
                          <span className="text-sm font-medium">{area.label}</span>
                          <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
                            <LinkIcon className="size-3.5" aria-hidden /> {area.evidence}
                          </span>
                        </div>
                        <ConnectedButtonGroup size="sm" aria-label={area.label}>
                          {READINESS_LEVELS.map((level, index) => (
                            <ConnectedButton
                              key={level}
                              pressed={ratings[area.id] === index}
                              onClick={() =>
                                setRatings((current) => ({ ...current, [area.id]: index }))
                              }
                            >
                              {level}
                            </ConnectedButton>
                          ))}
                        </ConnectedButtonGroup>
                      </div>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Blockers</legend>
                <div className="flex flex-wrap gap-2">
                  {BlockerSchema.options.map((value) => {
                    const on = blockers.has(value);
                    return (
                      <Chip
                        key={value}
                        variant="filter"
                        selected={on}
                        aria-pressed={on}
                        onClick={() =>
                          setBlockers((current) => {
                            const next = new Set(current);
                            if (next.has(value)) next.delete(value);
                            else next.add(value);
                            return next;
                          })
                        }
                      >
                        {on ? <CheckIcon aria-hidden /> : <AddIcon aria-hidden />}
                        {BLOCKER_LABEL[value]}
                      </Chip>
                    );
                  })}
                </div>
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.notes}>Notes</Label>
                <Textarea
                  id={ids.notes}
                  rows={4}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="What went well, what’s unclear, what you agreed"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.next}>Agreed next steps</Label>
                <Textarea
                  id={ids.next}
                  rows={3}
                  value={nextSteps}
                  onChange={(event) => setNextSteps(event.target.value)}
                />
              </div>
              {type === "probation" ? (
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Recommendation to People Ops</legend>
                  <OptionList orientation="horizontal">
                    {RECOMMENDATIONS.map((entry) => (
                      <OptionTile
                        key={entry.value}
                        className="min-w-44 flex-1"
                        input={
                          <input
                            type="radio"
                            name="recommendation"
                            value={entry.value}
                            checked={recommendation === entry.value}
                            onChange={() => setRecommendation(entry.value)}
                          />
                        }
                        title={entry.title}
                        description={entry.description}
                      />
                    ))}
                  </OptionList>
                </fieldset>
              ) : null}
              <label
                htmlFor={ids.share}
                className="flex cursor-pointer items-center gap-3.5 rounded-lg bg-field px-3.5 py-3"
              >
                <span className="flex-1 text-sm">
                  <b className="font-medium">Share with {first}</b>
                  <br />
                  <span className="text-xs text-on-surface-variant">
                    {first} sees the notes and next steps. Readiness ratings go to People Ops.
                  </span>
                </span>
                <Switch id={ids.share} checked={share} onCheckedChange={setShare} />
              </label>
            </Card>
            <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-container-high px-4 py-3 shadow-elevation-1">
              <span className="text-sm">Saved to {first}’s onboarding record</span>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  nativeButton={false}
                  render={<Link to={memberPath(member.person.id)} />}
                >
                  Cancel
                </Button>
                <Button onClick={submit} disabled={save.isPending}>
                  <CheckIcon aria-hidden />{" "}
                  {type === "probation" ? "Save and send recommendation" : "Save check-in"}
                </Button>
              </div>
            </div>
          </form>
        </PageMain>
        <PageSide>
          <SectionCard
            title="Evidence"
            action={<span className="text-xs text-on-surface-variant">Pulled from ContextOS</span>}
          >
            {days <= 0 && member.modules.length ? (
              <PlanProgress
                progress={member.progress}
                expected={member.expected}
                status={member.status}
                label={`${member.person.name} progress`}
              />
            ) : null}
            {member.checks.length ? (
              <SegmentedList>
                {member.checks.map((entry) => (
                  <SegmentedItem key={entry.id} className="min-h-15 gap-3 px-3.5 py-2.5">
                    <CheckMark state={entry.state} />
                    <SegmentedItemBody>
                      <SegmentedItemTitle>{entry.title}</SegmentedItemTitle>
                      <SegmentedItemMeta>{entry.result}</SegmentedItemMeta>
                    </SegmentedItemBody>
                  </SegmentedItem>
                ))}
              </SegmentedList>
            ) : (
              <p className="text-sm text-on-surface-variant">No knowledge checks yet.</p>
            )}
          </SectionCard>
          {member.checkins[0] ? (
            <SectionCard
              title="Last check-in"
              action={
                <span className="text-xs text-on-surface-variant">
                  {formatShortDate(member.checkins[0].on)}
                </span>
              }
            >
              <p className="text-sm">{member.checkins[0].note}</p>
            </SectionCard>
          ) : null}
        </PageSide>
      </PageColumns>
    </div>
  );
}
