import type { Hub } from "@contextos/shared";
import { Link } from "react-router";
import { useAssistant } from "@/components/layout/assistant-context";
import { Button } from "@/components/ui/button";
import {
  ChatIcon,
  DescriptionIcon,
  FolderOpenFilledIcon,
  HistoryIcon,
  HubFilledIcon,
  LayersIcon,
  LinkIcon,
  RocketLaunchFilledIcon,
  UpdateIcon,
} from "@/components/ui/icons";
import { MetaChip, TypeChip } from "@/components/ui/meta-chip";
import { Shape } from "@/components/ui/shape";
import { StatusChip } from "@/components/ui/status-chip";
import { SyncStatus } from "@/features/hub/components/sync-status";
import { formatCount, formatDate } from "@/lib/format";

/** The prototype's project hero: AI-tinted surface, spinning mark, chips, title, summary, facts, actions. */
export function ProjectHero({ hub }: { hub: Hub }) {
  const { project, sync, overview } = hub;
  const { openAssistant } = useAssistant();
  const { stats } = project;

  return (
    <header className="flex flex-col gap-4 rounded-3xl bg-ai-container/55 px-6 py-6 text-on-ai-container @xl:flex-row @xl:items-start @xl:gap-7 @xl:px-8 @xl:py-7">
      <span aria-hidden className="relative grid size-18 shrink-0 place-items-center @xl:size-26">
        <Shape kind="sunny" className="col-start-1 row-start-1 size-full text-ai motion-safe:animate-[spin_60s_linear_infinite]" />
        <RocketLaunchFilledIcon className="relative z-10 col-start-1 row-start-1 size-8 text-on-ai @xl:size-12 motion-safe:animate-[spin_60s_linear_infinite_reverse]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TypeChip>
            <FolderOpenFilledIcon /> Project
          </TypeChip>
          <SyncStatus sync={sync} />
          {overview?.stale ? (
            <StatusChip tone="warning" icon={<HistoryIcon />}>
              Overview out of date
            </StatusChip>
          ) : null}
        </div>
        <h1 className="font-heading text-3xl leading-9 font-semibold text-balance @xl:text-4xl @xl:leading-10">
          {project.name}
        </h1>
        {project.description ? <p className="max-w-[64ch] text-base">{project.description}</p> : null}
        <div className="flex flex-wrap gap-1.5">
          <MetaChip>
            <DescriptionIcon />
            {formatCount(stats.sources, "source")}
            {stats.sources > 0 ? ` · ${stats.readySources} ready` : ""}
          </MetaChip>
          <MetaChip>
            <LayersIcon />
            {formatCount(stats.contextItems, "context item")}
          </MetaChip>
          <MetaChip>
            <ChatIcon />
            {formatCount(stats.questions, "question")}
          </MetaChip>
          {stats.lastProcessedAt ? (
            <MetaChip>
              <UpdateIcon />
              Updated {formatDate(stats.lastProcessedAt)}
            </MetaChip>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <Button
            variant="ai-tonal"
            onClick={() =>
              openAssistant(`Summarize ${project.name}: what it is, what was decided, and what is still open.`)
            }
          >
            <HubFilledIcon aria-hidden />
            Ask about {project.name}
          </Button>
          <Button
            variant="ghost"
            className="text-current"
            nativeButton={false}
            render={<Link to={`/projects/${project.id}/sources`} />}
          >
            <LinkIcon aria-hidden />
            {formatCount(stats.sources, "source")}
          </Button>
        </div>
      </div>
    </header>
  );
}
