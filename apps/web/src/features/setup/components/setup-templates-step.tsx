import type { SetupRole, SetupRoles } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  AddIcon,
  CheckCircleIcon,
  DeleteIcon,
  EditIcon,
  RadioButtonUncheckedIcon,
  SmartToyIcon,
  WarningIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { templatePath } from "@/features/people-ops/people-ops-meta";
import {
  setupRolesQuery,
  useGenerateSetupTemplates,
  useSaveSetupRoles,
} from "@/features/setup/api/setup.queries";

type Role = SetupRoles["roles"][number];
const NONE = "none";

const asInput = (role: Pick<Role, "title" | "departmentId" | "teamId">): SetupRole => ({
  title: role.title,
  departmentId: role.departmentId,
  teamId: role.teamId,
});

function TemplateState({ role }: { role: Role }) {
  const template = role.template;
  if (!template) return <StatusChip icon={<RadioButtonUncheckedIcon />}>No template</StatusChip>;
  if (template.failed)
    return (
      <StatusChip tone="error" icon={<WarningIcon />}>
        Couldn’t be drafted
      </StatusChip>
    );
  if (template.generating)
    return (
      <StatusChip tone="ai" icon={<SmartToyIcon />}>
        Drafting…
      </StatusChip>
    );
  return template.status === "published" ? (
    <StatusChip tone="success" icon={<CheckCircleIcon />}>
      Published
    </StatusChip>
  ) : (
    <StatusChip tone="info" icon={<EditIcon />}>
      Draft · waiting for review
    </StatusChip>
  );
}

/**
 * Setup's "Onboarding templates" step (N-18): every role in the company (job title and department,
 * from people, invitations and roles added here before hiring) gets a template drafted from the
 * Knowledge Hub at once, from a one-time allowance. People Ops then review and publish each one.
 */
export function SetupTemplatesStep() {
  const ids = { title: useId(), department: useId(), team: useId() };
  const query = useQuery(setupRolesQuery());
  const save = useSaveSetupRoles();
  const generate = useGenerateSetupTemplates();
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState(NONE);
  const [team, setTeam] = useState(NONE);

  if (query.isPending) return <Skeleton className="h-40" aria-busy="true" />;
  if (query.isError)
    return (
      <Banner
        tone="error"
        icon={<WarningIcon />}
        title="The roles couldn’t be loaded"
        description={query.error.message}
      />
    );
  const { roles, departments, allowance } = query.data;
  const missing = roles.filter((role) => !role.template || role.template.failed);
  const planned = roles.filter((role) => role.planned).map(asInput);
  const teamOptions = departments.find((entry) => entry.id === department)?.teams ?? [];

  const run = (list: Role[]) =>
    generate.mutate(list.map(asInput), {
      onSuccess: (result) => {
        if (result.started)
          toast.success(
            `Drafting ${result.started} template${result.started === 1 ? "" : "s"}. People Ops are told as each one is ready to review.`,
          );
        if (result.stopped) toast.error(result.stopped);
      },
      onError: (error) => toast.error(error.message),
    });
  const addRole = () => {
    if (title.trim().length < 2) return;
    save.mutate(
      [
        ...planned,
        {
          title: title.trim(),
          departmentId: department === NONE ? null : department,
          teamId: team === NONE ? null : team,
        },
      ],
      {
        onSuccess: () => {
          setTitle("");
          setTeam(NONE);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };
  const removeRole = (role: Role) =>
    save.mutate(
      planned.filter(
        (entry) =>
          !(
            entry.title === role.title &&
            entry.departmentId === role.departmentId &&
            entry.teamId === role.teamId
          ),
      ),
      { onError: (error) => toast.error(error.message) },
    );
  const departmentOptions = [
    { value: NONE, label: "No department" },
    ...departments.map((entry) => ({ value: entry.id, label: entry.name })),
  ];
  const teamChoices = [
    { value: NONE, label: "Any team" },
    ...teamOptions.map((entry) => ({ value: entry.id, label: entry.name })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-on-surface-variant">
        Roles come from your people’s job titles and invitations; add the ones you haven’t hired for
        yet. Company basics such as security and your products are shared between roles.
      </p>
      <p className="text-xs text-on-surface-variant">
        Setup allowance: {allowance.templates.used} of {allowance.templates.total} templates and{" "}
        {allowance.modules.used} of {allowance.modules.total} module drafts used. After that, the
        daily AI limits apply.
      </p>

      {roles.length ? (
        <ul
          aria-label="Roles"
          className="flex flex-col divide-y divide-outline-variant rounded-xl bg-pane"
        >
          {roles.map((role) => (
            <li
              key={`${role.title}|${role.departmentId ?? ""}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5"
            >
              <div className="flex min-w-48 flex-1 flex-col">
                <b className="text-sm font-medium">{role.title}</b>
                <span className="text-xs text-on-surface-variant">
                  {[
                    role.departmentName ?? "No department",
                    role.teamName,
                    role.planned
                      ? "added here"
                      : role.people
                        ? `${role.people} ${role.people === 1 ? "person" : "people"}`
                        : "no one in it yet",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <TemplateState role={role} />
              {role.template && !role.template.failed ? (
                <Button
                  size="xs"
                  variant="ghost"
                  nativeButton={false}
                  render={<Link to={templatePath(role.template.id)} />}
                >
                  Open
                </Button>
              ) : (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={generate.isPending}
                  onClick={() => run([role])}
                >
                  Generate
                </Button>
              )}
              {role.planned ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${role.title}`}
                  disabled={save.isPending}
                  onClick={() => removeRole(role)}
                >
                  <DeleteIcon aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-on-surface-variant">
          No roles yet. Add the roles you hire for below, or invite people with their job titles.
        </p>
      )}

      <form
        className="grid gap-3 sm:grid-cols-2 sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          addRole();
        }}
      >
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={ids.title}>Add a role</Label>
          <Input
            id={ids.title}
            value={title}
            maxLength={100}
            placeholder="e.g. Sales executive"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.department}>Department</Label>
          <Select
            items={Object.fromEntries(
              departmentOptions.map((option) => [option.value, option.label]),
            )}
            value={department}
            onValueChange={(next) => {
              setDepartment(String(next));
              setTeam(NONE);
            }}
          >
            <SelectTrigger id={ids.department} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {departmentOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.team}>Team</Label>
          <Select
            items={Object.fromEntries(teamChoices.map((option) => [option.value, option.label]))}
            value={team}
            onValueChange={(next) => setTeam(String(next))}
            disabled={!teamOptions.length}
          >
            <SelectTrigger id={ids.team} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {teamChoices.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Button
            type="submit"
            variant="outline"
            disabled={save.isPending || title.trim().length < 2}
          >
            <AddIcon aria-hidden /> Add role
          </Button>
        </div>
      </form>

      <div>
        <Button disabled={!missing.length || generate.isPending} onClick={() => run(missing)}>
          <SmartToyIcon aria-hidden />
          {missing.length
            ? `Generate templates for ${missing.length} role${missing.length === 1 ? "" : "s"}`
            : "Every role has a template"}
        </Button>
      </div>
    </div>
  );
}
