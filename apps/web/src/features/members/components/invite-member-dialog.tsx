import { zodResolver } from "@hookform/resolvers/zod";
import { InviteInputSchema, type InviteInput } from "@contextos/shared";
import { useForm } from "react-hook-form";
import type { z } from "zod";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionList, OptionTile } from "@/components/ui/option-tile";
import { Spinner } from "@/components/ui/spinner";
import { useInviteMember } from "@/features/members/api/members.queries";
import { ApiClientError } from "@/lib/api-client";

const ROLES: Array<{ value: InviteInput["role"]; title: string; description: string }> = [
  { value: "member", title: "Member", description: "Reads the hub, asks questions, contributes knowledge" },
  { value: "manager", title: "Manager", description: "Also sees direct reports' onboarding and records check-ins" },
  { value: "admin", title: "Admin", description: "Also manages members, connectors and workspace settings" },
  { value: "guest", title: "Guest", description: "Limited to the projects they are explicitly added to" },
];

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Sends a Clerk organization invitation. The requested application role is applied after acceptance. */
export function InviteMemberDialog({ open, onOpenChange }: InviteMemberDialogProps) {
  const invite = useInviteMember();
  // Input type allows the role default; the resolver yields the parsed output type.
  const form = useForm<z.input<typeof InviteInputSchema>, unknown, InviteInput>({
    resolver: zodResolver(InviteInputSchema),
    defaultValues: { email: "", role: "member" },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    invite.mutate(values, {
      onSuccess: () => {
        toast.success(`Invitation sent to ${values.email}`);
        form.reset();
        onOpenChange(false);
      },
    });
  });

  const notConfigured = invite.error instanceof ApiClientError && invite.error.status === 503;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>
              They get an email to join this organization. Their role in ContextOS applies once they
              accept.
            </DialogDescription>
          </DialogHeader>

          {notConfigured ? (
            <Banner
              tone="warning"
              title="Invitations need Clerk"
              description="This environment runs with the local development actor. Set AUTH_MODE=clerk on the API to deliver invitations."
            />
          ) : invite.isError ? (
            <Banner tone="error" title="Could not send the invitation" description={invite.error.message} />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="invite-email">Work email</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              placeholder="name@company.com"
              aria-invalid={!!errors.email}
              {...form.register("email")}
            />
            {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Role</legend>
            <OptionList>
              {ROLES.map((role) => (
                <OptionTile
                  key={role.value}
                  title={role.title}
                  description={role.description}
                  input={<input type="radio" value={role.value} {...form.register("role")} />}
                />
              ))}
            </OptionList>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? <Spinner /> : null}
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
