import type { AskThread } from "@contextos/shared";
import { cn } from "cn";
import { MessageSquareIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedItemTrail,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { formatDate } from "@/lib/format";

interface ThreadListProps {
  threads: AskThread[];
  activeId: string | null;
  onSelect: (threadId: string | null) => void;
  onDelete: (thread: AskThread) => void;
}

/** The caller's private conversations in this project, newest first. */
export function ThreadList({ threads, activeId, onSelect, onDelete }: ThreadListProps) {
  return (
    <div className="space-y-3">
      <Button variant="secondary" className="w-full justify-start" onClick={() => onSelect(null)}>
        <PlusIcon aria-hidden />
        New conversation
      </Button>
      {threads.length === 0 ? (
        <p className="px-2 text-xs text-on-surface-variant">
          Conversations are private to you and keep every answer with its citations.
        </p>
      ) : (
        <SegmentedList aria-label="Conversations">
          {threads.map((thread) => {
            const active = thread.id === activeId;
            return (
              <SegmentedItem
                key={thread.id}
                className={cn("min-h-14 py-2", active && "bg-secondary-container text-on-secondary-container")}
                aria-current={active ? "true" : undefined}
              >
                <button
                  type="button"
                  onClick={() => onSelect(thread.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <MessageSquareIcon className="size-4 shrink-0 text-on-surface-variant" aria-hidden />
                  <SegmentedItemBody>
                    <SegmentedItemTitle className={cn(active && "text-on-secondary-container")}>{thread.title}</SegmentedItemTitle>
                    <SegmentedItemMeta>{formatDate(thread.createdAt)}</SegmentedItemMeta>
                  </SegmentedItemBody>
                </button>
                <SegmentedItemTrail>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Delete conversation ${thread.title}`}
                    onClick={() => onDelete(thread)}
                  >
                    <Trash2Icon />
                  </Button>
                </SegmentedItemTrail>
              </SegmentedItem>
            );
          })}
        </SegmentedList>
      )}
    </div>
  );
}
