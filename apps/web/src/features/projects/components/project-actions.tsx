import type { ProjectWithStats, SystemRole } from "@contextos/shared";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteIcon, EditIcon, MoreHorizIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDeleteProject, useUpdateProject } from "@/features/projects/api/projects.queries";
import { useViewer } from "@/features/workspace/hooks/use-viewer";

/** Who may rename and who may delete a project; the API checks the same. */
const EDITORS: readonly SystemRole[] = ["owner", "admin", "manager"];
const DELETERS: readonly SystemRole[] = ["owner", "admin"];

/** Rename or delete a project, for the roles allowed to. Nothing shows for anyone else. */
export function ProjectActions({ project }: { project: ProjectWithStats }) {
  const { role } = useViewer();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const canEdit = role !== undefined && EDITORS.includes(role);
  const canDelete = role !== undefined && DELETERS.includes(role);
  if (!canEdit) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Manage ${project.name}`} />}
        >
          <MoreHorizIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDialog("rename")}>
            <EditIcon /> Rename
          </DropdownMenuItem>
          {canDelete ? (
            <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
              <DeleteIcon /> Delete project
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={dialog !== null} onOpenChange={(open) => (open ? null : setDialog(null))}>
        <DialogContent className="sm:max-w-md">
          {dialog === "rename" ? (
            <RenameForm project={project} close={() => setDialog(null)} />
          ) : dialog === "delete" ? (
            <DeleteForm project={project} close={() => setDialog(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RenameForm({ project, close }: { project: ProjectWithStats; close: () => void }) {
  const id = useId();
  const update = useUpdateProject(project.id);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const changed =
    name.trim() !== project.name || description.trim() !== (project.description ?? "");
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate(
          { name: name.trim(), description: description.trim() },
          {
            onSuccess: () => {
              toast.success("Project saved");
              close();
            },
          },
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>Rename project</DialogTitle>
        <DialogDescription>Its address and links keep working.</DialogDescription>
      </DialogHeader>
      {update.isError ? <p className="text-sm text-destructive">{update.error.message}</p> : null}
      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <Textarea
          id={`${id}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || !changed || update.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteForm({ project, close }: { project: ProjectWithStats; close: () => void }) {
  const remove = useDeleteProject();
  const navigate = useNavigate();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete {project.name}?</DialogTitle>
        <DialogDescription>
          Its sources, knowledge items, hub and conversations are removed for everyone. This can't
          be undone.
        </DialogDescription>
      </DialogHeader>
      {remove.isError ? <p className="text-sm text-destructive">{remove.error.message}</p> : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          Keep project
        </Button>
        <Button
          variant="destructive"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(project.id, {
              onSuccess: () => {
                toast.success(`${project.name} deleted`);
                void navigate("/knowledge");
              },
            })
          }
        >
          Delete project
        </Button>
      </DialogFooter>
    </>
  );
}
