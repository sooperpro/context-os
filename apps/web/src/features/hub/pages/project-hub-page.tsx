import type { ContextItemKind } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { contextItemsQuery, hubQuery } from "@/features/hub/api/hub.queries";
import { HubSection } from "@/features/hub/components/hub-section";
import { OverviewTab } from "@/features/hub/components/overview-tab";
import { Timeline } from "@/features/hub/components/timeline";

/** Sections other than the overview: which item kinds they list and their honest empty copy. */
const SECTIONS: Record<string, { kinds: ContextItemKind[]; title: string; description: string }> = {
  decisions: {
    kinds: ["decision"],
    title: "No decisions found yet",
    description: "Decisions appear when a source states what was decided (or proposed) and why.",
  },
  current: {
    kinds: ["status_claim"],
    title: "No status claims yet",
    description: "Current state comes from sources that say what is active, blocked, done or at risk.",
  },
  people: {
    kinds: ["person"],
    title: "No people identified yet",
    description: "Ownership is only recorded when a source states it. Nothing is inferred from names alone.",
  },
  system: {
    kinds: ["component", "dependency"],
    title: "No components or dependencies yet",
    description: "Architecture facts appear when sources describe services, integrations and what depends on what.",
  },
  terms: {
    kinds: ["term"],
    title: "No terminology yet",
    description: "Project-specific terms and their definitions are collected from the sources.",
  },
};

export function ProjectHubPage() {
  const { projectId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab") ?? "overview";

  const hub = useQuery(hubQuery(projectId));
  const items = useQuery(contextItemsQuery(projectId));

  if (hub.isPending || items.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (hub.isError || items.isError) {
    const message = hub.error?.message ?? items.error?.message ?? "Unknown error";
    return <p className="text-sm text-error">Could not load the hub: {message}</p>;
  }

  const allItems = items.data.items;
  if (tab === "timeline") return <Timeline projectId={projectId} items={allItems} />;
  const section = SECTIONS[tab];
  if (section) {
    return (
      <HubSection
        projectId={projectId}
        items={allItems.filter((item) => section.kinds.includes(item.kind))}
        allItems={allItems}
        emptyTitle={section.title}
        emptyDescription={section.description}
      />
    );
  }
  return <OverviewTab projectId={projectId} hub={hub.data} items={allItems} />;
}
