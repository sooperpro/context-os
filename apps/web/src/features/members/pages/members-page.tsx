import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonAddIcon, WarningIcon } from "@/components/ui/icons";
import { membersQuery } from "@/features/members/api/members.queries";
import { InviteMemberDialog } from "@/features/members/components/invite-member-dialog";
import { MemberList } from "@/features/members/components/member-list";
import { OrgStructure } from "@/features/members/components/org-structure";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { ApiClientError } from "@/lib/api-client";

/** The People directory and the org structure. Guests cannot read the directory (API 403). */
export function MembersPage() {
  const viewer = useViewer();
  const members = useQuery(membersQuery());
  const [inviteOpen, setInviteOpen] = useState(false);
  const viewerRole = viewer.role;
  const canManage = viewerRole === "owner" || viewerRole === "admin";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members & roles"
        description="Who is in this workspace, what they can do, and how teams are organized."
        actions={
          canManage ? (
            <Button onClick={() => setInviteOpen(true)}>
              <PersonAddIcon aria-hidden />
              Invite
            </Button>
          ) : null
        }
      />

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="org">Departments and teams</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="pt-4">
          {members.isPending ? (
            <div className="space-y-1" aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton
                  key={i}
                  className="h-18 rounded-xs first:rounded-t-xl last:rounded-b-xl"
                />
              ))}
            </div>
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
            <MemberList members={members.data} viewerRole={viewerRole} />
          )}
        </TabsContent>

        <TabsContent value="org" className="pt-4">
          <OrgStructure canManage={canManage} />
        </TabsContent>
      </Tabs>

      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
