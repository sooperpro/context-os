import type { AdminConnector, ConnectInput, SyncFrequency } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConnectorLogo } from "@/components/connector-logo";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { ConnectedButton, ConnectedButtonGroup } from "@/components/ui/connected-button-group";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BlockIcon,
  CheckCircleFilledIcon,
  CheckCircleIcon,
  LockIcon,
  OpenInNewIcon,
  ShieldPersonIcon,
  SyncIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
import { OptionList, OptionTile } from "@/components/ui/option-tile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { Stepper, StepperItem } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  adminConnectorsQuery,
  useAuthorizeConnector,
  useConnectConnector,
  useRequestConnector,
} from "@/features/admin/api/admin.queries";
import { SYNC_FREQUENCY } from "@/features/admin/admin-meta";
import { projectsQuery } from "@/features/projects/api/projects.queries";
import { ApiClientError } from "@/lib/api-client";

/** The server's own words when it has them (they say what to do next), else a generic line. */
const reason = (error: unknown, fallback: string) =>
  error instanceof ApiClientError || (error instanceof Error && error.constructor === Error)
    ? error.message
    : fallback;

const STEPS = ["Authorize", "Choose content", "Sync settings"] as const;
const SKIP = { never: "Never skip", "3y": "3 years", "1y": "1 year" } as const;

/** Connect a source (prototype `connectWizard`): read-only consent, what to index, how often. */
export function ConnectWizard({
  connector,
  onOpenChange,
}: {
  connector: AdminConnector | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={connector !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        {connector ? <Wizard connector={connector} close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Wizard({ connector: opened, close }: { connector: AdminConnector; close: () => void }) {
  const authorize = useAuthorizeConnector();
  const connect = useConnectConnector();
  // What can be indexed is only known once access is granted, so read the refreshed catalog entry.
  const catalog = useQuery(adminConnectorsQuery());
  const connector = catalog.data?.items.find((item) => item.id === opened.id) ?? opened;
  const projects = useQuery(projectsQuery());
  const ids = { skip: useId(), project: useId(), share: useId() };
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState<string | null>(null);
  const [picked, setPicked] = useState(() => new Set<string>());
  const [frequency, setFrequency] = useState<SyncFrequency>("hourly");
  const [skip, setSkip] = useState<ConnectInput["skipOlderThan"]>("3y");
  const [shared, setShared] = useState(true);
  const [projectChoice, setProjectChoice] = useState<string | null>(null);
  const projectItems = projects.data?.items ?? [];
  const projectId = projectChoice ?? projectItems[0]?.id ?? null;
  const unit = connector.unit.toLowerCase();

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <DialogHeader className="flex-row items-center gap-3">
        <ConnectorLogo provider={connector.id} />
        <DialogTitle>Connect {connector.name}</DialogTitle>
      </DialogHeader>
      <Stepper aria-label="Steps">
        {STEPS.map((label, index) => (
          <StepperItem
            key={label}
            index={index + 1}
            status={index < step ? "done" : index === step ? "current" : "upcoming"}
            connector={index < STEPS.length - 1}
          >
            {label}
          </StepperItem>
        ))}
      </Stepper>

      {step === 0 ? (
        authorize.isPending ? (
          <div role="status" className="flex flex-col items-center gap-2 py-6 text-center">
            <Loader label={`Waiting for ${connector.name}`} />
            <b className="font-heading text-base font-medium">Waiting for {connector.name}…</b>
            <p className="text-sm text-on-surface-variant">
              Finish signing in and approving access in the {connector.name} window.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div aria-hidden className="flex items-center justify-center gap-3 py-2">
              <Brand compact />
              <span className="h-0.5 w-8 rounded-full bg-outline-variant" />
              <span className="grid size-9 place-items-center rounded-full bg-surface-container-high text-on-surface-variant [&_svg]:size-5">
                <LockIcon />
              </span>
              <span className="h-0.5 w-8 rounded-full bg-outline-variant" />
              <ConnectorLogo provider={connector.id} size="lg" />
            </div>
            <p className="text-center text-base">
              ContextOS will ask for <b className="font-medium">read-only</b> access to{" "}
              {connector.name}.
            </p>
            <ul className="flex flex-col gap-3">
              {(
                [
                  [true, "Read content", connector.description],
                  [
                    true,
                    "Read sharing permissions",
                    "So people only see answers from what they can already open.",
                  ],
                  [
                    false,
                    "Never edits, deletes or posts",
                    `ContextOS can’t change anything in ${connector.name}.`,
                  ],
                ] as const
              ).map(([ok, title, detail]) => (
                <li key={title} className="flex items-start gap-3">
                  {ok ? (
                    <CheckCircleFilledIcon
                      className="mt-0.5 size-5 shrink-0 text-success"
                      aria-hidden
                    />
                  ) : (
                    <BlockIcon className="mt-0.5 size-5 shrink-0 text-error" aria-hidden />
                  )}
                  <span className="flex flex-col">
                    <b className="text-sm font-medium">{title}</b>
                    <span className="text-xs text-on-surface-variant">{detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            {connector.needsAdminOf ? (
              <p className="flex items-center justify-center gap-1.5 text-xs text-on-surface-variant">
                <ShieldPersonIcon className="size-4" aria-hidden />A {connector.needsAdminOf} admin
                needs to approve this for your organization.
              </p>
            ) : null}
          </div>
        )
      ) : step === 1 ? (
        <div className="flex flex-col gap-4">
          <StatusChip tone="success" icon={<CheckCircleIcon />} className="self-start">
            Connected as {account}
          </StatusChip>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">
              Which {unit} should ContextOS index?
            </legend>
            <OptionList>
              {connector.scopeOptions.map((option) => (
                <OptionTile
                  key={option.id}
                  input={
                    <input
                      type="checkbox"
                      checked={picked.has(option.id)}
                      onChange={() => toggle(option.id)}
                    />
                  }
                  title={option.name}
                  description={
                    option.restricted
                      ? "Restricted. Only its members will see answers from it."
                      : undefined
                  }
                  trailing={
                    option.restricted ? (
                      <StatusChip icon={<LockIcon />} tone="neutral">
                        Restricted
                      </StatusChip>
                    ) : null
                  }
                />
              ))}
            </OptionList>
          </fieldset>
          {connector.scopeOptions.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              Nothing to index was found for this account.
            </p>
          ) : null}
          <div className="flex items-center gap-3 rounded-md bg-pane px-3.5 py-3">
            <label htmlFor={ids.share} className="flex flex-1 flex-col">
              <b className="text-sm font-medium">Share with everyone in the workspace</b>
              <span className="text-xs text-on-surface-variant">
                {shared
                  ? "Every member can get answers from what you index here."
                  : `People only get answers from items they can open in ${connector.name}.`}
              </span>
            </label>
            <Switch id={ids.share} checked={shared} onCheckedChange={setShared} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.project}>Add to project</Label>
            {projectItems.length ? (
              <Select
                value={projectId ?? ""}
                onValueChange={(value) => setProjectChoice(String(value))}
              >
                <SelectTrigger id={ids.project} className="w-full">
                  <SelectValue>
                    {projectItems.find((project) => project.id === projectId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projectItems.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-sm text-on-surface-variant">
                {projects.isPending
                  ? "Loading projects…"
                  : "Create a project first: everything ContextOS indexes belongs to one."}
              </span>
            )}
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Sync frequency</legend>
            <ConnectedButtonGroup aria-label="Sync frequency">
              {(Object.keys(SYNC_FREQUENCY) as SyncFrequency[]).map((value) => (
                <ConnectedButton
                  key={value}
                  pressed={frequency === value}
                  onClick={() => setFrequency(value)}
                >
                  {SYNC_FREQUENCY[value]}
                </ConnectedButton>
              ))}
            </ConnectedButtonGroup>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.skip}>Skip content not updated in</Label>
            <Select
              items={SKIP}
              value={skip}
              onValueChange={(value) => setSkip(String(value) as ConnectInput["skipOlderThan"])}
            >
              <SelectTrigger id={ids.skip} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SKIP) as Array<keyof typeof SKIP>).map((value) => (
                  <SelectItem key={value} value={value}>
                    {SKIP[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-on-surface-variant">
              Older content stays in {connector.name} but won’t appear in answers.
            </span>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-pane p-3.5">
            <ConnectorLogo provider={connector.id} />
            <span className="flex flex-col">
              <b className="text-sm font-medium">{connector.name}</b>
              <span className="text-xs text-on-surface-variant">
                {picked.size} {unit} · syncs {SYNC_FREQUENCY[frequency].toLowerCase()} ·{" "}
                {shared ? "shared with everyone" : "permissions mirrored"}
              </span>
            </span>
          </div>
        </div>
      )}

      <DialogFooter>
        {step === 2 ? (
          <Button variant="ghost" onClick={() => setStep(1)}>
            Back
          </Button>
        ) : (
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
        )}
        {step === 0 ? (
          <Button
            disabled={authorize.isPending}
            onClick={() =>
              authorize.mutate(connector.id, {
                onSuccess: (granted) => {
                  setAccount(granted);
                  setStep(1);
                },
                onError: (error) =>
                  toast.error(
                    reason(error, `${connector.name} did not grant access. Please try again.`),
                  ),
              })
            }
          >
            <OpenInNewIcon aria-hidden /> Continue with {connector.name}
          </Button>
        ) : step === 1 ? (
          <Button disabled={!picked.size} onClick={() => setStep(2)}>
            Next
          </Button>
        ) : (
          <Button
            disabled={connect.isPending || !projectId}
            onClick={() =>
              connect.mutate(
                {
                  id: connector.id,
                  input: {
                    scopeIds: [...picked],
                    frequency,
                    skipOlderThan: skip,
                    projectId: projectId ?? undefined,
                    visibility: shared ? "workspace" : "restricted",
                  },
                },
                {
                  onSuccess: () => {
                    toast.success(`${connector.name} connected. First sync started.`);
                    close();
                  },
                  onError: (error) =>
                    toast.error(
                      reason(error, `${connector.name} could not be connected. Please try again.`),
                    ),
                },
              )
            }
          >
            <SyncIcon aria-hidden /> Connect and start sync
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

/** "Request a connector": a tool that isn't in the catalog yet. */
export function RequestConnectorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? <RequestForm close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RequestForm({ close }: { close: () => void }) {
  const request = useRequestConnector();
  const ids = { tool: useId(), notes: useId() };
  const [tool, setTool] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        if (tool.trim().length < 2) return;
        request.mutate(
          { tool: tool.trim(), notes },
          {
            onSuccess: () => {
              toast.success(
                `Request recorded for ${tool.trim()}. We’ll let you know when it’s available.`,
              );
              close();
            },
            onError: () => toast.error("The request could not be sent. Please try again."),
          },
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>Request a connector</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.tool}>Which tool?</Label>
        <Input
          id={ids.tool}
          value={tool}
          onChange={(event) => setTool(event.target.value)}
          placeholder="e.g. SharePoint, Guru, Coda"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.notes}>What knowledge lives there?</Label>
        <Textarea
          id={ids.notes}
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="e.g. Sales playbooks and customer onboarding guides"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={tool.trim().length < 2 || request.isPending}>
          Send request
        </Button>
      </DialogFooter>
    </form>
  );
}
