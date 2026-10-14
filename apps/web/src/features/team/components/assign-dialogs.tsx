import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddIcon, CheckIcon, SmartToyIcon } from "@/components/ui/icons";
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
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";
import { homeQuery } from "@/features/home/api/home.queries";
import {
  assignOptionsQuery,
  useAssignLearning,
  useAssignRoadmap,
} from "@/features/team/api/team.queries";
import { dateInputToIso, firstName } from "@/lib/format";

interface Person {
  id: string;
  name: string;
}

interface DialogProps {
  person: Person | null;
  onOpenChange: (open: boolean) => void;
}

/** A week from today, for the due date field. */
function inAWeek(): string {
  const date = new Date(Date.now() + 7 * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Assign a learning task": one module, practical task or check, with a due date and a note. */
export function AssignLearningDialog({ person, onOpenChange }: DialogProps) {
  return (
    <Dialog open={person !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        {person ? <AssignLearningForm person={person} close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Anyone on the manager's team can be picked (prototype update, Oct 14); the button that opened the
 * dialog preselects the person.
 */
function AssignLearningForm({ person: opener, close }: { person: Person; close: () => void }) {
  const roster = useQuery(homeQuery("teamOnboarding"));
  const team =
    roster.data?.people.map((entry) => ({ id: entry.person.id, name: entry.person.name })) ?? [];
  const [personId, setPersonId] = useState(opener.id);
  const person = team.find((entry) => entry.id === personId) ?? opener;
  const options = useQuery(assignOptionsQuery(person.id));
  const assign = useAssignLearning(person.id);
  const ids = { person: useId(), due: useId(), note: useId() };
  const items = options.data?.learning.items ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen ?? items.find((item) => item.suggested)?.id ?? items[0]?.id ?? null;
  const [due, setDue] = useState(inAWeek);
  const [note, setNote] = useState("");

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        if (!selected || !dateInputToIso(due)) return;
        const title = items.find((item) => item.id === selected)?.title ?? "the task";
        assign.mutate(
          { itemId: selected, dueOn: due, note },
          {
            onSuccess: () => {
              toast.success(`Assigned “${title}” to ${person.name}`);
              close();
            },
            onError: () => toast.error("The task could not be assigned. Please try again."),
          },
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>Assign a learning task</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.person}>Person</Label>
        <Select
          items={Object.fromEntries(
            (team.length ? team : [opener]).map((entry) => [entry.id, entry.name]),
          )}
          value={person.id}
          onValueChange={(value) => {
            setPersonId(String(value));
            setChosen(null);
          }}
        >
          <SelectTrigger id={ids.person} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(team.length ? team : [opener]).map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogDescription>
        {options.data?.learning.reason ??
          `Pick a module, practical task or knowledge check for ${firstName(person.name)}.`}
      </DialogDescription>
      {options.isPending ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : (
        <OptionList aria-label="Task">
          {items.map((item) => (
            <OptionTile
              key={item.id}
              input={
                <input
                  type="radio"
                  name="task"
                  value={item.id}
                  checked={selected === item.id}
                  onChange={() => setChosen(item.id)}
                />
              }
              title={item.title}
              description={item.detail}
              trailing={
                item.suggested ? (
                  <StatusChip tone="ai" icon={<SmartToyIcon />}>
                    Suggested
                  </StatusChip>
                ) : null
              }
            />
          ))}
        </OptionList>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.due}>Due</Label>
        <Input
          id={ids.due}
          type="date"
          value={due}
          onChange={(event) => setDue(event.target.value)}
          className="w-48"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.note}>Note to {firstName(person.name)} (optional)</Label>
        <Textarea
          id={ids.note}
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why this, and what good looks like"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!selected || assign.isPending}>
          Assign task
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Assign a roadmap": a template, add-ons and a buddy, for someone starting without a plan. */
export function AssignRoadmapDialog({ person, onOpenChange }: DialogProps) {
  return (
    <Dialog open={person !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        {person ? <AssignRoadmapForm person={person} close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AssignRoadmapForm({ person, close }: { person: Person; close: () => void }) {
  const options = useQuery(assignOptionsQuery(person.id));
  const assign = useAssignRoadmap(person.id);
  const buddyId = useId();
  const roadmap = options.data?.roadmap;
  const [template, setTemplate] = useState<string | null>(null);
  const [addOns, setAddOns] = useState<Set<string> | null>(null);
  const [buddy, setBuddy] = useState<string | null>(null);
  const chosenTemplate =
    template ??
    roadmap?.templates.find((entry) => entry.matchesRole)?.id ??
    roadmap?.templates[0]?.id ??
    null;
  const chosenAddOns =
    addOns ?? new Set(roadmap?.addOns.filter((entry) => entry.suggested).map((entry) => entry.id));
  const chosenBuddy = buddy ?? roadmap?.buddies[0]?.id ?? null;
  const buddyItems = Object.fromEntries(
    (roadmap?.buddies ?? []).map((entry) => [entry.id, entry.name]),
  );

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        if (!chosenTemplate || !chosenBuddy) return;
        const buddyName =
          roadmap?.buddies.find((entry) => entry.id === chosenBuddy)?.name ?? "a buddy";
        assign.mutate(
          { templateId: chosenTemplate, addOnIds: [...chosenAddOns], buddyId: chosenBuddy },
          {
            onSuccess: () => {
              toast.success(`Roadmap assigned to ${person.name} · buddy ${buddyName}`);
              close();
            },
            onError: () => toast.error("The roadmap could not be assigned. Please try again."),
          },
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>Assign a roadmap to {person.name}</DialogTitle>
        <DialogDescription>Pick a template so day one has a plan.</DialogDescription>
      </DialogHeader>
      {!roadmap ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Template</legend>
            <OptionList>
              {roadmap.templates.map((entry) => (
                <OptionTile
                  key={entry.id}
                  input={
                    <input
                      type="radio"
                      name="template"
                      value={entry.id}
                      checked={chosenTemplate === entry.id}
                      onChange={() => setTemplate(entry.id)}
                    />
                  }
                  title={entry.name}
                  description={`${entry.version} · ${entry.moduleCount} modules · ${entry.weeks} weeks`}
                  trailing={
                    entry.matchesRole ? (
                      <StatusChip tone="ai" icon={<SmartToyIcon />}>
                        Matches role
                      </StatusChip>
                    ) : null
                  }
                />
              ))}
            </OptionList>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Add-ons</legend>
            <div className="flex flex-wrap gap-2">
              {roadmap.addOns.map((entry) => {
                const on = chosenAddOns.has(entry.id);
                return (
                  <Chip
                    key={entry.id}
                    variant="filter"
                    selected={on}
                    aria-pressed={on}
                    onClick={() => {
                      const next = new Set(chosenAddOns);
                      if (on) next.delete(entry.id);
                      else next.add(entry.id);
                      setAddOns(next);
                    }}
                  >
                    {on ? <CheckIcon aria-hidden /> : <AddIcon aria-hidden />}
                    {entry.label}
                  </Chip>
                );
              })}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={buddyId}>Onboarding buddy</Label>
            <Select
              items={buddyItems}
              value={chosenBuddy}
              onValueChange={(value) => setBuddy(String(value))}
            >
              <SelectTrigger id={buddyId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roadmap.buddies.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!chosenTemplate || !chosenBuddy || assign.isPending}>
          Assign roadmap
        </Button>
      </DialogFooter>
    </form>
  );
}
