import type { SystemRole } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { MailIcon } from "@/components/ui/icons";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemTitle,
  SegmentedList,
} from "@/components/ui/segmented-list";
import {
  pendingInvitationsQuery,
  useRevokeInvitation,
} from "@/features/members/api/members.queries";
import { formatRelativeTime, formatShortDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";

/** Invitations nobody has accepted yet, with Revoke. Shown to admins when there are any. */
export function PendingInvitationsCard() {
  const invitations = useQuery(pendingInvitationsQuery());
  const revoke = useRevokeInvitation();
  if (!invitations.data?.length) return null;
  return (
    <SectionCard title="Pending invitations" count={invitations.data.length}>
      <SegmentedList aria-label="Pending invitations">
        {invitations.data.map((invitation) => {
          const role = invitation.data.role as SystemRole | undefined;
          return (
            <SegmentedItem key={invitation.id}>
              <SegmentedItemLead tone="neutral" size="sm">
                <MailIcon />
              </SegmentedItemLead>
              <SegmentedItemBody>
                <SegmentedItemTitle>
                  {invitation.data.name ?? invitation.data.email}
                </SegmentedItemTitle>
                <span className="text-xs text-on-surface-variant">
                  {[
                    invitation.data.name ? invitation.data.email : null,
                    role ? ROLE_LABEL[role] : null,
                    `sent ${formatRelativeTime(invitation.createdAt)}`,
                    invitation.data.expiresAt
                      ? `expires ${formatShortDate(invitation.data.expiresAt)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </SegmentedItemBody>
              <Button
                size="xs"
                variant="ghost"
                disabled={revoke.isPending}
                aria-label={`Revoke the invitation to ${invitation.data.email}`}
                onClick={() =>
                  revoke.mutate(invitation.id, {
                    onSuccess: () =>
                      toast.success(`Invitation to ${invitation.data.email} revoked`),
                    onError: (error) =>
                      toast.error(error.message || "The invitation could not be revoked."),
                  })
                }
              >
                Revoke
              </Button>
            </SegmentedItem>
          );
        })}
      </SegmentedList>
    </SectionCard>
  );
}
