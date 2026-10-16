import type { SourceObject } from "@contextos/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DeleteIcon,
  OpenInNewIcon,
  PersonAddIcon,
  SyncAltIcon,
  VisibilityIcon,
} from "@/components/ui/icons";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedItemTrail,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SOURCE_KIND_ICON } from "@/features/hub/components/kind-icon";
import { useDeleteSource, useReprocessSource } from "@/features/sources/api/sources.queries";
import { SourceStatusBadge } from "@/features/sources/components/source-status-badge";
import { SourceShareDialog } from "@/features/sources/components/source-share-dialog";
import { useSourceDrawer } from "@/features/sources/hooks/use-source-drawer";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { formatCount, formatDate, formatDateTime } from "@/lib/format";
import { SOURCE_KIND_LABEL } from "@/lib/labels";

interface SourceListProps {
  projectId: string;
  sources: SourceObject[];
}

/** The prototype's sources list: kind tile, title, provenance lines, status and actions per row. */
export function SourceList({ projectId, sources }: SourceListProps) {
  const drawer = useSourceDrawer();
  const reprocess = useReprocessSource(projectId);
  const remove = useDeleteSource(projectId);
  const [pendingDelete, setPendingDelete] = useState<SourceObject | null>(null);
  const [sharing, setSharing] = useState<SourceObject | null>(null);
  // Admins share pasted or uploaded sources (restricted by default) one person at a time.
  const { persona } = useViewer();
  const canShare = (source: SourceObject) => persona === "admin" && source.connector === "manual";

  const confirmDelete = () => {
    if (!pendingDelete) return;
    remove.mutate(pendingDelete.id, {
      onSuccess: () => toast.success("Source deleted"),
      onSettled: () => setPendingDelete(null),
    });
  };

  return (
    <>
      <SegmentedList aria-label="Sources">
        {sources.map((source) => {
          const Icon = SOURCE_KIND_ICON[source.kind];
          return (
            <SegmentedItem key={source.id} className="items-start">
              <SegmentedItemLead className="mt-0.5 bg-surface-container-highest text-on-surface-variant">
                <Icon />
              </SegmentedItemLead>
              <SegmentedItemBody>
                <SegmentedItemTitle>
                  <button
                    type="button"
                    className="max-w-full truncate rounded-xs text-start outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    onClick={() => drawer.open({ sourceId: source.id })}
                  >
                    {source.title}
                  </button>
                </SegmentedItemTitle>
                <SegmentedItemMeta>
                  <span>{SOURCE_KIND_LABEL[source.kind]}</span>
                  {source.author ? <span>{source.author}</span> : null}
                  <span>
                    {source.sourceCreatedAt
                      ? `Dated ${formatDate(source.sourceCreatedAt)}`
                      : "Undated"}
                  </span>
                </SegmentedItemMeta>
                <SegmentedItemMeta>
                  <span>Ingested {formatDateTime(source.ingestedAt)}</span>
                  <span>{source.contentLength.toLocaleString()} characters</span>
                  {source.chunkCount > 0 ? (
                    <span>{formatCount(source.chunkCount, "chunk")}</span>
                  ) : null}
                </SegmentedItemMeta>
                {source.status === "failed" && source.error ? (
                  <p className="text-xs text-error">{source.error}</p>
                ) : null}
              </SegmentedItemBody>
              <SegmentedItemTrail className="flex-wrap justify-end gap-1">
                <SourceStatusBadge status={source.status} />
                {source.url ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Open ${source.title} in its source`}
                          nativeButton={false}
                          render={<a href={source.url} target="_blank" rel="noreferrer" />}
                        />
                      }
                    >
                      <OpenInNewIcon />
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
                        aria-label={`View ${source.title}`}
                        onClick={() => drawer.open({ sourceId: source.id })}
                      />
                    }
                  >
                    <VisibilityIcon />
                  </TooltipTrigger>
                  <TooltipContent>View content</TooltipContent>
                </Tooltip>
                {canShare(source) ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Share ${source.title} with a person`}
                          onClick={() => setSharing(source)}
                        />
                      }
                    >
                      <PersonAddIcon />
                    </TooltipTrigger>
                    <TooltipContent>Share with a person</TooltipContent>
                  </Tooltip>
                ) : null}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Reprocess ${source.title}`}
                        disabled={reprocess.isPending || source.status === "processing"}
                        onClick={() =>
                          reprocess.mutate(source.id, {
                            onSuccess: () => toast.success("Reprocessing queued"),
                          })
                        }
                      />
                    }
                  >
                    <SyncAltIcon />
                  </TooltipTrigger>
                  <TooltipContent>Reprocess</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${source.title}`}
                        disabled={remove.isPending}
                        onClick={() => setPendingDelete(source)}
                      />
                    }
                  >
                    <DeleteIcon />
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </SegmentedItemTrail>
            </SegmentedItem>
          );
        })}
      </SegmentedList>

      <SourceShareDialog
        projectId={projectId}
        source={sharing}
        onOpenChange={(open) => (open ? null : setSharing(null))}
      />
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this source?</DialogTitle>
            <DialogDescription>
              "{pendingDelete?.title}" and everything derived from it are removed: its chunks,
              extracted context items and their evidence. Answers that cited it lose that citation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
