import type { RoleRequest } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/section-card";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircleFilledIcon, RemoveIcon } from "@/components/ui/icons";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedList,
} from "@/components/ui/segmented-list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ADMIN_ENDPOINTS as E } from "@/features/admin/api/admin.api";
import { roleRequestsQuery, useDecideRoleRequest } from "@/features/admin/api/admin.queries";
import { CAPABILITIES, CAPABILITY_ROLES } from "@/features/admin/admin-meta";
import { firstName, formatShortDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";

const article = (role: RoleRequest["role"]) => (role === "admin" || role === "owner" ? "an" : "a");

/** Open role requests (prototype "Role requests"): approve or decline; making someone an admin asks first. */
export function RoleRequestsCard() {
  const query = useQuery(roleRequestsQuery());
  const decide = useDecideRoleRequest();
  const [confirming, setConfirming] = useState<RoleRequest | null>(null);
  const items = query.data?.items ?? [];

  const run = (request: RoleRequest, decision: "approve" | "decline") =>
    decide.mutate(
      { id: request.id, decision },
      {
        onSuccess: () => {
          setConfirming(null);
          toast.success(
            decision === "approve"
              ? `${request.person.name} is now ${article(request.role)} ${ROLE_LABEL[request.role]}`
              : `Declined. ${firstName(request.person.name)} has been told why.`,
          );
        },
        onError: () => toast.error("The request could not be updated. Please try again."),
      },
    );

  // Nothing pending: the card goes away, as in the reference.
  if (query.isSuccess && !items.length) return null;
  return (
    <SectionCard
      title="Role requests"
      count={query.data ? items.length : undefined}
      endpoint={E.roleRequests.path}
      status={query}
    >
      <SegmentedList>
        {items.map((request) => (
          <SegmentedItem key={request.id} className="flex-wrap">
            <PersonAvatar person={request.person} size="md" />
            <SegmentedItemBody className="min-w-50">
              <SegmentedItemTitle className="whitespace-normal">
                {request.person.name} wants the {ROLE_LABEL[request.role]} role
              </SegmentedItemTitle>
              <SegmentedItemMeta className="whitespace-normal">
                “{request.reason}” · {formatShortDate(request.requestedAt)}
              </SegmentedItemMeta>
            </SegmentedItemBody>
            <span className="flex gap-1">
              <Button
                size="xs"
                variant="ghost"
                disabled={decide.isPending}
                onClick={() => run(request, "decline")}
              >
                Decline
              </Button>
              <Button
                size="xs"
                disabled={decide.isPending}
                onClick={() =>
                  request.role === "admin" || request.role === "owner"
                    ? setConfirming(request)
                    : run(request, "approve")
                }
              >
                Approve
              </Button>
            </span>
          </SegmentedItem>
        ))}
      </SegmentedList>
      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => (open ? null : setConfirming(null))}
      >
        <DialogContent className="sm:max-w-md">
          {confirming ? (
            <>
              <DialogHeader>
                <DialogTitle>Make {confirming.person.name} an Admin?</DialogTitle>
                <DialogDescription>
                  Admins can manage connectors, access policies, AI settings and roles for every
                  member.
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm text-on-surface-variant">
                They still can’t see onboarding records or check-in notes.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
                <Button disabled={decide.isPending} onClick={() => run(confirming, "approve")}>
                  Make Admin
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

/** "What each role can do" (prototype `.table.perm`): capabilities by persona. */
export function CapabilitiesCard() {
  return (
    <SectionCard title="What each role can do">
      <div className="-mx-6 overflow-x-auto px-6">
        <Table className="min-w-150">
          <TableHeader>
            <TableRow>
              <TableHead>Capability</TableHead>
              {CAPABILITY_ROLES.map((role) => (
                <TableHead key={role} className="text-center">
                  {role}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {CAPABILITIES.map(([capability, allowed]) => (
              <TableRow key={capability} className="border-0 hover:bg-transparent">
                <TableHead
                  scope="row"
                  className="h-12 rounded-none border-t-2 border-card bg-pane px-3 text-sm font-normal whitespace-normal text-on-surface"
                >
                  {capability}
                </TableHead>
                {allowed.map((yes, index) => (
                  <TableCell key={CAPABILITY_ROLES[index]} className="h-12 text-center">
                    {yes ? (
                      <CheckCircleFilledIcon className="inline size-5 text-success" aria-hidden />
                    ) : (
                      <RemoveIcon className="inline size-5 text-outline-variant" aria-hidden />
                    )}
                    <span className="sr-only">
                      {CAPABILITY_ROLES[index]}: {yes ? "yes" : "no"}
                    </span>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-on-surface-variant">
        Managers see only their own reports. Admins don’t see onboarding records or check-in notes.
      </p>
    </SectionCard>
  );
}
