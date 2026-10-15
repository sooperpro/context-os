import { zodResolver } from "@hookform/resolvers/zod";
import { InviteFormSchema, type InviteForm } from "@contextos/shared";
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

const ROLES: Array<{ value: InviteForm["role"]; title: string; description: string }> = [
  {
    value: "member",
    title: "Member",
    description: "Reads the hub, asks questions, contributes knowledge",
  },
  {
    value: "manager",
    title: "Manager",
    description: "Also sees direct reports' onboarding and records check-ins",
  },
  {
    value: "admin",
    title: "Admin",
    description: "Also manages members, connectors and workspace settings",
  },
  {
    value: "guest",
    title: "Guest",
    description: "Limited to the projects they are explicitly added to",
  },
];

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Emails an invitation. The requested role applies when they sign in with that address. */
export function InviteMemberDialog({ open, onOpenChange }: InviteMemberDialogProps) {
  const invite = useInviteMember();
  // Input type allows the role default; the resolver yields the parsed output type.
  const form = useForm<z.input<typeof InviteFormSchema>, unknown, InviteForm>({
    resolver: zodResolver(InviteFormSchema),
    defaultValues: { email: "", role: "member" },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    invite.mutate(values, {
      onSuccess: (result) => {
        if (result.status === "already_member") toast.info(`${values.email} is already a member`);
        else if (result.delivery === "local")
          toast.success(`Invitation recorded for ${values.email}`, {
            description: "This environment doesn't send email (development mode).",
          });
        else toast.success(`Invitation sent to ${values.email}`);
        form.reset();
        onOpenChange(false);
      },
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>
              They get an email to join this workspace. Their role applies when they sign in with
              that address.
            </DialogDescription>
          </DialogHeader>

          {invite.isError ? (
            <Banner
              tone="error"
              title="Could not send the invitation"
              description={invite.error.message}
            />
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
            {errors.email ? (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            ) : null}
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
