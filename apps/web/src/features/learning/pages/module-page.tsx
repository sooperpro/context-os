import type { ModuleDetail } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { useAssistant } from "@/components/layout/assistant-context";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { OriginIcon } from "@/components/origin-icon";
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
import { DotList } from "@/components/ui/dot-list";
import {
  ChatIcon,
  CheckCircleFilledIcon,
  ChevronRightIcon,
  ContactSupportIcon,
  DescriptionIcon,
  FormatListNumberedIcon,
  HubIcon,
  LockClockIcon,
  LockIcon,
  OpenInNewIcon,
  PersonIcon,
  PlayArrowFilledIcon,
  RadioButtonUncheckedIcon,
  ScheduleIcon,
  SchoolIcon,
  UpdateIcon,
  VerifiedIcon,
} from "@/components/ui/icons";
import { Loader } from "@/components/ui/loader";
import { MetaChip } from "@/components/ui/meta-chip";
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
import { Shape } from "@/components/ui/shape";
import { LEARNING_ENDPOINTS as E } from "@/features/learning/api/learning.api";
import { moduleQuery } from "@/features/learning/api/learning.queries";
import { LessonNumber } from "@/features/learning/components/lesson-number";
import { RatingButtons } from "@/features/learning/components/rating-buttons";
import { ClarificationDialog } from "@/features/learning/components/request-dialogs";
import {
  LESSON_TYPE,
  MODULE_KIND,
  ROADMAP_PATH,
  learningPath,
  moduleTime,
} from "@/features/learning/learning-meta";
import { comingSoon } from "@/lib/coming-soon";
import { formatShortDate } from "@/lib/format";
import { KNOWLEDGE_ORIGIN_LABEL } from "@/lib/labels";

const lessonTarget = (lesson: ModuleDetail["lessons"][number]) => ({
  kind: lesson.type === "check" ? ("check" as const) : ("lesson" as const),
  id: lesson.id,
});

/** A module (prototype `modulePage`): what it covers, its lessons, sources and people. */
export function ModulePage() {
  const { moduleId = "" } = useParams();
  const query = useQuery(moduleQuery(moduleId));

  if (query.isPending) {
    return (
      <div className="grid min-h-80 place-items-center">
        <Loader label="Loading the module" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-360">
        <SectionCard
          title="This module could not be loaded"
          endpoint={E.module.path}
          status={query}
        />
      </div>
    );
  }
  return <ModuleView module={query.data} />;
}

function ModuleView({ module }: { module: ModuleDetail }) {
  useBotContext(
    {
      chips: [
        { icon: SchoolIcon, label: `Module: ${module.title}` },
        ...(module.sources.length
          ? [
              {
                icon: DescriptionIcon,
                label:
                  module.sources.length === 1 ? "1 source" : `${module.sources.length} sources`,
              },
            ]
          : []),
      ],
      suggestions:
        module.id === "m4"
          ? [
              "Summarize this module in 3 points",
              "Why are we moving billing to Kafka?",
              "Who owns pricing decisions?",
            ]
          : ["What should I focus on this week?"],
      intro: `I’m scoped to “${module.title}” and its sources.`,
    },
    `module:${module.id}`,
  );
  const { openAssistant } = useAssistant();
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const Icon = MODULE_KIND[module.kind].icon;
  const locked = module.status === "locked";
  const done = module.status === "done";
  const lessonsDone = module.lessons.filter((lesson) => lesson.done).length;
  const current = done || locked ? undefined : module.lessons.find((lesson) => !lesson.done);
  const lessonCount = module.lessons.length;

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to={ROADMAP_PATH} />}>My roadmap</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to={`${ROADMAP_PATH}?stage=${module.stage.id}`} />}>
              {module.stage.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Module {module.number}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <section
        aria-labelledby="module-title"
        className={cn(
          "flex flex-col items-start gap-4 rounded-2xl bg-primary-container p-6 text-on-primary-container medium:gap-7 medium:rounded-3xl @min-[640px]:flex-row @min-[640px]:px-8 @min-[640px]:py-7",
          locked && "bg-card text-on-surface",
          done &&
            "bg-[color-mix(in_srgb,var(--color-success-container)_70%,var(--color-pane))] text-on-success-container",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "relative grid size-18 shrink-0 place-items-center text-primary-foreground @min-[640px]:size-26",
            locked && "text-on-surface-variant",
            done && "text-on-success",
          )}
        >
          <Shape
            kind="cookie9"
            className={cn(
              "absolute inset-0 size-full text-primary motion-safe:animate-[spin_60s_linear_infinite]",
              locked && "text-surface-container-highest",
              done && "text-success",
            )}
          />
          <Icon className="relative z-10 size-9 @min-[640px]:size-12" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="text-sm font-medium">
            {module.stage.name} · Module {module.number} of {module.stage.moduleCount} ·{" "}
            {MODULE_KIND[module.kind].label}
          </p>
          <h1
            id="module-title"
            className="font-heading text-[28px] leading-9 font-semibold tracking-tight text-balance medium:text-[32px] medium:leading-10"
          >
            {module.title}
          </h1>
          <p className="max-w-[62ch] text-base">{module.objective}</p>
          <div className="flex flex-wrap gap-1.5">
            <MetaChip className={cn(locked && "bg-surface-container-high text-on-surface-variant")}>
              <ScheduleIcon aria-hidden /> {moduleTime(module)}
            </MetaChip>
            {lessonCount ? (
              <MetaChip
                className={cn(locked && "bg-surface-container-high text-on-surface-variant")}
              >
                <FormatListNumberedIcon aria-hidden /> {lessonCount}{" "}
                {lessonCount === 1 ? "step" : "lessons"}
              </MetaChip>
            ) : null}
            {module.owner ? (
              <MetaChip
                className={cn(locked && "bg-surface-container-high text-on-surface-variant")}
              >
                <PersonIcon aria-hidden /> Owner: {module.owner.name}
              </MetaChip>
            ) : null}
            {module.updatedAt ? (
              <MetaChip
                className={cn(locked && "bg-surface-container-high text-on-surface-variant")}
              >
                <UpdateIcon aria-hidden /> Updated {formatShortDate(module.updatedAt)}
              </MetaChip>
            ) : null}
            {module.reviewedBy ? (
              <MetaChip>
                <VerifiedIcon aria-hidden /> Reviewed by {module.reviewedBy}
              </MetaChip>
            ) : null}
          </div>
          {locked ? (
            <p className="flex items-center gap-2.5 self-start rounded-[14px] bg-surface-container-high px-3.5 py-2.5 text-sm">
              <LockClockIcon className="size-5 shrink-0" aria-hidden />
              <span>
                Opens on{" "}
                <b className="font-medium">
                  {module.stage.opensOn ? formatShortDate(module.stage.opensOn) : "a later date"}
                </b>{" "}
                with the {module.stage.name} stage.
              </span>
            </p>
          ) : (
            <div className="flex max-w-140 items-center gap-4">
              <Progress
                value={Math.round((done ? 1 : module.progress) * 100)}
                aria-label="Module progress"
                className="flex-1 [--progress-track:color-mix(in_srgb,var(--color-primary)_22%,transparent)]"
              />
              <span className="text-sm font-medium whitespace-nowrap">
                {done
                  ? module.completedOn
                    ? `Completed ${formatShortDate(module.completedOn)}`
                    : "Completed"
                  : `${lessonsDone} of ${lessonCount} done`}
              </span>
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-3 @max-[640px]:[&>*]:flex-[1_1_auto]">
            {current ? (
              <Button
                size="md"
                nativeButton={false}
                render={<Link to={learningPath(lessonTarget(current))} />}
              >
                <PlayArrowFilledIcon aria-hidden />
                {current.type === "check"
                  ? "Take the knowledge check"
                  : lessonsDone > 0
                    ? `Resume lesson ${current.number}`
                    : "Start module"}
              </Button>
            ) : null}
            <Button
              size="md"
              variant="ai-tonal"
              onClick={() => openAssistant(module.suggestedQuestion ?? `Summarize ${module.title}`)}
            >
              <HubIcon aria-hidden /> Ask about this module
            </Button>
            <Button variant="ghost" className="text-current" onClick={() => setClarifyOpen(true)}>
              <ContactSupportIcon aria-hidden /> Request clarification
            </Button>
          </div>
        </div>
      </section>

      <PageColumns>
        <PageMain>
          <SectionCard
            title="Lessons"
            count={lessonCount ? `${lessonsDone} of ${lessonCount} done` : undefined}
            endpoint={E.module.path}
          >
            {lessonCount ? (
              <SegmentedList>
                {module.lessons.map((lesson) => {
                  const type = LESSON_TYPE[lesson.type];
                  const TypeIcon = type.icon;
                  const isCurrent = current?.id === lesson.id;
                  return (
                    <SegmentedItem
                      key={lesson.id}
                      render={<Link to={learningPath(lessonTarget(lesson))} />}
                      className={cn(
                        "gap-3",
                        isCurrent &&
                          "bg-[color-mix(in_srgb,var(--color-primary-container)_55%,var(--color-pane))]",
                      )}
                    >
                      <LessonNumber number={lesson.number} done={lesson.done} current={isCurrent} />
                      <SegmentedItemLead tone="neutral" size="sm">
                        <TypeIcon aria-hidden />
                      </SegmentedItemLead>
                      <SegmentedItemBody>
                        <SegmentedItemTitle className="whitespace-normal">
                          {lesson.title}
                        </SegmentedItemTitle>
                        <SegmentedItemMeta>
                          <DotList
                            parts={[
                              type.label,
                              lesson.type === "check"
                                ? `${lesson.questionCount ?? 5} questions`
                                : `${lesson.minutes} min`,
                              lesson.done ? "Done" : null,
                            ]}
                          />
                        </SegmentedItemMeta>
                      </SegmentedItemBody>
                      <SegmentedItemTrail>
                        {isCurrent ? (
                          <span className="inline-flex h-7 items-center rounded-full bg-secondary-container px-3 text-xs font-medium text-on-secondary-container">
                            {lesson.type === "check" ? "Start" : "Continue"}
                          </span>
                        ) : (
                          <ChevronRightIcon
                            className="size-5 text-on-surface-variant"
                            aria-hidden
                          />
                        )}
                      </SegmentedItemTrail>
                    </SegmentedItem>
                  );
                })}
              </SegmentedList>
            ) : (
              <p className="flex items-center gap-2 text-sm text-on-surface-variant">
                <LockIcon className="size-4" aria-hidden /> Lessons appear when the stage opens.
              </p>
            )}
          </SectionCard>
          {module.objectives.length ? (
            <SectionCard title="What you’ll be able to do">
              <ul className="flex flex-col gap-1">
                {module.objectives.map((objective, index) => {
                  const met = done || index < lessonsDone;
                  return (
                    <li key={objective} className="flex items-start gap-3 py-1.5 text-base">
                      {met ? (
                        <CheckCircleFilledIcon
                          className="mt-0.5 size-5 shrink-0 text-success"
                          aria-label="Met"
                        />
                      ) : (
                        <RadioButtonUncheckedIcon
                          className="mt-0.5 size-5 shrink-0 text-outline"
                          aria-label="Not yet"
                        />
                      )}
                      {objective}
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          ) : null}
        </PageMain>
        <PageSide>
          {module.sources.length ? (
            <SectionCard title="Sources" count={module.sources.length}>
              <SegmentedList>
                {module.sources.map((source) => (
                  <SegmentedItem key={source.id} className="min-h-0 items-start gap-3 p-3">
                    <SegmentedItemLead tone="neutral" size="sm">
                      <OriginIcon origin={source.origin} />
                    </SegmentedItemLead>
                    <SegmentedItemBody>
                      <SegmentedItemTitle className="whitespace-normal">
                        {source.title}
                      </SegmentedItemTitle>
                      <SegmentedItemMeta>
                        <DotList parts={[source.label, KNOWLEDGE_ORIGIN_LABEL[source.origin]]} />
                      </SegmentedItemMeta>
                      <SegmentedItemMeta>
                        <DotList
                          parts={[source.owner, `Updated ${formatShortDate(source.updatedAt)}`]}
                        />
                      </SegmentedItemMeta>
                      {source.restrictedTo ? (
                        <>
                          <span className="mt-1 inline-flex items-center gap-1 text-xs text-on-surface-variant">
                            <LockIcon className="size-3.5" aria-hidden /> {source.restrictedTo}. You
                            don’t have access.
                          </span>
                          <Button
                            size="xs"
                            variant="outline"
                            className="mt-1.5 self-start"
                            onClick={() => comingSoon("Access requests")}
                          >
                            Request access
                          </Button>
                        </>
                      ) : null}
                    </SegmentedItemBody>
                    {source.restrictedTo ? null : source.url ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Open ${source.title} in ${KNOWLEDGE_ORIGIN_LABEL[source.origin]}`}
                        nativeButton={false}
                        render={<a href={source.url} target="_blank" rel="noreferrer" />}
                      >
                        <OpenInNewIcon />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Open ${source.title} in ${KNOWLEDGE_ORIGIN_LABEL[source.origin]}`}
                        onClick={() => comingSoon("Opening sources")}
                      >
                        <OpenInNewIcon />
                      </Button>
                    )}
                  </SegmentedItem>
                ))}
              </SegmentedList>
            </SectionCard>
          ) : null}
          <SectionCard title="People">
            <SegmentedList>
              {module.people.map((entry) => (
                <SegmentedItem key={entry.person.id} className="min-h-0 gap-3 py-2 pr-2 pl-2.5">
                  <PersonAvatar person={entry.person} size="md" />
                  <SegmentedItemBody>
                    <SegmentedItemTitle>{entry.person.name}</SegmentedItemTitle>
                    <span className="truncate text-xs text-on-surface-variant">{entry.role}</span>
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
          </SectionCard>
          <SectionCard title="Was this module useful?">
            <RatingButtons
              targetType="module"
              targetId={module.id}
              initial={module.rating}
              labels={{ up: "Useful", down: "Not useful" }}
              ownerName={module.owner?.name ?? null}
            />
          </SectionCard>
        </PageSide>
      </PageColumns>
      <ClarificationDialog
        open={clarifyOpen}
        onOpenChange={setClarifyOpen}
        moduleId={module.id}
        owner={module.owner}
        topics={[
          { id: "module", label: module.title, lessonId: null },
          ...module.lessons
            .filter((lesson) => lesson.type !== "check")
            .map((lesson) => ({
              id: lesson.id,
              label: `Lesson ${lesson.number}: ${lesson.title}`,
              lessonId: lesson.id,
            })),
        ]}
      />
    </div>
  );
}
