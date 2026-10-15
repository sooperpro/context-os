import type { PersonRef } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { meQuery } from "@/features/account/api/account.queries";
import { membersQuery, useGrantAssignment } from "@/features/members/api/members.queries";
import { OptionalSelect } from "@/features/members/components/optional-select";
import { projectsQuery } from "@/features/projects/api/projects.queries";

const KINDS = {
  mentor: {
    label: "Mentor",
    detail: "Follows another report's onboarding and signs off milestones.",
  },
  path_curator: {
    label: "Path curator",
    detail: "Builds tutorials for a project in Tutorial Studio.",
  },
} as const;
type Kind = keyof typeof KINDS;

/**
 * A manager makes one of their reports a mentor (for another of their reports) or a path curator
 * (for a project). The API allows managers nothing else.
 */
export function ResponsibilityDialog({
  person,
  open,
  onOpenChange,
}: {
  person: PersonRef;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? <ResponsibilityForm person={person} close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ResponsibilityForm({ person, close }: { person: PersonRef; close: () => void }) {
  const id = useId();
  const me = useQuery(meQuery());
  const members = useQuery(membersQuery());
  const projects = useQuery(projectsQuery());
  const grant = useGrantAssignment();
  const [kind, setKind] = useState<Kind>("mentor");
  const [scope, setScope] = useState("");
  const options =
    kind === "mentor"
      ? (members.data ?? [])
          .filter(
            (member) =>
              member.status === "active" &&
              member.managerId === me.data?.id &&
              member.id !== person.id,
          )
          .map((member) => ({ value: member.id, label: member.name }))
      : (projects.data?.items ?? []).map((project) => ({ value: project.id, label: project.name }));

  return (
    <>
      <DialogHeader>
        <DialogTitle>Give {person.name} a responsibility</DialogTitle>
        <DialogDescription>{KINDS[kind].detail}</DialogDescription>
      </DialogHeader>
      {grant.isError ? <p className="text-sm text-destructive">{grant.error.message}</p> : null}
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${id}-kind`}>Responsibility</Label>
          <Select
            items={Object.fromEntries(
              Object.entries(KINDS).map(([key, value]) => [key, value.label]),
            )}
            value={kind}
            onValueChange={(next) => {
              setKind(String(next) as Kind);
              setScope("");
            }}
          >
            <SelectTrigger id={`${id}-kind`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KINDS) as Kind[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {KINDS[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-scope`}>{kind === "mentor" ? "Mentoring" : "Project"}</Label>
          <OptionalSelect id={`${id}-scope`} value={scope} onChange={setScope} options={options} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button
          disabled={!scope || grant.isPending}
          onClick={() =>
            grant.mutate(
              {
                userId: person.id,
                type: kind,
                scopeType: kind === "mentor" ? "user" : "project",
                scopeId: scope,
              },
              {
                onSuccess: () => {
                  toast.success(`${person.name} is now a ${KINDS[kind].label.toLowerCase()}`);
                  close();
                },
              },
            )
          }
        >
          Give responsibility
        </Button>
      </DialogFooter>
    </>
  );
}
