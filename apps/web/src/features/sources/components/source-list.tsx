import type { SourceObject } from "@contextos/shared";
import { ExternalLinkIcon, EyeIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeleteSource, useReprocessSource } from "@/features/sources/api/sources.queries";
import { SourceStatusBadge } from "@/features/sources/components/source-status-badge";
import { useSourceDrawer } from "@/features/sources/hooks/use-source-drawer";
import { formatCount, formatDate, formatDateTime } from "@/lib/format";
import { SOURCE_KIND_LABEL } from "@/lib/labels";

interface SourceListProps {
  projectId: string;
  sources: SourceObject[];
}

export function SourceList({ projectId, sources }: SourceListProps) {
  const drawer = useSourceDrawer();
  const reprocess = useReprocessSource(projectId);
  const remove = useDeleteSource(projectId);

  return (
    <ul className="divide-y rounded-xl border">
      {sources.map((source) => (
        <li key={source.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{SOURCE_KIND_LABEL[source.kind]}</Badge>
              <SourceStatusBadge status={source.status} />
            </div>
            <button
              type="button"
              className="block max-w-full truncate text-left text-sm font-medium hover:underline"
              onClick={() => drawer.open({ sourceId: source.id })}
            >
              {source.title}
            </button>
            <p className="text-xs text-muted-foreground">
              {[
                source.author ? `by ${source.author}` : null,
                source.sourceCreatedAt ? `dated ${formatDate(source.sourceCreatedAt)}` : "undated",
                `ingested ${formatDateTime(source.ingestedAt)}`,
                `${source.contentLength.toLocaleString()} chars`,
                source.chunkCount > 0 ? formatCount(source.chunkCount, "chunk") : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {source.status === "failed" && source.error ? (
              <p className="text-xs text-destructive">{source.error}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {source.url ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Open original"
                      nativeButton={false}
                      render={<a href={source.url} target="_blank" rel="noreferrer" />}
                    />
                  }
                >
                  <ExternalLinkIcon />
                </TooltipTrigger>
                <TooltipContent>Open original</TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="View content"
                    onClick={() => drawer.open({ sourceId: source.id })}
                  />
                }
              >
                <EyeIcon />
              </TooltipTrigger>
              <TooltipContent>View content</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Reprocess"
                    disabled={reprocess.isPending || source.status === "processing"}
                    onClick={() =>
                      reprocess.mutate(source.id, {
                        onSuccess: () => toast.success("Reprocessing queued"),
                      })
                    }
                  />
                }
              >
                <RefreshCwIcon />
              </TooltipTrigger>
              <TooltipContent>Reprocess</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete source"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (
                        window.confirm(`Delete "${source.title}" and everything derived from it?`)
                      ) {
                        remove.mutate(source.id, {
                          onSuccess: () => toast.success("Source deleted"),
                        });
                      }
                    }}
                  />
                }
              >
                <Trash2Icon />
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </div>
        </li>
      ))}
    </ul>
  );
}
