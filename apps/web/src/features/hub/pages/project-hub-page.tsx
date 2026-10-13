import type { ContextItemKind } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { contextItemsQuery, hubQuery } from "@/features/hub/api/hub.queries";
import { HubSection } from "@/features/hub/components/hub-section";
import { OverviewCard } from "@/features/hub/components/overview-card";
import { Timeline } from "@/features/hub/components/timeline";

const TABS = [
  { value: "timeline", label: "Timeline", kinds: ["event", "decision"] },
  { value: "decisions", label: "Decisions", kinds: ["decision"] },
  { value: "current", label: "Current state", kinds: ["status_claim"] },
  { value: "people", label: "People", kinds: ["person"] },
  { value: "system", label: "Components", kinds: ["component", "dependency"] },
  { value: "terms", label: "Terms", kinds: ["term"] },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  kinds: readonly ContextItemKind[];
}>;
type TabValue = (typeof TABS)[number]["value"];

const EMPTY_COPY: Record<TabValue, { title: string; description: string }> = {
  timeline: { title: "", description: "" },
  decisions: {
    title: "No decisions found yet",
    description: "Decisions appear when a source states what was decided (or proposed) and why.",
  },
  current: {
    title: "No status claims yet",
    description:
      "Current state comes from sources that say what is active, blocked, done or at risk.",
  },
  people: {
    title: "No people identified yet",
    description:
      "Ownership is only recorded when a source states it. Nothing is inferred from names alone.",
  },
  system: {
    title: "No components or dependencies yet",
    description:
      "Architecture facts appear when sources describe services, integrations and what depends on what.",
  },
  terms: {
    title: "No terminology yet",
    description: "Project-specific terms and their definitions are collected from the sources.",
  },
};

function isTab(value: string | null): value is TabValue {
  return TABS.some((tab) => tab.value === value);
}

export function ProjectHubPage() {
  const { projectId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TabValue = isTab(searchParams.get("tab"))
    ? (searchParams.get("tab") as TabValue)
    : "timeline";

  const hub = useQuery(hubQuery(projectId));
  const items = useQuery(contextItemsQuery(projectId));

  if (hub.isPending || items.isPending) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-10 w-96 rounded-lg" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (hub.isError || items.isError) {
    const message = hub.error?.message ?? items.error?.message ?? "Unknown error";
    return <p className="text-sm text-destructive">Could not load the hub: {message}</p>;
  }

  const allItems = items.data.items;
  const countFor = (kinds: readonly ContextItemKind[]) =>
    kinds.reduce((sum, kind) => sum + (hub.data.counts[kind] ?? 0), 0);

  return (
    <div className="space-y-8">
      <OverviewCard projectId={projectId} hub={hub.data} items={allItems} />

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ tab: String(value) }, { replace: true })}
      >
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                {countFor(t.kinds)}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="pt-4">
            {t.value === "timeline" ? (
              <Timeline projectId={projectId} items={allItems} />
            ) : (
              <HubSection
                projectId={projectId}
                items={allItems.filter((item) =>
                  (t.kinds as readonly ContextItemKind[]).includes(item.kind),
                )}
                allItems={allItems}
                emptyTitle={EMPTY_COPY[t.value].title}
                emptyDescription={EMPTY_COPY[t.value].description}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
