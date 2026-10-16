import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddIcon } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AssignmentRow } from "@/features/members/api/members.api";
import {
  assignmentsQuery,
  membersQuery,
  useGrantAssignment,
  useRemoveAssignment,
} from "@/features/members/api/members.queries";
import { OptionalSelect } from "@/features/members/components/optional-select";
import { projectsQuery } from "@/features/projects/api/projects.queries";
import { currentWorkspaceQuery } from "@/features/workspace/api/workspace.queries";

const LABEL: Record<string, string> = {
  domain_owner: "Domain owner",
  path_curator: "Path curator",
  mentor: "Mentor",
  bounty_sponsor: "Bounty sponsor",
  department_head: "Department head",
  rewards_approver: "Rewards approver",
  review_cycle_admin: "Review cycle admin",
};

/** What can be granted here, and what it means. */
const GRANTABLE = {
  domain_owner:
    "Confirms, marks stale or disputes knowledge in a project, and reviews proposed answers.",
  path_curator: "Builds and maintains learning content for a project.",
  mentor: "Follows one person's onboarding and signs off their milestones.",
} as const;
type Grantable = keyof typeof GRANTABLE;
const WORKSPACE = "workspace";

/**
 * Responsibilities (PRD §6.5): who owns which knowledge, curates which learning, mentors whom.
 * Admins only; the API refuses everyone else.
 */
export function ResponsibilitiesPanel() {
  const assignments = useQuery(assignmentsQuery());
  const members = useQuery(membersQuery());
  const projects = useQuery(projectsQuery());
  const remove = useRemoveAssignment();
  const [granting, setGranting] = useState(false);

  const nameOf = (userId: string) =>
    members.data?.find((member) => member.id === userId)?.name ?? "Former member";
  const projectName = (projectId: string) =>
    projects.data?.items.find((project) => project.id === projectId)?.name ?? "A deleted project";
  const covers = (row: AssignmentRow) => {
    if (row.scopeType === "workspace") return "The whole workspace";
    if (row.scopeType === "project") return projectName(row.scopeId);
    if (row.scopeType === "user") return nameOf(row.scopeId);
    if (row.scopeType === "section") {
      const [projectId = "", section = ""] = row.scopeId.split(":");
      return `${projectName(projectId)} · ${section.replaceAll("_", " ")}`;
    }
    return row.scopeId;
  };
  const rows = [...(assignments.data?.items ?? [])].sort(
    (a, b) => nameOf(a.userId).localeCompare(nameOf(b.userId)) || a.type.localeCompare(b.type),
  );

  return (
    <SectionCard
      title="Responsibilities"
      status={assignments}
      endpoint="/v1/assignments"
      action={
        <Button size="sm" onClick={() => setGranting(true)}>
          <AddIcon aria-hidden /> Grant
        </Button>
      }
    >
      <p className="text-sm text-on-surface-variant">
        Domain owners keep a project's knowledge right: only they can confirm, mark stale or dispute
        items. Without one, nobody can.
      </p>
      {rows.length ? (
        <div className="-mx-6 overflow-x-auto px-6">
          <Table className="min-w-140">
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Responsibility</TableHead>
                <TableHead>Covers</TableHead>
                <TableHead>
                  <span className="sr-only">Remove</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm">{nameOf(row.userId)}</TableCell>
                  <TableCell className="text-sm">{LABEL[row.type] ?? row.type}</TableCell>
                  <TableCell className="text-sm">{covers(row)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={remove.isPending}
                      aria-label={`Remove ${nameOf(row.userId)} as ${(LABEL[row.type] ?? row.type).toLowerCase()} of ${covers(row)}`}
                      onClick={() =>
                        remove.mutate(row.id, {
                          onSuccess: () => toast.success("Responsibility removed"),
                          onError: (error) =>
                            toast.error(error.message || "It could not be removed."),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : assignments.data ? (
        <p className="text-sm text-on-surface-variant">Nobody holds a responsibility yet.</p>
      ) : null}
      <GrantDialog open={granting} onOpenChange={setGranting} />
    </SectionCard>
  );
}

function GrantDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted while open, so every grant starts blank. */}
        {open ? <GrantForm close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function GrantForm({ close }: { close: () => void }) {
  const id = useId();
  const members = useQuery(membersQuery());
  const projects = useQuery(projectsQuery());
  const workspace = useQuery(currentWorkspaceQuery());
  const grant = useGrantAssignment();
  const [type, setType] = useState<Grantable>("domain_owner");
  const [userId, setUserId] = useState("");
  const [scope, setScope] = useState("");

  // Guests can't hold responsibilities (the API refuses them).
  const people = (members.data ?? [])
    .filter((member) => member.status === "active" && member.role !== "guest")
    .map((member) => ({ value: member.id, label: member.name }));
  const scopeOptions =
    type === "mentor"
      ? people.filter((person) => person.value !== userId)
      : [
          ...(type === "domain_owner" ? [{ value: WORKSPACE, label: "The whole workspace" }] : []),
          ...(projects.data?.items ?? []).map((project) => ({
            value: project.id,
            label: project.name,
          })),
        ];
  const ready = Boolean(userId && scope && workspace.data);

  const submit = () =>
    grant.mutate(
      {
        userId,
        type,
        scopeType: type === "mentor" ? "user" : scope === WORKSPACE ? "workspace" : "project",
        scopeId: scope === WORKSPACE ? workspace.data!.id : scope,
      },
      {
        onSuccess: () => {
          toast.success("Responsibility granted");
          close();
        },
      },
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Grant a responsibility</DialogTitle>
        <DialogDescription>{GRANTABLE[type]}</DialogDescription>
      </DialogHeader>
      {grant.isError ? <p className="text-sm text-destructive">{grant.error.message}</p> : null}
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${id}-type`}>Responsibility</Label>
          <Select
            items={Object.fromEntries(Object.keys(GRANTABLE).map((key) => [key, LABEL[key]]))}
            value={type}
            onValueChange={(next) => {
              setType(String(next) as Grantable);
              setScope("");
            }}
          >
            <SelectTrigger id={`${id}-type`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(GRANTABLE).map((key) => (
                <SelectItem key={key} value={key}>
                  {LABEL[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-person`}>Person</Label>
          <OptionalSelect
            id={`${id}-person`}
            value={userId}
            onChange={setUserId}
            options={people}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-scope`}>{type === "mentor" ? "Mentoring" : "Project"}</Label>
          <OptionalSelect
            id={`${id}-scope`}
            value={scope}
            onChange={setScope}
            options={scopeOptions}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button disabled={!ready || grant.isPending} onClick={submit}>
          {grant.isPending ? <Spinner /> : null}
          Grant
        </Button>
      </DialogFooter>
    </>
  );
}
