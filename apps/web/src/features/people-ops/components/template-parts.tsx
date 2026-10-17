import type {
  OnboardingTemplate,
  TemplateDetail,
  TemplateFamily,
  TemplateModule,
} from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useId, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DotList } from "@/components/ui/dot-list";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionList, OptionTile } from "@/components/ui/option-tile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shape } from "@/components/ui/shape";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  templateAudienceQuery,
  templateLibraryQuery,
  templateVersionQuery,
  useCreateTemplate,
  useGenerateTemplate,
} from "@/features/people-ops/api/people-ops.queries";
import {
  TEMPLATE_FAMILY,
  TEMPLATE_MODULE_KIND,
  minutesLabel,
  templateModuleMeta,
  templatePath,
  weeksLabel,
} from "@/features/people-ops/people-ops-meta";
import { formatCount, formatShortDate } from "@/lib/format";

/** A template's icon on its shape (prototype `.coll-shape`). */
export function TemplateTile({
  family,
  size = "default",
}: {
  family: TemplateFamily;
  size?: "default" | "lg";
}) {
  const look = TEMPLATE_FAMILY[family];
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center text-on-primary-container",
        size === "lg" ? "size-14" : "size-11",
      )}
    >
      <Shape kind={look.shape} className="absolute inset-0 size-full text-primary-container" />
      {/* Size the icon on its own wrapper: a descendant svg rule would shrink the shape too. */}
      <span
        className={cn(
          "relative z-10 grid place-items-center",
          size === "lg" ? "[&_svg]:size-7" : "[&_svg]:size-5",
        )}
      >
        <look.icon />
      </span>
    </span>
  );
}

/** "New template": a draft copied from an existing template. */
export function NewTemplateDialog({
  open,
  onOpenChange,
  templates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: OnboardingTemplate[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? <NewTemplateForm templates={templates} close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function NewTemplateForm({
  templates,
  close,
}: {
  templates: OnboardingTemplate[];
  close: () => void;
}) {
  const create = useCreateTemplate();
  const navigate = useNavigate();
  const ids = { name: useId(), base: useId() };
  const [name, setName] = useState("");
  const [base, setBase] = useState(templates[0]?.id ?? "");
  const items = Object.fromEntries(
    templates.map((entry) => [entry.id, `${entry.name} (${entry.version})`]),
  );
  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        const from = templates.find((entry) => entry.id === base);
        if (!from) return;
        create.mutate(
          { name, baseId: base },
          {
            onSuccess: (created) => {
              toast.success(`Draft created from ${from.name}`);
              close();
              void navigate(templatePath(created.id));
            },
            onError: () => toast.error("The template could not be created. Please try again."),
          },
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>New template</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.name}>Name</Label>
        <Input
          id={ids.name}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Customer success · Manager"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.base}>Start from</Label>
        <Select items={items} value={base} onValueChange={(value) => setBase(String(value))}>
          <SelectTrigger id={ids.base} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {templates.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {items[entry.id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!base || create.isPending}>
          Create draft
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Add a module to <stage>": library modules not already in the template. */
export function AddModuleDialog({
  stage,
  exclude,
  onAdd,
  onOpenChange,
}: {
  stage: { id: string; name: string } | null;
  exclude: ReadonlySet<string>;
  onAdd: (module: TemplateModule) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={stage !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        {stage ? (
          <AddModuleForm
            stage={stage}
            exclude={exclude}
            onAdd={onAdd}
            close={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AddModuleForm({
  stage,
  exclude,
  onAdd,
  close,
}: {
  stage: { id: string; name: string };
  exclude: ReadonlySet<string>;
  onAdd: (module: TemplateModule) => void;
  close: () => void;
}) {
  const library = useQuery(templateLibraryQuery());
  const options = (library.data?.items ?? []).filter((entry) => !exclude.has(entry.id));
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen ?? options[0]?.id ?? null;
  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        const module = options.find((entry) => entry.id === selected);
        if (!module) return;
        onAdd(module);
        close();
      }}
    >
      <DialogHeader>
        <DialogTitle>Add a module to {stage.name}</DialogTitle>
      </DialogHeader>
      {library.isPending ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : options.length ? (
        <OptionList aria-label="Module">
          {options.map((entry) => (
            <OptionTile
              key={entry.id}
              input={
                <input
                  type="radio"
                  name="module"
                  value={entry.id}
                  checked={selected === entry.id}
                  onChange={() => setChosen(entry.id)}
                />
              }
              title={entry.title}
              description={templateModuleMeta(entry).join(" · ")}
            />
          ))}
        </OptionList>
      ) : (
        <p className="text-sm text-on-surface-variant">
          Every library module is already in this template.
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!selected}>
          Add module
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Publish vN of <template>?" with a note for the version history. */
/** Publish a version, or (managers and path curators) submit the draft to People Ops for review. */
export function PublishDialog({
  template,
  next,
  mode = "publish",
  draftModules = [],
  open,
  pending,
  onPublish,
  onOpenChange,
}: {
  template: TemplateDetail;
  next: string;
  mode?: "publish" | "submit";
  /** Titles of its modules whose lessons are still drafts: published with it. */
  draftModules?: string[];
  open: boolean;
  pending: boolean;
  onPublish: (note: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const noteId = useId();
  const [note, setNote] = useState("");
  if (mode === "submit")
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              onPublish(note);
            }}
          >
            <DialogHeader>
              <DialogTitle>Submit {template.name} for review?</DialogTitle>
              <DialogDescription>
                HR, an admin or the owner checks it, then publishes it or sends it back with a note.
                Its modules are reviewed too.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={noteId}>Note for the reviewer</Label>
              <Textarea
                id={noteId}
                rows={2}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional: what you changed, or what to look at"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Submit for review
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            onPublish(note);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              Publish {next} of {template.name}?
            </DialogTitle>
            <DialogDescription>
              New onboardings that use this template get {next}.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-on-surface-variant">
            {template.publishedVersion
              ? `The ${template.activeCount} people on ${template.publishedVersion} keep their current roadmap. Their managers can switch them from the member page.`
              : "No one uses this template yet."}
          </p>
          {draftModules.length ? (
            <div className="flex flex-col gap-1.5 rounded-xl bg-pane px-3.5 py-3 text-sm">
              <b className="font-medium">
                This also publishes the lessons of{" "}
                {formatCount(draftModules.length, "draft module")}:
              </b>
              <ul className="list-disc ps-5 text-on-surface-variant">
                {draftModules.slice(0, 8).map((title) => (
                  <li key={title}>{title}</li>
                ))}
                {draftModules.length > 8 ? <li>and {draftModules.length - 8} more</li> : null}
              </ul>
              <span className="text-xs text-on-surface-variant">
                To check a module’s lessons first, open “Review draft lessons” under it.
              </span>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={noteId}>What changed?</Label>
            <Textarea
              id={noteId}
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Shown in the version history"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {draftModules.length
                ? `Publish ${next} and ${formatCount(draftModules.length, "module")}`
                : `Publish ${next}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Asks before archiving or deleting a template, and says what will happen to the people on it. The
 * action itself is the caller's: it knows how to reach the API and where to go afterwards.
 */
export function TemplateActionDialog({
  template,
  action,
  pending,
  onConfirm,
  onOpenChange,
}: {
  template: TemplateDetail;
  action: "archive" | "delete" | null;
  pending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const deleting = action === "delete";
  return (
    <Dialog open={action !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {action ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {deleting ? "Delete" : "Archive"} {template.name}?
              </DialogTitle>
              <DialogDescription>
                {deleting
                  ? "This removes the template and its version history for good. It can’t be undone."
                  : "It stops being offered for new onboardings. You can restore it any time."}
              </DialogDescription>
            </DialogHeader>
            {deleting ? (
              <p className="text-sm text-on-surface-variant">
                No onboarding has used it, so nobody’s roadmap changes.
              </p>
            ) : (
              <p className="text-sm text-on-surface-variant">
                {template.activeCount
                  ? `Everyone already on it (${formatCount(template.activeCount, "person", "people")}) keeps their roadmap.`
                  : "Nobody is on it right now."}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant={deleting ? "destructive" : "default"}
                disabled={pending}
                onClick={onConfirm}
              >
                {deleting ? "Delete template" : "Archive template"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** An old version as it was published: read only. `version` is the history entry, such as "v2". */
export function TemplateVersionDialog({
  templateId,
  version,
  onOpenChange,
}: {
  templateId: string;
  version: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={version !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        {version ? <VersionBody templateId={templateId} version={version} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function VersionBody({ templateId, version }: { templateId: string; version: string }) {
  const query = useQuery(templateVersionQuery(templateId, Number(version.slice(1))));
  if (query.isPending)
    return (
      <>
        <DialogHeader>
          <DialogTitle>Version {version.slice(1)}</DialogTitle>
        </DialogHeader>
        <Skeleton className="h-64 rounded-lg" />
      </>
    );
  if (query.isError)
    return (
      <>
        <DialogHeader>
          <DialogTitle>Version {version.slice(1)}</DialogTitle>
          <DialogDescription>This version could not be opened.</DialogDescription>
        </DialogHeader>
        <p role="alert" className="text-sm text-error">
          {query.error.message}
        </p>
      </>
    );
  const detail = query.data;
  const minutes = detail.stages.reduce(
    (sum, item) => sum + item.modules.reduce((acc, module) => acc + (module.minutes ?? 0), 0),
    0,
  );
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {detail.name} · Version {detail.version.slice(1)}
        </DialogTitle>
        <DialogDescription>
          Published {formatShortDate(detail.publishedOn)}
          {detail.note ? ` · ${detail.note}` : ""}. A read-only copy of how it was then.
        </DialogDescription>
      </DialogHeader>
      <p className="text-sm text-on-surface-variant">
        <DotList
          parts={[
            detail.roles.length ? detail.roles.join(", ") : "No roles set",
            `${detail.weeks} weeks`,
            minutesLabel(minutes),
          ]}
        />
      </p>
      <ol className="flex flex-col gap-3">
        {detail.stages.map((item, index) => (
          <li key={item.id} className="rounded-lg bg-pane p-3.5">
            <p className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium">
              <span>
                {index + 1}. {item.name}
              </span>
              <span className="text-xs font-normal text-on-surface-variant">
                {weeksLabel(item)} · {formatCount(item.modules.length, "module")}
              </span>
            </p>
            {item.modules.length ? (
              <ul className="flex flex-col gap-1.5">
                {item.modules.map((module) => {
                  const Kind = TEMPLATE_MODULE_KIND[module.kind].icon;
                  return (
                    <li key={module.id} className="flex items-center gap-2.5 text-sm">
                      <Kind className="size-4 shrink-0 text-on-surface-variant" aria-hidden />
                      <span className="min-w-0 flex-1">{module.title}</span>
                      <span className="text-xs text-on-surface-variant">
                        {minutesLabel(module.minutes)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-on-surface-variant">No modules in this stage.</p>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

/** A stage's name and weeks: edit one, or add a new one. Empty stages can be removed. */
export function StageDialog({
  stage,
  open,
  onSave,
  onRemove,
  onOpenChange,
}: {
  /** Null to add a stage. */
  stage: { name: string; weekStart: number; weekEnd: number; modules: unknown[] } | null;
  open: boolean;
  onSave: (stage: { name: string; weekStart: number; weekEnd: number }) => void;
  onRemove: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const ids = { name: useId(), from: useId(), to: useId() };
  const [name, setName] = useState(stage?.name ?? "");
  const [from, setFrom] = useState(String(stage?.weekStart ?? 1));
  const [to, setTo] = useState(String(stage?.weekEnd ?? 1));
  const first = Number(from);
  const last = Number(to);
  const valid = name.trim() !== "" && first >= 1 && last >= first && last <= 104;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) onSave({ name: name.trim(), weekStart: first, weekEnd: last });
          }}
        >
          <DialogHeader>
            <DialogTitle>{stage ? `Edit ${stage.name}` : "Add a stage"}</DialogTitle>
            <DialogDescription>
              Weeks count from the start date. Due dates spread across the stage’s weeks.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.name}>Name</Label>
            <Input
              id={ids.name}
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.from}>First week</Label>
              <Input
                id={ids.from}
                type="number"
                min={1}
                max={104}
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.to}>Last week</Label>
              <Input
                id={ids.to}
                type="number"
                min={1}
                max={104}
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            {stage ? (
              <Button
                type="button"
                variant="outline"
                className="me-auto"
                disabled={stage.modules.length > 0}
                title={stage.modules.length ? "Remove its modules first" : undefined}
                onClick={onRemove}
              >
                Remove stage
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              {stage ? "Save" : "Add stage"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The department field's "no department" choice. */
const ANY_DEPARTMENT = "any";

/** "Generate with AI": a template for a job title, planned from the Knowledge Hub. */
export function GenerateTemplateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ids = {
    title: useId(),
    team: useId(),
    department: useId(),
    seniority: useId(),
    titles: useId(),
    teams: useId(),
  };
  const [jobTitle, setJobTitle] = useState("");
  const [team, setTeam] = useState("");
  const [department, setDepartment] = useState(ANY_DEPARTMENT);
  const [seniority, setSeniority] = useState("");
  const generate = useGenerateTemplate();
  // The organisation's job titles, teams and departments, suggested as they type.
  const audience = useQuery({ ...templateAudienceQuery(), enabled: open });
  const departments = audience.data?.departments ?? [];
  const teamChoices = (audience.data?.teams ?? []).filter(
    (entry) =>
      department === ANY_DEPARTMENT ||
      entry.departmentId === null ||
      entry.departmentId === department,
  );
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            if (!jobTitle.trim()) return;
            generate.mutate(
              {
                jobTitle: jobTitle.trim(),
                ...(team.trim() ? { team: team.trim() } : {}),
                ...(department === ANY_DEPARTMENT ? {} : { departmentId: department }),
                ...(seniority.trim() ? { seniority: seniority.trim() } : {}),
              },
              {
                onSuccess: (template) => {
                  toast.success("Planning the roadmap. It's ready to review in a minute or two.");
                  onOpenChange(false);
                  void navigate(templatePath(template.id));
                },
                onError: (error) => toast.error(error.message),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Generate a template</DialogTitle>
            <DialogDescription>
              ContextOS plans the stages, probation, check-ins and modules from your company’s
              knowledge, and drafts lessons for each new module. Nothing reaches anyone until you
              publish it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.title}>Job title</Label>
            <Input
              id={ids.title}
              value={jobTitle}
              maxLength={100}
              placeholder="Account executive"
              list={ids.titles}
              autoComplete="off"
              onChange={(event) => setJobTitle(event.target.value)}
            />
            <datalist id={ids.titles}>
              {(audience.data?.roles ?? []).map((role) => (
                <option key={role} value={role} />
              ))}
            </datalist>
          </div>
          {departments.length ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.department}>Department (optional)</Label>
              <Select
                items={{
                  [ANY_DEPARTMENT]: "Any department",
                  ...Object.fromEntries(departments.map((entry) => [entry.id, entry.name])),
                }}
                value={department}
                onValueChange={(next) => setDepartment(String(next))}
              >
                <SelectTrigger id={ids.department} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_DEPARTMENT}>Any department</SelectItem>
                  {departments.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.team}>Team (optional)</Label>
            <Input
              id={ids.team}
              value={team}
              maxLength={100}
              list={ids.teams}
              autoComplete="off"
              onChange={(event) => setTeam(event.target.value)}
            />
            <datalist id={ids.teams}>
              {teamChoices.map((entry) => (
                <option key={entry.name} value={entry.name} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.seniority}>Seniority (optional)</Label>
            <Input
              id={ids.seniority}
              value={seniority}
              maxLength={60}
              placeholder="Graduate, senior"
              onChange={(event) => setSeniority(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!jobTitle.trim() || generate.isPending}>
              Generate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
