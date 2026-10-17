import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ConnectedButton, ConnectedButtonGroup } from "@/components/ui/connected-button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DownloadIcon, WarningIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { MiniTile } from "@/components/ui/kpi-tile";
import { Label } from "@/components/ui/label";
import {
  analyticsQuery,
  downloadWorkspaceExport,
  useWorkspaceDeletion,
} from "@/features/admin/api/workspace-admin.api";
import { currentWorkspaceQuery } from "@/features/workspace/api/workspace.queries";
import { CompanyProfileForm } from "@/features/workspace/components/company-profile-form";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { formatLongDate, formatPercent } from "@/lib/format";

const PERIODS = [
  [30, "30 days"],
  [90, "90 days"],
] as const;

/**
 * The workspace as a whole (admins): how its knowledge and Context Bot are doing, a copy of its
 * data, and, for owners, deleting it.
 */
export function WorkspacePage() {
  const { role } = useViewer();
  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker="Admin"
        title="Workspace"
        description="How knowledge and Context Bot are doing across the workspace, and its data."
      />
      <SectionCard title="Company profile">
        <CompanyProfileForm />
      </SectionCard>
      <AnalyticsCard />
      <ExportCard />
      {role === "owner" ? <DeletionCard /> : null}
    </div>
  );
}

/** Aggregates only, k-anonymous: a rate needs enough answers or ratings behind it. */
function AnalyticsCard() {
  const [days, setDays] = useState<number>(30);
  const query = useQuery(analyticsQuery(days));
  const rate = (value: number | null) =>
    value === null ? "Not enough data" : formatPercent(value);
  const data = query.data;
  return (
    <SectionCard
      title="Analytics"
      endpoint="/v1/analytics/overview"
      status={query}
      action={
        <ConnectedButtonGroup aria-label="Period">
          {PERIODS.map(([value, label]) => (
            <ConnectedButton key={value} pressed={days === value} onClick={() => setDays(value)}>
              {label}
            </ConnectedButton>
          ))}
        </ConnectedButtonGroup>
      }
    >
      {data ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 @min-[640px]:grid-cols-4">
            <MiniTile
              className="bg-card"
              label="Questions asked"
              value={data.ask.volume.toLocaleString()}
            />
            <MiniTile
              className="bg-card"
              label="Rated helpful"
              value={rate(data.ask.helpfulRate)}
            />
            <MiniTile
              className="bg-card"
              label="No answer found"
              value={rate(data.ask.insufficientRate)}
            />
            <MiniTile
              className="bg-card"
              label="Corrections verified"
              value={data.contributions.correctionsVerified.toLocaleString()}
            />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Knowledge health by project</h3>
            {data.knowledgeHealth.length ? (
              <ul className="flex flex-col gap-1.5" aria-label="Knowledge health by project">
                {data.knowledgeHealth.map((project) => (
                  <li key={project.projectId} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    <span className="text-on-surface-variant tabular-nums">
                      {project.khs === null ? "—" : `${Math.round(project.khs)} / 100`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-on-surface-variant">No projects yet.</p>
            )}
          </div>
          <p className="text-xs text-on-surface-variant">
            Flags: {data.contributions.flagsOpened} opened, {data.contributions.flagsResolved}{" "}
            resolved. Bounties completed: {data.contributions.bountiesCompleted}. Rates show once
            enough people answered or rated, so no one can be singled out.
          </p>
        </div>
      ) : null}
    </SectionCard>
  );
}

function ExportCard() {
  const [busy, setBusy] = useState(false);
  return (
    <SectionCard title="Export workspace data">
      <p className="text-sm text-on-surface-variant">
        Projects, source details, knowledge items, members, teams and the audit trail, as JSON. Ask
        conversations and people data (onboarding, check-ins) are never included.
      </p>
      <div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            downloadWorkspaceExport()
              .then((name) => toast.success(`Downloaded ${name}`))
              .catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : "The export failed."),
              )
              .finally(() => setBusy(false));
          }}
        >
          <DownloadIcon aria-hidden /> Download export
        </Button>
      </div>
    </SectionCard>
  );
}

/** Owners only. Deletion takes effect after 7 days, and can be cancelled until then. */
function DeletionCard() {
  const workspace = useQuery(currentWorkspaceQuery());
  const { schedule, cancel } = useWorkspaceDeletion();
  const [confirming, setConfirming] = useState(false);
  const scheduled = workspace.data?.settings?.deletion;
  return (
    <SectionCard title="Delete this workspace" className="border border-error/40">
      {scheduled ? (
        <>
          <Banner
            tone="error"
            icon={<WarningIcon />}
            title={`Deletion is scheduled for ${formatLongDate(new Date(scheduled.scheduledAt))}`}
            description="Everything in the workspace is removed then: projects, sources, knowledge, members and the audit trail."
          />
          <div>
            <Button
              variant="outline"
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate(undefined, {
                  onSuccess: () => toast.success("Deletion cancelled"),
                  onError: (error) => toast.error(error.message || "It could not be cancelled."),
                })
              }
            >
              Cancel deletion
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-on-surface-variant">
            Removes every project, source, knowledge item, member and the audit trail, 7 days after
            you confirm. Admins are told, and you can cancel until then.
          </p>
          <div>
            <Button variant="destructive" onClick={() => setConfirming(true)}>
              Delete workspace…
            </Button>
          </div>
        </>
      )}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          {confirming && workspace.data ? (
            <ConfirmDeletion
              expected={workspace.data.slug ?? workspace.data.name}
              pending={schedule.isPending}
              error={schedule.error?.message ?? null}
              onCancel={() => setConfirming(false)}
              onConfirm={(confirm) =>
                schedule.mutate(confirm, {
                  onSuccess: () => {
                    toast.success("Deletion scheduled for 7 days from now");
                    setConfirming(false);
                  },
                })
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function ConfirmDeletion({
  expected,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  expected: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (confirm: string) => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState("");
  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete this workspace?</DialogTitle>
        <DialogDescription>
          It's removed in 7 days. Type <b className="font-medium">{expected}</b> to confirm.
        </DialogDescription>
      </DialogHeader>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="space-y-2">
        <Label htmlFor={`${id}-confirm`}>Workspace</Label>
        <Input
          id={`${id}-confirm`}
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Keep workspace
        </Button>
        <Button
          variant="destructive"
          disabled={typed !== expected || pending}
          onClick={() => onConfirm(typed)}
        >
          Schedule deletion
        </Button>
      </DialogFooter>
    </>
  );
}
