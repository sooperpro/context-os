import { useQuery } from "@tanstack/react-query";
import { useBotContext } from "@/components/layout/bot-context";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { useAssistant } from "@/components/layout/assistant-context";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { PageHeader } from "@/components/layout/page-header";
import { OnboardingStatusChip } from "@/components/onboarding-status-chip";
import { SectionCard } from "@/components/section-card";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DotList } from "@/components/ui/dot-list";
import {
  ChatIcon,
  ConstructionIcon,
  ContactSupportIcon,
  EditCalendarIcon,
  FilterAltIcon,
  HubIcon,
  LockClockIcon,
  QuizIcon,
  RouteIcon,
  SchoolIcon,
} from "@/components/ui/icons";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SegmentedItemLead, SegmentedList } from "@/components/ui/segmented-list";
import { Skeleton } from "@/components/ui/skeleton";
import { LEARNING_ENDPOINTS as E } from "@/features/learning/api/learning.api";
import { roadmapQuery } from "@/features/learning/api/learning.queries";
import { ModuleRow } from "@/features/learning/components/module-row";
import {
  ClarificationDialog,
  RoadmapChangeDialog,
} from "@/features/learning/components/request-dialogs";
import { StageTabs } from "@/features/learning/components/stage-tabs";
import { STAGE_PANEL_ID, stageTabId } from "@/features/learning/learning-meta";
import { comingSoon } from "@/lib/coming-soon";
import { daysFromToday, formatPercent, formatShortDate } from "@/lib/format";

const HISTORY_ICON = { module: SchoolIcon, check: QuizIcon, practical: ConstructionIcon } as const;

/** My roadmap (prototype `roadmapPage`): the plan by stage, progress, help and what's done. */
export function RoadmapPage() {
  const query = useQuery(roadmapQuery());
  const { openAssistant } = useAssistant();
  const [params, setParams] = useSearchParams();
  const [changeOpen, setChangeOpen] = useState(false);
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const roadmap = query.data;

  const current = roadmap?.stages.find((stage) => stage.state === "current") ?? roadmap?.stages[0];
  const stage = roadmap?.stages.find((entry) => entry.id === params.get("stage")) ?? current;
  useBotContext(
    {
      chips: [
        { icon: RouteIcon, label: "My roadmap" },
        ...(current ? [{ icon: FilterAltIcon, label: `${current.name} stage` }] : []),
      ],
      suggestions: [
        "What should I focus on this week?",
        "What happens in Product & systems?",
        "How is my progress measured?",
      ],
      intro: "I can explain anything on your roadmap and help you plan your week.",
    },
    `roadmap:${current?.id ?? ""}`,
  );
  const day = roadmap ? 1 - daysFromToday(roadmap.startDate) : 0;
  const weeks = roadmap?.stages.at(-1)?.weekEnd ?? 12;
  const modules = roadmap?.stages.flatMap((entry) => entry.modules) ?? [];
  const pace = roadmap
    ? roadmap.progress > roadmap.expected + 0.02
      ? "slightly ahead of plan"
      : roadmap.progress < roadmap.expected - 0.02
        ? "a little behind plan"
        : "on plan"
    : "";

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker={
          roadmap
            ? `${roadmap.template.name} ${roadmap.template.version}${roadmap.adjustedBy ? ` · adjusted by ${roadmap.adjustedBy.name}` : ""}`
            : undefined
        }
        title="My roadmap"
        description={
          roadmap
            ? `${weeks} weeks to become a productive member of the ${roadmap.team ?? "your"} team. You’re in week ${Math.max(1, Math.ceil(day / 7))}, ${pace}.`
            : undefined
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setChangeOpen(true)}>
              <EditCalendarIcon aria-hidden /> Request a change
            </Button>
            <Button
              variant="ai-tonal"
              onClick={() => openAssistant("What should I focus on this week?")}
            >
              <HubIcon aria-hidden /> What should I focus on?
            </Button>
          </>
        }
      />
      {!roadmap ? (
        query.isError ? (
          <SectionCard title="My roadmap" endpoint={E.roadmap.path} status={query} />
        ) : (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your roadmap">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-96 rounded-card" />
          </div>
        )
      ) : (
        <>
          <StageTabs
            stages={roadmap.stages}
            selected={stage?.id ?? ""}
            onSelect={(id) => setParams(id === current?.id ? {} : { stage: id }, { replace: true })}
            probationReviewOn={roadmap.probationReviewOn}
            totalDays={roadmap.totalDays}
          />
          <PageColumns>
            <PageMain>
              {stage ? (
                <SectionCard
                  id={STAGE_PANEL_ID}
                  role="tabpanel"
                  aria-labelledby={stageTabId(stage.id)}
                  title={stage.name}
                  endpoint={E.roadmap.path}
                  action={
                    <span className="text-sm whitespace-nowrap">
                      <b className="font-medium">
                        {stage.modules.filter((module) => module.status === "done").length}
                      </b>
                      <span className="text-on-surface-variant">
                        {" "}
                        of {stage.modules.length} done
                      </span>
                    </span>
                  }
                >
                  <p className="-mt-2 text-sm text-on-surface-variant">
                    {formatShortDate(stage.startsOn)} – {formatShortDate(stage.endsOn)} ·{" "}
                    {stage.goal}
                  </p>
                  {stage.state === "next" || stage.state === "later" ? (
                    <p className="flex items-center gap-2.5 rounded-[14px] bg-surface-container-high px-3.5 py-2.5 text-sm text-on-surface-variant">
                      <LockClockIcon className="size-5 shrink-0" aria-hidden />
                      <span>
                        This stage opens on{" "}
                        <b className="font-medium">{formatShortDate(stage.startsOn)}</b>. You can
                        preview what’s coming.
                      </span>
                    </p>
                  ) : null}
                  <SegmentedList aria-label={`${stage.name} modules`}>
                    {stage.modules.map((module) => (
                      <ModuleRow
                        key={module.id}
                        module={module}
                        opensOn={
                          stage.state === "next" || stage.state === "later" ? stage.startsOn : null
                        }
                      />
                    ))}
                  </SegmentedList>
                </SectionCard>
              ) : null}
            </PageMain>
            <PageSide>
              <SectionCard
                title="Progress"
                action={<OnboardingStatusChip status={roadmap.status} />}
              >
                <div className="flex flex-wrap items-center gap-5">
                  <ProgressRing
                    value={roadmap.progress}
                    size={112}
                    role="img"
                    aria-label={`${formatPercent(roadmap.progress)} complete`}
                  >
                    <span className="font-heading text-2xl leading-7 font-semibold">
                      {formatPercent(roadmap.progress)}
                    </span>
                    <span className="text-[11px] font-medium text-on-surface-variant">
                      Day {Math.max(1, day)} of {roadmap.totalDays}
                    </span>
                  </ProgressRing>
                  <dl className="flex min-w-35 flex-1 flex-col gap-2.5 text-sm">
                    {(
                      [
                        [
                          "Modules",
                          `${modules.filter((module) => module.status === "done").length} of ${modules.length}`,
                        ],
                        [
                          "Knowledge checks",
                          `${roadmap.checks.done} of ${roadmap.checks.total} passed`,
                        ],
                        ["Expected by today", formatPercent(roadmap.expected)],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="flex items-baseline justify-between gap-2">
                        <dt className="text-xs text-on-surface-variant">{label}</dt>
                        <dd className="text-end font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </SectionCard>
              <SectionCard title="Stuck on something?">
                {roadmap.buddy ? (
                  <div className="flex items-center gap-3 rounded-lg bg-pane py-2 pr-2 pl-2.5">
                    <PersonAvatar person={roadmap.buddy} size="md" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <b className="text-sm font-medium">{roadmap.buddy.name}</b>
                      <span className="text-xs text-on-surface-variant">Your onboarding buddy</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Message ${roadmap.buddy.name}`}
                      onClick={() => comingSoon("Messages")}
                    >
                      <ChatIcon />
                    </Button>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="xs" variant="secondary" onClick={() => setClarifyOpen(true)}>
                    <ContactSupportIcon aria-hidden /> Request clarification
                  </Button>
                  <Button size="xs" variant="ai-tonal" onClick={() => openAssistant()}>
                    <HubIcon aria-hidden /> Ask Context Bot
                  </Button>
                </div>
              </SectionCard>
              <SectionCard title="Completed" count={roadmap.history.length}>
                {roadmap.history.length ? (
                  <ol className="flex flex-col divide-y divide-outline-variant/60">
                    {roadmap.history.map((entry) => {
                      const Icon = HISTORY_ICON[entry.kind];
                      return (
                        <li key={entry.id} className="flex items-start gap-3 py-2.5">
                          <SegmentedItemLead tone="success" size="sm">
                            <Icon aria-hidden />
                          </SegmentedItemLead>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm font-medium">{entry.title}</span>
                            <span className="flex flex-wrap items-center gap-x-2 text-xs text-on-surface-variant">
                              <DotList parts={[entry.result, formatShortDate(entry.completedOn)]} />
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="text-sm text-on-surface-variant">
                    Finished modules and checks show up here.
                  </p>
                )}
              </SectionCard>
            </PageSide>
          </PageColumns>
        </>
      )}
      <RoadmapChangeDialog
        open={changeOpen}
        onOpenChange={setChangeOpen}
        manager={roadmap?.adjustedBy ?? null}
      />
      <ClarificationDialog
        open={clarifyOpen}
        onOpenChange={setClarifyOpen}
        moduleId={null}
        topics={[]}
        owner={null}
      />
    </div>
  );
}
