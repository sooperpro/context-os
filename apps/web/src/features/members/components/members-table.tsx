import type { MembershipStatus, SystemRole, WorkspaceMember } from "@contextos/shared";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PersonCell } from "@/components/person-cell";
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
import {
  CheckIcon,
  MailIcon,
  MoreHorizIcon,
  PauseIcon,
  PersonRemoveIcon,
} from "@/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUpdateMember } from "@/features/members/api/members.queries";
import { formatRelativeTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";

const STATUS: Record<
  MembershipStatus,
  { label: string; tone: "success" | "warning" | "neutral"; icon: ReactNode }
> = {
  active: { label: "Active", tone: "success", icon: <CheckIcon /> },
  suspended: { label: "Suspended", tone: "warning", icon: <PauseIcon /> },
  offboarded: { label: "Offboarded", tone: "neutral", icon: <PersonRemoveIcon /> },
};

/** Roles that widen what someone can do across the workspace; changing to them asks first. */
const ELEVATED: readonly SystemRole[] = ["owner", "admin"];

const ROLE_POWER: Partial<Record<SystemRole, string>> = {
  owner: "Owners can do everything admins can, and manage billing and ownership.",
  admin:
    "Admins manage connectors, access policies, AI settings and roles. They still can’t see onboarding records or check-in notes.",
};

interface MembersTableProps {
  members: WorkspaceMember[];
  /** The viewer: owners and admins manage roles; nobody changes their own. */
  viewer: { id: string | undefined; role: SystemRole | undefined };
}

/** The members table (prototype Members & roles): role, status and last active, with role changes in place. */
export function MembersTable({ members, viewer }: MembersTableProps) {
  const update = useUpdateMember();
  const [pending, setPending] = useState<{ member: WorkspaceMember; role: SystemRole } | null>(
    null,
  );
  const canManage = viewer.role === "owner" || viewer.role === "admin";
  const assignable: SystemRole[] =
    viewer.role === "owner"
      ? ["owner", "admin", "manager", "hr", "member", "guest"]
      : ["admin", "manager", "hr", "member", "guest"];

  const setRole = (member: WorkspaceMember, role: SystemRole) =>
    update.mutate(
      { userId: member.id, role },
      {
        onSuccess: () => {
          setPending(null);
          toast.success(
            `${member.name} is now ${role === "admin" || role === "owner" || role === "hr" ? "an" : "a"} ${ROLE_LABEL[role]}`,
          );
        },
        onError: (error) => toast.error(error.message || "The role could not be changed."),
      },
    );

  return (
    <>
      <div className="-mx-6 overflow-x-auto px-6">
        <Table className="min-w-170">
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last active</TableHead>
              {canManage ? (
                <TableHead>
                  <span className="sr-only">Manage</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const status = member.invitedAt
                ? { label: "Invited", tone: "neutral" as const, icon: <MailIcon /> }
                : STATUS[member.status];
              const self = member.id === viewer.id;
              // Only an owner may touch ownership; the API enforces it too.
              const locked = self || (member.role === "owner" && viewer.role !== "owner");
              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <PersonCell person={member} meta={member.email ?? undefined} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {member.team ?? <span className="text-on-surface-variant">—</span>}
                  </TableCell>
                  <TableCell>
                    {canManage ? (
                      <Select
                        items={ROLE_LABEL}
                        value={member.role}
                        disabled={locked || update.isPending}
                        onValueChange={(value) => {
                          const role = String(value) as SystemRole;
                          if (role === member.role) return;
                          if (ELEVATED.includes(role)) setPending({ member, role });
                          else setRole(member, role);
                        }}
                      >
                        <SelectTrigger
                          size="sm"
                          aria-label={`Role for ${member.name}`}
                          title={self ? "You can’t change your own role" : undefined}
                          className="w-36 rounded-md bg-surface-container-high shadow-none"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(assignable.includes(member.role)
                            ? assignable
                            : [member.role, ...assignable]
                          ).map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABEL[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm">{ROLE_LABEL[member.role]}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusChip tone={status.tone} icon={status.icon}>
                      {status.label}
                    </StatusChip>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap text-on-surface-variant">
                    {member.invitedAt
                      ? "Not signed in yet"
                      : member.lastActiveAt
                        ? formatRelativeTime(member.lastActiveAt)
                        : "—"}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Manage ${member.name}`}
                              disabled={locked || update.isPending}
                            />
                          }
                        >
                          <MoreHorizIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {member.status === "active" ? (
                            <DropdownMenuItem
                              onClick={() =>
                                update.mutate({ userId: member.id, status: "suspended" })
                              }
                            >
                              <PauseIcon /> Suspend
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => update.mutate({ userId: member.id, status: "active" })}
                            >
                              <CheckIcon /> Reactivate
                            </DropdownMenuItem>
                          )}
                          {member.status !== "offboarded" ? (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() =>
                                update.mutate({ userId: member.id, status: "offboarded" })
                              }
                            >
                              <PersonRemoveIcon /> Offboard
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Dialog open={pending !== null} onOpenChange={(open) => (open ? null : setPending(null))}>
        <DialogContent className="sm:max-w-md">
          {pending ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  Give {pending.member.name} the {ROLE_LABEL[pending.role]} role?
                </DialogTitle>
                <DialogDescription>{ROLE_POWER[pending.role]}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPending(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={update.isPending}
                  onClick={() => setRole(pending.member, pending.role)}
                >
                  Make {ROLE_LABEL[pending.role]}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
