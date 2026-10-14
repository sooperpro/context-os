import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link, Outlet, useLocation, useParams, useSearchParams } from "react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ArrowBackIcon } from "@/components/ui/icons";
import { PillTab, PillTabs } from "@/components/ui/pill-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { hubQuery } from "@/features/hub/api/hub.queries";
import { FailedJobsPanel } from "@/features/hub/components/failed-jobs-panel";
import { ProjectHero } from "@/features/hub/components/project-hero";
import { projectKeys } from "@/features/projects/api/keys";
import { SourceDrawerProvider } from "@/features/sources/components/source-drawer";
import { ApiClientError } from "@/lib/api-client";

/** The hub's sections (query parameter) and the project routes, as one row of pills. */
const PROJECT_SECTIONS = [
  { id: "overview", label: "Overview", tab: null },
  { id: "decisions", label: "Decisions", tab: "decisions" },
  { id: "current", label: "Current state", tab: "current" },
  { id: "people", label: "People", tab: "people" },
  { id: "system", label: "Systems", tab: "system" },
  { id: "terms", label: "Terms", tab: "terms" },
  { id: "timeline", label: "Timeline", tab: "timeline" },
] as const;

export function ProjectLayout() {
  const { projectId = "" } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const hub = useQuery(hubQuery(projectId));

  // When background processing finishes, refresh everything under this project once.
  const syncState = hub.data?.sync.state;
  const previousState = useRef(syncState);
  useEffect(() => {
    if (previousState.current === "processing" && syncState && syncState !== "processing") {
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    }
    previousState.current = syncState;
  }, [syncState, projectId, queryClient]);

  if (hub.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-56 rounded-3xl" />
        <Skeleton className="h-10 w-3/4 rounded-full" />
      </div>
    );
  }

  if (hub.isError) {
    const notFound = hub.error instanceof ApiClientError && hub.error.status === 404;
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="font-heading text-2xl font-semibold">
          {notFound ? "Project not found" : "Could not load project"}
        </h1>
        {!notFound ? <p className="text-sm text-on-surface-variant">{hub.error.message}</p> : null}
        <Button variant="outline" nativeButton={false} render={<Link to="/knowledge" />}>
          <ArrowBackIcon aria-hidden />
          Back to the Knowledge Hub
        </Button>
      </div>
    );
  }

  const base = `/projects/${projectId}`;
  const route = location.pathname.endsWith("/sources")
    ? "sources"
    : location.pathname.endsWith("/ask")
      ? "ask"
      : (searchParams.get("tab") ?? "overview");
  const { project, sync } = hub.data;

  return (
    <SourceDrawerProvider projectId={projectId}>
      <div className="space-y-5">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/knowledge" />}>Knowledge Hub</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/knowledge?cat=projects" />}>Projects</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{project.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <ProjectHero hub={hub.data} />
        {sync.state === "attention" ? <FailedJobsPanel projectId={projectId} /> : null}

        <PillTabs aria-label="Project sections">
          {PROJECT_SECTIONS.map((section) => (
            <PillTab
              key={section.id}
              active={route === section.id}
              render={<Link to={section.tab ? `${base}?tab=${section.tab}` : base} />}
            >
              {section.label}
            </PillTab>
          ))}
          <PillTab active={route === "sources"} render={<Link to={`${base}/sources`} />}>
            Sources
          </PillTab>
          <PillTab active={route === "ask"} render={<Link to={`${base}/ask`} />}>
            Ask
          </PillTab>
        </PillTabs>

        <Outlet />
      </div>
    </SourceDrawerProvider>
  );
}
