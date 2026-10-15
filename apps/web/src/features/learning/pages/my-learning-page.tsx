import type { MyLearning } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { toast } from "sonner";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { DotList } from "@/components/ui/dot-list";
import {
  Diversity3Icon,
  FactCheckIcon,
  GavelIcon,
  RocketLaunchIcon,
  RouteIcon,
  SchoolIcon,
  SmartToyIcon,
  type MaterialIcon,
} from "@/components/ui/icons";
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
import { StatusChip } from "@/components/ui/status-chip";
import { meQuery } from "@/features/account/api/account.queries";
import { LEARNING_ENDPOINTS as E } from "@/features/learning/api/learning.api";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { myLearningQuery, useAddCourse } from "@/features/learning/api/learning.queries";
import { coursePath, modulePath } from "@/features/learning/learning-meta";
import { formatShortDate } from "@/lib/format";

const KIND_ICON: Record<MyLearning["assigned"][number]["kind"], MaterialIcon> = {
  review: FactCheckIcon,
  project: RocketLaunchIcon,
  decisions: GavelIcon,
  coaching: SchoolIcon,
  other: SchoolIcon,
};

/** My learning (prototype `myLearningPage`): for people past onboarding. */
export function MyLearningPage() {
  // Managers and People Ops share this page; the wording follows who is looking.
  const peopleOps = useViewer().persona === "people_ops";
  useBotContext(
    {
      chips: [{ icon: RouteIcon, label: "My learning" }],
      suggestions: [
        peopleOps ? "What should I learn next?" : "Which topics is my team struggling with?",
      ],
      intro: peopleOps
        ? "I can suggest courses and tutorials that fit your role."
        : "I can suggest courses based on what your team is learning.",
    },
    "my-learning",
  );
  const query = useQuery(myLearningQuery());
  const me = useQuery(meQuery());
  const add = useAddCourse();
  const data = query.data;
  const finished = data?.onboardingFinishedOn
    ? new Date(`${data.onboardingFinishedOn}T12:00:00`).toLocaleDateString(undefined, {
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto flex max-w-360 flex-col">
      <PageHeader
        kicker={me.data?.name}
        title="My learning"
        description={`${finished ? `You finished onboarding in ${finished}. ` : ""}Here’s what’s assigned to you now, and what might help ${peopleOps ? "you" : "your team"}.`}
        actions={
          peopleOps ? (
            <Button variant="outline" nativeButton={false} render={<Link to="/onboarding" />}>
              <Diversity3Icon aria-hidden /> Everyone onboarding
            </Button>
          ) : (
            <Button variant="outline" nativeButton={false} render={<Link to="/team" />}>
              <Diversity3Icon aria-hidden /> Your team’s onboarding
            </Button>
          )
        }
      />
      <PageColumns>
        <PageMain>
          <SectionCard
            title="Assigned to you"
            count={data?.assigned.length}
            endpoint={E.myLearning.path}
            status={query}
          >
            <SegmentedList>
              {(data?.assigned ?? []).map((course) => {
                const Icon = KIND_ICON[course.kind];
                const started = course.lessonsDone > 0;
                return (
                  <SegmentedItem key={course.id} className="flex-wrap @min-[640px]:flex-nowrap">
                    {started ? (
                      <span
                        aria-hidden
                        className="relative grid size-11 shrink-0 place-items-center text-primary-foreground"
                      >
                        <Shape kind="cookie7" className="absolute inset-0 size-full text-primary" />
                        <Icon className="relative z-10 size-5" />
                      </span>
                    ) : (
                      <SegmentedItemLead tone="neutral">
                        <Icon aria-hidden />
                      </SegmentedItemLead>
                    )}
                    <SegmentedItemBody>
                      <SegmentedItemTitle className="whitespace-normal">
                        {course.title}
                      </SegmentedItemTitle>
                      <SegmentedItemMeta>
                        <DotList
                          parts={[
                            course.reason,
                            `${course.lessonCount} lessons`,
                            `${course.minutes} min`,
                            course.dueOn ? `Due ${formatShortDate(course.dueOn)}` : null,
                          ]}
                        />
                      </SegmentedItemMeta>
                      {started ? (
                        <Progress
                          value={Math.round((course.lessonsDone / course.lessonCount) * 100)}
                          aria-label="Course progress"
                          className="mt-1.5 max-w-60"
                        />
                      ) : null}
                    </SegmentedItemBody>
                    <SegmentedItemTrail className="ps-14 @min-[640px]:ps-0">
                      {course.id.startsWith("tutorial-") ? (
                        // Tutorials open as a module: lessons, then the knowledge check.
                        <Button
                          size="xs"
                          variant={started ? "default" : "secondary"}
                          nativeButton={false}
                          render={<Link to={modulePath(course.id)} />}
                        >
                          {started ? "Resume" : "Start"}
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          variant={started ? "default" : "secondary"}
                          nativeButton={false}
                          render={<Link to={coursePath(course.id)} />}
                        >
                          {started ? "Resume" : "Start"}
                        </Button>
                      )}
                    </SegmentedItemTrail>
                  </SegmentedItem>
                );
              })}
            </SegmentedList>
          </SectionCard>
          <SectionCard
            title="Suggested for you"
            endpoint={E.myLearning.path}
            action={
              <StatusChip tone="ai" icon={<SmartToyIcon />}>
                {peopleOps ? "From published courses" : "From your team’s activity"}
              </StatusChip>
            }
          >
            {data?.suggested.length ? (
              <SegmentedList>
                {data.suggested.map((course) => {
                  const Icon = KIND_ICON[course.kind];
                  return (
                    <SegmentedItem key={course.id}>
                      <SegmentedItemLead tone="ai">
                        <Icon aria-hidden />
                      </SegmentedItemLead>
                      <SegmentedItemBody>
                        <SegmentedItemTitle className="whitespace-normal">
                          {course.title}
                        </SegmentedItemTitle>
                        <span className="text-xs text-on-surface-variant">
                          {course.reason} · {course.minutes} min
                        </span>
                      </SegmentedItemBody>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={add.isPending}
                        onClick={() =>
                          add.mutate(course.id, {
                            onSuccess: () =>
                              toast.success(`Added “${course.title}” to your learning`),
                            onError: () => toast.error("It could not be added. Please try again."),
                          })
                        }
                      >
                        Add
                      </Button>
                    </SegmentedItem>
                  );
                })}
              </SegmentedList>
            ) : (
              <p className="text-sm text-on-surface-variant">No suggestions right now.</p>
            )}
          </SectionCard>
        </PageMain>
        <PageSide>
          <SectionCard title="Completed" count={data?.completed.length}>
            <ol className="flex flex-col divide-y divide-outline-variant/60">
              {(data?.completed ?? []).map((course) => (
                <li key={course.id} className="flex items-start gap-3 py-2.5">
                  <SegmentedItemLead tone="success" size="sm">
                    <SchoolIcon aria-hidden />
                  </SegmentedItemLead>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium">{course.title}</span>
                    <span className="text-xs text-on-surface-variant">
                      {new Date(`${course.completedOn}T12:00:00`).toLocaleDateString(undefined, {
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </SectionCard>
        </PageSide>
      </PageColumns>
    </div>
  );
}
