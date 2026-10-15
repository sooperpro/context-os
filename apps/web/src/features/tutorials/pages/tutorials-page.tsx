import type { TutorialSummary } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { AddIcon, SchoolIcon, WarningIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { projectsQuery } from "@/features/projects/api/projects.queries";
import { TUTORIAL_ENDPOINTS } from "@/features/tutorials/api/tutorials.api";
import { tutorialsQuery, useCreateTutorial } from "@/features/tutorials/api/tutorials.queries";
import { TUTORIAL_STATUS, tutorialPath } from "@/features/tutorials/tutorials-meta";
import { formatRelativeTime } from "@/lib/format";

/**
 * Tutorials (admins and People Ops): step-by-step learning drafted from a project's knowledge.
 * Drafts are reviewed in the Studio and published; learners only see published versions.
 */
export function TutorialsPage() {
  const query = useQuery(tutorialsQuery());
  const [creating, setCreating] = useState(false);
  const items = query.data?.items ?? [];

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker="Learning"
        title="Tutorials"
        description="Turn a project's knowledge into short lessons with a knowledge check. You review every draft before anyone sees it, and syncing never changes a published tutorial."
        actions={
          <Button onClick={() => setCreating(true)}>
            <AddIcon aria-hidden /> New tutorial
          </Button>
        }
      />
      {query.isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {[0, 1, 2].map((tile) => (
            <Skeleton key={tile} className="h-48 rounded-3xl" />
          ))}
        </div>
      ) : query.isError ? (
        <SectionCard title="Tutorials" endpoint={TUTORIAL_ENDPOINTS.list.path} status={query} />
      ) : items.length ? (
        <ul
          aria-label="Tutorials"
          className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3"
        >
          {items.map((tutorial) => (
            <li key={tutorial.id} className="flex">
              <TutorialCard tutorial={tutorial} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="rounded-card bg-card py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SchoolIcon />
            </EmptyMedia>
            <EmptyTitle>No tutorials yet</EmptyTitle>
            <EmptyDescription>
              Pick a project whose documents are synced, say who it's for, and ContextOS drafts
              lessons and a knowledge check from what it learned.
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

function TutorialCard({ tutorial }: { tutorial: TutorialSummary }) {
  const status = TUTORIAL_STATUS[tutorial.status];
  const stats = [
    ["Lessons", tutorial.lessonCount],
    ["Questions", tutorial.questionCount],
    ["Learners", tutorial.learners],
  ] as const;
  return (
    <Link
      to={tutorialPath(tutorial.id)}
      className="flex w-full flex-col gap-2 rounded-3xl bg-card p-4.5 text-on-surface no-underline transition-[border-radius,box-shadow] duration-[350ms] ease-spring-fast-spatial outline-none hover:rounded-[32px] hover:shadow-elevation-1 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <StatusChip tone={status.tone}>
          {status.label}
          {tutorial.status === "published" && tutorial.publishedVersion
            ? ` · v${tutorial.publishedVersion}`
            : ""}
        </StatusChip>
        {tutorial.generating && tutorial.status !== "generating" ? (
          <StatusChip tone="info">Writing new draft</StatusChip>
        ) : null}
        {tutorial.staleSources ? (
          <StatusChip tone="warning" icon={<WarningIcon />}>
            Needs update
          </StatusChip>
        ) : null}
      </span>
      <b className="font-heading text-base font-medium">{tutorial.title}</b>
      <span className="text-xs text-on-surface-variant">
        {tutorial.project.name} · for {tutorial.audience}
        {tutorial.minutes ? ` · ~${tutorial.minutes} min` : ""}
      </span>
      <dl className="my-1 grid grid-cols-3 gap-0.5">
        {stats.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col rounded-[4px] bg-pane px-2.5 py-2 first:rounded-l-xl last:rounded-r-xl"
          >
            <dt className="text-[11px] font-medium tracking-[0.4px] text-on-surface-variant">
              {label}
            </dt>
            <dd className="text-sm font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <span className="text-xs text-on-surface-variant">
        {tutorial.unpublishedChanges ? "Unpublished changes · " : ""}Updated{" "}
        {formatRelativeTime(tutorial.updatedAt).toLowerCase()}
      </span>
    </Link>
  );
}

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
  const list = projects.data?.items ?? [];
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
                projectId: chosen,
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
