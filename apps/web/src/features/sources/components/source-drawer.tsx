import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { sourceQuery } from "@/features/sources/api/sources.queries";
import {
  SourceDrawerContext,
  type SourceDrawerTarget,
} from "@/features/sources/components/source-drawer-context";
import { SourceStatusBadge } from "@/features/sources/components/source-status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { SOURCE_KIND_LABEL } from "@/lib/labels";

interface SourceDrawerProviderProps {
  projectId: string;
  children: ReactNode;
}

/** Hosts the slide-over that shows any source (and the evidence quote that led there). */
export function SourceDrawerProvider({ projectId, children }: SourceDrawerProviderProps) {
  const [target, setTarget] = useState<SourceDrawerTarget | null>(null);
  const api = useMemo(() => ({ open: setTarget }), []);

  return (
    <SourceDrawerContext value={api}>
      {children}
      <SourceSheet projectId={projectId} target={target} onClose={() => setTarget(null)} />
    </SourceDrawerContext>
  );
}

interface SourceSheetProps {
  projectId: string;
  target: SourceDrawerTarget | null;
  onClose: () => void;
}

function SourceSheet({ projectId, target, onClose }: SourceSheetProps) {
  const source = useQuery({
    ...sourceQuery(projectId, target?.sourceId ?? ""),
    enabled: target !== null,
  });

  return (
    <Sheet open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-xl">
        {source.isPending ? (
          <div className="space-y-3 p-6" aria-busy="true">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : source.isError ? (
          <SheetHeader>
            <SheetTitle>Could not load source</SheetTitle>
            <SheetDescription>{source.error.message}</SheetDescription>
          </SheetHeader>
        ) : (
          <>
            <SheetHeader className="border-b">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{SOURCE_KIND_LABEL[source.data.kind]}</Badge>
                <SourceStatusBadge status={source.data.status} />
              </div>
              <SheetTitle className="leading-snug">{source.data.title}</SheetTitle>
              <SheetDescription>
                {[
                  source.data.author ? `by ${source.data.author}` : null,
                  source.data.sourceCreatedAt
                    ? `created ${formatDate(source.data.sourceCreatedAt)}`
                    : "source date unknown",
                  `ingested ${formatDateTime(source.data.ingestedAt)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </SheetDescription>
              {source.data.url ? (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto w-fit px-0"
                  nativeButton={false}
                  render={<a href={source.data.url} target="_blank" rel="noreferrer" />}
                >
                  Open original
                  <ExternalLinkIcon aria-hidden />
                </Button>
              ) : null}
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 p-6">
                {target?.quote ? (
                  <section className="space-y-2">
                    <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Evidence
                    </h3>
                    <blockquote className="rounded-md border-l-2 border-primary/40 bg-muted/50 px-3 py-2 text-sm">
                      “{target.quote}”
                    </blockquote>
                    <Separator />
                  </section>
                ) : null}
                <section className="space-y-2">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Content
                  </h3>
                  <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">
                    {source.data.content}
                  </pre>
                </section>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
