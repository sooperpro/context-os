import type { OnboardingRecord } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NotificationsIcon, SyncAltIcon } from "@/components/ui/icons";
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
import {
  onboardingOptionsQuery,
  useCreateOnboarding,
  useUpdateOnboarding,
} from "@/features/people-ops/api/people-ops.queries";
import { onboardingPath } from "@/features/people-ops/people-ops-meta";
import { firstName } from "@/lib/format";

/** "Later" in the optional selects; the API takes null. */
const LATER = "later";

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function OptionSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select
      items={Object.fromEntries(options.map((option) => [option.value, option.label]))}
      value={value}
      onValueChange={(next) => onChange(String(next))}
    >
      <SelectTrigger id={id} className="w-full">
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
  );
}

function Note({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-on-surface-variant [&_svg]:mt-px [&_svg]:size-4 [&_svg]:shrink-0">
      {icon}
      <span>{children}</span>
    </p>
  );
}

/** Three weeks out, a sensible first start date. */
function defaultStart(): string {
  const date = new Date(Date.now() + 20 * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "New onboarding" (prototype `newOnboarding`): someone joining, their manager, buddy and template. */
export function NewOnboardingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        {open ? <NewOnboardingForm close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function NewOnboardingForm({ close }: { close: () => void }) {
  const options = useQuery(onboardingOptionsQuery());
  const create = useCreateOnboarding();
  const navigate = useNavigate();
  const ids = {
    name: useId(),
    title: useId(),
    team: useId(),
    start: useId(),
    manager: useId(),
    buddy: useId(),
    template: useId(),
  };
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [team, setTeam] = useState<string | null>(null);
  const [start, setStart] = useState(defaultStart);
  const [manager, setManager] = useState<string | null>(null);
  const [buddy, setBuddy] = useState(LATER);
  const [template, setTemplate] = useState(LATER);
  const data = options.data;
  const chosenTeam = team ?? data?.teams[0] ?? "";
  const chosenManager = manager ?? data?.managers[0]?.id ?? "";

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim().length < 2 || title.trim().length < 2) {
          toast.error("Add a name and job title to create the onboarding");
          return;
        }
        create.mutate(
          {
            name: name.trim(),
            title: title.trim(),
            team: chosenTeam,
            startDate: start,
            managerId: chosenManager,
            buddyId: buddy === LATER ? null : buddy,
            templateId: template === LATER ? null : template,
          },
          {
            onSuccess: (record) => {
              toast.success(`Onboarding created for ${record.person.name}`);
              close();
              void navigate(onboardingPath(record.id));
            },
            onError: () => toast.error("The onboarding could not be created. Please try again."),
          },
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>New onboarding</DialogTitle>
      </DialogHeader>
      {!data ? (
        <Skeleton className="h-72 rounded-lg" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={ids.name} label="Full name">
              <Input
                id={ids.name}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Noor Hassan"
                required
              />
            </Field>
            <Field id={ids.title} label="Job title">
              <Input
                id={ids.title}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Backend Engineer"
                required
              />
            </Field>
            <Field id={ids.team} label="Team">
              <OptionSelect
                id={ids.team}
                value={chosenTeam}
                onChange={setTeam}
                options={data.teams.map((entry) => ({ value: entry, label: entry }))}
              />
            </Field>
            <Field id={ids.start} label="Start date">
              <Input
                id={ids.start}
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </Field>
            <Field id={ids.manager} label="Manager">
              <OptionSelect
                id={ids.manager}
                value={chosenManager}
                onChange={setManager}
                options={data.managers.map((entry) => ({ value: entry.id, label: entry.name }))}
              />
            </Field>
            <Field id={ids.buddy} label="Onboarding buddy">
              <OptionSelect
                id={ids.buddy}
                value={buddy}
                onChange={setBuddy}
                options={[
                  { value: LATER, label: "Assign later" },
                  ...data.buddies.map((entry) => ({ value: entry.id, label: entry.name })),
                ]}
              />
            </Field>
          </div>
          <Field id={ids.template} label="Template">
            <OptionSelect
              id={ids.template}
              value={template}
              onChange={setTemplate}
              options={[
                { value: LATER, label: "Choose later" },
                ...data.templates.map((entry) => ({ value: entry.id, label: entry.name })),
              ]}
            />
          </Field>
          <Note icon={<SyncAltIcon aria-hidden />}>
            Their Google Workspace account comes from SCIM. The manager is asked to confirm the
            roadmap.
          </Note>
        </>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!data || !start || create.isPending}>
          Create onboarding
        </Button>
      </DialogFooter>
    </form>
  );
}

export type AssignmentKind = "manager" | "buddy" | "template";

const ASSIGNMENT_LABEL: Record<AssignmentKind, string> = {
  manager: "manager",
  buddy: "onboarding buddy",
  template: "template",
};

/** Change or assign a record's manager, buddy or template (prototype `changeDialog`). */
export function AssignmentDialog({
  record,
  kind,
  onOpenChange,
}: {
  record: OnboardingRecord;
  kind: AssignmentKind | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {kind ? (
          <AssignmentForm record={record} kind={kind} close={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AssignmentForm({
  record,
  kind,
  close,
}: {
  record: OnboardingRecord;
  kind: AssignmentKind;
  close: () => void;
}) {
  const options = useQuery(onboardingOptionsQuery());
  const update = useUpdateOnboarding(record.id);
  const fieldId = useId();
  const label = ASSIGNMENT_LABEL[kind];
  const fieldLabel = label.charAt(0).toUpperCase() + label.slice(1);
  const current =
    kind === "manager"
      ? record.manager?.id
      : kind === "buddy"
        ? record.buddy?.id
        : record.template?.id;
  const list =
    kind === "manager"
      ? (options.data?.managers ?? []).map((entry) => ({ value: entry.id, label: entry.name }))
      : kind === "buddy"
        ? (options.data?.buddies ?? [])
            .filter((entry) => entry.id !== record.person.id)
            .map((entry) => ({ value: entry.id, label: entry.name }))
        : (options.data?.templates ?? []).map((entry) => ({ value: entry.id, label: entry.name }));
  const [value, setValue] = useState<string | null>(null);
  const chosen =
    value ?? (list.some((entry) => entry.value === current) ? current : list[0]?.value) ?? "";
  const first = firstName(record.person.name);
  const assigning = !current;

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        if (!chosen) return;
        const input =
          kind === "manager"
            ? { managerId: chosen }
            : kind === "buddy"
              ? { buddyId: chosen }
              : { templateId: chosen };
        update.mutate(input, {
          onSuccess: () => {
            toast.success(`${fieldLabel} updated for ${record.person.name}`);
            close();
          },
          onError: () => toast.error(`The ${label} could not be changed. Please try again.`),
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {assigning ? "Assign" : "Change"} {first}’s {label}
        </DialogTitle>
      </DialogHeader>
      {options.isPending ? (
        <Skeleton className="h-14 rounded-md" />
      ) : (
        <Field id={fieldId} label={fieldLabel}>
          <OptionSelect id={fieldId} value={chosen} onChange={setValue} options={list} />
        </Field>
      )}
      <Note icon={<NotificationsIcon aria-hidden />}>
        {first}
        {kind === "manager" ? ", the old manager and the new manager" : " and their manager"} will
        be notified.
      </Note>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!chosen || update.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
