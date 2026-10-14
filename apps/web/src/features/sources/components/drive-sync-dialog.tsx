import type { ConnectorConnection, ConnectorScope, ConnectorScopeOption } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckIcon, FolderIcon, RefreshIcon, SyncIcon, WarningIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import {
  connectorScopesQuery,
  connectorsQuery,
  useRequestConnectorSync,
  useSetConnectorScopes,
} from "@/features/connectors/api/connectors.queries";
import { ConnectPrompt, SharingSwitch } from "@/features/sources/components/drive-import-dialog";
import { formatCount, formatRelativeTime } from "@/lib/format";

interface DriveSyncDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Keeps Drive folders or shared drives in sync with a project (FR-INT-005): the API imports the
 * supported documents inside them and processes each one. The admin decides whether everyone in
 * the workspace can read them or only people who can open them in Drive.
 */
export function DriveSyncDialog({ projectId, open, onOpenChange }: DriveSyncDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Sync from Google Drive</DialogTitle>
          <DialogDescription>
            Pick folders or shared drives to keep in sync with this project. Documents inside them
            are imported and processed on their own.
          </DialogDescription>
        </DialogHeader>
        {open ? <DriveScopePicker projectId={projectId} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** The scope list for one project, from the person's own Drive connection. The setup wizard embeds it too. */
export function DriveScopePicker({ projectId }: { projectId: string }) {
  const connectors = useQuery(connectorsQuery());
  if (connectors.isPending)
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  if (connectors.isError)
    return (
      <Banner
        tone="error"
        icon={<WarningIcon />}
        title="Could not load connectors"
        description={connectors.error.message}
      />
    );
  const connection = connectors.data.find((entry) => entry.status === "connected");
  if (!connection)
    return (
      <ConnectPrompt stale={connectors.data.some((entry) => entry.status === "needs_reauth")} />
    );
  return <ScopeList projectId={projectId} connection={connection} />;
}

const STATUS: Record<
  ConnectorScope["status"],
  { label: string; tone: "neutral" | "success" | "warning"; icon: ReactNode }
> = {
  selected: { label: "Waiting for first sync", tone: "neutral", icon: <SyncIcon /> },
  backfilling: { label: "Syncing", tone: "neutral", icon: <SyncIcon /> },
  live: { label: "In sync", tone: "success", icon: <CheckIcon /> },
  degraded: { label: "Sync problems", tone: "warning", icon: <WarningIcon /> },
  needs_reauth: { label: "Reconnect Drive", tone: "warning", icon: <WarningIcon /> },
};

const kindLabel = (option: ConnectorScopeOption) =>
  option.scopeType === "shared_drive"
    ? "Shared drive"
    : option.externalId === "root"
      ? "Everything in My Drive, folders included"
      : "Folder";

function ScopeList({
  projectId,
  connection,
}: {
  projectId: string;
  connection: ConnectorConnection;
}) {
  const scopes = useQuery(connectorScopesQuery(connection.id));
  const save = useSetConnectorScopes(connection.id, projectId);
  const sync = useRequestConnectorSync(connection.id, projectId);
  // Unsaved toggles by scope id; anything else shows as saved.
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  // null: as saved (shared, unless every saved scope is permission-mirrored).
  const [shareAll, setShareAll] = useState<boolean | null>(null);

  const options = scopes.data?.items ?? [];
  const selectionOf = (option: ConnectorScopeOption) =>
    option.selections.find((scope) => scope.projectId === projectId && !scope.excluded);
  const isChecked = (option: ConnectorScopeOption) =>
    draft[option.externalId] ?? selectionOf(option) !== undefined;
  const saved = options.map(selectionOf).filter((scope) => scope !== undefined);
  const savedShared = saved.length === 0 || saved.some((scope) => scope.visibility === "workspace");
  const shared = shareAll ?? savedShared;
  const visibility = shared ? "workspace" : "restricted";
  const dirty =
    options.some(
      (option) =>
        option.externalId in draft &&
        draft[option.externalId] !== (selectionOf(option) !== undefined),
    ) ||
    (saved.length > 0 && shared !== savedShared);

  const announce = (started: { queued: number }) =>
    toast.success(
      started.queued > 0
        ? `Syncing ${formatCount(started.queued, "scope")}. Sources appear as files are imported.`
        : "Saved. Everything was synced less than 10 minutes ago.",
    );
  const saveAndSync = () =>
    save.mutate(
      options.filter(isChecked).map((option) => ({
        scopeType: option.scopeType,
        externalId: option.externalId,
        name: option.name,
        visibility,
      })),
      {
        onSuccess: (result) => {
          setDraft({});
          setShareAll(null);
          if (result.length === 0) {
            toast.success("Drive sync turned off for this project");
            return;
          }
          sync.mutate(undefined, {
            onSuccess: announce,
            onError: (error) => toast.error(error.message),
          });
        },
        onError: (error) => toast.error(error.message),
      },
    );

  if (scopes.isPending)
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  if (scopes.isError)
    return (
      <Banner
        tone="error"
        icon={<WarningIcon />}
        title="Could not list your Drive"
        description={scopes.error.message}
      />
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ul
        className="flex flex-col gap-1 overflow-y-auto"
        aria-label="Drive folders and shared drives"
      >
        {options.map((option) => {
          const selection = selectionOf(option);
          const id = `drive-scope-${option.externalId}`;
          return (
            <li
              key={option.externalId}
              className="flex items-start gap-3 rounded-md bg-pane px-3 py-2"
            >
              <input
                id={id}
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-primary"
                checked={isChecked(option)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [option.externalId]: event.target.checked,
                  }))
                }
              />
              <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                  <FolderIcon className="size-4 shrink-0 text-on-surface-variant" aria-hidden />
                  {option.name}
                  <span className="text-xs font-normal text-on-surface-variant">
                    {kindLabel(option)}
                  </span>
                </span>
                {selection ? (
                  <span className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                    <StatusChip
                      tone={STATUS[selection.status].tone}
                      icon={STATUS[selection.status].icon}
                    >
                      {STATUS[selection.status].label}
                    </StatusChip>
                    <span>
                      {formatCount(selection.itemCount, "file")}
                      {selection.lastSyncedAt
                        ? ` · synced ${formatRelativeTime(selection.lastSyncedAt).toLowerCase()}`
                        : ""}
                    </span>
                    {selection.lastError ? (
                      <span className="text-error">{selection.lastError}</span>
                    ) : null}
                  </span>
                ) : null}
              </label>
            </li>
          );
        })}
        {options.length === 0 ? (
          <li className="px-3 py-2 text-sm text-on-surface-variant">
            No folders or shared drives were found in this Drive.
          </li>
        ) : null}
      </ul>
      <SharingSwitch id="drive-sync-share" checked={shared} onCheckedChange={setShareAll} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-on-surface-variant">
          {formatCount(options.filter(isChecked).length, "scope")} selected
        </span>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => void scopes.refetch()}>
            <RefreshIcon aria-hidden />
            Refresh
          </Button>
          {saved.length > 0 && !dirty ? (
            <Button
              variant="outline"
              size="sm"
              disabled={sync.isPending}
              onClick={() =>
                sync.mutate(undefined, {
                  onSuccess: announce,
                  onError: (error) => toast.error(error.message),
                })
              }
            >
              <SyncIcon aria-hidden />
              Sync now
            </Button>
          ) : null}
          <Button
            size="sm"
            disabled={!dirty || save.isPending || sync.isPending}
            onClick={saveAndSync}
          >
            <CheckIcon aria-hidden />
            Save and sync
          </Button>
        </div>
      </div>
    </div>
  );
}
