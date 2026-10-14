import type { ProjectWithStats } from "@contextos/shared";
import { Link } from "react-router";
import { Card } from "@/components/ui/card";
import {
  CheckIcon,
  DescriptionIcon,
  FolderOpenFilledIcon,
  LayersIcon,
  PendingIcon,
  ScheduleIcon,
} from "@/components/ui/icons";
import { Shape, type ShapeKind } from "@/components/ui/shape";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip } from "@/components/ui/status-chip";
import { formatCount, formatDate } from "@/lib/format";

/** Tonal "start here" cards from the prototype: tone and shape rotate with the card's position. */
const TONES = ["primary", "secondary", "ai"] as const;
const SHAPES: ShapeKind[] = ["cookie9", "clover4", "sunny"];

function projectStatus(stats: ProjectWithStats["stats"]) {
  if (stats.sources === 0)
    return { tone: "neutral" as const, icon: <PendingIcon />, label: "No sources yet" };
  if (stats.readySources < stats.sources)
    return { tone: "info" as const, icon: <Spinner className="size-3.5" />, label: "Processing" };
  return { tone: "success" as const, icon: <CheckIcon />, label: "Ready" };
}

export function ProjectCard({ project, index = 0 }: { project: ProjectWithStats; index?: number }) {
  const status = projectStatus(project.stats);
  const tone = TONES[index % TONES.length]!;
  const shape = SHAPES[index % SHAPES.length]!;

  return (
    <Card tone={tone} interactive className="min-h-55 justify-start gap-2 p-5">
      <span className="relative grid size-14 place-items-center" aria-hidden>
        <Shape kind={shape} className="col-start-1 row-start-1 size-14 text-surface-container-lowest" />
        <FolderOpenFilledIcon className="relative z-10 col-start-1 row-start-1 size-6 text-current" />
      </span>
      <StatusChip tone={status.tone} icon={status.icon} className="self-start">
        {status.label}
      </StatusChip>
      <h3 className="font-heading text-base leading-6 font-medium">
        <Link to={`/projects/${project.id}`} className="outline-none after:absolute after:inset-0 after:content-['']">
          {project.name}
        </Link>
      </h3>
      <p className="line-clamp-3 text-xs opacity-90">{project.description ?? "No description yet."}</p>
      <dl className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs opacity-90 [&_svg]:size-4">
        <div className="flex items-center gap-1">
          <DescriptionIcon aria-hidden />
          <dd>{formatCount(project.stats.sources, "source")}</dd>
        </div>
        <div className="flex items-center gap-1">
          <LayersIcon aria-hidden />
          <dd>{formatCount(project.stats.contextItems, "item")}</dd>
        </div>
        {project.stats.lastProcessedAt ? (
          <div className="flex items-center gap-1">
            <ScheduleIcon aria-hidden />
            <dd>Updated {formatDate(project.stats.lastProcessedAt)}</dd>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}
