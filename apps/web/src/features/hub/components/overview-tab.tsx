import type { ContextItem, ContextItemKind, Hub } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { useAssistant } from "@/components/layout/assistant-context";
import { BotGlyph } from "@/components/ui/bot-glyph";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import {
  HelpIcon,
  NorthEastIcon,
  OpenInNewIcon,
  RocketLaunchIcon,
  ShieldIcon,
  SyncProblemIcon,
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
import { StatusChip } from "@/components/ui/status-chip";
import { StateBadge } from "@/features/hub/components/badges";
import { KIND_ICON, SOURCE_KIND_ICON } from "@/features/hub/components/kind-icon";
import { OverviewCard } from "@/features/hub/components/overview-card";
import { sourcesQuery } from "@/features/sources/api/sources.queries";
import { formatCount, formatDate } from "@/lib/format";
import { SOURCE_KIND_LABEL } from "@/lib/labels";
import { itemPath } from "@/features/hub/hub-paths";
import { RelationshipMap } from "@/features/hub/components/relationship-map";

/*
 * The prototype's project overview: "How it connects" (what the sources establish, by kind),
 * the cited overview, risks and open questions, and an aside with Ask prompts and the sources.
 * Everything here is derived from context items and sources; nothing is invented.
 */

const GROUPS: Array<{
  label: string;
  kinds: ContextItemKind[];
  tab: string;
  icon: ContextItemKind;
}> = [
  { label: "Systems", kinds: ["component", "dependency"], tab: "system", icon: "component" },
  { label: "Decisions", kinds: ["decision"], tab: "decisions", icon: "decision" },
  { label: "People", kinds: ["person"], tab: "people", icon: "person" },
  { label: "Terms", kinds: ["term"], tab: "terms", icon: "term" },
];

const PROMPTS = (name: string) => [
  `Why does ${name} exist, and what problem does it solve?`,
  "What was decided most recently, and why?",
  "What is blocked or at risk right now?",
];

function subtitle(item: ContextItem): string {
  switch (item.kind) {
    case "person":
      return item.data.role ?? item.summary;
    case "dependency":
      return `${item.data.from} ${item.data.relation.replace("_", " ")} ${item.data.to}`;
    case "decision":
      return item.data.decisionStatus;
    default:
      return item.summary;
  }
}

export function OverviewTab({
  projectId,
  hub,
  items,
}: {
  projectId: string;
  hub: Hub;
  items: ContextItem[];
}) {
  const { openAssistant } = useAssistant();
  const sources = useQuery(sourcesQuery(projectId));
  const base = `/projects/${projectId}`;

  const groups = GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => group.kinds.includes(item.kind)),
  })).filter((group) => group.items.length > 0);
  const risks = items.filter(
    (item): item is Extract<ContextItem, { kind: "status_claim" }> =>
      item.kind === "status_claim" &&
      ["risk", "blocked", "open_question"].includes(item.data.state),
  );
  const gaps = hub.overview?.keyUnknowns ?? [];
  const sourceItems = sources.data?.items ?? [];

  return (
    <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_20rem] @3xl:items-start">
      <div className="space-y-4">
        {groups.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>How it connects</CardTitle>
              <CardDescription>
                What the sources establish about this project. Select any item to open it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RelationshipMap
                center={{
                  title: hub.project.name,
                  subtitle: formatCount(items.length, "item"),
                  icon: RocketLaunchIcon,
                }}
                groups={groups.map((group) => ({
                  label: `${group.label} · ${group.items.length}`,
                  icon: KIND_ICON[group.icon],
                  items: group.items
                    .slice(0, 4)
                    .map((item) => ({
                      id: item.id,
                      title: item.title,
                      subtitle: subtitle(item),
                      to: itemPath(item),
                    })),
                  more: { count: group.items.length - 4, to: `${base}?tab=${group.tab}` },
                }))}
              />
            </CardContent>
          </Card>
        ) : null}

        <OverviewCard projectId={projectId} hub={hub} items={items} />

        {risks.length > 0 || gaps.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Risks and open questions</CardTitle>
              <CardDescription>
                Status claims the sources mark as blocked, at risk or open, and what the sources do
                not establish.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SegmentedList>
                {risks.map((item) => (
                  <SegmentedItem key={item.id}>
                    <SegmentedItemLead
                      className={
                        item.data.state === "blocked"
                          ? "bg-error-container text-on-error-container"
                          : "bg-warning-container text-on-warning-container"
                      }
                    >
                      <ShieldIcon />
                    </SegmentedItemLead>
                    <SegmentedItemBody>
                      <SegmentedItemTitle>{item.title}</SegmentedItemTitle>
                      <SegmentedItemMeta>{item.summary}</SegmentedItemMeta>
                    </SegmentedItemBody>
                    <SegmentedItemTrail>
                      <StateBadge state={item.data.state} />
                    </SegmentedItemTrail>
                  </SegmentedItem>
                ))}
                {gaps.map((gap) => (
                  <SegmentedItem key={gap}>
                    <SegmentedItemLead className="bg-error-container text-on-error-container">
                      <HelpIcon />
                    </SegmentedItemLead>
                    <SegmentedItemBody>
                      <SegmentedItemTitle>{gap}</SegmentedItemTitle>
                      <SegmentedItemMeta>Not established by the sources</SegmentedItemMeta>
                    </SegmentedItemBody>
                    <SegmentedItemTrail>
                      <StatusChip tone="error" icon={<HelpIcon />}>
                        Knowledge gap
                      </StatusChip>
                      <Button size="xs" variant="secondary" onClick={() => openAssistant(gap)}>
                        Ask
                      </Button>
                    </SegmentedItemTrail>
                  </SegmentedItem>
                ))}
              </SegmentedList>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <BotGlyph size="sm" />
              Ask about this project
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {PROMPTS(hub.project.name).map((prompt) => (
              <Chip
                key={prompt}
                variant="prompt"
                className="w-full"
                onClick={() => openAssistant(prompt)}
              >
                <NorthEastIcon />
                {prompt}
              </Chip>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>
                Sources{" "}
                <span className="text-sm font-normal text-on-surface-variant tabular-nums">
                  {sourceItems.length}
                </span>
              </CardTitle>
              <Button
                variant="ghost"
                size="xs"
                nativeButton={false}
                render={<Link to={`${base}/sources`} />}
              >
                All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {sourceItems.length === 0 ? (
              <p className="text-xs text-on-surface-variant">
                {sources.isPending
                  ? "Loading sources…"
                  : "No sources yet. Add the documents a new joiner would be handed."}
              </p>
            ) : (
              <ul className="space-y-3">
                {sourceItems.slice(0, 4).map((source) => {
                  const Icon = SOURCE_KIND_ICON[source.kind];
                  return (
                    <li key={source.id} className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-container-highest text-on-surface-variant [&_svg]:size-5"
                      >
                        <Icon />
                      </span>
                      <div className="min-w-0 flex-1 text-xs text-on-surface-variant">
                        <p className="truncate text-sm font-medium text-on-surface">
                          {source.title}
                        </p>
                        <p className="truncate">
                          {SOURCE_KIND_LABEL[source.kind]}
                          {source.author ? ` · ${source.author}` : ""}
                        </p>
                        {source.sourceUpdatedAt ? (
                          <p>Updated {formatDate(source.sourceUpdatedAt)}</p>
                        ) : null}
                        {source.status === "failed" ? (
                          <p className="flex items-center gap-1 text-error [&_svg]:size-3.5">
                            <SyncProblemIcon aria-hidden /> Processing failed
                          </p>
                        ) : null}
                      </div>
                      {source.url ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          nativeButton={false}
                          aria-label={`Open ${source.title} in its source`}
                          render={<a href={source.url} target="_blank" rel="noopener noreferrer" />}
                        >
                          <OpenInNewIcon />
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {sourceItems.length > 4 ? (
              <p className="mt-2 text-xs text-on-surface-variant">
                {formatCount(sourceItems.length - 4, "more source")} on the Sources page.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
