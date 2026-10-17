import { zodResolver } from "@hookform/resolvers/zod";
import { InviteFormSchema, type InviteForm } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OptionalSelect } from "@/features/members/components/optional-select";
import { ProjectPicker } from "@/features/members/components/project-picker";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { TemplatePicker } from "@/features/people-ops/components/template-picker";
import {
  departmentsQuery,
  membersQuery,
  teamsQuery,
  useInviteMember,
} from "@/features/members/api/members.queries";

const ROLES: Array<{ value: InviteForm["role"]; title: string; description: string }> = [
  {
    value: "member",
    title: "Employee",
    description: "Reads the hub, asks questions, contributes knowledge",
  },
  {
    value: "manager",
    title: "Manager",
    description: "Also sees direct reports' onboarding and records check-ins",
  },
  {
    value: "hr",
    title: "HR",
    description: "Also runs onboarding templates, people records and employment decisions",
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

const ROLE_ITEMS = Object.fromEntries(ROLES.map((option) => [option.value, option.title]));

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Emails an invitation. The role and details apply when they sign in with that address. */
export function InviteMemberDialog({ open, onOpenChange }: InviteMemberDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {/* Mounted while open, so every invite starts from a blank form. */}
        {open ? <InviteMemberForm close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function InviteMemberForm({ close }: { close: () => void }) {
  const id = useId();
  const invite = useInviteMember();
  const departments = useQuery(departmentsQuery());
  const teams = useQuery(teamsQuery());
  const members = useQuery(membersQuery());
  // Input type allows the defaults; the resolver yields the parsed output type.
  const form = useForm<z.input<typeof InviteFormSchema>, unknown, InviteForm>({
    resolver: zodResolver(InviteFormSchema),
    defaultValues: {
      email: "",
      role: "member",
      name: "",
      jobTitle: "",
      departmentId: "",
      teamId: "",
      managerId: "",
      startDate: "",
      isNewHire: false,
      templateId: "",
      projectIds: [],
    },
  });
  const errors = form.formState.errors;
  const role = useWatch({ control: form.control, name: "role" });
  const departmentId = useWatch({ control: form.control, name: "departmentId" });
  const jobTitle = useWatch({ control: form.control, name: "jobTitle" });
  const teamId = useWatch({ control: form.control, name: "teamId" });
  const isNewHire = useWatch({ control: form.control, name: "isNewHire" });

  // A chosen department narrows the teams; a chosen team fills in its department.
  const teamOptions = (teams.data ?? []).filter(
    (team) => !departmentId || team.departmentId === departmentId,
  );
  const managerOptions = (members.data ?? []).filter(
    (member) => member.status === "active" && member.role !== "guest",
  );

  const onSubmit = form.handleSubmit((values) => {
    // Only a new hire takes a template.
    invite.mutate(values.isNewHire ? values : { ...values, templateId: undefined }, {
      onSuccess: (result) => {
        if (result.status === "already_member") toast.info(`${values.email} is already a member`);
        else if (result.delivery === "local")
          toast.success(`Invitation recorded for ${values.email}`, {
            description: "This environment doesn't send email (development mode).",
          });
        else toast.success(`Invitation sent to ${values.email}`);
        close();
      },
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <DialogHeader>
        <DialogTitle>Invite a teammate</DialogTitle>
        <DialogDescription>
          They get an email to join this workspace. Their role and details apply when they sign in
          with that address.
        </DialogDescription>
      </DialogHeader>

      {invite.isError ? (
        <Banner
          tone="error"
          title="Could not send the invitation"
          description={invite.error.message}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${id}-email`}>Work email</Label>
          <Input
            id={`${id}-email`}
            type="email"
            autoComplete="off"
            placeholder="name@company.com"
            aria-invalid={!!errors.email}
            {...form.register("email")}
          />
          {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-name`}>Full name (optional)</Label>
          <Input
            id={`${id}-name`}
            autoComplete="off"
            placeholder="e.g. Noor Hassan"
            {...form.register("name")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-title`}>Job title (optional)</Label>
          <Input
            id={`${id}-title`}
            autoComplete="off"
            placeholder="e.g. Backend Engineer"
            {...form.register("jobTitle")}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${id}-role`}>Role</Label>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <Select
                items={ROLE_ITEMS}
                value={field.value}
                onValueChange={(next) => {
                  field.onChange(next);
                  // Guests are not onboarded as new hires; only guests are added to projects.
                  if (next === "guest") form.setValue("isNewHire", false);
                  else form.setValue("projectIds", []);
                }}
              >
                <SelectTrigger id={`${id}-role`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-xs text-on-surface-variant">
            {ROLES.find((option) => option.value === role)?.description}
          </p>
        </div>
      </div>

      {role === "guest" ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Projects they can see</legend>
          <p className="text-xs text-on-surface-variant">
            A guest sees nothing else. You can change this later from their row.
          </p>
          <Controller
            control={form.control}
            name="projectIds"
            render={({ field }) => (
              <ProjectPicker value={field.value ?? []} onChange={field.onChange} />
            )}
          />
        </fieldset>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Where they fit (optional)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <>
            <div className="space-y-2">
              <Label htmlFor={`${id}-department`}>Department</Label>
              <Controller
                control={form.control}
                name="departmentId"
                render={({ field }) => (
                  <OptionalSelect
                    id={`${id}-department`}
                    value={field.value ?? ""}
                    disabled={!departments.data}
                    options={(departments.data ?? []).map((entry) => ({
                      value: entry.id,
                      label: entry.name,
                    }))}
                    onChange={(next) => {
                      field.onChange(next);
                      const team = teams.data?.find(
                        (entry) => entry.id === form.getValues("teamId"),
                      );
                      if (next && team && team.departmentId !== next) form.setValue("teamId", "");
                    }}
                  />
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-team`}>Team</Label>
              <Controller
                control={form.control}
                name="teamId"
                render={({ field }) => (
                  <OptionalSelect
                    id={`${id}-team`}
                    value={field.value ?? ""}
                    disabled={!teams.data}
                    options={teamOptions.map((entry) => ({ value: entry.id, label: entry.name }))}
                    onChange={(next) => {
                      field.onChange(next);
                      const team = teams.data?.find((entry) => entry.id === next);
                      if (team) form.setValue("departmentId", team.departmentId);
                    }}
                  />
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-manager`}>Reports to</Label>
              <Controller
                control={form.control}
                name="managerId"
                render={({ field }) => (
                  <OptionalSelect
                    id={`${id}-manager`}
                    value={field.value ?? ""}
                    disabled={!members.data}
                    options={managerOptions.map((entry) => ({
                      value: entry.id,
                      label: entry.name,
                    }))}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </>

          <div className="space-y-2">
            <Label htmlFor={`${id}-start`}>Start date</Label>
            <Input
              id={`${id}-start`}
              type="date"
              aria-invalid={!!errors.startDate}
              {...form.register("startDate")}
            />
            {errors.startDate ? (
              <p className="text-xs text-destructive">{errors.startDate.message}</p>
            ) : null}
          </div>
        </div>
        {role === "guest" ? null : (
          <div className="flex items-center gap-3 rounded-md bg-pane px-3.5 py-3">
            <label htmlFor={`${id}-new-hire`} className="flex flex-1 flex-col">
              <b className="text-sm font-medium">New hire</b>
              <span className="text-xs text-on-surface-variant">
                Starts their onboarding from the start date above.
              </span>
            </label>
            <Controller
              control={form.control}
              name="isNewHire"
              render={({ field }) => (
                <Switch
                  id={`${id}-new-hire`}
                  checked={field.value ?? false}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>
        )}
        {role !== "guest" && isNewHire ? (
          // The onboarding template for their role, suggested from the job title, team and
          // department (N-18). Templates are made in Templates, not here.
          <div className="space-y-2">
            <Label htmlFor={`${id}-template`}>Onboarding template</Label>
            <Controller
              control={form.control}
              name="templateId"
              render={({ field }) => (
                <TemplatePicker
                  id={`${id}-template`}
                  role={{
                    title: jobTitle ?? "",
                    teamId: teamId?.length ? teamId : null,
                    departmentId: departmentId?.length ? departmentId : null,
                  }}
                  value={field.value?.length ? field.value : null}
                  onChange={(next) => field.onChange(next ?? "")}
                />
              )}
            />
          </div>
        ) : null}
      </fieldset>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={invite.isPending}>
          {invite.isPending ? <Spinner /> : null}
          Send invitation
        </Button>
      </DialogFooter>
    </form>
  );
}
