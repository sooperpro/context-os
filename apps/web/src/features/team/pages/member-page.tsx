import type { MemberModuleState, TeamMemberDetail } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { useAssistant } from "@/components/layout/assistant-context";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { OnboardingStatusChip } from "@/components/onboarding-status-chip";
import { PlanProgress, PlanTickNote } from "@/components/plan-progress";
import { ProfileHero } from "@/components/profile-hero";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { BotGlyph } from "@/components/ui/bot-glyph";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DotList } from "@/components/ui/dot-list";
import {
  AddIcon,
  AssignmentAddIcon,
  BlockIcon,
  CheckCircleIcon,
  CheckIcon,
  DeleteIcon,
  EditIcon,
  EditNoteIcon,
  ErrorIcon,
  LockIcon,
  PendingIcon,
  PersonIcon,
  RouteIcon,
  ScheduleIcon,
  SmartToyIcon,
  UndoIcon,
} from "@/components/ui/icons";
import { Loader } from "@/components/ui/loader";
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
import { StatusChip } from "@/components/ui/status-chip";
import { TEAM_ENDPOINTS as E } from "@/features/team/api/team.api";
import {
  teamMemberQuery,
  useEditMemberRoadmap,
  useEscalateMember,
} from "@/features/team/api/team.queries";
import {
  AssignLearningDialog,
  AssignRoadmapDialog,
} from "@/features/team/components/assign-dialogs";
import { CheckMark } from "@/features/team/components/check-mark";
import {
  CHECKIN_TYPE_LABEL,
  ESCALATED_TO,
  PULSE,
  TEAM_PATH,
  checkinPath,
} from "@/features/team/team-meta";
import { daysFromToday, firstName, formatShortDate, formatWeekday } from "@/lib/format";

const MODULE_STATE: Record<
  MemberModuleState,
  {
    label: string;
    tone: "success" | "info" | "neutral" | "warning" | "error";
    lead: "success" | "neutral" | "warning" | "error";
    icon: ReactNode;
  }
> = {
  done: { label: "Done", tone: "success", lead: "success", icon: <CheckCircleIcon /> },
  active: { label: "In progress", tone: "info", lead: "neutral", icon: <PendingIcon /> },
  todo: { label: "Not started", tone: "neutral", lead: "neutral", icon: <ScheduleIcon /> },
  overdue: { label: "Overdue", tone: "warning", lead: "warning", icon: <ErrorIcon /> },
  blocked: { label: "Blocked", tone: "error", lead: "error", icon: <BlockIcon /> },
};

/** A team member's onboarding (prototype `memberPage`), as their manager sees it. */
export function MemberPage() {
  const { personId = "" } = useParams();
  const query = useQuery(teamMemberQuery(personId));
  if (query.isPending) {
    return (
      <div className="grid min-h-80 place-items-center">
        <Loader label="Loading their onboarding" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-360">
        <SectionCard
          title="This onboarding could not be loaded"
          endpoint={E.member.path}
          status={query}
        />
      </div>
    );
  }
  return <MemberView member={query.data} />;
}

function MemberView({ member }: { member: TeamMemberDetail }) {
  const { openAssistant } = useAssistant();
  const [assigning, setAssigning] = useState<"learning" | "roadmap" | null>(null);
  const person = { id: member.person.id, name: member.person.name };
  const first = firstName(member.person.name);
  useBotContext(
    {
      chips: [
        { icon: PersonIcon, label: member.person.name },
        { icon: LockIcon, label: "Visible to you as manager" },
      ],
      suggestions: [
        `Summarize ${first}’s onboarding progress`,
        "Which topics is my team struggling with?",
      ],
      intro: `I can summarize ${first}’s progress, check-ins and knowledge checks.`,
    },
    `member:${member.person.id}`,
  );
  const days = daysFromToday(member.startDate);
  const started = days <= 0;
  const hasRoadmap = member.modules.length > 0;
  const escalate = useEscalateMember();

  const insightAction = () => {
    const action = member.insight?.action;
    if (!action) return null;
    if (action.kind === "start_recommendation")
      return (
        <Button
          size="xs"
          variant="ai"
          nativeButton={false}
          render={<Link to={checkinPath(member.person.id, "probation")} />}
        >
          {action.label}
        </Button>
      );
    return (
      <Button
        size="xs"
        variant="ai"
        onClick={() =>
          action.kind === "assign_learning"
            ? setAssigning("learning")
            : action.kind === "assign_roadmap"
              ? setAssigning("roadmap")
              : escalate.mutate(member.person.id, {
                  onSuccess: (result) => toast.success(`Escalated to ${ESCALATED_TO[result.to]}`),
                  onError: () => toast.error("The escalation could not be sent. Please try again."),
                })
        }
        disabled={action.kind === "escalate" && escalate.isPending}
      >
        {action.label}
      </Button>
    );
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
            <BreadcrumbPage>{member.person.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <ProfileHero
        person={member.person}
        chips={
          <>
            <OnboardingStatusChip status={member.status} />
            <Badge variant="neutral">
              {started ? `Day ${1 - days} of 90` : `Starts ${formatShortDate(member.startDate)}`}
            </Badge>
            {member.buddy ? <Badge variant="ai">Buddy: {member.buddy.name}</Badge> : null}
          </>
        }
        subtitle={
          <DotList
            parts={[
              member.person.title,
              started
                ? `started ${formatShortDate(member.startDate)}`
                : `starts ${formatShortDate(member.startDate)}`,
              member.stage ?? "Pre-boarding",
            ]}
          />
        }
        actions={
          <>
            <Button nativeButton={false} render={<Link to={checkinPath(member.person.id)} />}>
              <EditNoteIcon aria-hidden /> Record check-in
            </Button>
            {hasRoadmap ? (
              <Button variant="secondary" onClick={() => setAssigning("learning")}>
                <AssignmentAddIcon aria-hidden /> Assign learning task
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setAssigning("roadmap")}>
                <RouteIcon aria-hidden /> Assign roadmap
              </Button>
            )}
            <Button
              variant="ai-tonal"
              onClick={() => openAssistant(`Summarize ${member.person.name}’s onboarding progress`)}
            >
              <SmartToyIcon aria-hidden /> Ask about {first}
            </Button>
          </>
        }
      />

      {member.insight ? (
        <section
          aria-label="Context Bot suggestion"
          className="flex flex-wrap items-start gap-3.5 rounded-2xl bg-[color-mix(in_srgb,var(--color-ai-container)_45%,var(--color-pane))] px-4.5 py-4 text-on-ai-container"
        >
          <BotGlyph size="sm" />
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
            <span className="text-sm font-medium">Suggested by Context Bot</span>
            <span className="text-sm">{member.insight.text}</span>
            {member.issues.length ? (
              <ul className="mt-1.5 flex flex-col gap-1">
                {member.issues.map((issue) => (
                  <li key={issue} className="flex items-center gap-1.5 text-xs">
                    <ErrorIcon className="size-4 shrink-0" aria-hidden /> {issue}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="self-center">{insightAction()}</div>
        </section>
      ) : null}

      <PageColumns>
        <PageMain>
          {started && hasRoadmap ? (
            <SectionCard
              title="Progress"
              action={<span className="text-xs text-on-surface-variant">{member.stage}</span>}
            >
              <PlanProgress
                progress={member.progress}
                expected={member.expected}
                status={member.status}
                label={`${member.person.name} progress`}
              />
              <PlanTickNote who={first} />
            </SectionCard>
          ) : null}
          <RoadmapCard
            member={member}
            onAssignRoadmap={() => setAssigning("roadmap")}
            onAssignLearning={() => setAssigning("learning")}
          />
          {member.checks.length ? (
            <SectionCard title="Knowledge checks">
              <SegmentedList>
                {member.checks.map((entry) => (
                  <SegmentedItem key={entry.id} className="gap-3">
                    <CheckMark state={entry.state} />
                    <SegmentedItemBody>
                      <SegmentedItemTitle>{entry.title}</SegmentedItemTitle>
                      <SegmentedItemMeta>
                        <DotList parts={[entry.result, entry.note]} />
                      </SegmentedItemMeta>
                    </SegmentedItemBody>
                  </SegmentedItem>
                ))}
              </SegmentedList>
            </SectionCard>
          ) : null}
        </PageMain>
        <PageSide>
          <SectionCard title="Coming up">
            <ol className="flex flex-col gap-0.5">
              {member.upcoming.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-xs bg-pane p-2.5 first:rounded-t-xl last:rounded-b-xl"
                >
                  <div className="flex h-13 w-12 shrink-0 flex-col items-center justify-center rounded-[14px] bg-secondary-container text-on-secondary-container">
                    <span className="text-[11px] font-medium tracking-[0.8px] uppercase">
                      {formatWeekday(entry.on)}
                    </span>
                    <span className="text-base font-medium tabular-nums">
                      {Number(entry.on.slice(8))}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <b className="text-sm font-medium">{entry.title}</b>
                    <span className="text-xs text-on-surface-variant">
                      {formatShortDate(entry.on)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </SectionCard>
          <SectionCard title="Check-ins" count={member.checkins.length}>
            {member.checkins.length ? (
              <ol className="flex flex-col gap-0.5">
                {member.checkins.map((entry) => {
                  const pulse = PULSE[entry.pulse];
                  return (
                    <li
                      key={entry.id}
                      className="flex flex-col gap-1.5 rounded-xs bg-pane px-3.5 py-3 first:rounded-t-lg last:rounded-b-lg"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="text-sm font-medium">{CHECKIN_TYPE_LABEL[entry.type]}</b>
                        <span className="text-xs text-on-surface-variant">
                          {formatShortDate(entry.on)}
                        </span>
                        <StatusChip
                          tone={pulse.tone}
                          icon={<CheckCircleIcon />}
                          className="ms-auto"
                        >
                          {pulse.label}
                        </StatusChip>
                      </div>
                      <p className="text-sm">{entry.note}</p>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-sm text-on-surface-variant">No check-ins yet.</p>
            )}
          </SectionCard>
          <SectionCard title="Probation">
            <dl className="flex flex-col gap-2.5 text-sm">
              {(
                [
                  [
                    "Readiness review",
                    member.readinessReviewOn ? formatShortDate(member.readinessReviewOn) : "—",
                  ],
                  [
                    "Probation review",
                    member.probationReviewOn ? formatShortDate(member.probationReviewOn) : "—",
                  ],
                  ["People partner", member.peoplePartner?.name ?? "—"],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-2">
                  <dt className="text-xs text-on-surface-variant">{label}</dt>
                  <dd className="text-end font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>
        </PageSide>
      </PageColumns>
      <AssignLearningDialog
        person={assigning === "learning" ? person : null}
        onOpenChange={(open) => (open ? null : setAssigning(null))}
      />
      <AssignRoadmapDialog
        person={assigning === "roadmap" ? person : null}
        onOpenChange={(open) => (open ? null : setAssigning(null))}
      />
    </div>
  );
}

/** "Roadmap · current stage", with the manager's edit mode: move a module a week or take it off. */
function RoadmapCard({
  member,
  onAssignRoadmap,
  onAssignLearning,
}: {
  member: TeamMemberDetail;
  onAssignRoadmap: () => void;
  onAssignLearning: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [changes, setChanges] = useState<Record<string, "postpone_week" | "remove">>({});
  const edit = useEditMemberRoadmap(member.person.id);
  const first = firstName(member.person.name);

  const toggle = (id: string, action: "postpone_week" | "remove") =>
    setChanges((current) => {
      const next = { ...current };
      if (next[id] === action) delete next[id];
      else next[id] = action;
      return next;
    });

  const save = () => {
    const list = Object.entries(changes).map(([moduleId, action]) => ({ moduleId, action }));
    if (list.length === 0) {
      setEditing(false);
      toast("No changes to save");
      return;
    }
    edit.mutate(
      { changes: list },
      {
        onSuccess: () => {
          toast.success(
            `Roadmap updated with ${list.length} ${list.length === 1 ? "change" : "changes"}. ${first} will be notified.`,
          );
          setChanges({});
          setEditing(false);
        },
        onError: () => toast.error("The roadmap could not be updated. Please try again."),
      },
    );
  };

  return (
    <SectionCard
      title="Roadmap · current stage"
      action={
        member.modules.length ? (
          editing ? (
            <Button size="xs" onClick={save} disabled={edit.isPending}>
              <CheckIcon aria-hidden /> Save changes
            </Button>
          ) : (
            <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
              <EditIcon aria-hidden /> Edit roadmap
            </Button>
          )
        ) : undefined
      }
    >
      {member.modules.length ? (
        <>
          <SegmentedList>
            {member.modules.map((entry) => {
              const state = MODULE_STATE[entry.state];
              const change = changes[entry.id];
              return (
                <SegmentedItem
                  key={entry.id}
                  className={cn(
                    "flex-wrap gap-3 @min-[640px]:flex-nowrap",
                    editing &&
                      entry.state !== "done" &&
                      "shadow-[inset_0_0_0_1px_var(--color-outline-variant)]",
                    change === "remove" && "opacity-50",
                  )}
                >
                  <SegmentedItemLead tone={state.lead} size="sm">
                    {state.icon}
                  </SegmentedItemLead>
                  <SegmentedItemBody>
                    <SegmentedItemTitle
                      className={cn("whitespace-normal", change === "remove" && "line-through")}
                    >
                      {entry.title}
                    </SegmentedItemTitle>
                    <SegmentedItemMeta
                      className={entry.state === "overdue" ? "text-warning" : undefined}
                    >
                      <DotList
                        parts={[
                          entry.completedOn
                            ? formatShortDate(entry.completedOn)
                            : entry.dueOn
                              ? `${entry.state === "overdue" ? "Was due" : "Due"} ${formatShortDate(entry.dueOn)}${entry.postponed ? " (moved)" : ""}${change === "postpone_week" ? " · moving a week" : ""}`
                              : null,
                          entry.note ? <span className="text-error">{entry.note}</span> : null,
                        ]}
                      />
                    </SegmentedItemMeta>
                  </SegmentedItemBody>
                  <SegmentedItemTrail>
                    {editing && entry.state !== "done" ? (
                      <>
                        {entry.dueOn ? (
                          <Button
                            size="xs"
                            variant="ghost"
                            aria-pressed={change === "postpone_week"}
                            onClick={() => toggle(entry.id, "postpone_week")}
                          >
                            {change === "postpone_week" ? "Moved +1 week" : "+1 week"}
                          </Button>
                        ) : null}
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`${change === "remove" ? "Restore" : "Remove"} ${entry.title}`}
                          onClick={() => toggle(entry.id, "remove")}
                        >
                          {change === "remove" ? <UndoIcon /> : <DeleteIcon />}
                        </Button>
                      </>
                    ) : (
                      <StatusChip tone={state.tone} icon={state.icon}>
                        {state.label}
                      </StatusChip>
                    )}
                  </SegmentedItemTrail>
                </SegmentedItem>
              );
            })}
          </SegmentedList>
          {editing ? (
            <Button size="xs" variant="secondary" className="self-start" onClick={onAssignLearning}>
              <AddIcon aria-hidden /> Add a module or task
            </Button>
          ) : null}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-4 rounded-xl bg-pane p-5">
          <span
            aria-hidden
            className="relative grid size-14 shrink-0 place-items-center text-on-surface-variant"
          >
            <Shape
              kind="cookie6"
              className="absolute inset-0 size-full text-surface-container-highest"
            />
            <RouteIcon className="relative z-10 size-6" />
          </span>
          <div className="flex-1">
            <b className="text-sm font-medium">No roadmap yet</b>
            <p className="text-xs text-on-surface-variant">
              Pick a template so {first} has a plan on day one.
            </p>
          </div>
          <Button size="xs" onClick={onAssignRoadmap}>
            Assign roadmap
          </Button>
        </div>
      )}
    </SectionCard>
  );
}
