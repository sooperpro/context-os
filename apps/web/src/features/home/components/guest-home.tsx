import { useQuery } from "@tanstack/react-query";
import { AskBand } from "@/components/ask-band";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { meQuery } from "@/features/account/api/account.queries";
import { ProjectCard } from "@/features/projects/components/project-card";
import { projectsQuery } from "@/features/projects/api/projects.queries";
import { firstName, formatLongDate } from "@/lib/format";

/**
 * A guest's Home: the projects they were added to, when their access ends, and Context Bot. Guests
 * aren't onboarding, so there is no roadmap here.
 */
export function GuestHome() {
  const me = useQuery(meQuery());
  const projects = useQuery(projectsQuery());
  const ends = me.data?.guestExpiresAt;
  const items = projects.data?.items ?? [];
  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker="Guest access"
        title={me.data ? `Welcome, ${firstName(me.data.name)}` : "Welcome"}
        description={
          ends
            ? `You can see the projects below until ${formatLongDate(new Date(ends))}.`
            : "You can see the projects below."
        }
      />
      <SectionCard
        title="Your projects"
        count={items.length}
        endpoint="/v1/projects"
        status={projects}
      >
        {items.length ? (
          <div className="grid gap-3 @min-[640px]:grid-cols-2 @min-[940px]:grid-cols-3">
            {items.map((project, index) => (
              <ProjectCard key={project.id} project={project} index={index} />
            ))}
          </div>
        ) : projects.data ? (
          <p className="text-sm text-on-surface-variant">
            You haven't been added to a project yet. Ask the person who invited you.
          </p>
        ) : null}
      </SectionCard>
      {items.length ? (
        <AskBand
          description="Answers come only from the projects you were added to, with the sources cited."
          prompts={items.slice(0, 3).map((project) => `What is ${project.name} about?`)}
        />
      ) : null}
    </div>
  );
}
