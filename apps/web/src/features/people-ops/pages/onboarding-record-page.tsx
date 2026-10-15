import type { OnboardingRecord, OnboardingStatus, SetupStepId } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { OnboardingStatusChip } from "@/components/onboarding-status-chip";
import { PlanProgress } from "@/components/plan-progress";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { ProfileHero } from "@/components/profile-hero";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
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
  BlockIcon,
  ChatIcon,
  CheckCircleFilledIcon,
  CheckIcon,
  Diversity3Icon,
  ErrorIcon,
  EventAvailableIcon,
  EventIcon,
  ForumIcon,
  HandshakeIcon,
  HowToRegIcon,
  InfoIcon,
  LibraryBooksIcon,
  LockIcon,
  RadioButtonUncheckedIcon,
  SupervisorAccountIcon,
  VerifiedIcon,
} from "@/components/ui/icons";
import { Loader } from "@/components/ui/loader";
import { Progress } from "@/components/ui/progress";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemTitle,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { PEOPLE_OPS_ENDPOINTS as E } from "@/features/people-ops/api/people-ops.api";
import {
  onboardingQuery,
  useCompleteSetupStep,
} from "@/features/people-ops/api/people-ops.queries";
import {
  AssignmentDialog,
  type AssignmentKind,
} from "@/features/people-ops/components/onboarding-dialogs";
import { ONBOARDING_PATH, probationPath } from "@/features/people-ops/people-ops-meta";
import { comingSoon } from "@/lib/coming-soon";
import { daysFromToday, formatShortDate } from "@/lib/format";

/** An employee's onboarding record (prototype `#onboarding-<id>`): assignments, setup, milestones. */
export function OnboardingRecordPage() {
  const { recordId = "" } = useParams();
  const query = useQuery(onboardingQuery(recordId));
  if (query.isPending) {
    return (
      <div className="grid min-h-80 place-items-center">
        <Loader label="Loading the onboarding record" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-360">
        <SectionCard
          title="This onboarding record could not be loaded"
          endpoint={E.onboarding.path}
          status={query}
        />
      </div>
    );
  }
  return <RecordView record={query.data} />;
}

const NOTE: Partial<
  Record<OnboardingStatus, { tone: "error" | "warning" | "info"; icon: ReactNode }>
> = {
  blocked: { tone: "error", icon: <BlockIcon aria-hidden /> },
  at_risk: { tone: "warning", icon: <ErrorIcon aria-hidden /> },
  needs_setup: { tone: "info", icon: <InfoIcon aria-hidden /> },
  not_started: { tone: "info", icon: <InfoIcon aria-hidden /> },
};

function RecordView({ record }: { record: OnboardingRecord }) {
  useBotContext(
    {
      chips: [
        { icon: HowToRegIcon, label: `Onboarding: ${record.person.name}` },
        { icon: LockIcon, label: "People Ops" },
      ],
      suggestions: [
        "Which teams have overdue check-ins?",
        "Which probation reviews need action this week?",
      ],
    },
    `onboarding:${record.id}`,
  );
  const [changing, setChanging] = useState<AssignmentKind | null>(null);
  const setup = useCompleteSetupStep(record.id);
  const days = daysFromToday(record.startDate);
  const starting = days > 0;
  const note = record.note ? NOTE[record.status] : undefined;
  const done = record.setupSteps.filter((step) => step.done).length;
  const total = record.setupSteps.length;

  const assignments: Array<{
    kind: AssignmentKind | null;
    label: string;
    value: string | null;
    icon: ReactNode;
  }> = [
    {
      kind: "manager",
      label: "Manager",
      value: record.manager?.name ?? null,
      icon: <SupervisorAccountIcon />,
    },
    {
      kind: "buddy",
      label: "Onboarding buddy",
      value: record.buddy?.name ?? null,
      icon: <HandshakeIcon />,
    },
    {
      kind: "partner",
      label: "People partner",
      value: record.peoplePartner?.name ?? null,
      icon: <Diversity3Icon />,
    },
    {
      kind: "template",
      label: "Template",
      value: record.template?.name ?? null,
      icon: <LibraryBooksIcon />,
    },
  ];

  const completeStep = (step: SetupStepId) =>
    setup.mutate(step, {
      onSuccess: () =>
        toast.success(
          step === "welcome" ? `Welcome message sent to ${record.person.name}` : "Marked as done",
        ),
      onError: () => toast.error("The setup step could not be updated. Please try again."),
    });

  const stepAction = (step: SetupStepId) => {
    if (step === "roadmap")
      return (
        <Button size="xs" variant="secondary" onClick={() => setChanging("template")}>
          Assign roadmap
        </Button>
      );
    if (step === "buddy")
      return (
        <Button size="xs" variant="secondary" onClick={() => setChanging("buddy")}>
          Assign buddy
        </Button>
      );
    return (
      <Button
        size="xs"
        variant="secondary"
        disabled={setup.isPending}
        onClick={() => completeStep(step)}
      >
        {step === "welcome" ? "Send now" : "Mark done"}
      </Button>
    );
  };

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to={ONBOARDING_PATH} />}>Onboarding</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{record.person.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <ProfileHero
        person={record.person}
        chips={
          <>
            <OnboardingStatusChip status={record.status} />
            <Badge variant="neutral">
              {starting ? `Starts ${formatShortDate(record.startDate)}` : `Day ${1 - days} of 90`}
            </Badge>
            <PreviewDataChip endpoint={E.onboarding.path} />
          </>
        }
        subtitle={
          <DotList
            parts={[
              record.person.title,
              record.team,
              `${starting ? "starts" : "started"} ${formatShortDate(record.startDate)}`,
            ]}
          />
        }
        actions={
          <>
            {record.probationReviewId ? (
              <Button
                variant="secondary"
                nativeButton={false}
                render={<Link to={probationPath(record.probationReviewId)} />}
              >
                <EventAvailableIcon aria-hidden /> Probation review
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => comingSoon("Messages")}>
              <ChatIcon aria-hidden /> Message
            </Button>
          </>
        }
      />
      {note ? <Banner tone={note.tone} icon={note.icon} title={record.note} /> : null}

      <PageColumns>
        <PageMain>
          <SectionCard title="Assignments">
            <SegmentedList>
              {assignments.map((entry) => (
                <SegmentedItem key={entry.label}>
                  <SegmentedItemLead tone="neutral" size="sm">
                    {entry.icon}
                  </SegmentedItemLead>
                  <SegmentedItemBody>
                    <span className="text-xs text-on-surface-variant">{entry.label}</span>
                    <SegmentedItemTitle className={entry.value ? undefined : "text-warning"}>
                      {entry.value ?? "Not assigned"}
                    </SegmentedItemTitle>
                  </SegmentedItemBody>
                  {entry.kind ? (
                    <Button
                      size="xs"
                      variant={entry.value ? "ghost" : "secondary"}
                      aria-label={`${entry.value ? "Change" : "Assign"} ${entry.label.toLowerCase()}`}
                      onClick={() => setChanging(entry.kind)}
                    >
                      {entry.value ? "Change" : "Assign"}
                    </Button>
                  ) : null}
                </SegmentedItem>
              ))}
            </SegmentedList>
          </SectionCard>
          <SectionCard
            title="Setup"
            action={
              <span className="text-xs text-on-surface-variant">
                {done} of {total} done
              </span>
            }
          >
            <Progress
              flat
              tone={done === total ? "success" : "primary"}
              value={Math.round((done / total) * 100)}
              aria-label="Setup progress"
            />
            <SegmentedList aria-label="Setup steps">
              {record.setupSteps.map((step) => (
                <SegmentedItem key={step.id}>
                  <span className={step.done ? "text-success" : "text-outline"}>
                    {step.done ? (
                      <CheckCircleFilledIcon className="size-5" aria-hidden />
                    ) : (
                      <RadioButtonUncheckedIcon className="size-5" aria-hidden />
                    )}
                  </span>
                  <SegmentedItemBody>
                    <SegmentedItemTitle className="font-normal">
                      {step.label}
                      <span className="sr-only">{step.done ? " (done)" : " (not done)"}</span>
                    </SegmentedItemTitle>
                  </SegmentedItemBody>
                  {step.done ? (
                    <span className="text-xs text-on-surface-variant">{step.doneBy ?? "Done"}</span>
                  ) : (
                    stepAction(step.id)
                  )}
                </SegmentedItem>
              ))}
            </SegmentedList>
          </SectionCard>
        </PageMain>
        <PageSide>
          {starting ? null : (
            <SectionCard
              title="Progress"
              action={<span className="text-xs text-on-surface-variant">{record.stage}</span>}
            >
              <PlanProgress
                progress={record.progress}
                expected={record.expected}
                status={record.status}
                label="Progress"
              />
              {record.lastCheckin ? (
                <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                  <ForumIcon className="size-4" aria-hidden /> {record.lastCheckin}
                </p>
              ) : null}
            </SectionCard>
          )}
          <SectionCard title="Milestones">
            <Timeline>
              {record.milestones.map((milestone, index) => (
                <TimelineItem
                  key={milestone.title}
                  date={formatShortDate(milestone.on)}
                  state={milestone.state}
                  icon={
                    milestone.state === "done" ? (
                      <CheckIcon aria-hidden />
                    ) : index === record.milestones.length - 1 ? (
                      <VerifiedIcon aria-hidden />
                    ) : (
                      <EventIcon aria-hidden />
                    )
                  }
                  title={milestone.title}
                  detail={
                    milestone.state === "done"
                      ? "Done"
                      : milestone.state === "soon"
                        ? "Coming up"
                        : "Scheduled"
                  }
                />
              ))}
            </Timeline>
          </SectionCard>
          <p className="flex items-start gap-1.5 px-1 text-xs text-on-surface-variant">
            <LockIcon className="mt-px size-4 shrink-0" aria-hidden />
            Visible to People Ops and {record.manager?.name ?? "their manager"}. Check-in notes stay
            with the manager and employee.
          </p>
        </PageSide>
      </PageColumns>
      <AssignmentDialog
        record={record}
        kind={changing}
        onOpenChange={(open) => (open ? null : setChanging(null))}
      />
    </div>
  );
}
