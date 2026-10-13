import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { hubQuery } from "@/features/hub/api/hub.queries";
import { FailedJobsPanel } from "@/features/hub/components/failed-jobs-panel";
import { SyncStatus } from "@/features/hub/components/sync-status";
import { projectKeys } from "@/features/projects/api/keys";
import { SourceDrawerProvider } from "@/features/sources/components/source-drawer";
import { ApiClientError } from "@/lib/api-client";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ProjectLayout() {
  const { projectId = "" } = useParams();
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
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-9 w-72" />
      </div>
    );
  }

  if (hub.isError) {
    const notFound = hub.error instanceof ApiClientError && hub.error.status === 404;
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-2xl font-semibold">
          {notFound ? "Project not found" : "Could not load project"}
        </h1>
        {!notFound ? <p className="text-sm text-muted-foreground">{hub.error.message}</p> : null}
        <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
          <ArrowLeftIcon aria-hidden />
          Back to projects
        </Button>
      </div>
    );
  }

  const { project, sync } = hub.data;
  const navItems = [
    { to: `/projects/${projectId}`, label: "Hub", end: true },
    { to: `/projects/${projectId}/ask`, label: "Ask", end: false },
    { to: `/projects/${projectId}/sources`, label: "Sources", end: false },
  ];

  return (
    <SourceDrawerProvider projectId={projectId}>
      <div className="space-y-6">
        <div className="space-y-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3" aria-hidden />
            Projects
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
              {project.description ? (
                <p className="max-w-prose text-sm text-muted-foreground">{project.description}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {formatCount(project.stats.sources, "source")}
                {project.stats.sources > 0 ? ` (${project.stats.readySources} ready)` : ""} ·{" "}
                {formatCount(project.stats.contextItems, "context item")} ·{" "}
                {formatCount(project.stats.questions, "question")}
              </p>
            </div>
            <SyncStatus sync={sync} />
          </div>
          {sync.state === "attention" ? <FailedJobsPanel projectId={projectId} /> : null}
          <nav className="flex gap-1 border-b" aria-label="Project sections">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
                    isActive && "border-primary font-medium text-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <Outlet />
      </div>
    </SourceDrawerProvider>
  );
}
