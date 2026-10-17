import { DRIVE_FOLDER_MIME, type ConnectorConnection, type DriveFile } from "@contextos/shared";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Banner } from "@/components/ui/banner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedItemTrail,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip } from "@/components/ui/status-chip";
import { Switch } from "@/components/ui/switch";
import {
  CheckIcon,
  ChevronRightIcon,
  DescriptionIcon,
  DownloadIcon,
  FolderIcon,
  OpenInNewIcon,
  RefreshIcon,
  WarningIcon,
} from "@/components/ui/icons";
import {
  connectorFilesQuery,
  connectorsQuery,
  useAuthorizeGoogleDrive,
  useImportDriveFile,
} from "@/features/connectors/api/connectors.queries";
import { formatDate } from "@/lib/format";

/** Types the API can parse today. Sheets and Slides are listed but not importable yet. */
const IMPORTABLE = new Set([
  "application/vnd.google-apps.document",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

interface Crumb {
  id: string;
  name: string;
}

interface DriveImportDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Browse a connected Google Drive and import one selected file at a time into this project.
 * Only files the connected account can open are listed; nothing is written back to Drive.
 */
export function DriveImportDialog({ projectId, open, onOpenChange }: DriveImportDialogProps) {
  const connectors = useQuery({ ...connectorsQuery(), enabled: open });
  const connected = (connectors.data ?? []).filter((c) => c.status === "connected");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85svh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from Google Drive</DialogTitle>
          <DialogDescription>
            Pick a document to import into this project. Permission mirroring stays on: only files
            the connected account can open are shown, and ContextOS never writes to Drive.
          </DialogDescription>
        </DialogHeader>

        {connectors.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : connectors.isError ? (
          <Banner
            tone="error"
            icon={<WarningIcon />}
            title="Could not load connections"
            description={connectors.error.message}
          />
        ) : connected.length === 0 ? (
          <ConnectPrompt stale={(connectors.data ?? []).some((c) => c.status === "needs_reauth")} />
        ) : (
          <DriveBrowser projectId={projectId} connection={connected[0]!} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Shown when the person has no usable Drive connection; shared with the sync picker. */
export function ConnectPrompt({ stale }: { stale: boolean }) {
  const queryClient = useQueryClient();
  const authorize = useAuthorizeGoogleDrive();
  return (
    <div className="space-y-3">
      <Banner
        tone={stale ? "warning" : "info"}
        icon={<WarningIcon />}
        title={stale ? "Google Drive needs to be reconnected" : "Google Drive is not connected yet"}
        description="Consent opens in a new tab with read-only Drive scope. Come back and check again once Google returns you to ContextOS."
      />
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
          disabled={authorize.isPending}
          onClick={() =>
            authorize.mutate(undefined, {
              onSuccess: (url) => window.open(url, "_blank", "noopener,noreferrer"),
            })
          }
        >
          <OpenInNewIcon aria-hidden />
          Connect Google Drive
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            void queryClient.invalidateQueries({ queryKey: connectorsQuery().queryKey })
          }
        >
          <RefreshIcon aria-hidden />
          Check again
        </Button>
      </div>
    </div>
  );
}

function DriveBrowser({
  projectId,
  connection,
}: {
  projectId: string;
  connection: ConnectorConnection;
}) {
  const [path, setPath] = useState<Crumb[]>([]);
  const folderId = path.at(-1)?.id;
  const files = useInfiniteQuery(connectorFilesQuery(connection.id, folderId));
  const importFile = useImportDriveFile(projectId);
  const [imported, setImported] = useState<Set<string>>(() => new Set());
  const [importingId, setImportingId] = useState<string | null>(null);
  const [shareAll, setShareAll] = useState(true);

  const items = files.data?.pages.flatMap((page) => page.items) ?? [];
  const folders = items.filter((item) => item.mimeType === DRIVE_FOLDER_MIME && !item.trashed);
  const documents = items.filter((item) => item.mimeType !== DRIVE_FOLDER_MIME && !item.trashed);

  const runImport = (file: DriveFile) => {
    setImportingId(file.id);
    importFile.mutate(
      {
        connectionId: connection.id,
        fileId: file.id,
        visibility: shareAll ? "workspace" : "restricted",
      },
      {
        onSuccess: () => {
          setImported((current) => new Set(current).add(file.id));
          toast.success(`Imported "${file.name}"`);
        },
        onSettled: () => setImportingId(null),
      },
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            {path.length === 0 ? (
              <BreadcrumbPage>My Drive</BreadcrumbPage>
            ) : (
              <BreadcrumbLink render={<button type="button" onClick={() => setPath([])} />}>
                My Drive
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
          {path.map((crumb, index) => (
            <BreadcrumbItem key={crumb.id}>
              <BreadcrumbSeparator />
              {index === path.length - 1 ? (
                <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  render={
                    <button type="button" onClick={() => setPath(path.slice(0, index + 1))} />
                  }
                >
                  {crumb.name}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <SharingSwitch id="drive-import-share" checked={shareAll} onCheckedChange={setShareAll} />

      {importFile.isError ? (
        <Banner
          tone="error"
          icon={<WarningIcon />}
          title="Could not import this file"
          description={importFile.error.message}
        />
      ) : null}

      <ScrollArea className="-mx-1 min-h-0 flex-1 px-1">
        {files.isPending ? (
          <div className="space-y-1" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-xs first:rounded-t-xl last:rounded-b-xl" />
            ))}
          </div>
        ) : files.isError ? (
          <Banner
            tone="error"
            icon={<WarningIcon />}
            title="Could not list this folder"
            description={files.error.message}
            actions={
              <Button variant="ghost" size="sm" onClick={() => void files.refetch()}>
                Retry
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-on-surface-variant">This folder is empty.</p>
        ) : (
          <SegmentedList aria-label="Files">
            {folders.map((folder) => (
              <SegmentedItem
                key={folder.id}
                render={
                  <button
                    type="button"
                    onClick={() => setPath([...path, { id: folder.id, name: folder.name }])}
                  />
                }
              >
                <SegmentedItemLead>
                  <FolderIcon />
                </SegmentedItemLead>
                <SegmentedItemBody>
                  <SegmentedItemTitle>{folder.name}</SegmentedItemTitle>
                  <SegmentedItemMeta>Folder</SegmentedItemMeta>
                </SegmentedItemBody>
                <SegmentedItemTrail>
                  <ChevronRightIcon className="size-5 text-on-surface-variant" aria-hidden />
                </SegmentedItemTrail>
              </SegmentedItem>
            ))}
            {documents.map((file) => {
              const supported =
                IMPORTABLE.has(file.mimeType) && file.capabilities?.canDownload !== false;
              const done = imported.has(file.id);
              return (
                <SegmentedItem key={file.id}>
                  <SegmentedItemLead className="bg-surface-container-highest text-on-surface-variant">
                    <DescriptionIcon />
                  </SegmentedItemLead>
                  <SegmentedItemBody>
                    <SegmentedItemTitle>{file.name}</SegmentedItemTitle>
                    <SegmentedItemMeta>
                      {file.owners?.[0]?.displayName ? (
                        <span>{file.owners[0].displayName}</span>
                      ) : null}
                      {file.modifiedTime ? (
                        <span>Updated {formatDate(file.modifiedTime)}</span>
                      ) : null}
                    </SegmentedItemMeta>
                  </SegmentedItemBody>
                  <SegmentedItemTrail>
                    {done ? (
                      <StatusChip tone="success" icon={<CheckIcon />}>
                        Imported
                      </StatusChip>
                    ) : supported ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={importingId !== null}
                        onClick={() => runImport(file)}
                        aria-label={`Import ${file.name}`}
                      >
                        {importingId === file.id ? <Spinner /> : <DownloadIcon aria-hidden />}
                        Import
                      </Button>
                    ) : (
                      <StatusChip tone="neutral" icon={<WarningIcon />}>
                        Not supported yet
                      </StatusChip>
                    )}
                  </SegmentedItemTrail>
                </SegmentedItem>
              );
            })}
          </SegmentedList>
        )}
      </ScrollArea>

      {files.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={files.isFetchingNextPage}
          onClick={() => void files.fetchNextPage()}
        >
          {files.isFetchingNextPage ? <Spinner /> : null}
          Load more
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Who can read what gets imported. On: every member of the workspace, in this project. Off:
 * permission mirroring, so only people whose own Google account opens the file in Drive, once they
 * connect it. Shared by the import and sync dialogs.
 */
export function SharingSwitch({
  id,
  checked,
  onCheckedChange,
  shared = "Every member can read these documents in this project.",
  restricted = "Only people whose own Google account can open them in Drive, after they connect it.",
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Who can read it, said for each position. */
  shared?: string;
  restricted?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md bg-pane px-3 py-2">
      <label htmlFor={id} className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">Share with everyone in the workspace</span>
        <span className="text-xs text-on-surface-variant">{checked ? shared : restricted}</span>
      </label>
      <Switch id={id} size="sm" checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
