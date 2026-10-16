import {
  SETUP_STEPS,
  type SetupStep,
  type SetupStepStatus,
  type WorkspaceSetup,
} from "@contextos/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MiniTile } from "@/components/ui/kpi-tile";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedItemTrail,
  SegmentedList,
} from "@/components/ui/segmented-list";
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
import { Stepper, StepperItem } from "@/components/ui/stepper";
import {
  AddIcon,
  CheckIcon,
  OpenInNewIcon,
  PendingIcon,
  PersonAddIcon,
  RefreshIcon,
  SkipNextIcon,
  WarningIcon,
} from "@/components/ui/icons";
import {
  connectorsQuery,
  useAuthorizeGoogleDrive,
} from "@/features/connectors/api/connectors.queries";
import { InviteMemberDialog } from "@/features/members/components/invite-member-dialog";
import { projectsQuery } from "@/features/projects/api/projects.queries";
import { CreateProjectDialog } from "@/features/projects/components/create-project-dialog";
import { DriveScopePicker } from "@/features/sources/components/drive-sync-dialog";
import { setupQuery, useUpdateSetupStep } from "@/features/setup/api/setup.queries";
import { STEP_COPY } from "@/features/setup/components/setup-steps";
import { ApiClientError } from "@/lib/api-client";

/*
 * The setup wizard is an orchestrating feature: it composes the actions other features own
 * (create a project, invite a member, connect a source). It may import those features' dialogs;
 * leaf features must not import each other.
 */

interface StepState {
  step: SetupStep;
  status: SetupStepStatus;
  evidence: boolean;
}

function stepStates(setup: WorkspaceSetup): StepState[] {
  return SETUP_STEPS.map((step) => ({
    step,
    status: setup.data.steps[step] ?? "pending",
    evidence: setup.evidence.completed[step] ?? false,
  }));
}

function StepStatusChip({ state }: { state: StepState }) {
  if (state.status === "completed")
    return (
      <StatusChip tone="success" icon={<CheckIcon />}>
        Completed
      </StatusChip>
    );
  if (state.status === "skipped")
    return (
      <StatusChip tone="neutral" icon={<SkipNextIcon />}>
        Skipped
      </StatusChip>
    );
  if (state.evidence)
    return (
      <StatusChip tone="info" icon={<CheckIcon />}>
        Ready to confirm
      </StatusChip>
    );
  return (
    <StatusChip tone="neutral" icon={<PendingIcon />}>
      Pending
    </StatusChip>
  );
}

export function SetupPage() {
  const queryClient = useQueryClient();
  const setup = useQuery(setupQuery());
  const connectors = useQuery(connectorsQuery());
  const update = useUpdateSetupStep();
  const authorize = useAuthorizeGoogleDrive();
  const [selected, setSelected] = useState<SetupStep | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  if (setup.isPending) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-6 w-full max-w-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (setup.isError) {
    const forbidden = setup.error instanceof ApiClientError && setup.error.status === 403;
    return (
      <div className="space-y-4">
        <PageHeader title="Workspace setup" />
        <Banner
          tone={forbidden ? "warning" : "error"}
          icon={<WarningIcon />}
          title={forbidden ? "Setup is for owners and admins" : "Could not load setup"}
          description={forbidden ? "Ask a workspace admin to run setup." : setup.error.message}
        />
      </div>
    );
  }

  const states = stepStates(setup.data);
  const firstOpen = states.find((state) => state.status === "pending")?.step ?? null;
  const currentStep = selected ?? firstOpen ?? SETUP_STEPS[0];
  const current = states.find((state) => state.step === currentStep)!;
  const copy = STEP_COPY[current.step];
  const { version } = setup.data;
  const { sync } = setup.data.evidence;

  const setStatus = (step: SetupStep, status: SetupStepStatus) =>
    update.mutate({ version, step, status });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: setupQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: connectorsQuery().queryKey }),
    ]);

  const stepAction: Record<SetupStep, ReactNode> = {
    connect_source: (
      <div className="space-y-3">
        {connectors.data && connectors.data.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {connectors.data.map((connection) => (
              <li key={connection.id}>
                <StatusChip
                  tone={connection.status === "connected" ? "success" : "warning"}
                  icon={connection.status === "connected" ? <CheckIcon /> : <WarningIcon />}
                >
                  Google Drive ·{" "}
                  {connection.status === "connected" ? "connected" : connection.status}
                </StatusChip>
              </li>
            ))}
          </ul>
        ) : null}
        {authorize.isError ? (
          <Banner
            tone="error"
            icon={<WarningIcon />}
            title="Google Drive is not available"
            description={authorize.error.message}
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              authorize.mutate(undefined, {
                onSuccess: (url) => window.open(url, "_blank", "noopener,noreferrer"),
              })
            }
            disabled={authorize.isPending}
          >
            <OpenInNewIcon aria-hidden />
            Connect Google Drive
          </Button>
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshIcon aria-hidden />
            Check again
          </Button>
        </div>
        <p className="text-xs text-on-surface-variant">
          Consent opens in a new tab with read-only Drive scope. After approval, Google returns that
          tab to this Setup page and shows the connection status.
        </p>
      </div>
    ),
    select_scopes: <SetupScopesStep />,
    create_project: (
      <Button onClick={() => setCreateOpen(true)}>
        <AddIcon aria-hidden />
        New project
      </Button>
    ),
    invite_team: (
      <Button onClick={() => setInviteOpen(true)}>
        <PersonAddIcon aria-hidden />
        Invite a teammate
      </Button>
    ),
    assign_new_hire: (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-on-surface-variant">
          Admins don't see onboarding records, so someone with the HR role starts it. If nobody has
          that role yet, invite them as HR.
        </p>
        <div>
          <Button onClick={() => setInviteOpen(true)}>
            <PersonAddIcon aria-hidden />
            Invite People Ops
          </Button>
        </div>
      </div>
    ),
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Set up your workspace"
        description="Five steps, each confirmed by what actually happened rather than by a checkbox. Skip anything and come back later."
      />

      {setup.data.status === "completed" ? (
        <Banner
          tone="success"
          icon={<CheckIcon />}
          title="Setup complete"
          description="Every step is completed or skipped. Resume a skipped step any time."
        />
      ) : null}

      <Stepper aria-label="Setup steps">
        {states.map((state, index) => (
          <StepperItem
            key={state.step}
            index={index + 1}
            status={
              state.step === current.step
                ? "current"
                : state.status === "completed"
                  ? "done"
                  : "upcoming"
            }
            connector={index < states.length - 1}
          >
            {STEP_COPY[state.step].short}
          </StepperItem>
        ))}
      </Stepper>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-xl">{copy.title}</CardTitle>
              <StepStatusChip state={current} />
            </div>
            <CardDescription>{copy.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stepAction[current.step]}
            <p className="text-xs text-on-surface-variant">{copy.evidence}</p>
            {update.isError ? (
              <Banner
                tone="error"
                icon={<WarningIcon />}
                title="Could not update this step"
                description={update.error.message}
              />
            ) : null}
          </CardContent>
          <CardFooter className="flex-wrap gap-2">
            {current.status === "completed" ? null : (
              <Button
                variant="secondary"
                disabled={!current.evidence || update.isPending}
                onClick={() => setStatus(current.step, "completed")}
              >
                <CheckIcon aria-hidden />
                Mark completed
              </Button>
            )}
            {current.status === "pending" ? (
              <Button
                variant="ghost"
                disabled={update.isPending}
                onClick={() => setStatus(current.step, "skipped")}
              >
                Skip for now
              </Button>
            ) : null}
            {current.status === "skipped" ? (
              <Button
                variant="ghost"
                disabled={update.isPending}
                onClick={() => setStatus(current.step, "pending")}
              >
                Resume
              </Button>
            ) : null}
          </CardFooter>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            <MiniTile label="Sources" value={sync.sources} />
            <MiniTile label="Ready" value={sync.ready} />
            <MiniTile
              label="Processing"
              value={sync.pending}
              tone={sync.pending > 0 ? "info" : "neutral"}
            />
            <MiniTile
              label="Failed"
              value={sync.failed}
              tone={sync.failed > 0 ? "error" : "neutral"}
            />
          </div>
          <SegmentedList aria-label="All steps">
            {states.map((state, index) => (
              <SegmentedItem
                key={state.step}
                render={
                  <button
                    type="button"
                    aria-current={state.step === current.step ? "step" : undefined}
                  />
                }
                onClick={() => setSelected(state.step)}
              >
                <SegmentedItemLead className="text-sm font-semibold">{index + 1}</SegmentedItemLead>
                <SegmentedItemBody>
                  <SegmentedItemTitle>{STEP_COPY[state.step].title}</SegmentedItemTitle>
                  <SegmentedItemMeta>{STEP_COPY[state.step].evidence}</SegmentedItemMeta>
                </SegmentedItemBody>
                <SegmentedItemTrail>
                  <StepStatusChip state={state} />
                </SegmentedItemTrail>
              </SegmentedItem>
            ))}
          </SegmentedList>
        </div>
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

/** FR-WS-009 "select scopes": which Drive folders feed a project; the first project is preselected. */
function SetupScopesStep() {
  const projects = useQuery(projectsQuery());
  const [projectId, setProjectId] = useState<string | null>(null);
  const items = projects.data?.items ?? [];
  const selected = projectId ?? items[0]?.id ?? "";

  if (projects.isPending) return <Skeleton className="h-24" aria-busy="true" />;
  if (projects.isError)
    return (
      <Banner
        tone="error"
        icon={<WarningIcon />}
        title="Could not load projects"
        description={projects.error.message}
      />
    );
  if (items.length === 0)
    return (
      <p className="text-sm text-on-surface-variant">
        Create a project first (the next step), then come back here to choose which Drive folders
        feed it.
      </p>
    );
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="setup-scopes-project">Project</Label>
        <Select value={selected} onValueChange={(value) => setProjectId(String(value))}>
          <SelectTrigger id="setup-scopes-project" className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DriveScopePicker projectId={selected} />
      <p className="text-xs text-on-surface-variant">
        Need a single document instead? Open the project, go to Sources and choose Import from
        Drive.
      </p>
    </div>
  );
}
