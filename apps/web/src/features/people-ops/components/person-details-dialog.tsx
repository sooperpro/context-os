import type { PersonDetails, PersonDetailsInput } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WarningIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { meQuery } from "@/features/account/api/account.queries";
import { departmentsQuery, membersQuery, teamsQuery } from "@/features/members/api/members.queries";
import { OptionalSelect } from "@/features/members/components/optional-select";
import {
  personDetailsQuery,
  useUpdatePersonDetails,
} from "@/features/people-ops/api/people-ops.queries";
import { firstName } from "@/lib/format";

/** People Ops changes a person's job title, department, team or manager (role access spec §3). */
export function PersonDetailsDialog({
  personId,
  open,
  onOpenChange,
}: {
  personId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Mounted while open, so each edit starts from what is saved now. */}
        {open ? <DetailsLoader personId={personId} close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DetailsLoader({ personId, close }: { personId: string; close: () => void }) {
  const details = useQuery({ ...personDetailsQuery(personId), gcTime: 0 });
  if (details.isError)
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
        </DialogHeader>
        <Banner
          tone="error"
          icon={<WarningIcon aria-hidden />}
          title="Their details could not be loaded"
          description={details.error.message}
          actions={
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => void details.refetch()}
            >
              Try again
            </Button>
          }
        />
      </>
    );
  if (!details.data)
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
        </DialogHeader>
        <Skeleton className="h-64 rounded-lg" />
      </>
    );
  return <DetailsForm details={details.data} close={close} />;
}

function DetailsForm({ details, close }: { details: PersonDetails; close: () => void }) {
  const id = useId();
  const save = useUpdatePersonDetails(details.id);
  const departments = useQuery(departmentsQuery());
  const teams = useQuery(teamsQuery());
  const members = useQuery(membersQuery());
  const me = useQuery(meQuery());

  const [jobTitle, setJobTitle] = useState(details.jobTitle ?? "");
  const [departmentId, setDepartmentId] = useState(details.departmentId ?? "");
  const [teamId, setTeamId] = useState(details.teamId ?? "");
  const [managerId, setManagerId] = useState(details.manager?.id ?? "");

  const allTeams = teams.data ?? [];
  const teamOptions = allTeams.filter(
    (team) => !departmentId || team.departmentId === departmentId,
  );
  // Anyone active who can lead people, except the person themselves and People Ops (who can't be
  // the manager: they would then recommend and decide the same probation).
  const managerOptions = (members.data ?? []).filter(
    (member) =>
      member.status === "active" &&
      member.role !== "guest" &&
      member.id !== details.id &&
      member.id !== me.data?.id,
  );

  // A team moves them to its department; a department drops a team that is not in it.
  const chooseTeam = (next: string) => {
    setTeamId(next);
    const team = allTeams.find((entry) => entry.id === next);
    if (team) setDepartmentId(team.departmentId);
  };
  const chooseDepartment = (next: string) => {
    setDepartmentId(next);
    const team = allTeams.find((entry) => entry.id === teamId);
    if (!next || (team && team.departmentId !== next)) setTeamId("");
  };

  const changes: PersonDetailsInput = {
    ...(jobTitle.trim() !== (details.jobTitle ?? "") ? { jobTitle: jobTitle.trim() } : {}),
    ...(departmentId !== (details.departmentId ?? "")
      ? { departmentId: departmentId || null }
      : {}),
    ...(teamId !== (details.teamId ?? "") ? { teamId: teamId || null } : {}),
    ...(managerId !== (details.manager?.id ?? "") ? { managerId: managerId || null } : {}),
  };
  const changed = Object.keys(changes).length > 0;
  const loading = !departments.data || !teams.data || !members.data;

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        if (!changed) return;
        save.mutate(changes, {
          onSuccess: () => {
            toast.success(`Updated ${firstName(details.name)}’s details`);
            close();
          },
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Edit {firstName(details.name)}’s details</DialogTitle>
        <DialogDescription>
          Their job title, team and manager. Their onboarding record follows, and a new manager is
          told.
        </DialogDescription>
      </DialogHeader>
      {save.isError ? (
        <Banner
          tone="error"
          icon={<WarningIcon aria-hidden />}
          title="The details could not be saved"
          description={save.error.message}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-title`}>Job title</Label>
          <Input
            id={`${id}-title`}
            value={jobTitle}
            maxLength={200}
            placeholder="e.g. Backend Engineer"
            autoComplete="off"
            onChange={(event) => setJobTitle(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-department`}>Department</Label>
          <OptionalSelect
            id={`${id}-department`}
            value={departmentId}
            disabled={loading}
            options={(departments.data ?? []).map((entry) => ({
              value: entry.id,
              label: entry.name,
            }))}
            onChange={chooseDepartment}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-team`}>Team</Label>
          <OptionalSelect
            id={`${id}-team`}
            value={teamId}
            disabled={loading}
            options={teamOptions.map((entry) => ({ value: entry.id, label: entry.name }))}
            onChange={chooseTeam}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-manager`}>Reports to</Label>
          <OptionalSelect
            id={`${id}-manager`}
            value={managerId}
            disabled={loading}
            options={[
              ...managerOptions.map((entry) => ({ value: entry.id, label: entry.name })),
              // Whoever it is now stays pickable, even if they would not be offered afresh.
              ...(details.manager &&
              !managerOptions.some((entry) => entry.id === details.manager?.id)
                ? [{ value: details.manager.id, label: details.manager.name }]
                : []),
            ]}
            onChange={setManagerId}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!changed || save.isPending}>
          Save changes
        </Button>
      </DialogFooter>
    </form>
  );
}
