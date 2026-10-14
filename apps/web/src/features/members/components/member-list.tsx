import type { MembershipStatus, SystemRole, WorkspaceMember } from "@contextos/shared";
import { CheckIcon, MoreHorizontalIcon, PauseIcon, UserMinusIcon, UserRoundIcon } from "lucide-react";
import { Avatar, AvatarFallback, avatarToneFor } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedItemTrail,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { StatusChip } from "@/components/ui/status-chip";
import { useUpdateMember } from "@/features/members/api/members.queries";
import { initialsOf } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";

const STATUS: Record<MembershipStatus, { label: string; tone: "success" | "warning" | "neutral"; icon: React.ReactNode }> = {
  active: { label: "Active", tone: "success", icon: <CheckIcon /> },
  suspended: { label: "Suspended", tone: "warning", icon: <PauseIcon /> },
  offboarded: { label: "Offboarded", tone: "neutral", icon: <UserMinusIcon /> },
};

interface MemberListProps {
  members: WorkspaceMember[];
  /** The viewer's role; owners and admins get the management menu. */
  viewerRole: SystemRole | undefined;
}

export function MemberList({ members, viewerRole }: MemberListProps) {
  const update = useUpdateMember();
  const canManage = viewerRole === "owner" || viewerRole === "admin";
  const assignableRoles: SystemRole[] =
    viewerRole === "owner" ? ["owner", "admin", "manager", "member", "guest"] : ["admin", "manager", "member", "guest"];

  return (
    <SegmentedList aria-label="Members">
      {members.map((member) => {
        const status = STATUS[member.status];
        // Only an owner may touch ownership; the API enforces it too.
        const locked = member.role === "owner" && viewerRole !== "owner";
        return (
          <SegmentedItem key={member.id}>
            <Avatar tone={avatarToneFor(member.id)}>
              <AvatarFallback>{initialsOf(member.name) || <UserRoundIcon className="size-5" />}</AvatarFallback>
            </Avatar>
            <SegmentedItemBody>
              <SegmentedItemTitle>{member.name}</SegmentedItemTitle>
              <SegmentedItemMeta>
                <span>{ROLE_LABEL[member.role]}</span>
              </SegmentedItemMeta>
            </SegmentedItemBody>
            <SegmentedItemTrail>
              <StatusChip tone={status.tone} icon={status.icon}>
                {status.label}
              </StatusChip>
              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-sm" aria-label={`Manage ${member.name}`} disabled={locked || update.isPending} />}
                  >
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Role</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={member.role}
                      onValueChange={(role) => update.mutate({ userId: member.id, role: role as SystemRole })}
                    >
                      {assignableRoles.map((role) => (
                        <DropdownMenuRadioItem key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    {member.status === "active" ? (
                      <DropdownMenuItem onClick={() => update.mutate({ userId: member.id, status: "suspended" })}>
                        <PauseIcon /> Suspend
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => update.mutate({ userId: member.id, status: "active" })}>
                        <CheckIcon /> Reactivate
                      </DropdownMenuItem>
                    )}
                    {member.status !== "offboarded" ? (
                      <DropdownMenuItem variant="destructive" onClick={() => update.mutate({ userId: member.id, status: "offboarded" })}>
                        <UserMinusIcon /> Offboard
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </SegmentedItemTrail>
          </SegmentedItem>
        );
      })}
    </SegmentedList>
  );
}
