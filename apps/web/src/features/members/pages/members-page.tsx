import type { SystemRole } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { SectionCard } from "@/components/section-card";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  AdminPanelSettingsIcon,
  CheckIcon,
  ManageAccountsIcon,
  PersonAddIcon,
  SyncAltIcon,
  SyncIcon,
  WarningIcon,
} from "@/components/ui/icons";
import { MiniTile } from "@/components/ui/kpi-tile";
import { SearchField } from "@/components/ui/search-field";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { meQuery } from "@/features/account/api/account.queries";
import { ADMIN_ENDPOINTS } from "@/features/admin/api/admin.api";
import { membersOverviewQuery, useDirectorySync } from "@/features/admin/api/admin.queries";
import { membersQuery } from "@/features/members/api/members.queries";
import { InviteMemberDialog } from "@/features/members/components/invite-member-dialog";
import { MembersTable } from "@/features/members/components/members-table";
import { OrgStructure } from "@/features/members/components/org-structure";
import { CapabilitiesCard, RoleRequestsCard } from "@/features/members/components/role-cards";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { ApiClientError } from "@/lib/api-client";
import { formatCount, formatTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import { ResponsibilitiesPanel } from "@/features/members/components/responsibilities-panel";
import { PendingInvitationsCard } from "@/features/members/components/pending-invitations-card";

const ROLE_ORDER: SystemRole[] = ["member", "manager", "admin", "owner", "guest"];

/**
 * Members & roles (prototype `#members`): seats, role counts, role requests, the members table with
 * role changes, and what each role can do. Everything here is live: members, roles and the org
 * structure, plus seats, directory sync and role requests (platform/members-admin.routes.ts).
 */
export function MembersPage() {
  useBotContext(
    {
      chips: [
        { icon: ManageAccountsIcon, label: "Members & roles" },
        { icon: AdminPanelSettingsIcon, label: "Workspace" },
      ],
      suggestions: ["Who changed access policies this week?"],
    },
    "members",
  );
  const viewer = useViewer();
  const me = useQuery(meQuery());
  const members = useQuery(membersQuery());
  const canManage = viewer.role === "owner" || viewer.role === "admin";
  // People Ops runs departments and teams too; roles and invitations stay with admins (N-9).
  const canEditOrg = canManage || viewer.role === "hr";
  const overview = useQuery({ ...membersOverviewQuery(), enabled: canManage });
  const sync = useDirectorySync();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [text, setText] = useState("");
  const [role, setRole] = useState<SystemRole | "all">("all");
  const all = members.data ?? [];
  const q = text.trim().toLowerCase();
  const shown = all.filter(
    (member) =>
      (role === "all" || member.role === role) &&
      (!q || `${member.name} ${member.email ?? ""} ${member.team ?? ""}`.toLowerCase().includes(q)),
  );
  const roles = ROLE_ORDER.filter((entry) => all.some((member) => member.role === entry));
  const seats = overview.data?.seats;
  const directory = overview.data?.directorySync;

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker={
          seats
            ? seats.total === null
              ? formatCount(seats.used, "active member")
              : `${seats.used} of ${seats.total} seats`
            : undefined
        }
        title="Members & roles"
        description={
          canManage
            ? `Members sync from ${directory?.provider ?? "your directory"}. Roles decide what each person can see and do in ContextOS.`
            : "Who is in this workspace, what they can do, and how teams are organized."
        }
        actions={
          canManage ? (
            <>
              <Button
                variant="outline"
                disabled={sync.isPending}
                onClick={() =>
                  sync.mutate(undefined, {
                    onSuccess: (result) =>
                      toast.success(
                        result.created || result.updated || result.deactivated
                          ? `Synced with ${directory?.provider ?? "the directory"}: ${result.created} added, ${result.updated} updated, ${result.deactivated} deactivated.`
                          : `Synced with ${directory?.provider ?? "the directory"}. No changes.`,
                      ),
                    onError: () =>
                      toast.error("The directory could not be synced. Please try again."),
                  })
                }
              >
                <SyncIcon aria-hidden /> Sync now
              </Button>
              <Button onClick={() => setInviteOpen(true)}>
                <PersonAddIcon aria-hidden /> Invite people
              </Button>
            </>
          ) : null
        }
      />

      <Tabs defaultValue={viewer.role === "hr" ? "org" : "members"}>
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="org">Departments and teams</TabsTrigger>
          {canManage ? <TabsTrigger value="responsibilities">Responsibilities</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="members" className="flex flex-col gap-3 pt-4 medium:gap-4">
          {members.isPending ? (
            <Skeleton className="h-72 rounded-card" aria-busy="true" />
          ) : members.isError ? (
            members.error instanceof ApiClientError && members.error.status === 403 ? (
              <Banner
                tone="warning"
                icon={<WarningIcon />}
                title="The directory is not available to guests"
                description="Guests see only the projects they are added to. Ask an admin if you need a broader role."
              />
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>Could not load members</EmptyTitle>
                  <EmptyDescription>{members.error.message}</EmptyDescription>
                </EmptyHeader>
                <Button variant="outline" onClick={() => void members.refetch()}>
                  Try again
                </Button>
              </Empty>
            )
          ) : (
            <>
              <div
                role="group"
                aria-label="Members by role"
                className="grid grid-cols-2 gap-3 @min-[640px]:grid-cols-4"
              >
                {roles.map((entry) => (
                  <MiniTile
                    className="bg-card"
                    key={entry}
                    label={`${ROLE_LABEL[entry]}s`}
                    value={all.filter((member) => member.role === entry).length}
                  />
                ))}
              </div>
              {canManage ? <RoleRequestsCard /> : null}
              {canManage ? <PendingInvitationsCard /> : null}
              <SectionCard
                title="Members"
                action={
                  directory?.lastRunAt ? (
                    <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
                      <SyncAltIcon className="size-4" aria-hidden /> Synced from{" "}
                      {directory.provider} at {formatTime(directory.lastRunAt)}
                      <PreviewDataChip endpoint={ADMIN_ENDPOINTS.membersOverview.path} />
                    </span>
                  ) : undefined
                }
              >
                <div className="flex flex-col gap-3">
                  <SearchField
                    label="Search members"
                    value={text}
                    onValueChange={setText}
                    placeholder="Search by name or team"
                    tone="field"
                  />
                  <div role="group" aria-label="Filter by role" className="flex flex-wrap gap-2">
                    {(["all", ...roles] as const).map((entry) => (
                      <Chip
                        key={entry}
                        variant="filter"
                        selected={role === entry}
                        onClick={() => setRole(entry)}
                      >
                        {role === entry ? <CheckIcon aria-hidden /> : null}
                        {entry === "all" ? "All" : ROLE_LABEL[entry]}
                      </Chip>
                    ))}
                  </div>
                </div>
                {shown.length ? (
                  <MembersTable members={shown} viewer={{ id: me.data?.id, role: viewer.role }} />
                ) : (
                  <p className="text-sm text-on-surface-variant">No members match.</p>
                )}
                <p className="text-xs text-on-surface-variant">
                  Showing {shown.length} of {formatCount(seats?.used ?? all.length, "member")}.
                </p>
              </SectionCard>
              <CapabilitiesCard />
            </>
          )}
        </TabsContent>

        <TabsContent value="org" className="pt-4">
          <OrgStructure canManage={canEditOrg} />
        </TabsContent>

        {canManage ? (
          <TabsContent value="responsibilities" className="pt-4">
            <ResponsibilitiesPanel />
          </TabsContent>
        ) : null}
      </Tabs>

      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
