import type { SourcePick } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { OriginIcon } from "@/components/origin-icon";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OptionList, OptionTile } from "@/components/ui/option-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { CONTRIBUTION_ENDPOINTS as E } from "@/features/contributions/api/contributions.api";
import { sourceSearchQuery } from "@/features/contributions/api/contributions.queries";
import { KNOWLEDGE_ORIGIN_LABEL } from "@/lib/labels";

interface SourcePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Matches sources to the draft (its title). */
  query: string;
  selected: SourcePick[];
  onConfirm: (sources: SourcePick[]) => void;
}

/** "Add sources": sources the person can access that match the draft, as checkboxes (prototype `pickSources`). */
export function SourcePickerDialog({
  open,
  onOpenChange,
  query,
  selected,
  onConfirm,
}: SourcePickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        {/* Remounted on open so the selection starts from the draft's current sources. */}
        {open ? (
          <PickerBody
            query={query}
            selected={selected}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({
  query,
  selected,
  onCancel,
  onConfirm,
}: Omit<SourcePickerDialogProps, "open" | "onOpenChange"> & { onCancel: () => void }) {
  const sources = useQuery(sourceSearchQuery(query));
  const [chosen, setChosen] = useState(() => new Set(selected.map((source) => source.id)));
  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add sources</DialogTitle>
        <DialogDescription>Showing sources you can access that match this draft.</DialogDescription>
        <PreviewDataChip endpoint={E.sources.path} />
      </DialogHeader>
      {sources.isPending ? (
        <div className="flex flex-col gap-0.5" aria-busy="true" aria-label="Loading sources">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-16 rounded-xs first:rounded-t-lg last:rounded-b-lg" />
          ))}
        </div>
      ) : sources.isError ? (
        <p className="text-sm text-error">Sources could not be loaded. Close this and try again.</p>
      ) : (
        <OptionList aria-label="Sources">
          {sources.data.map((source) => (
            <OptionTile
              key={source.id}
              input={
                <input
                  type="checkbox"
                  checked={chosen.has(source.id)}
                  onChange={() => toggle(source.id)}
                />
              }
              title={
                <span className="inline-flex items-center gap-2">
                  <OriginIcon origin={source.origin} className="size-4.5 shrink-0 opacity-80" />
                  {source.title}
                </span>
              }
              description={`${source.label} · ${KNOWLEDGE_ORIGIN_LABEL[source.origin]}`}
            />
          ))}
        </OptionList>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!sources.data}
          onClick={() => onConfirm((sources.data ?? []).filter((source) => chosen.has(source.id)))}
        >
          Add selected
        </Button>
      </DialogFooter>
    </>
  );
}
