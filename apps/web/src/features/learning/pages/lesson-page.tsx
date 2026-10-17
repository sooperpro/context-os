import type { Lesson } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { SectionCard } from "@/components/section-card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  ArrowForwardIcon,
  ArticleIcon,
  CheckIcon,
  HighlightIcon,
  SchoolIcon,
  VerifiedIcon,
} from "@/components/ui/icons";
import { Loader } from "@/components/ui/loader";
import { Progress } from "@/components/ui/progress";
import { LEARNING_ENDPOINTS as E } from "@/features/learning/api/learning.api";
import { lessonQuery, useCompleteLesson } from "@/features/learning/api/learning.queries";
import { LessonBlocks } from "@/features/learning/components/lesson-blocks";
import { LessonNumber } from "@/features/learning/components/lesson-number";
import { RatingButtons } from "@/features/learning/components/rating-buttons";
import { RevisitButton } from "@/features/learning/components/revisit-button";
import { SelectionAsk } from "@/features/learning/components/selection-ask";
import {
  LESSON_TYPE,
  MODULE_KIND,
  ROADMAP_PATH,
  learningPath,
  modulePath,
} from "@/features/learning/learning-meta";
import { formatShortDate } from "@/lib/format";
import { assistantPreferencesQuery } from "@/features/account/api/account.queries";
import { useMediaQuery, WINDOW } from "@/hooks/use-media-query";
import { useAssistant } from "@/components/layout/assistant-context";

/** A lesson (prototype `lessonPage`): the module outline beside a readable article. */
export function LessonPage() {
  const { lessonId = "" } = useParams();
  const query = useQuery(lessonQuery(lessonId));

  if (query.isPending) {
    return (
      <div className="grid min-h-80 place-items-center">
        <Loader label="Loading the lesson" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-360">
        <SectionCard
          title="This lesson could not be loaded"
          endpoint={E.lesson.path}
          status={query}
        />
      </div>
    );
  }
  return <LessonView lesson={query.data} />;
}

function LessonView({ lesson }: { lesson: Lesson }) {
  useOpenBesideLesson();
  useBotContext(
    {
      chips: [
        { icon: ArticleIcon, label: `Lesson: ${lesson.title}` },
        { icon: SchoolIcon, label: lesson.module.title },
      ],
      suggestions: [
        "What does dual-write mean here?",
        "Explain idempotent consumers simply",
        "Who made this decision?",
      ],
      intro:
        "I’m reading this lesson with you. Ask about anything in it, or select text in the lesson to ask about that passage.",
    },
    `lesson:${lesson.id}`,
  );
  const navigate = useNavigate();
  const articleRef = useRef<HTMLElement>(null);
  const complete = useCompleteLesson();
  const ModuleIcon = MODULE_KIND[lesson.module.kind].icon;
  const outlineTarget = (entry: Lesson["outline"][number]) =>
    learningPath({ kind: entry.type === "check" ? "check" : "lesson", id: entry.id });
  const nextInOutline = lesson.outline.find((entry) => entry.number > lesson.number);

  const finish = () =>
    complete.mutate(lesson.id, {
      onSuccess: (result) => {
        const remaining = lesson.outline.filter((entry) => !entry.done && entry.id !== lesson.id);
        toast.success(
          result.next === null
            ? `${lesson.module.title} is complete.`
            : remaining.length === 1 && remaining[0]?.type === "check"
              ? `Lesson ${lesson.number} complete. One step left: the knowledge check.`
              : `Lesson ${lesson.number} complete.`,
        );
        void navigate(result.next ? learningPath(result.next) : modulePath(lesson.module.id));
      },
      onError: () => toast.error("The lesson could not be marked complete. Please try again."),
    });

  const provenance = [
    lesson.basedOn.length ? `Based on ${lesson.basedOn.join(" and ")}` : null,
    lesson.reviewedBy
      ? `Reviewed by ${lesson.reviewedBy.name}${lesson.reviewedOn ? ` on ${formatShortDate(lesson.reviewedOn)}` : ""}`
      : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to={ROADMAP_PATH} />}>My roadmap</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to={`${ROADMAP_PATH}?stage=${lesson.stage.id}`} />}>
                {lesson.stage.name}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to={modulePath(lesson.module.id)} />}>
                {lesson.module.title}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Lesson {lesson.number}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <span className="flex items-center gap-2 text-xs whitespace-nowrap text-on-surface-variant">
          <PreviewDataChip endpoint={E.lesson.path} />
          Lesson {lesson.number} of {lesson.outline.length}
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 @min-[760px]:grid-cols-[200px_minmax(0,1fr)] @min-[760px]:gap-7 @min-[1000px]:grid-cols-[232px_minmax(0,1fr)] @min-[1000px]:gap-10">
        <aside
          aria-label="Lessons in this module"
          className="flex flex-col gap-3 rounded-2xl bg-card p-4 @min-[760px]:sticky @min-[760px]:top-4"
        >
          <Link
            to={modulePath(lesson.module.id)}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <ModuleIcon className="size-5 shrink-0 text-primary" aria-hidden />
            {lesson.module.title}
          </Link>
          <Progress value={Math.round(lesson.module.progress * 100)} aria-label="Module progress" />
          <ol className="flex flex-col gap-0.5">
            {lesson.outline.map((entry) => {
              const isCurrent = entry.id === lesson.id;
              return (
                <li key={entry.id}>
                  <Link
                    to={outlineTarget(entry)}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-on-surface/6",
                      isCurrent &&
                        "bg-secondary-container text-on-secondary-container hover:bg-secondary-container",
                      entry.done && !isCurrent && "text-on-surface-variant",
                    )}
                  >
                    <LessonNumber number={entry.number} done={entry.done} current={isCurrent} />
                    {entry.title}
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="flex items-start gap-1.5 rounded-md bg-ai-container/45 px-3 py-2.5 text-xs text-on-ai-container">
            <HighlightIcon className="size-4 shrink-0" aria-hidden />
            Select any text in the lesson to ask Context Bot about it.
          </p>
        </aside>

        <article
          ref={articleRef}
          aria-labelledby="lesson-title"
          className="max-w-[68ch] text-base leading-[27px] text-on-surface selection:bg-ai-container selection:text-on-ai-container"
        >
          <p className="text-sm font-medium text-on-surface-variant">
            {LESSON_TYPE[lesson.type].label} · {lesson.minutes} min
            {lesson.type === "article" ? " read" : ""}
          </p>
          <h1
            id="lesson-title"
            className="mt-1.5 mb-2 font-heading text-[28px] leading-9 font-semibold tracking-tight text-balance medium:text-[32px] medium:leading-10"
          >
            {lesson.title}
          </h1>
          {provenance.length ? (
            <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
              <VerifiedIcon className="size-4 shrink-0" aria-hidden />
              {provenance.join(" · ")}
            </p>
          ) : null}
          <LessonBlocks blocks={lesson.blocks} />
          <footer className="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-outline-variant pt-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Was this lesson clear?</span>
              <RatingButtons
                targetType="lesson"
                targetId={lesson.id}
                initial={lesson.rating}
                labels={{ up: "Clear", down: "Not clear" }}
                ownerName={null}
              />
              <RevisitButton id={lesson.id} revisit={lesson.revisit === true} />
            </div>
            {lesson.done ? (
              nextInOutline ? (
                <Button
                  size="md"
                  nativeButton={false}
                  render={<Link to={outlineTarget(nextInOutline)} />}
                >
                  Next: {nextInOutline.title} <ArrowForwardIcon aria-hidden />
                </Button>
              ) : (
                <Button
                  size="md"
                  variant="outline"
                  nativeButton={false}
                  render={<Link to={modulePath(lesson.module.id)} />}
                >
                  Back to the module
                </Button>
              )
            ) : (
              <Button size="md" disabled={complete.isPending} onClick={finish}>
                <CheckIcon aria-hidden /> Mark complete and continue
              </Button>
            )}
          </footer>
        </article>
      </div>
      <SelectionAsk containerRef={articleRef} />
    </div>
  );
}

/** Settings → "Open beside lessons": on large screens, Context Bot opens next to the lesson. */
function useOpenBesideLesson() {
  const { openAssistant } = useAssistant();
  const preferences = useQuery(assistantPreferencesQuery());
  const expanded = useMediaQuery(WINDOW.expanded);
  const enabled = preferences.data?.openBesideLessons === true && expanded;
  useEffect(() => {
    if (enabled) openAssistant();
    // Once per lesson visit, not on every preference refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
