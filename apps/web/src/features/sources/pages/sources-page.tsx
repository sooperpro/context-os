import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AddIcon, ArticleIcon, CloudDownloadIcon, SyncIcon } from "@/components/ui/icons";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { sourcesQuery } from "@/features/sources/api/sources.queries";
import { AddSourceDialog } from "@/features/sources/components/add-source-dialog";
import { DriveImportDialog } from "@/features/sources/components/drive-import-dialog";
import { DriveSyncDialog } from "@/features/sources/components/drive-sync-dialog";
import { SourceList } from "@/features/sources/components/source-list";
import { formatCount } from "@/lib/format";

export function SourcesPage() {
  const { projectId = "" } = useParams();
  const [addOpen, setAddOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const sources = useQuery(sourcesQuery(projectId));

  return (
    <div>
      <PageHeader
        level={2}
        kicker={
          sources.data
            ? `${formatCount(sources.data.items.length, "source")} · ${sources.data.items.filter((s) => s.status === "ready").length} ready`
            : undefined
        }
        title="Sources"
        description="Everything the hub knows comes from here. Each source keeps its author, dates and link as provenance."
        actions={
          <>
            <Button variant="outline" onClick={() => setSyncOpen(true)}>
              <SyncIcon aria-hidden />
              Sync from Drive
            </Button>
            <Button variant="outline" onClick={() => setDriveOpen(true)}>
              <CloudDownloadIcon aria-hidden />
              Import from Drive
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <AddIcon aria-hidden />
              Add source
            </Button>
          </>
        }
      />

      {sources.isPending ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xs first:rounded-t-xl last:rounded-b-xl" />
          ))}
        </div>
      ) : sources.isError ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Could not load sources</EmptyTitle>
            <EmptyDescription>{sources.error.message}</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={() => void sources.refetch()}>
            Try again
          </Button>
        </Empty>
      ) : sources.data.items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ArticleIcon />
            </EmptyMedia>
            <EmptyTitle>No sources yet</EmptyTitle>
            <EmptyDescription>
              Start with the two or three documents a new joiner would be handed: a design doc, the
              last planning thread, a decision record.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setAddOpen(true)}>
            <AddIcon aria-hidden />
            Add the first source
          </Button>
        </Empty>
      ) : (
        <Card>
          <CardContent>
            <SourceList projectId={projectId} sources={sources.data.items} />
          </CardContent>
        </Card>
      )}

      <AddSourceDialog projectId={projectId} open={addOpen} onOpenChange={setAddOpen} />
      <DriveImportDialog projectId={projectId} open={driveOpen} onOpenChange={setDriveOpen} />
      <DriveSyncDialog projectId={projectId} open={syncOpen} onOpenChange={setSyncOpen} />
    </div>
  );
}
