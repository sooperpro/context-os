import type { LessonState, TutorialSummary, TutorialUsage } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ConnectedButton, ConnectedButtonGroup } from "@/components/ui/connected-button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DotList } from "@/components/ui/dot-list";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  AddIcon,
  CheckCircleFilledIcon,
  ChevronRightIcon,
  DescriptionIcon,
  KeyboardArrowDownIcon,
  RateReviewIcon,
  SchoolIcon,
  SmartToyIcon,
  UndoIcon,
  WarningIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetaChip } from "@/components/ui/meta-chip";
import { SearchField } from "@/components/ui/search-field";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedItemTrail,
  SegmentedList,
} from "@/components/ui/segmented-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";
import { templatePath, weeksLabel } from "@/features/people-ops/people-ops-meta";
import { projectsQuery } from "@/features/projects/api/projects.queries";
import { TUTORIAL_ENDPOINTS } from "@/features/tutorials/api/tutorials.api";
import { tutorialsQuery, useCreateTutorial } from "@/features/tutorials/api/tutorials.queries";
import {
  COMPANY_WIDE,
  LESSON_STATE,
  tutorialFromTemplate,
  tutorialPath,
} from "@/features/tutorials/tutorials-meta";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatCount, formatRelativeTime } from "@/lib/format";

/** The status filter: everything (archived aside), what needs attention, or one state. */
type StatusFilter = "all" | "attention" | LessonState;
/** The template filter: every template, one of them, or tutorials no template uses. */
const ALL = "all";
const NO_TEMPLATE = "none";

/** Most urgent first, for the flat list and the attention summary. */
const STATE_ORDER: LessonState[] = [
  "failed",
  "update_ready",
  "sources_changed",
  "unpublished_edits",
  "in_review",
  "sent_back",
  "draft",
  "writing",
  "published",
  "archived",
];

/** "6 updates ready to review": the attention summary's chips. */
const ATTENTION_LABEL: Partial<Record<LessonState, (count: number) => string>> = {
  failed: (count) => formatCount(count, "failed draft"),
  update_ready: (count) => `${formatCount(count, "update")} ready to review`,
  sources_changed: (count) => `${count} with changed sources`,
  unpublished_edits: (count) => `${count} with edits not published`,
  in_review: (count) => `${count} in review`,
  sent_back: (count) => `${count} sent back`,
  draft: (count) => formatCount(count, "draft"),
};

const STATE_ICON: Record<LessonState, React.ReactNode> = {
  writing: <SmartToyIcon />,
  failed: <WarningIcon />,
  draft: <DescriptionIcon />,
  in_review: <RateReviewIcon />,
  sent_back: <UndoIcon />,
  update_ready: <WarningIcon />,
  unpublished_edits: <WarningIcon />,
  sources_changed: <WarningIcon />,
  published: <CheckCircleFilledIcon />,
  archived: <DescriptionIcon />,
};

interface TemplateGroup {
  id: string;
  name: string;
  published: boolean;
  /** Its tutorials in stage order, each with where it sits in this template. */
  entries: Array<{ tutorial: TutorialSummary; usage: TutorialUsage }>;
}

/** Templates that use the shown tutorials, published ones first, each in stage order. */
function groupByTemplate(items: TutorialSummary[]): TemplateGroup[] {
  const groups = new Map<string, TemplateGroup>();
  for (const tutorial of items)
    for (const usage of tutorial.usedIn) {
      const group = groups.get(usage.templateId) ?? {
        id: usage.templateId,
        name: usage.templateName,
        published: usage.published,
        entries: [],
      };
      group.entries.push({ tutorial, usage });
      groups.set(usage.templateId, group);
    }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      entries: group.entries.sort((a, b) => a.usage.position - b.usage.position),
    }))
    .sort((a, b) => Number(b.published) - Number(a.published) || a.name.localeCompare(b.name));
}

/**
 * Tutorials (admins, People Ops and path curators): every module's lessons, organised by the
 * onboarding templates that use them, in stage order, with what needs attention first. Drafts are
 * reviewed in the Studio and published; learners only see published versions.
 */
export function TutorialsPage() {
  const query = useQuery(tutorialsQuery());
  const [creating, setCreating] = useState(false);
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "all" ? "all" : "templates";
  const status = (params.get("status") ?? ALL) as StatusFilter;
  const templateFilter = params.get("template") ?? ALL;
  const [text, setText] = useState(params.get("q") ?? "");
  const q = useDebouncedValue(text.trim(), 250);
  const items = query.data?.items ?? [];

  const setParam = (key: string, value: string, fallback: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === fallback) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  // Keep the search in the URL so a filtered list can be shared and survives a reload.
  useEffect(() => {
    setParam("q", q, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the search settles
  }, [q]);

  const needle = q.toLocaleLowerCase();
  const shown = items.filter((tutorial) => {
    if (
      status === ALL
        ? tutorial.state === "archived"
        : status === "attention"
          ? !LESSON_STATE[tutorial.state].attention
          : tutorial.state !== status
    )
      return false;
    if (
      templateFilter === NO_TEMPLATE
        ? tutorial.usedIn.length > 0
        : templateFilter !== ALL &&
          !tutorial.usedIn.some((usage) => usage.templateId === templateFilter)
    )
      return false;
    return (
      !needle ||
      `${tutorial.title} ${tutorial.audience} ${tutorial.project?.name ?? ""} ${tutorial.usedIn.map((usage) => usage.templateName).join(" ")}`
        .toLocaleLowerCase()
        .includes(needle)
    );
  });
  const attention = STATE_ORDER.flatMap((state) => {
    const count = items.filter((tutorial) => tutorial.state === state).length;
    const label = ATTENTION_LABEL[state];
    return count && label ? [{ state, label: label(count) }] : [];
  });
  const templates = groupByTemplate(items);
  const groups = groupByTemplate(shown).filter(
    (group) => templateFilter === ALL || group.id === templateFilter,
  );
  const unused = shown.filter((tutorial) => !tutorial.usedIn.length);
  const filtered = status !== ALL || templateFilter !== ALL || needle !== "";
  const states = STATE_ORDER.filter((state) => items.some((tutorial) => tutorial.state === state));
  const statusOptions = [
    { value: ALL, label: "All statuses" },
    ...(attention.length ? [{ value: "attention", label: "Needs attention" }] : []),
    ...states.map((state) => ({ value: state, label: LESSON_STATE[state].label })),
  ];
  const templateOptions = [
    { value: ALL, label: "All templates" },
    ...templates.map((group) => ({ value: group.id, label: group.name })),
    { value: NO_TEMPLATE, label: "Not in any template" },
  ];

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker="Learning"
        title="Tutorials"
        description="The lessons behind your onboarding templates and projects, in each template's stage order. You review every draft before anyone sees it, and syncing never changes a published tutorial."
        actions={
          <Button onClick={() => setCreating(true)}>
            <AddIcon aria-hidden /> New tutorial
          </Button>
        }
      />
      {query.isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((tile) => (
            <Skeleton key={tile} className="h-20 rounded-3xl" />
          ))}
        </div>
      ) : query.isError ? (
        <SectionCard title="Tutorials" endpoint={TUTORIAL_ENDPOINTS.list.path} status={query} />
      ) : items.length ? (
        <>
          {attention.length ? (
            <div
              role="group"
              aria-label="Needs attention"
              className="flex flex-wrap items-center gap-2 rounded-3xl bg-card px-4 py-3"
            >
              <span className="me-1 text-sm font-medium">Needs attention</span>
              {attention.map((entry) => (
                <Chip
                  key={entry.state}
                  variant="filter"
                  selected={status === entry.state}
                  onClick={() =>
                    setParam("status", status === entry.state ? ALL : entry.state, ALL)
                  }
                >
                  {entry.label}
                </Chip>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <SearchField
              label="Search tutorials"
              value={text}
              onValueChange={setText}
              placeholder="Search by title, audience, project or template"
              className="min-w-64 flex-1"
            />
            <FilterSelect
              label="Status"
              options={statusOptions}
              value={status}
              onChange={(value) => setParam("status", value, ALL)}
            />
            <FilterSelect
              label="Template"
              options={templateOptions}
              value={templateFilter}
              onChange={(value) => setParam("template", value, ALL)}
            />
            <ConnectedButtonGroup aria-label="View">
              <ConnectedButton
                pressed={view === "templates"}
                onClick={() => setParam("view", "templates", "templates")}
              >
                By template
              </ConnectedButton>
              <ConnectedButton
                pressed={view === "all"}
                onClick={() => setParam("view", "all", "templates")}
              >
                All tutorials
              </ConnectedButton>
            </ConnectedButtonGroup>
          </div>
          {!shown.length ? (
            <Empty className="rounded-card bg-card py-10">
              <EmptyHeader>
                <EmptyTitle>No tutorials match</EmptyTitle>
                <EmptyDescription>Try another search, status or template.</EmptyDescription>
              </EmptyHeader>
              <Button
                variant="outline"
                onClick={() => {
                  setText("");
                  setParams({}, { replace: true });
                }}
              >
                Clear filters
              </Button>
            </Empty>
          ) : view === "all" ? (
            <SegmentedList aria-label="Tutorials">
              {[...shown]
                .sort(
                  (a, b) =>
                    STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
                    b.updatedAt.localeCompare(a.updatedAt),
                )
                .map((tutorial) => (
                  <TutorialRow key={tutorial.id} tutorial={tutorial} showTemplates />
                ))}
            </SegmentedList>
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((group) => (
                <TemplateSection
                  key={group.id}
                  group={group}
                  defaultOpen={
                    filtered ||
                    groups.length <= 3 ||
                    group.entries.some((entry) => LESSON_STATE[entry.tutorial.state].attention)
                  }
                />
              ))}
              {unused.length && (templateFilter === ALL || templateFilter === NO_TEMPLATE) ? (
                <CollapsibleSection
                  title="Not in any template"
                  meta={[
                    formatCount(unused.length, "tutorial"),
                    "Project tutorials and lessons no template uses yet",
                  ]}
                  defaultOpen={filtered || groups.length === 0}
                >
                  <SegmentedList aria-label="Not in any template">
                    {unused.map((tutorial) => (
                      <TutorialRow key={tutorial.id} tutorial={tutorial} />
                    ))}
                  </SegmentedList>
                </CollapsibleSection>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <Empty className="rounded-card bg-card py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SchoolIcon />
            </EmptyMedia>
            <EmptyTitle>No tutorials yet</EmptyTitle>
            <EmptyDescription>
              Pick a project whose documents are synced, say who it's for, and ContextOS drafts
              lessons and a knowledge check from what it learned. Templates drafted in setup add
              their modules here too.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setCreating(true)}>
            <AddIcon aria-hidden /> New tutorial
          </Button>
        </Empty>
      )}
      <NewTutorialDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Select
        items={Object.fromEntries(options.map((option) => [option.value, option.label]))}
        value={options.some((option) => option.value === value) ? value : ALL}
        onValueChange={(next) => onChange(String(next))}
      >
        <SelectTrigger
          id={id}
          className="w-auto min-w-44 rounded-full bg-card shadow-none data-[size=default]:h-13"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

/** A card whose heading opens and closes it. */
function CollapsibleSection({
  title,
  meta,
  action,
  defaultOpen,
  children,
}: {
  title: string;
  meta: React.ReactNode[];
  action?: React.ReactNode;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-3xl bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-6 [&_svg]:shrink-0 [&_svg]:text-on-surface-variant"
        >
          {open ? <KeyboardArrowDownIcon aria-hidden /> : <ChevronRightIcon aria-hidden />}
          <span className="flex min-w-0 flex-col">
            <b className="font-heading text-base font-medium">{title}</b>
            <span className="text-xs text-on-surface-variant">
              <DotList parts={meta} />
            </span>
          </span>
        </button>
        {action}
      </div>
      {open ? <div id={bodyId}>{children}</div> : null}
    </section>
  );
}

/** One template's modules with lessons, by stage ("Weeks 1–2 · Induction"). */
function TemplateSection({ group, defaultOpen }: { group: TemplateGroup; defaultOpen: boolean }) {
  const waiting = group.entries.filter((entry) => LESSON_STATE[entry.tutorial.state].attention);
  const stages: Array<{ key: string; label: string; entries: TemplateGroup["entries"] }> = [];
  for (const entry of group.entries) {
    const key = `${entry.usage.stage}|${entry.usage.weekStart}`;
    const last = stages.at(-1);
    if (last?.key === key) last.entries.push(entry);
    else
      stages.push({
        key,
        label: `${weeksLabel(entry.usage)} · ${entry.usage.stage}`,
        entries: [entry],
      });
  }
  return (
    <CollapsibleSection
      title={group.name}
      meta={[
        group.published ? "" : "Draft template",
        formatCount(group.entries.length, "module"),
        waiting.length ? `${waiting.length} need${waiting.length === 1 ? "s" : ""} attention` : "",
      ]}
      defaultOpen={defaultOpen}
      action={
        <Button
          size="xs"
          variant="ghost"
          nativeButton={false}
          render={<Link to={templatePath(group.id)} />}
        >
          Open template
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {stages.map((stage) => (
          <div key={stage.key} className="flex flex-col gap-1.5">
            <h3 className="px-1 text-xs font-medium tracking-wide text-on-surface-variant uppercase">
              {stage.label}
            </h3>
            <SegmentedList aria-label={stage.label}>
              {stage.entries.map(({ tutorial }) => (
                <TutorialRow key={tutorial.id} tutorial={tutorial} templateId={group.id} />
              ))}
            </SegmentedList>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

/**
 * A tutorial as a compact row: what it is, its numbers and where it stands. Opened from a template
 * group, the Studio offers the way back to that template.
 */
function TutorialRow({
  tutorial,
  templateId,
  showTemplates = false,
}: {
  tutorial: TutorialSummary;
  templateId?: string;
  showTemplates?: boolean;
}) {
  const state = LESSON_STATE[tutorial.state];
  const shared = tutorial.usedIn.length > 1;
  return (
    <SegmentedItem
      render={
        <Link
          to={
            templateId ? tutorialFromTemplate(tutorial.id, templateId) : tutorialPath(tutorial.id)
          }
        />
      }
      className="gap-3 text-on-surface no-underline"
    >
      <SegmentedItemLead tone="neutral" size="sm">
        <SchoolIcon />
      </SegmentedItemLead>
      <SegmentedItemBody>
        <SegmentedItemTitle className="whitespace-normal">{tutorial.title}</SegmentedItemTitle>
        <SegmentedItemMeta>
          <DotList
            parts={[
              `${tutorial.project?.name ?? COMPANY_WIDE} · for ${tutorial.audience}`,
              formatCount(tutorial.lessonCount, "lesson"),
              formatCount(tutorial.questionCount, "question"),
              tutorial.minutes ? `~${tutorial.minutes} min` : "",
              tutorial.learners
                ? `${formatCount(tutorial.learners, "learner")}${tutorial.inProgress ? ` (${tutorial.inProgress} part-way)` : ""}`
                : "",
              `Updated ${formatRelativeTime(tutorial.updatedAt).toLowerCase()}`,
            ]}
          />
        </SegmentedItemMeta>
        {showTemplates ? (
          <span className="text-xs text-on-surface-variant">
            {tutorial.usedIn.length
              ? `In ${tutorial.usedIn.map((usage) => usage.templateName).join(", ")}`
              : "Not in any template"}
          </span>
        ) : null}
      </SegmentedItemBody>
      <SegmentedItemTrail className="flex flex-wrap items-center justify-end gap-1.5">
        {shared && !showTemplates ? (
          <MetaChip>Shared by {tutorial.usedIn.length} templates</MetaChip>
        ) : null}
        {tutorial.generating && tutorial.state !== "writing" ? (
          <StatusChip tone="info" icon={<SmartToyIcon />}>
            Writing new draft
          </StatusChip>
        ) : null}
        <StatusChip tone={state.tone} icon={STATE_ICON[tutorial.state]}>
          {state.label}
          {tutorial.state === "published" && tutorial.publishedVersion
            ? ` · v${tutorial.publishedVersion}`
            : ""}
        </StatusChip>
      </SegmentedItemTrail>
    </SegmentedItem>
  );
}

/** The project picker's value for a tutorial drafted from every project. */
const COMPANY = "company";

/** "New tutorial": project, audience and an optional focus; the draft is written in the background. */
function NewTutorialDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const projects = useQuery({ ...projectsQuery(), enabled: open });
  const create = useCreateTutorial();
  const navigate = useNavigate();
  const ids = { project: useId(), audience: useId(), focus: useId() };
  const [projectId, setProjectId] = useState<string | null>(null);
  const [audience, setAudience] = useState("New team members");
  const [focus, setFocus] = useState("");
  // Owners, admins and People Ops can draft from every project at once.
  const { role } = useViewer();
  const companyWide = role === "owner" || role === "admin" || role === "hr";
  const list = [
    ...(projects.data?.items ?? []),
    ...(companyWide ? [{ id: COMPANY, name: `${COMPANY_WIDE} (all projects)` }] : []),
  ];
  const chosen = projectId ?? list[0]?.id ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            if (!chosen || !audience.trim()) return;
            create.mutate(
              {
                ...(chosen === COMPANY ? {} : { projectId: chosen }),
                audience: audience.trim(),
                ...(focus.trim() ? { focus: focus.trim() } : {}),
              },
              {
                onSuccess: (tutorial) => {
                  toast.success("Writing the draft. It's ready to review in about a minute.");
                  onOpenChange(false);
                  void navigate(tutorialPath(tutorial.id));
                },
                onError: (error) => toast.error(error.message),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>New tutorial</DialogTitle>
            <DialogDescription>
              ContextOS drafts lessons and a knowledge check from what it already learned about the
              project. Nothing is shown to anyone until you publish it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.project}>Project</Label>
            <Select
              items={Object.fromEntries(list.map((project) => [project.id, project.name]))}
              value={chosen}
              onValueChange={(value) => setProjectId(String(value))}
            >
              <SelectTrigger id={ids.project} className="w-full" disabled={!list.length}>
                <SelectValue
                  placeholder={projects.isPending ? "Loading projects" : "No projects"}
                />
              </SelectTrigger>
              <SelectContent>
                {list.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.audience}>Who it's for</Label>
            <Input
              id={ids.audience}
              value={audience}
              maxLength={100}
              onChange={(event) => setAudience(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.focus}>Focus (optional)</Label>
            <Textarea
              id={ids.focus}
              value={focus}
              maxLength={300}
              rows={2}
              placeholder="How billing works end to end"
              onChange={(event) => setFocus(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!chosen || !audience.trim() || create.isPending}>
              Draft tutorial
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
