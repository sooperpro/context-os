import type { ContextItem, ProjectWithStats, SystemRole } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAssistant } from "@/components/layout/assistant-context";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  AddIcon,
  AppsIcon,
  CloseIcon,
  FolderOpenIcon,
  GroupsIcon,
  HubIcon,
  LockIcon,
  RocketLaunchFilledIcon,
  SearchOffIcon,
  SmartToyFilledIcon,
  type MaterialIcon,
} from "@/components/ui/icons";
import { TypeChip } from "@/components/ui/meta-chip";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { Shape } from "@/components/ui/shape";
import { SearchField } from "@/components/ui/search-field";
import { Skeleton } from "@/components/ui/skeleton";
import { contextItemsQuery } from "@/features/hub/api/hub.queries";
import { membersQuery, teamsQuery } from "@/features/members/api/members.queries";
import { KIND_ICON } from "@/features/hub/components/kind-icon";
import { CATEGORIES, categoryById, type KnowledgeCategory } from "@/features/knowledge/categories";
import { CollectionCard } from "@/features/knowledge/components/collection-card";
import { itemPath } from "@/features/hub/hub-paths";
import { savedQuery } from "@/features/knowledge/api/saved.queries";
import { projectsQuery } from "@/features/projects/api/projects.queries";
import { CreateProjectDialog } from "@/features/projects/components/create-project-dialog";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { ProjectCard } from "@/features/projects/components/project-card";
import { formatCount, formatDate } from "@/lib/format";
import { KIND_LABEL } from "@/lib/labels";

/*
 * Knowledge Hub (prototype #knowledge): everything the workspace knows, organized by what it is
 * about. Projects come from the projects API; decisions, systems, people and terms are the context
 * items of each project, which the API already filters to what the person may open.
 */

type Entry =
  | {
      type: "project";
      id: string;
      title: string;
      summary: string;
      project: ProjectWithStats;
      to: string;
    }
  | {
      type: "item";
      id: string;
      title: string;
      summary: string;
      item: ContextItem;
      project: ProjectWithStats;
      to: string;
    };

const projectPath = (project: ProjectWithStats) => `/projects/${project.id}`;

/** Who may create a project: the same roles the API allows (`POST /projects`). */
const PROJECT_CREATORS: readonly SystemRole[] = ["owner", "admin", "manager"];

export function KnowledgeHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = categoryById(searchParams.get("cat"));
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const { role } = useViewer();
  const canCreate = role !== undefined && PROJECT_CREATORS.includes(role);
  const { openAssistant } = useAssistant();
  useBotContext(
    {
      chips: [
        { icon: HubIcon, label: "Knowledge Hub" },
        { icon: LockIcon, label: "Pages you can access" },
      ],
      suggestions: [
        "What does the Platform team own?",
        "Why are we moving billing to Kafka?",
        "What is a shipment event?",
      ],
      intro: "I search every page here plus the documents and conversations behind them.",
    },
    "knowledge",
  );

  const projects = useQuery(projectsQuery());
  const projectList = projects.data?.items ?? [];
  const itemQueries = useQueries({
    queries: projectList.map((project) => contextItemsQuery(project.id)),
  });
  const itemsLoading = itemQueries.some((q) => q.isPending);
  const projectById = new Map(projectList.map((project) => [project.id, project]));
  const items = itemQueries.flatMap((q) => q.data?.items ?? []);

  const members = useQuery(membersQuery());
  const teams = useQuery(teamsQuery());

  const entriesFor = (cat: KnowledgeCategory): Entry[] =>
    cat.source === "projects"
      ? projectList
          .filter((project) => project.category === cat.projectCategory)
          .map((project) => ({
            type: "project",
            id: project.id,
            title: project.name,
            summary: project.description ?? "",
            project,
            to: projectPath(project),
          }))
      : items
          .filter((item) => cat.kinds.includes(item.kind))
          .flatMap((item) => {
            const project = projectById.get(item.projectId);
            return project
              ? [
                  {
                    type: "item" as const,
                    id: item.id,
                    title: item.title,
                    summary: item.summary,
                    item,
                    project,
                    to: itemPath(item),
                  },
                ]
              : [];
          });

  const setCategory = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("cat", id);
    else next.delete("cat");
    setSearchParams(next, { replace: true });
  };

  const needle = query.trim().toLowerCase();
  const filtering = needle.length > 0 || category !== undefined;
  const results = (category ? [category] : CATEGORIES)
    .flatMap(entriesFor)
    .filter(
      (entry) =>
        !needle ||
        `${entry.title} ${entry.summary} ${entry.project.name}`.toLowerCase().includes(needle),
    );

  const totalSources = projectList.reduce((sum, project) => sum + project.stats.sources, 0);
  const recent = [...projectList]
    .filter((project) => project.stats.lastProcessedAt)
    .sort((a, b) => (b.stats.lastProcessedAt ?? "").localeCompare(a.stats.lastProcessedAt ?? ""));
  const startHere = (recent.length > 0 ? recent : projectList).slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker={
          projects.data
            ? `${formatCount(items.length, "item")} across ${formatCount(projectList.length, "project")} · ${formatCount(totalSources, "source")}`
            : undefined
        }
        title="Knowledge Hub"
        description="Everything your company knows, organized by what it's about. You only see what you have access to."
        actions={
          <>
            {canCreate ? (
              <Button variant="outline" onClick={() => setCreateOpen(true)}>
                <AddIcon aria-hidden />
                New project
              </Button>
            ) : null}
            <Button variant="ai-tonal" onClick={() => openAssistant()}>
              <SmartToyFilledIcon aria-hidden />
              Ask Context Bot
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <SearchField
          label="Search the Knowledge Hub"
          value={query}
          onValueChange={setQuery}
          placeholder="Search projects, decisions, systems, people and terms"
          tone="field"
          className="max-w-180"
        />
        <div
          role="group"
          aria-label="Filter by type"
          className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-0.5 @2xl:mx-0 @2xl:flex-wrap @2xl:px-0"
        >
          <Chip variant="filter" selected={!category} onClick={() => setCategory(null)}>
            <AppsIcon /> All
          </Chip>
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <Chip
                key={cat.id}
                variant="filter"
                selected={category?.id === cat.id}
                onClick={() => setCategory(cat.id)}
              >
                <Icon /> {cat.name}
              </Chip>
            );
          })}
        </div>
      </div>

      {projects.isPending ? (
        <div className="grid gap-3 @2xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-55 rounded-card" />
          ))}
        </div>
      ) : projects.isError ? (
        <Empty className="rounded-card bg-card py-12">
          <EmptyHeader>
            <EmptyTitle>Could not load the Knowledge Hub</EmptyTitle>
            <EmptyDescription>{projects.error.message}</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={() => void projects.refetch()}>
            Try again
          </Button>
        </Empty>
      ) : projectList.length === 0 ? (
        <Empty className="rounded-card bg-card py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpenIcon />
            </EmptyMedia>
            <EmptyTitle>No knowledge yet</EmptyTitle>
            <EmptyDescription>
              {canCreate
                ? "Create a project, then add the documents, threads and tickets that describe it. "
                : "An admin or manager can create a project and add the documents, threads and tickets that describe it. "}
              Decisions, systems, people and terms appear here as they are extracted.
            </EmptyDescription>
          </EmptyHeader>
          {canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <AddIcon aria-hidden />
              Create your first project
            </Button>
          ) : null}
        </Empty>
      ) : filtering ? (
        <ResultsView
          entries={results}
          query={query.trim()}
          category={category}
          loading={itemsLoading && category?.source !== "projects"}
          onClear={() => {
            setQuery("");
            setCategory(null);
          }}
          onAsk={() => openAssistant(query.trim())}
        />
      ) : (
        <div className="grid gap-4 @4xl:grid-cols-[minmax(0,2fr)_minmax(17.5rem,1fr)] @4xl:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            <section aria-labelledby="kb-start">
              <h2
                id="kb-start"
                className="mb-3 flex flex-wrap items-baseline gap-x-2.5 font-heading text-xl font-medium"
              >
                Start here
                <span className="text-sm font-normal text-on-surface-variant">
                  The most recently updated projects
                </span>
              </h2>
              <div className="grid gap-3 @2xl:grid-cols-3">
                {startHere.map((project, index) => (
                  <ProjectCard key={project.id} project={project} index={index} />
                ))}
              </div>
            </section>
            <section aria-labelledby="kb-browse">
              <h2 id="kb-browse" className="mb-3 font-heading text-xl font-medium">
                Browse
              </h2>
              <div className="grid gap-3 @2xl:grid-cols-2">
                {CATEGORIES.map((cat) => {
                  const entries = entriesFor(cat);
                  return (
                    <CollectionCard
                      key={cat.id}
                      name={cat.name}
                      description={cat.description}
                      icon={cat.icon}
                      shape={cat.shape}
                      count={entries.length}
                      entries={entries
                        .slice(0, 3)
                        .map((entry) => ({ id: entry.id, label: entry.title, to: entry.to }))}
                      to={`/knowledge?cat=${cat.id}`}
                      emptyNote={cat.emptyNote}
                    />
                  );
                })}
                {/* The prototype's last Browse card opens People rather than filtering the hub. */}
                {members.data ? (
                  <CollectionCard
                    name="Teams & people"
                    description="Who owns what, and who to ask"
                    icon={GroupsIcon}
                    shape="cookie12"
                    count={members.data.length}
                    entries={(teams.data && teams.data.length > 0
                      ? teams.data.map((team) => ({ id: team.id, label: team.name }))
                      : members.data.map((member) => ({ id: member.id, label: member.name }))
                    )
                      .slice(0, 3)
                      .map((entry) => ({ ...entry, to: "/people?view=teams" }))}
                    to="/people?view=teams"
                    emptyNote="No teams yet."
                  />
                ) : null}
              </div>
            </section>
          </div>
          <aside className="flex min-w-0 flex-col gap-4">
            <SavedCard items={items} projects={projectList} />
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recently updated</CardTitle>
              </CardHeader>
              <CardContent>
                {recent.length === 0 ? (
                  <p className="text-xs text-on-surface-variant">Nothing processed yet.</p>
                ) : (
                  <SegmentedList>
                    {recent.slice(0, 5).map((project) => (
                      <SegmentedItem
                        key={project.id}
                        render={<Link to={projectPath(project)} />}
                        className="min-h-0 gap-3 py-2.5"
                      >
                        <SegmentedItemLead className="size-9 bg-ai-container text-on-ai-container [&_svg]:size-4">
                          <RocketLaunchFilledIcon />
                        </SegmentedItemLead>
                        <SegmentedItemBody>
                          <SegmentedItemTitle>{project.name}</SegmentedItemTitle>
                          <SegmentedItemMeta>
                            {formatCount(project.stats.sources, "source")} · Updated{" "}
                            {formatDate(project.stats.lastProcessedAt ?? project.updatedAt)}
                          </SegmentedItemMeta>
                        </SegmentedItemBody>
                      </SegmentedItem>
                    ))}
                  </SegmentedList>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      )}

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        // Creating from inside a project collection files the new project there.
        defaultCategory={category?.source === "projects" ? category.projectCategory : undefined}
      />
    </div>
  );
}

interface ResultsViewProps {
  entries: Entry[];
  query: string;
  category: KnowledgeCategory | undefined;
  loading: boolean;
  onClear: () => void;
  onAsk: () => void;
}

/** The prototype's results view: a count line with Clear, then result rows; an honest empty state. */
function ResultsView({ entries, query, category, loading, onClear, onAsk }: ResultsViewProps) {
  if (entries.length === 0 && !loading) {
    return (
      <Card className="flex-row flex-wrap items-center gap-4 px-6">
        <span aria-hidden className="relative grid size-14 shrink-0 place-items-center">
          <Shape
            kind="cookie6"
            className="col-start-1 row-start-1 size-14 text-surface-container-highest"
          />
          <SearchOffIcon className="relative z-10 col-start-1 row-start-1 size-6 text-on-surface-variant" />
        </span>
        <div className="min-w-60 flex-1">
          <p className="font-medium">
            {query
              ? `Nothing in the Knowledge Hub matches "${query}"`
              : (category?.emptyNote ?? "Nothing here yet.")}
          </p>
          <p className="text-sm text-on-surface-variant">
            Context Bot can search a project's documents and conversations too.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {query ? (
            <Button variant="ai-tonal" onClick={onAsk}>
              <SmartToyFilledIcon aria-hidden />
              Ask Context Bot
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClear}>
            Clear
          </Button>
        </div>
      </Card>
    );
  }

  const label = query
    ? `${formatCount(entries.length, "result")} for "${query}"${category ? ` in ${category.name}` : ""}`
    : `${category?.name ?? "All"} · ${entries.length}`;

  return (
    <Card aria-live="polite">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{label}</CardTitle>
          <Button variant="ghost" size="xs" onClick={onClear}>
            <CloseIcon aria-hidden />
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && entries.length === 0 ? (
          <Skeleton className="h-18 rounded-xl" />
        ) : (
          <SegmentedList>
            {entries.map((entry) => {
              const Icon =
                entry.type === "project" ? RocketLaunchFilledIcon : KIND_ICON[entry.item.kind];
              const typeLabel = entry.type === "project" ? "Project" : KIND_LABEL[entry.item.kind];
              return (
                <SegmentedItem
                  key={`${entry.type}-${entry.id}`}
                  render={<Link to={entry.to} />}
                  className="items-start"
                >
                  <SegmentedItemLead className="mt-0.5">
                    <Icon />
                  </SegmentedItemLead>
                  <SegmentedItemBody>
                    <span className="flex flex-wrap items-center gap-2">
                      <TypeChip>{typeLabel}</TypeChip>
                      <SegmentedItemTitle>{entry.title}</SegmentedItemTitle>
                    </span>
                    {entry.summary ? (
                      <span className="line-clamp-2 text-xs text-on-surface-variant">
                        {entry.summary}
                      </span>
                    ) : null}
                    {entry.type === "item" ? (
                      <SegmentedItemMeta>{entry.project.name}</SegmentedItemMeta>
                    ) : null}
                  </SegmentedItemBody>
                </SegmentedItem>
              );
            })}
          </SegmentedList>
        )}
      </CardContent>
    </Card>
  );
}

/** What the person saved (prototype "Saved"), resolved against the items and projects already loaded. */
function SavedCard({ items, projects }: { items: ContextItem[]; projects: ProjectWithStats[] }) {
  const saved = useQuery(savedQuery());
  const entries = (saved.data?.items ?? []).flatMap(
    (entry): Array<{ id: string; title: string; meta: string; to: string; Icon: MaterialIcon }> => {
      if (entry.targetType === "project") {
        const project = projects.find((candidate) => candidate.id === entry.targetId);
        return project
          ? [
              {
                id: project.id,
                title: project.name,
                meta: "Project",
                to: projectPath(project),
                Icon: RocketLaunchFilledIcon,
              },
            ]
          : [];
      }
      const item = items.find((candidate) => candidate.id === entry.targetId);
      return item
        ? [
            {
              id: item.id,
              title: item.title,
              meta: `${KIND_LABEL[item.kind]} · Updated ${formatDate(item.updatedAt)}`,
              to: itemPath(item),
              Icon: KIND_ICON[item.kind],
            },
          ]
        : [];
    },
  );
  if (!entries.length) return null;
  return (
    <Card role="region" aria-labelledby="kb-saved">
      <CardHeader>
        <CardTitle id="kb-saved" className="text-base">
          Saved{" "}
          <span className="text-sm font-normal text-on-surface-variant tabular-nums">
            {entries.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <SegmentedList>
          {entries.map((entry) => (
            <SegmentedItem
              key={entry.id}
              render={<Link to={entry.to} />}
              className="min-h-0 gap-3 py-2.5"
            >
              <SegmentedItemLead className="size-9 [&_svg]:size-4">
                <entry.Icon />
              </SegmentedItemLead>
              <SegmentedItemBody>
                <SegmentedItemTitle>{entry.title}</SegmentedItemTitle>
                <SegmentedItemMeta>{entry.meta}</SegmentedItemMeta>
              </SegmentedItemBody>
            </SegmentedItem>
          ))}
        </SegmentedList>
      </CardContent>
    </Card>
  );
}
