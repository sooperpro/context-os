import type { Department, Team } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { Building2Icon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import {
  departmentsQuery,
  teamsQuery,
  useCreateDepartment,
  useCreateTeam,
  useDeleteDepartment,
  useDeleteTeam,
  useRenameDepartment,
  useUpdateTeam,
} from "@/features/members/api/members.queries";
import { NameDialog } from "@/features/members/components/name-dialog";

type DialogState =
  | { kind: "create-department" }
  | { kind: "rename-department"; department: Department }
  | { kind: "create-team"; department: Department; parent?: Team }
  | { kind: "rename-team"; team: Team }
  | null;

/** Departments with their teams (nested up to three levels). Owners and admins can edit. */
export function OrgStructure({ canManage }: { canManage: boolean }) {
  const departments = useQuery(departmentsQuery());
  const teams = useQuery(teamsQuery());
  const createDepartment = useCreateDepartment();
  const renameDepartment = useRenameDepartment();
  const deleteDepartment = useDeleteDepartment();
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();
  const [dialog, setDialog] = useState<DialogState>(null);

  if (departments.isPending || teams.isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    );
  }
  if (departments.isError || teams.isError) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Could not load the org structure</EmptyTitle>
          <EmptyDescription>{(departments.error ?? teams.error)?.message}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const teamsByDepartment = new Map<string, Team[]>();
  for (const team of teams.data) {
    teamsByDepartment.set(team.departmentId, [...(teamsByDepartment.get(team.departmentId) ?? []), team]);
  }

  const remove = (label: string, run: () => Promise<unknown>) =>
    run().then(() => toast.success(`${label} deleted`)).catch(() => undefined);

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={() => setDialog({ kind: "create-department" })}>
            <PlusIcon aria-hidden />
            New department
          </Button>
        </div>
      ) : null}

      {departments.data.length === 0 ? (
        <Empty className="border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2Icon />
            </EmptyMedia>
            <EmptyTitle>No departments yet</EmptyTitle>
            <EmptyDescription>
              Departments and teams let managers see their reports and let Context Bot route knowledge
              gaps to the right owners.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        departments.data.map((department) => {
          const departmentTeams = teamsByDepartment.get(department.id) ?? [];
          return (
            <Card key={department.id}>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Building2Icon className="size-5 text-on-surface-variant" aria-hidden />
                      {department.name}
                    </CardTitle>
                    <CardDescription>
                      {departmentTeams.length === 0 ? "No teams yet" : `${departmentTeams.length} team${departmentTeams.length === 1 ? "" : "s"}`}
                    </CardDescription>
                  </div>
                  {canManage ? (
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "create-team", department })}>
                        <PlusIcon aria-hidden />
                        Add team
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Manage ${department.name}`} />}>
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDialog({ kind: "rename-department", department })}>
                            <PencilIcon /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={departmentTeams.length > 0}
                            onClick={() => void remove(department.name, () => deleteDepartment.mutateAsync(department.id))}
                          >
                            <Trash2Icon /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              {departmentTeams.length > 0 ? (
                <CardContent>
                  <TeamTree
                    teams={departmentTeams}
                    parentId={null}
                    canManage={canManage}
                    onAddChild={(parent) => setDialog({ kind: "create-team", department, parent })}
                    onRename={(team) => setDialog({ kind: "rename-team", team })}
                    onDelete={(team) => void remove(team.name, () => deleteTeam.mutateAsync(team.id))}
                  />
                </CardContent>
              ) : null}
            </Card>
          );
        })
      )}

      <NameDialog
        open={dialog?.kind === "create-department"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="New department"
        label="Department name"
        submitLabel="Create"
        isPending={createDepartment.isPending}
        onSubmit={(input) => createDepartment.mutateAsync(input)}
      />
      <NameDialog
        open={dialog?.kind === "rename-department"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Rename department"
        label="Department name"
        initialName={dialog?.kind === "rename-department" ? dialog.department.name : ""}
        submitLabel="Save"
        isPending={renameDepartment.isPending}
        onSubmit={(input) =>
          dialog?.kind === "rename-department" ? renameDepartment.mutateAsync({ id: dialog.department.id, ...input }) : undefined
        }
      />
      <NameDialog
        open={dialog?.kind === "create-team"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.kind === "create-team" && dialog.parent ? `New team under ${dialog.parent.name}` : "New team"}
        description={dialog?.kind === "create-team" ? `In ${dialog.department.name}. Teams nest up to three levels.` : undefined}
        label="Team name"
        submitLabel="Create"
        isPending={createTeam.isPending}
        onSubmit={(input) =>
          dialog?.kind === "create-team"
            ? createTeam.mutateAsync({ ...input, departmentId: dialog.department.id, parentId: dialog.parent?.id ?? null })
            : undefined
        }
      />
      <NameDialog
        open={dialog?.kind === "rename-team"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Rename team"
        label="Team name"
        initialName={dialog?.kind === "rename-team" ? dialog.team.name : ""}
        submitLabel="Save"
        isPending={updateTeam.isPending}
        onSubmit={(input) => (dialog?.kind === "rename-team" ? updateTeam.mutateAsync({ id: dialog.team.id, ...input }) : undefined)}
      />
    </div>
  );
}

interface TeamTreeProps {
  teams: Team[];
  parentId: string | null;
  canManage: boolean;
  depth?: number;
  onAddChild: (parent: Team) => void;
  onRename: (team: Team) => void;
  onDelete: (team: Team) => void;
}

function TeamTree({ teams, parentId, canManage, depth = 0, onAddChild, onRename, onDelete }: TeamTreeProps) {
  const children = teams.filter((team) => team.parentId === parentId);
  if (children.length === 0) return null;
  return (
    <ul className={depth > 0 ? "mt-1 ml-6 border-l border-outline-variant/60 pl-4" : "space-y-1"}>
      {children.map((team) => {
        const hasChildren = teams.some((candidate) => candidate.parentId === team.id);
        return (
          <li key={team.id} className="space-y-1">
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-on-surface/4">
              <UsersIcon className="size-4 shrink-0 text-on-surface-variant" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">{team.name}</span>
              {depth > 0 ? (
                <StatusChip tone="neutral" icon={<UsersIcon />}>
                  Level {depth + 1}
                </StatusChip>
              ) : null}
              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`Manage ${team.name}`} />}>
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onRename(team)}>
                      <PencilIcon /> Rename
                    </DropdownMenuItem>
                    {depth < 2 ? (
                      <DropdownMenuItem onClick={() => onAddChild(team)}>
                        <PlusIcon /> Add sub-team
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" disabled={hasChildren} onClick={() => onDelete(team)}>
                      <Trash2Icon /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
            <TeamTree
              teams={teams}
              parentId={team.id}
              canManage={canManage}
              depth={depth + 1}
              onAddChild={onAddChild}
              onRename={onRename}
              onDelete={onDelete}
            />
          </li>
        );
      })}
    </ul>
  );
}
