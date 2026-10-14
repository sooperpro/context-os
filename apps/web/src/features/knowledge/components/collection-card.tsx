import { Link } from "react-router";
import { Card } from "@/components/ui/card";
import { ArrowRightIcon } from "@/components/ui/icons";
import { Shape } from "@/components/ui/shape";
import type { KnowledgeCategory } from "@/features/knowledge/categories";

interface CollectionCardProps {
  category: KnowledgeCategory;
  count: number;
  /** Up to three entries: a label and where it opens. */
  entries: Array<{ id: string; label: string; to: string }>;
  /** Where the header leads: the hub filtered to this collection. */
  to: string;
}

/** The prototype's Browse collection (`.coll-card`): a header that filters to the collection, then its top entries. */
export function CollectionCard({ category, count, entries, to }: CollectionCardProps) {
  const Icon = category.icon;
  return (
    <Card className="gap-1 p-2">
      <Link
        to={to}
        className="relative isolate flex items-center gap-3 rounded-[18px] p-2 text-on-surface no-underline outline-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-current before:opacity-0 before:transition-opacity before:content-[''] hover:before:opacity-8 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span aria-hidden className="relative grid size-11 shrink-0 place-items-center">
          <Shape
            kind={category.shape}
            className="col-start-1 row-start-1 size-11 text-primary-container"
          />
          <Icon className="relative z-10 col-start-1 row-start-1 size-5 text-on-primary-container" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-medium">{category.name}</span>
          <span className="truncate text-xs text-on-surface-variant">{category.description}</span>
        </span>
        <span className="rounded-sm bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-variant tabular-nums">
          {count}
        </span>
      </Link>
      {entries.length > 0 ? (
        <ul className="flex flex-col gap-0.5 px-1 pb-1">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                to={entry.to}
                className="flex items-center gap-1.5 rounded-md bg-pane px-2.5 py-2 text-sm text-on-surface no-underline outline-none hover:bg-on-surface/4 focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-on-surface-variant"
              >
                <ArrowRightIcon aria-hidden />
                <span className="truncate">{entry.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 pb-2 text-xs text-on-surface-variant">
          Nothing here yet. It fills in as sources are processed.
        </p>
      )}
    </Card>
  );
}
