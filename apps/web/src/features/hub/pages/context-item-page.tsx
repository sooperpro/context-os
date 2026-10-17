import type { ContextItem, Hub } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { AskCard } from "@/components/ask-card";
import { useAssistant } from "@/components/layout/assistant-context";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { SectionCard } from "@/components/section-card";
import { PersonAvatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  BookmarkIcon,
  ChatIcon,
  DifferenceIcon,
  FolderIcon,
  HistoryIcon,
  LinkIcon,
  OpenInNewIcon,
  SmartToyIcon,
  UpdateIcon,
} from "@/components/ui/icons";
import { Loader } from "@/components/ui/loader";
import { MetaChip, TypeChip } from "@/components/ui/meta-chip";
import { FeedbackButtons } from "@/features/feedback/components/feedback-buttons";
import { contextItemsQuery, hubQuery } from "@/features/hub/api/hub.queries";
import { ConfidenceBadge, VerificationBadge } from "@/features/hub/components/badges";
import { EvidenceList } from "@/features/hub/components/evidence-list";
import { ItemDetails, KindBadge, VerificationControls } from "@/features/hub/components/item-parts";
import { KIND_ICON } from "@/features/hub/components/kind-icon";
import { itemPath, projectPath } from "@/features/hub/hub-paths";
import { categoryForKind } from "@/features/knowledge/categories";
import { savedQuery, useSetSaved } from "@/features/knowledge/api/saved.queries";
import { SourceDrawerProvider } from "@/features/sources/components/source-drawer";
import { comingSoon } from "@/lib/coming-soon";
import { formatDate } from "@/lib/format";
import {
  CONFIDENCE_LABEL,
  DECISION_STATUS_LABEL,
  KIND_LABEL,
  STATE_LABEL,
  VERIFICATION_LABEL,
} from "@/lib/labels";

/**
 * One knowledge item (prototype `#kb-<id>`): what it says, the facts behind it, where it comes from,
 * who knows about it and what it connects to. Items are extracted from a project's sources; this
 * page reads them from the live context-items list.
 */
export function ContextItemPage() {
  const { projectId = "", itemId = "" } = useParams();
  const hub = useQuery(hubQuery(projectId));
  const items = useQuery(contextItemsQuery(projectId));

  if (hub.isPending || items.isPending) {
    return (
      <div className="grid min-h-80 place-items-center">
        <Loader label="Loading this item" />
      </div>
    );
  }
  const item = items.data?.items.find((entry) => entry.id === itemId);
  if (hub.isError || items.isError || !item || !hub.data) {
    return (
      <div className="mx-auto flex max-w-360 flex-col items-start gap-3">
        <h1 className="font-heading text-2xl font-semibold">
          {items.isError || hub.isError ? "Could not load this item" : "Item not found"}
        </h1>
        <p className="text-sm text-on-surface-variant">
          It may have been removed when its sources changed, or you may not have access.
        </p>
        <Button variant="outline" nativeButton={false} render={<Link to="/knowledge" />}>
          Back to the Knowledge Hub
        </Button>
      </div>
    );
  }
  return (
    <SourceDrawerProvider projectId={projectId}>
      <ItemView item={item} hub={hub.data} all={items.data?.items ?? []} />
    </SourceDrawerProvider>
  );
}

/** Items that share a source with this one, conflict with it, or name it: the prototype's "Connected knowledge". */
function connected(
  item: ContextItem,
  all: ContextItem[],
): Array<{ item: ContextItem; why: string }> {
  const sources = new Set(item.evidence.map((entry) => entry.sourceObjectId));
  const title = item.title.toLowerCase();
  const seen = new Set([item.id]);
  const out: Array<{ item: ContextItem; why: string }> = [];
  const add = (entry: ContextItem, why: string) => {
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    out.push({ item: entry, why });
  };
  for (const entry of all)
    if (item.conflictsWith.includes(entry.id)) add(entry, "Conflicts with this");
  for (const entry of all) {
    if (
      entry.kind === "dependency" &&
      [entry.data.from, entry.data.to].some((name) => name.toLowerCase() === title)
    )
      add(entry, "Dependency");
    if (
      item.kind === "dependency" &&
      [item.data.from, item.data.to].some(
        (name) => name.toLowerCase() === entry.title.toLowerCase(),
      )
    )
      add(entry, "Named here");
  }
  for (const entry of all)
    if (
      entry.kind !== "person" &&
      entry.evidence.some((evidence) => sources.has(evidence.sourceObjectId))
    )
      add(entry, "Same source");
  return out.slice(0, 6);
}

/** People the sources tie to it: owners of it, and the people in a decision. */
function experts(
  item: ContextItem,
  all: ContextItem[],
): Array<{ name: string; role: string | null }> {
  const title = item.title.toLowerCase();
  const people = all.filter(
    (entry): entry is Extract<ContextItem, { kind: "person" }> => entry.kind === "person",
  );
  const owners = people
    .filter((person) =>
      person.data.owns.some(
        (area) => area.toLowerCase().includes(title) || title.includes(area.toLowerCase()),
      ),
    )
    .map((person) => ({ name: person.title, role: person.data.role }));
  const participants =
    item.kind === "decision"
      ? item.data.participants.map((name) => ({
          name,
          role:
            people.find((person) => person.title === name)?.data.role ??
            "Took part in the decision",
        }))
      : [];
  return [...owners, ...participants].filter(
    (entry, index, list) => list.findIndex((other) => other.name === entry.name) === index,
  );
}

function facts(item: ContextItem, hub: Hub): Array<[string, string]> {
  const common: Array<[string, string]> = [
    ["Project", hub.project.name],
    ["Verification", VERIFICATION_LABEL[item.verification]],
    ["Confidence", CONFIDENCE_LABEL[item.confidence]],
  ];
  switch (item.kind) {
    case "decision":
      return [
        ["Status", DECISION_STATUS_LABEL[item.data.decisionStatus]],
        ...(item.eventAt ? ([["Date", formatDate(item.eventAt)]] as Array<[string, string]>) : []),
        ...(item.data.participants.length
          ? ([["Deciders", item.data.participants.join(", ")]] as Array<[string, string]>)
          : []),
        ...common,
      ];
    case "status_claim":
      return [
        ["State", STATE_LABEL[item.data.state]],
        ...(item.asOf ? ([["As of", formatDate(item.asOf)]] as Array<[string, string]>) : []),
        ...common,
      ];
    case "event":
      return [
        ["Category", item.data.category.replace(/^\w/, (letter) => letter.toUpperCase())],
        ...(item.eventAt ? ([["Date", formatDate(item.eventAt)]] as Array<[string, string]>) : []),
        ...common,
      ];
    case "component":
      return [
        ["Type", item.data.componentType.replace(/^\w/, (letter) => letter.toUpperCase())],
        ...common,
      ];
    case "dependency":
      return [
        ["From", item.data.from],
        ["Relation", item.data.relation.replace("_", " ")],
        ["To", item.data.to],
        ...common,
      ];
    case "person":
      return [
        ...(item.data.role ? ([["Role", item.data.role]] as Array<[string, string]>) : []),
        ...common,
      ];
    case "term":
    case "company":
    case "product":
    case "initiative":
    case "process":
      return common;
  }
}

function ItemView({ item, hub, all }: { item: ContextItem; hub: Hub; all: ContextItem[] }) {
  const { openAssistant } = useAssistant();
  const saved = useQuery(savedQuery());
  const setSaved = useSetSaved();
  const KindIcon = KIND_ICON[item.kind];
  const category = categoryForKind(item.kind);
  const isSaved = saved.data?.items.some((entry) => entry.targetId === item.id) ?? false;
  const sourceCount = new Set(item.evidence.map((entry) => entry.sourceObjectId)).size;
  const firstSource = item.evidence.find((entry) => entry.sourceUrl);
  const related = connected(item, all);
  const people = experts(item, all);
  const date = item.eventAt ?? item.asOf;

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/knowledge" />}>Knowledge Hub</BreadcrumbLink>
          </BreadcrumbItem>
          {category ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link to={`/knowledge?cat=${category.id}`} />}>
                  {category.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          ) : null}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{item.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col items-start gap-4 px-1 pt-2 @min-[640px]:flex-row @min-[640px]:gap-6">
        <span
          aria-hidden
          className="grid size-16 shrink-0 place-items-center rounded-2xl bg-secondary-container text-on-secondary-container [&_svg]:size-8"
        >
          <KindIcon />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <TypeChip>
              <KindIcon aria-hidden /> {KIND_LABEL[item.kind]}
            </TypeChip>
            <KindBadge item={item} />
            <VerificationBadge verification={item.verification} />
            <ConfidenceBadge confidence={item.confidence} />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-semibold tracking-tight medium:text-[32px] medium:leading-10">
            {item.title}
          </h1>
          <p className="max-w-[72ch] text-base">{item.summary}</p>
          <span className="flex flex-wrap gap-1.5">
            <Link
              to={projectPath(item.projectId)}
              className="no-underline hover:[&>span]:bg-on-surface/12"
            >
              <MetaChip tone="filled">
                <FolderIcon aria-hidden /> {hub.project.name}
              </MetaChip>
            </Link>
            {date ? (
              <MetaChip tone="filled">
                <HistoryIcon aria-hidden /> {item.kind === "status_claim" ? "As of" : "On"}{" "}
                {formatDate(date)}
              </MetaChip>
            ) : null}
            <MetaChip tone="filled">
              <UpdateIcon aria-hidden /> Updated {formatDate(item.updatedAt)}
            </MetaChip>
            <MetaChip tone="filled">
              <LinkIcon aria-hidden /> {sourceCount === 1 ? "1 source" : `${sourceCount} sources`}
            </MetaChip>
          </span>
          <div className="mt-1 flex flex-wrap gap-3">
            <Button
              variant={isSaved ? "secondary" : "outline"}
              aria-pressed={isSaved}
              disabled={setSaved.isPending || saved.isPending}
              onClick={() =>
                setSaved.mutate(
                  {
                    targetId: item.id,
                    targetType: "context_item",
                    projectId: item.projectId,
                    saved: !isSaved,
                  },
                  {
                    onSuccess: () =>
                      toast.success(
                        isSaved ? `Removed “${item.title}” from Saved` : `Saved “${item.title}”`,
                      ),
                    onError: () => toast.error("Could not update Saved. Please try again."),
                  },
                )
              }
            >
              <BookmarkIcon aria-hidden /> {isSaved ? "Saved" : "Save"}
            </Button>
            <Button variant="ai-tonal" onClick={() => openAssistant(`Summarize “${item.title}”`)}>
              <SmartToyIcon aria-hidden /> Ask about this
            </Button>
            {firstSource?.sourceUrl ? (
              <Button
                variant="ghost"
                nativeButton={false}
                render={
                  <a href={firstSource.sourceUrl} target="_blank" rel="noopener noreferrer" />
                }
              >
                <OpenInNewIcon aria-hidden /> Open {firstSource.sourceTitle}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      {item.verification === "stale" ? (
        <Banner
          tone="neutral"
          icon={<HistoryIcon aria-hidden />}
          title="This may be out of date"
          description="Someone marked it stale. Check the sources below, then confirm it or dispute it."
        />
      ) : item.verification === "disputed" || item.conflictsWith.length ? (
        <Banner
          tone="warning"
          icon={<DifferenceIcon aria-hidden />}
          title="Sources disagree about this"
          description="Another claim about the same subject says something different. Check the dates and evidence before relying on either."
        />
      ) : null}

      <PageColumns>
        <PageMain>
          <SectionCard title="Overview">
            <p className="text-base">
              {item.kind === "term" ? item.data.definition : item.summary}
            </p>
            <ItemDetails item={item} />
          </SectionCard>
          <SectionCard title="Key facts">
            <dl className="grid gap-x-6 gap-y-3 @min-[520px]:grid-cols-2">
              {facts(item, hub).map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5 rounded-md bg-pane px-3.5 py-2.5">
                  <dt className="text-xs text-on-surface-variant">{label}</dt>
                  <dd className="text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>
          <SectionCard title="Where this comes from" count={item.evidence.length || undefined}>
            <EvidenceList evidence={item.evidence} />
          </SectionCard>
          {related.length ? (
            <SectionCard title="Connected knowledge">
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                {related.map(({ item: entry, why }) => {
                  const Icon = KIND_ICON[entry.kind];
                  return (
                    <li key={entry.id} className="flex">
                      <Link
                        to={itemPath(entry)}
                        className="flex w-full flex-col items-start gap-1.5 rounded-xl bg-pane p-3.5 text-on-surface no-underline transition-colors outline-none hover:bg-on-surface/8 focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <TypeChip>
                          <Icon aria-hidden /> {KIND_LABEL[entry.kind]}
                        </TypeChip>
                        <b className="text-sm font-medium">{entry.title}</b>
                        <span className="text-xs text-on-surface-variant">
                          {why} · Updated {formatDate(entry.updatedAt)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          ) : null}
        </PageMain>
        <PageSide>
          {people.length ? (
            <SectionCard title="Owners & experts">
              <ul className="flex flex-col gap-3">
                {people.map((person) => (
                  <li key={person.name} className="flex items-center gap-3">
                    <PersonAvatar person={{ name: person.name }} size="md" />
                    <Link
                      to={`/people?q=${encodeURIComponent(person.name)}`}
                      className="flex min-w-0 flex-1 flex-col text-on-surface no-underline hover:[&_b]:underline"
                    >
                      <b className="text-sm font-medium">{person.name}</b>
                      {person.role ? (
                        <span className="text-xs text-on-surface-variant">{person.role}</span>
                      ) : null}
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Message ${person.name}`}
                      onClick={() => comingSoon("Messages")}
                    >
                      <ChatIcon aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
          <SectionCard title="Is this right?">
            <p className="text-xs text-on-surface-variant">
              Confirm what you know is true, or flag it so its owner checks the sources.
            </p>
            <VerificationControls projectId={item.projectId} item={item} />
            <FeedbackButtons
              projectId={item.projectId}
              targetType="context_item"
              targetId={item.id}
            />
          </SectionCard>
          <AskCard
            title="Ask about this page"
            prompts={[`Summarize “${item.title}”`, `Who owns “${item.title}”?`]}
          />
        </PageSide>
      </PageColumns>
    </div>
  );
}
