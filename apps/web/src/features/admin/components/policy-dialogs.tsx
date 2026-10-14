import type { AccessConflict, AccessPolicy } from "@contextos/shared";
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
import { AddIcon, CheckIcon, InfoIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionList, OptionTile } from "@/components/ui/option-tile";
import { useResolveConflict, useSavePolicy } from "@/features/admin/api/admin.queries";

/** New or edit an access policy (prototype `policyDialog`): name, effect and groups. */
export function PolicyDialog({
  policy,
  open,
  groups,
  onOpenChange,
}: {
  /** Null for a new policy. */
  policy: AccessPolicy | null;
  open: boolean;
  groups: string[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        {open ? (
          <PolicyForm policy={policy} groups={groups} close={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PolicyForm({
  policy,
  groups,
  close,
}: {
  policy: AccessPolicy | null;
  groups: string[];
  close: () => void;
}) {
  const save = useSavePolicy(policy?.id ?? null);
  const nameId = useId();
  const [name, setName] = useState(policy?.name ?? "");
  const [effect, setEffect] = useState<"restrict" | "exclude">(
    policy?.effect === "exclude" ? "exclude" : "restrict",
  );
  const [chosen, setChosen] = useState(() => new Set(policy?.groups ?? []));
  const valid = name.trim().length >= 2 && chosen.size > 0;

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        save.mutate(
          { name: name.trim(), effect, groups: [...chosen] },
          {
            onSuccess: (saved) => {
              toast.success(policy ? `Saved “${saved.name}”` : `Created “${saved.name}”`);
              close();
            },
            onError: () => toast.error("The policy could not be saved. Please try again."),
          },
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>{policy ? `Edit “${policy.name}”` : "New policy"}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Board materials"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Effect</legend>
        <OptionList orientation="horizontal">
          <OptionTile
            input={
              <input
                type="radio"
                name="effect"
                checked={effect === "restrict"}
                onChange={() => setEffect("restrict")}
              />
            }
            title="Restrict"
            description="Only these groups can see it"
          />
          <OptionTile
            input={
              <input
                type="radio"
                name="effect"
                checked={effect === "exclude"}
                onChange={() => setEffect("exclude")}
              />
            }
            title="Exclude"
            description="Nobody sees it in ContextOS"
          />
        </OptionList>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Groups</legend>
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => {
            const on = chosen.has(group);
            return (
              <Chip
                key={group}
                variant="filter"
                selected={on}
                onClick={() =>
                  setChosen((current) => {
                    const next = new Set(current);
                    if (on) next.delete(group);
                    else next.add(group);
                    return next;
                  })
                }
              >
                {on ? <CheckIcon aria-hidden /> : <AddIcon aria-hidden />}
                {group}
              </Chip>
            );
          })}
        </div>
      </fieldset>
      <p className="flex items-start gap-1.5 text-xs text-on-surface-variant">
        <InfoIcon className="mt-px size-4 shrink-0" aria-hidden />
        Changes apply to search and Context Bot answers within a minute and are added to the audit
        log.
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid || save.isPending}>
          {policy ? "Save policy" : "Create policy"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Resolve a conflict between two policies by applying one of its options. */
export function ResolveConflictDialog({
  conflict,
  onOpenChange,
}: {
  conflict: AccessConflict | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={conflict !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {conflict ? <ResolveForm conflict={conflict} close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ResolveForm({ conflict, close }: { conflict: AccessConflict; close: () => void }) {
  const resolve = useResolveConflict();
  const [option, setOption] = useState(conflict.options[0]?.id ?? "");
  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        resolve.mutate(
          { id: conflict.id, optionId: option },
          {
            onSuccess: () => {
              toast.success("Conflict resolved. Search and answers update within a minute.");
              close();
            },
            onError: () => toast.error("The conflict could not be resolved. Please try again."),
          },
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>Resolve the conflict</DialogTitle>
        <DialogDescription>{conflict.title}.</DialogDescription>
      </DialogHeader>
      <OptionList aria-label="Resolution">
        {conflict.options.map((entry) => (
          <OptionTile
            key={entry.id}
            input={
              <input
                type="radio"
                name="fix"
                checked={option === entry.id}
                onChange={() => setOption(entry.id)}
              />
            }
            title={entry.label}
            description={entry.description}
          />
        ))}
      </OptionList>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!option || resolve.isPending}>
          Apply
        </Button>
      </DialogFooter>
    </form>
  );
}
