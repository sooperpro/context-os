import type { Team } from "@contextos/shared";
import { useId, useState } from "react";
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
import type { OrgPerson } from "@/features/members/api/members.api";

interface TeamPeopleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  /** "add" picks several people not on the team; "lead" picks one person, or nobody. */
  mode: "add" | "lead";
  team: Team | null;
  people: OrgPerson[];
  teamNames: Map<string, string>;
  isPending: boolean;
  onSubmit: (userIds: string[]) => Promise<unknown>;
}

/** Picks people for a team (Departments and teams, N-9): who joins it, or who leads it. */
export function TeamPeopleDialog(props: TeamPeopleDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        {/* Mounted while open, so each opening starts from the team as it is now. */}
        {props.team ? <TeamPeopleForm {...props} team={props.team} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function TeamPeopleForm({
  onOpenChange,
  title,
  description,
  submitLabel,
  mode,
  team,
  people,
  teamNames,
  isPending,
  onSubmit,
}: TeamPeopleDialogProps & { team: Team }) {
  const id = useId();
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<string[]>(
    mode === "lead" && team.leadId ? [team.leadId] : [],
  );

  const needle = text.trim().toLocaleLowerCase();
  // Adding lists everyone not on the team yet; choosing a lead lists the team's people first.
  const candidates = people
    .filter((person) => mode === "lead" || person.teamId !== team.id)
    .filter((person) => !needle || person.name.toLocaleLowerCase().includes(needle))
    .sort((a, b) =>
      mode === "lead" ? Number(b.teamId === team.id) - Number(a.teamId === team.id) : 0,
    );
  const toggle = (personId: string) =>
    setChosen((current) =>
      mode === "lead"
        ? [personId]
        : current.includes(personId)
          ? current.filter((entry) => entry !== personId)
          : [...current, personId],
    );
  const where = (person: OrgPerson) =>
    person.teamId === team.id
      ? "On this team"
      : person.teamId
        ? `On ${teamNames.get(person.teamId) ?? "another team"}`
        : null;
  const option = (personId: string, label: string, hint: string | null) => (
    <li key={personId}>
      <label
        htmlFor={`${id}-${personId}`}
        className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-surface-container"
      >
        <input
          id={`${id}-${personId}`}
          type={mode === "lead" ? "radio" : "checkbox"}
          name={`${id}-people`}
          className="size-4 accent-primary"
          checked={chosen.includes(personId)}
          onChange={() => toggle(personId)}
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {hint ? <span className="text-xs text-on-surface-variant">{hint}</span> : null}
      </label>
    </li>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        // A failed save keeps the dialog open; the caller shows the error.
        void onSubmit(chosen).then(
          () => onOpenChange(false),
          () => undefined,
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor={`${id}-search`}>Find someone</Label>
        <Input
          id={`${id}-search`}
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <ul aria-label="People" className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {mode === "lead" && !needle ? option("", "No lead", null) : null}
        {candidates.map((person) => option(person.id, person.name, where(person)))}
      </ul>
      {!candidates.length ? (
        <p className="text-sm text-on-surface-variant">
          {needle || mode === "lead"
            ? "No one matches."
            : "Everyone is on this team already. Invite people from the Members tab."}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !chosen.length}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
