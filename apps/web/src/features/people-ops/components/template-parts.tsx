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
  templateLibraryQuery,
  useCreateTemplate,
} from "@/features/people-ops/api/people-ops.queries";
import {
  TEMPLATE_FAMILY,
  templateModuleMeta,
  templatePath,
} from "@/features/people-ops/people-ops-meta";

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
export function PublishDialog({
  template,
  next,
  open,
  pending,
  onPublish,
  onOpenChange,
}: {
  template: TemplateDetail;
  next: string;
  open: boolean;
  pending: boolean;
  onPublish: (note: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const noteId = useId();
  const [note, setNote] = useState("");
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
              Publish {next}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
