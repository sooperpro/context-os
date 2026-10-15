import type { RoleRequestInput, SystemRole } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScheduleIcon } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { OptionList, OptionTile } from "@/components/ui/option-tile";
import { StatusChip } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";
import { myRoleRequestsQuery, useRequestRole } from "@/features/admin/api/admin.queries";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";

const REQUESTABLE: Array<{ role: RoleRequestInput["role"]; description: string }> = [
  { role: "member", description: "Learn, find knowledge and ask Context Bot." },
  { role: "manager", description: "Support your team's onboarding, check-ins and probation." },
  {
    role: "hr",
    description: "Run onboarding across the company, templates and probation decisions.",
  },
  { role: "admin", description: "Manage members, connectors, access policies and AI settings." },
];

/**
 * "Your role" (role access spec §1 and §3): nobody can raise their own role, but anyone can ask.
 * An admin approves or declines on Members & roles; the outcome arrives as a notification.
 */
export function RoleRequestCard({ role }: { role: SystemRole }) {
  const requests = useQuery(myRoleRequestsQuery());
  const [open, setOpen] = useState(false);
  const pending = requests.data?.items.find((entry) => entry.status === "open");
  const last = requests.data?.items.find((entry) => entry.status !== "open");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your role</CardTitle>
        <CardDescription>
          {ROLE_LABEL[role]}. Roles decide what you can see and do in ContextOS.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-2">
        {pending ? (
          <StatusChip tone="neutral" icon={<ScheduleIcon />}>
            {ROLE_LABEL[pending.role]} requested {formatDate(pending.requestedAt)}, waiting for an
            admin
          </StatusChip>
        ) : (
          <>
            {last ? (
              <p className="text-xs text-on-surface-variant">
                Your request to become {ROLE_LABEL[last.role]} was {last.status}
                {last.decidedAt ? ` on ${formatDate(last.decidedAt)}` : ""}.
              </p>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={requests.isPending || role === "guest"}
              onClick={() => setOpen(true)}
            >
              Request a different role
            </Button>
          </>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {open ? <RequestForm current={role} close={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RequestForm({ current, close }: { current: SystemRole; close: () => void }) {
  const request = useRequestRole();
  const reasonId = useId();
  const options = REQUESTABLE.filter((entry) => entry.role !== current);
  const [role, setRole] = useState<RoleRequestInput["role"]>(options[0]?.role ?? "member");
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 3;
  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        request.mutate(
          { role, reason: reason.trim() },
          {
            onSuccess: () => {
              toast.success("Request sent. An admin will approve or decline it.");
              close();
            },
            onError: (error) => toast.error(error.message),
          },
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>Request a different role</DialogTitle>
        <DialogDescription>
          Admins see your request on Members & roles. You can’t change your own role.
        </DialogDescription>
      </DialogHeader>
      <OptionList aria-label="Role">
        {options.map((entry) => (
          <OptionTile
            key={entry.role}
            input={
              <input
                type="radio"
                name="role"
                checked={role === entry.role}
                onChange={() => setRole(entry.role)}
              />
            }
            title={ROLE_LABEL[entry.role]}
            description={entry.description}
          />
        ))}
      </OptionList>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={reasonId}>Why do you need it?</Label>
        <Textarea
          id={reasonId}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. I'm leading the new Billing team from November"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid || request.isPending}>
          Send request
        </Button>
      </DialogFooter>
    </form>
  );
}
