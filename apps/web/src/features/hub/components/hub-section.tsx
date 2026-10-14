import type { ContextItem } from "@contextos/shared";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ContextItemCard } from "@/features/hub/components/context-item-card";
import {
  SearchOffIcon,
} from "@/components/ui/icons";

interface HubSectionProps {
  projectId: string;
  items: ContextItem[];
  allItems: ContextItem[];
  emptyTitle: string;
  emptyDescription: string;
}

export function HubSection({
  projectId,
  items,
  allItems,
  emptyTitle,
  emptyDescription,
}: HubSectionProps) {
  if (items.length === 0) {
    return (
      <Empty className="border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchOffIcon />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const itemsById = new Map(allItems.map((item) => [item.id, item]));
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ContextItemCard key={item.id} projectId={projectId} item={item} itemsById={itemsById} />
      ))}
    </div>
  );
}
