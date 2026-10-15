import type { WorkspaceMember } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import { projectAccessQuery, useSetProjectAccess } from "@/features/members/api/members.queries";
import { ProjectPicker } from "@/features/members/components/project-picker";

/** Which projects a guest can see. They see nothing else in the workspace. */
export function ProjectAccessDialog({
  member,
  onOpenChange,
}: {
  member: WorkspaceMember | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={member !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {member ? <ProjectAccessForm member={member} close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ProjectAccessForm({ member, close }: { member: WorkspaceMember; close: () => void }) {
  const current = useQuery(projectAccessQuery(member.id));
  const save = useSetProjectAccess(member.id);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const from = current.data?.items.map((project) => project.id) ?? [];
  const value = chosen ?? from;
  const changed =
    value.length !== from.length || value.some((projectId) => !from.includes(projectId));

  return (
    <>
      <DialogHeader>
        <DialogTitle>Projects {member.name} can see</DialogTitle>
        <DialogDescription>
          Guests see only these projects and the sources in them they can open.
        </DialogDescription>
      </DialogHeader>
      {current.isError ? (
        <p className="text-sm text-destructive">Their projects could not be loaded.</p>
      ) : current.isPending ? (
        <p className="text-sm text-on-surface-variant">Loading their projects…</p>
      ) : (
        <ProjectPicker value={value} onChange={setChosen} disabled={save.isPending} />
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button
          disabled={!changed || save.isPending || !current.data}
          onClick={() =>
            save.mutate(
              { from, to: value },
              {
                onSuccess: () => {
                  toast.success(`Saved ${member.name}'s projects`);
                  close();
                },
                onError: (error) =>
                  toast.error(error.message || "Their projects could not be saved."),
              },
            )
          }
        >
          {save.isPending ? <Spinner /> : null}
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
