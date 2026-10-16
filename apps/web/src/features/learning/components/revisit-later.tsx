import type { RevisitItem } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { BookmarkIcon } from "@/components/ui/icons";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { revisitQuery } from "@/features/learning/api/learning.queries";
import { ROADMAP_PATH, learningPath } from "@/features/learning/learning-meta";

const pathOf = (item: RevisitItem) => learningPath({ kind: item.kind, id: item.id });

/** My roadmap: the lessons and modules the learner marked to come back to. Hidden when none. */
export function RevisitLaterCard() {
  const items = useQuery(revisitQuery()).data?.items ?? [];
  if (!items.length) return null;
  return (
    <SectionCard title="Revisit later" count={items.length}>
      <SegmentedList>
        {items.map((item) => (
          <SegmentedItem key={item.id} render={<Link to={pathOf(item)} />} className="gap-3">
            <SegmentedItemLead tone="neutral" size="sm">
              <BookmarkIcon aria-hidden />
            </SegmentedItemLead>
            <SegmentedItemBody>
              <SegmentedItemTitle className="whitespace-normal">{item.title}</SegmentedItemTitle>
              <SegmentedItemMeta>
                {item.kind === "lesson" ? item.module.title : "Module"}
              </SegmentedItemMeta>
            </SegmentedItemBody>
          </SegmentedItem>
        ))}
      </SegmentedList>
    </SectionCard>
  );
}

/** Home's "Up next": the first few marked items as links. Hidden when none. */
export function RevisitLaterLinks() {
  const items = useQuery(revisitQuery()).data?.items ?? [];
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">Revisit later</span>
      {items.slice(0, 3).map((item) => (
        <Button
          key={item.id}
          size="xs"
          variant="outline"
          nativeButton={false}
          render={<Link to={pathOf(item)} />}
        >
          <BookmarkIcon aria-hidden />
          {item.title}
        </Button>
      ))}
      {items.length > 3 ? (
        <Link to={ROADMAP_PATH} className="text-sm font-medium underline underline-offset-2">
          {items.length - 3} more
        </Link>
      ) : null}
    </div>
  );
}
