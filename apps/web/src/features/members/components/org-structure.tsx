import type { Department, Team } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import {
  AddIcon,
  CloseIcon,
  DeleteIcon,
  DomainIcon,
  EditIcon,
  GroupIcon,
  MoreHorizIcon,
  PersonAddIcon,
  SupervisorAccountIcon,
} from "@/components/ui/icons";
import type { OrgPerson } from "@/features/members/api/members.api";
import {
  departmentsQuery,
  orgPeopleQuery,
  teamsQuery,
  useAddTeamMembers,
  useCreateDepartment,
  useCreateTeam,
  useDeleteDepartment,
  useDeleteTeam,
  useRemoveTeamMember,
  useRenameDepartment,
  useUpdateTeam,
} from "@/features/members/api/members.queries";
import { NameDialog } from "@/features/members/components/name-dialog";
import { TeamPeopleDialog } from "@/features/members/components/team-people-dialog";

type DialogState =
  | { kind: "create-department" }
  | { kind: "rename-department"; department: Department }
  | { kind: "create-team"; department: Department; parent?: Team }
  | { kind: "rename-team"; team: Team }
  | { kind: "add-people"; team: Team }
  | { kind: "set-lead"; team: Team }
  | null;

/**
 * Departments with their teams (nested up to three levels), who is on each team and who leads it.
 * Owners, admins and People Ops can edit (N-9).
 */
export function OrgStructure({ canManage }: { canManage: boolean }) {
  const departments = useQuery(departmentsQuery());
  const teams = useQuery(teamsQuery());
  const people = useQuery(orgPeopleQuery());
  const addPeople = useAddTeamMembers();
  const removePerson = useRemoveTeamMember();
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
    teamsByDepartment.set(team.departmentId, [
      ...(teamsByDepartment.get(team.departmentId) ?? []),
      team,
    ]);
  }

  const remove = (label: string, run: () => Promise<unknown>) =>
    run()
      .then(() => toast.success(`${label} deleted`))
      .catch(() => undefined);
  const everyone = people.data ?? [];
  const teamNames = new Map(teams.data.map((team) => [team.id, team.name]));
  const names = new Map(everyone.map((person) => [person.id, person.name]));
  const membersOf = (team: Team) => everyone.filter((person) => person.teamId === team.id);
  const pickerTeam =
    dialog?.kind === "add-people" || dialog?.kind === "set-lead" ? dialog.team : null;

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={() => setDialog({ kind: "create-department" })}>
            <AddIcon aria-hidden />
            New department
          </Button>
        </div>
      ) : null}

      {departments.data.length === 0 ? (
        <Empty className="border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DomainIcon />
            </EmptyMedia>
            <EmptyTitle>No departments yet</EmptyTitle>
            <EmptyDescription>
              Departments and teams let managers see their reports and let Context Bot route
              knowledge gaps to the right owners.
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
                      <DomainIcon className="size-5 text-on-surface-variant" aria-hidden />
                      {department.name}
                    </CardTitle>
                    <CardDescription>
                      {departmentTeams.length === 0
                        ? "No teams yet"
                        : `${departmentTeams.length} team${departmentTeams.length === 1 ? "" : "s"}`}
                    </CardDescription>
                  </div>
                  {canManage ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDialog({ kind: "create-team", department })}
                      >
                        <AddIcon aria-hidden />
                        Add team
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Manage ${department.name}`}
                            />
                          }
                        >
                          <MoreHorizIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setDialog({ kind: "rename-department", department })}
                          >
                            <EditIcon /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={departmentTeams.length > 0}
                            onClick={() =>
                              void remove(department.name, () =>
                                deleteDepartment.mutateAsync(department.id),
                              )
                            }
                          >
                            <DeleteIcon /> Delete
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
                    membersOf={membersOf}
                    leadName={(team) => (team.leadId ? names.get(team.leadId) : undefined)}
                    onAddChild={(parent) => setDialog({ kind: "create-team", department, parent })}
                    onRename={(team) => setDialog({ kind: "rename-team", team })}
                    onAddPeople={(team) => setDialog({ kind: "add-people", team })}
                    onSetLead={(team) => setDialog({ kind: "set-lead", team })}
                    onRemovePerson={(team, person) =>
                      removePerson.mutate(
                        { teamId: team.id, userId: person.id },
                        {
                          onSuccess: () =>
                            toast.success(`${person.name} is no longer on ${team.name}`),
                          onError: (error) => toast.error(error.message),
                        },
                      )
                    }
                    onDelete={(team) =>
                      void remove(team.name, () => deleteTeam.mutateAsync(team.id))
                    }
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
          dialog?.kind === "rename-department"
            ? renameDepartment.mutateAsync({ id: dialog.department.id, ...input })
            : undefined
        }
      />
      <NameDialog
        open={dialog?.kind === "create-team"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={
          dialog?.kind === "create-team" && dialog.parent
            ? `New team under ${dialog.parent.name}`
            : "New team"
        }
        description={
          dialog?.kind === "create-team"
            ? `In ${dialog.department.name}. Teams nest up to three levels.`
            : undefined
        }
        label="Team name"
        submitLabel="Create"
        isPending={createTeam.isPending}
        onSubmit={(input) =>
          dialog?.kind === "create-team"
            ? createTeam.mutateAsync({
                ...input,
                departmentId: dialog.department.id,
                parentId: dialog.parent?.id ?? null,
              })
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
        onSubmit={(input) =>
          dialog?.kind === "rename-team"
            ? updateTeam.mutateAsync({ id: dialog.team.id, ...input })
            : undefined
        }
      />
      <TeamPeopleDialog
        open={dialog?.kind === "add-people"}
        onOpenChange={(open) => !open && setDialog(null)}
        mode="add"
        title={pickerTeam ? `Add people to ${pickerTeam.name}` : "Add people"}
        description="They join the team and its department. Each person is told."
        submitLabel="Add"
        team={pickerTeam}
        people={everyone}
        teamNames={teamNames}
        isPending={addPeople.isPending}
        onSubmit={(userIds) =>
          pickerTeam
            ? addPeople.mutateAsync({ teamId: pickerTeam.id, userIds }).then(
                ({ added }) =>
                  toast.success(
                    `${added.length === 1 ? "1 person" : `${added.length} people`} added to ${pickerTeam.name}`,
                  ),
                (error: Error) => {
                  toast.error(error.message);
                  throw error;
                },
              )
            : Promise.resolve()
        }
      />
      <TeamPeopleDialog
        open={dialog?.kind === "set-lead"}
        onOpenChange={(open) => !open && setDialog(null)}
        mode="lead"
        title={pickerTeam ? `Lead of ${pickerTeam.name}` : "Team lead"}
        description="Optional. The lead shows first on People › Teams and is told."
        submitLabel="Save"
        team={pickerTeam}
        people={everyone}
        teamNames={teamNames}
        isPending={updateTeam.isPending}
        onSubmit={(userIds) => {
          // "No lead" is the empty choice.
          const leadId = userIds.find(Boolean) ?? null;
          return pickerTeam
            ? updateTeam.mutateAsync({ id: pickerTeam.id, leadId }).then(
                () => toast.success(leadId ? "Team lead saved" : "Team lead removed"),
                (error: Error) => {
                  toast.error(error.message);
                  throw error;
                },
              )
            : Promise.resolve();
        }}
      />
    </div>
  );
}

interface TeamTreeProps {
  teams: Team[];
  parentId: string | null;
  canManage: boolean;
  depth?: number;
  membersOf: (team: Team) => OrgPerson[];
  leadName: (team: Team) => string | undefined;
  onAddChild: (parent: Team) => void;
  onRename: (team: Team) => void;
  onAddPeople: (team: Team) => void;
  onSetLead: (team: Team) => void;
  onRemovePerson: (team: Team, person: OrgPerson) => void;
  onDelete: (team: Team) => void;
}

function TeamTree(props: TeamTreeProps) {
  const { teams, parentId, canManage, depth = 0, membersOf, leadName } = props;
  const { onAddChild, onRename, onAddPeople, onSetLead, onRemovePerson, onDelete } = props;
  const children = teams.filter((team) => team.parentId === parentId);
  if (children.length === 0) return null;
  return (
    <ul className={depth > 0 ? "mt-1 ml-6 border-l border-outline-variant/60 pl-4" : "space-y-1"}>
      {children.map((team) => {
        const hasChildren = teams.some((candidate) => candidate.parentId === team.id);
        const members = membersOf(team);
        const lead = leadName(team);
        return (
          <li key={team.id} className="space-y-1">
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-on-surface/4">
              <GroupIcon className="size-4 shrink-0 text-on-surface-variant" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{team.name}</span>
                <span className="truncate text-xs text-on-surface-variant">
                  {members.length === 1 ? "1 person" : `${members.length} people`}
                  {lead ? ` · Lead: ${lead}` : ""}
                </span>
              </span>
              {depth > 0 ? (
                <StatusChip tone="neutral" icon={<GroupIcon />}>
                  Level {depth + 1}
                </StatusChip>
              ) : null}
              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon-xs" aria-label={`Manage ${team.name}`} />
                    }
                  >
                    <MoreHorizIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onAddPeople(team)}>
                      <PersonAddIcon /> Add people
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onSetLead(team)}>
                      <SupervisorAccountIcon /> Set team lead
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onRename(team)}>
                      <EditIcon /> Rename
                    </DropdownMenuItem>
                    {depth < 2 ? (
                      <DropdownMenuItem onClick={() => onAddChild(team)}>
                        <AddIcon /> Add sub-team
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={hasChildren || members.length > 0}
                      onClick={() => onDelete(team)}
                    >
                      <DeleteIcon /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
            {members.length ? (
              <ul aria-label={`People on ${team.name}`} className="ml-8 flex flex-wrap gap-1.5">
                {members.map((person) => (
                  <li
                    key={person.id}
                    className="inline-flex h-7 items-center gap-1 rounded-sm bg-surface-container ps-2.5 pe-1 text-xs"
                  >
                    {person.name}
                    {canManage ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${person.name} from ${team.name}`}
                        onClick={() => onRemovePerson(team, person)}
                      >
                        <CloseIcon />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <TeamTree {...props} parentId={team.id} depth={depth + 1} />
          </li>
        );
      })}
    </ul>
  );
}
