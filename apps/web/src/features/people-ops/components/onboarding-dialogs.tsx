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
import { ApiClientError } from "@/lib/api-client";
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

/** The server's reason for a refused change ("already has an onboarding record"), else a fallback. */
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError && error.isClientError ? error.message : fallback;
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
    email: useId(),
    team: useId(),
    start: useId(),
    manager: useId(),
    buddy: useId(),
    template: useId(),
  };
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
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
            email: email.trim() || null,
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
            onError: (error) =>
              toast.error(
                errorMessage(error, "The onboarding could not be created. Please try again."),
              ),
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
            <Field id={ids.email} label="Work email (optional)">
              <Input
                id={ids.email}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="e.g. noor@company.com"
                autoComplete="off"
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
            With a work email they get an invitation, and their manager and start date apply when
            they first sign in. Without one, their account comes from SCIM.
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

export type AssignmentKind = "manager" | "buddy" | "template" | "partner";

const ASSIGNMENT_LABEL: Record<AssignmentKind, string> = {
  manager: "manager",
  buddy: "onboarding buddy",
  template: "template",
  partner: "People partner",
};

/** Who hears about the change: the API notifies the new manager or buddy. */
const ASSIGNMENT_NOTE: Partial<Record<AssignmentKind, string>> = {
  manager: "The new manager will be notified.",
  buddy: "The new buddy will be notified.",
};

/** Change or assign a record's manager, buddy, template or People partner (prototype `changeDialog`). */
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
  const note = ASSIGNMENT_NOTE[kind];
  const current = {
    manager: record.manager?.id,
    buddy: record.buddy?.id,
    template: record.template?.id,
    partner: record.peoplePartner?.id,
  }[kind];
  const people = {
    manager: options.data?.managers ?? [],
    buddy: (options.data?.buddies ?? []).filter((entry) => entry.id !== record.person.id),
    partner: options.data?.peoplePartners ?? [],
    template: [],
  }[kind];
  const list =
    kind === "template"
      ? (options.data?.templates ?? []).map((entry) => ({ value: entry.id, label: entry.name }))
      : people.map((entry) => ({ value: entry.id, label: entry.name }));
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
        const input = {
          manager: { managerId: chosen },
          buddy: { buddyId: chosen },
          template: { templateId: chosen },
          partner: { peoplePartnerId: chosen },
        }[kind];
        update.mutate(input, {
          onSuccess: () => {
            toast.success(`${fieldLabel} updated for ${record.person.name}`);
            close();
          },
          onError: (error) =>
            toast.error(
              errorMessage(error, `The ${label} could not be changed. Please try again.`),
            ),
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
      {note ? <Note icon={<NotificationsIcon aria-hidden />}>{note}</Note> : null}
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
