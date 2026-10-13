import type { ProjectWithStats } from "@contextos/shared";
import { ArrowRightIcon, FileTextIcon, LayersIcon } from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount, formatDateTime } from "@/lib/format";

export function ProjectCard({ project }: { project: ProjectWithStats }) {
  return (
    <Card className="group/project relative transition-colors hover:border-foreground/20">
      <CardHeader>
        <CardTitle className="text-base">
          <Link to={`/projects/${project.id}`} className="after:absolute after:inset-0">
            {project.name}
          </Link>
        </CardTitle>
        <CardDescription className="line-clamp-2">
          {project.description ?? "No description yet."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <FileTextIcon className="size-3.5" aria-hidden />
            <dd>
              {formatCount(project.stats.sources, "source")}
              {project.stats.sources > 0 ? ` · ${project.stats.readySources} ready` : ""}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <LayersIcon className="size-3.5" aria-hidden />
            <dd>{formatCount(project.stats.contextItems, "context item")}</dd>
          </div>
          {project.stats.lastProcessedAt ? (
            <dd>Updated {formatDateTime(project.stats.lastProcessedAt)}</dd>
          ) : null}
        </dl>
        <ArrowRightIcon
          className="absolute top-4 right-4 size-4 text-muted-foreground opacity-0 transition-opacity group-hover/project:opacity-100"
          aria-hidden
        />
      </CardContent>
    </Card>
  );
}
