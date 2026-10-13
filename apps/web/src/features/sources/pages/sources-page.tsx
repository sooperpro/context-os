import { useQuery } from "@tanstack/react-query";
import { FileTextIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
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
import { SourceList } from "@/features/sources/components/source-list";

export function SourcesPage() {
  const { projectId = "" } = useParams();
  const [addOpen, setAddOpen] = useState(false);
  const sources = useQuery(sourcesQuery(projectId));

  return (
    <div>
      <PageHeader
        title="Sources"
        description="Everything the hub knows comes from here. Each source keeps its author, dates and link as provenance."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <PlusIcon aria-hidden />
            Add source
          </Button>
        }
      />

      {sources.isPending ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
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
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>No sources yet</EmptyTitle>
            <EmptyDescription>
              Start with the two or three documents a new joiner would be handed: a design doc, the
              last planning thread, a decision record.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setAddOpen(true)}>
            <PlusIcon aria-hidden />
            Add the first source
          </Button>
        </Empty>
      ) : (
        <SourceList projectId={projectId} sources={sources.data.items} />
      )}

      <AddSourceDialog projectId={projectId} open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
