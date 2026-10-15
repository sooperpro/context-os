import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAssistant } from "@/components/layout/assistant-context";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { CheckIcon, SmartToyIcon } from "@/components/ui/icons";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemTitle,
  SegmentedList,
} from "@/components/ui/segmented-list";
import {
  SEARCH_TYPES,
  resultPath,
  searchQuery,
  type SearchType,
} from "@/features/search/api/search.api";

const LABEL: Record<SearchType, string> = {
  context_item: "Knowledge",
  source: "Sources",
  project: "Projects",
  person: "People",
};

/** Search results for the top bar (`/search?q=`), with asking Context Bot as one option. */
export function SearchPage() {
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const { openAssistant } = useAssistant();
  const query = useQuery(searchQuery(q));
  const [type, setType] = useState<SearchType | "all">("all");
  const items = (query.data?.items ?? []).filter((item) => type === "all" || item.type === type);

  return (
    <div className="mx-auto flex max-w-240 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker="Search"
        title={q ? `Results for “${q}”` : "Search"}
        actions={
          q ? (
            <Button variant="ai-tonal" onClick={() => openAssistant(q)}>
              <SmartToyIcon aria-hidden /> Ask Context Bot
            </Button>
          ) : undefined
        }
      />
      {q.length < 2 ? (
        <p className="text-sm text-on-surface-variant">
          Type at least two characters in the search box above.
        </p>
      ) : (
        <SectionCard title="Results" count={query.data?.total} endpoint="/v1/search" status={query}>
          <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-2">
            {(["all", ...SEARCH_TYPES] as const).map((value) => (
              <Chip
                key={value}
                variant="filter"
                selected={type === value}
                onClick={() => setType(value)}
              >
                {type === value ? <CheckIcon aria-hidden /> : null}
                {value === "all" ? "All" : `${LABEL[value]} ${query.data?.facets[value] ?? 0}`}
              </Chip>
            ))}
          </div>
          {items.length ? (
            <SegmentedList aria-label="Search results">
              {items.map((item) => (
                <SegmentedItem
                  key={`${item.type}:${item.id}`}
                  render={<Link to={resultPath(item)} />}
                >
                  <SegmentedItemBody>
                    <SegmentedItemTitle>{item.title}</SegmentedItemTitle>
                    <span className="line-clamp-2 text-xs text-on-surface-variant">
                      {LABEL[item.type as SearchType] ?? item.type}
                      {item.snippet ? ` · ${item.snippet}` : ""}
                    </span>
                  </SegmentedItemBody>
                </SegmentedItem>
              ))}
            </SegmentedList>
          ) : query.data ? (
            <p className="text-sm text-on-surface-variant">
              Nothing you can open matches. Ask Context Bot, which also reads inside sources.
            </p>
          ) : null}
        </SectionCard>
      )}
    </div>
  );
}
