import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAssistant } from "@/components/layout/assistant-context";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { AddIcon, FolderOpenIcon, HubFilledIcon, SearchIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { projectsQuery } from "@/features/projects/api/projects.queries";
import { CreateProjectDialog } from "@/features/projects/components/create-project-dialog";
import { ProjectCard } from "@/features/projects/components/project-card";
import { formatCount } from "@/lib/format";

export function ProjectsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const projects = useQuery(projectsQuery());
  const { openAssistant } = useAssistant();

  const items = projects.data?.items ?? [];
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? items.filter(
        (project) =>
          project.name.toLowerCase().includes(needle) ||
          (project.description ?? "").toLowerCase().includes(needle),
      )
    : items;
  const totalSources = items.reduce((sum, project) => sum + project.stats.sources, 0);

  return (
    <div>
      <PageHeader
        kicker={
          projects.data
            ? `${formatCount(items.length, "project")} · ${formatCount(totalSources, "source")}`
            : undefined
        }
        title="Projects"
        description="Each project reconstructs how a piece of work got here, why, and what is true now."
        actions={
          <>
            <Button variant="ai" onClick={() => openAssistant()}>
              <HubFilledIcon aria-hidden />
              Ask Context Bot
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <AddIcon aria-hidden />
              New project
            </Button>
          </>
        }
      />

      {items.length > 0 ? (
        <form role="search" onSubmit={(event) => event.preventDefault()} className="mb-6">
          <label htmlFor="projects-search" className="sr-only">
            Search projects
          </label>
          <div className="flex h-14 items-center gap-2 rounded-full bg-field pr-2 pl-4 text-on-surface-variant focus-within:ring-3 focus-within:ring-ring/50">
            <SearchIcon className="size-5 shrink-0" aria-hidden />
            <input
              id="projects-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects by name or description"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-base text-on-surface outline-none placeholder:text-on-surface-variant"
            />
          </div>
        </form>
      ) : null}

      {projects.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-55 rounded-xl" />
          ))}
        </div>
      ) : projects.isError ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Could not load projects</EmptyTitle>
            <EmptyDescription>{projects.error.message}</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={() => void projects.refetch()}>
            Try again
          </Button>
        </Empty>
      ) : items.length === 0 ? (
        <Empty className="rounded-2xl bg-card py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpenIcon />
            </EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Create a project, then add the documents, threads and tickets that describe it.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setCreateOpen(true)}>
            <AddIcon aria-hidden />
            Create your first project
          </Button>
        </Empty>
      ) : visible.length === 0 ? (
        <Empty className="rounded-2xl bg-card py-12">
          <EmptyHeader>
            <EmptyTitle>No projects match "{query.trim()}"</EmptyTitle>
            <EmptyDescription>Try another name, or clear the search.</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={() => setQuery("")}>
            Clear search
          </Button>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
          {visible.map((project, index) => (
            <ProjectCard key={project.id} project={project} index={index} />
          ))}
        </div>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
