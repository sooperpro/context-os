import type { SourceObjectDetail } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FormatQuoteIcon, OpenInNewIcon } from "@/components/ui/icons";
import { TypeChip } from "@/components/ui/meta-chip";
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
import type { EvidenceDetail } from "@/features/sources/api/evidence.api";
import { evidenceQuery } from "@/features/sources/api/evidence.queries";
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
    enabled: target !== null && !target.evidenceId,
  });
  const evidence = useQuery({
    ...evidenceQuery(target?.evidenceId ?? ""),
    enabled: Boolean(target?.evidenceId),
  });
  const pending = target?.evidenceId ? evidence.isPending : source.isPending;
  const error = target?.evidenceId ? evidence.error : source.error;

  return (
    <Sheet open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-xl">
        {pending ? (
          <div className="space-y-3 p-6" aria-busy="true">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error ? (
          <SheetHeader>
            <SheetTitle>Could not load source</SheetTitle>
            <SheetDescription>{error.message}</SheetDescription>
          </SheetHeader>
        ) : evidence.data ? (
          <EvidenceSheet evidence={evidence.data} />
        ) : source.data ? (
          <FullSourceSheet source={source.data} quote={target?.quote} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function EvidenceSheet({ evidence }: { evidence: EvidenceDetail }) {
  const chunks = [evidence.context.before, evidence.chunk, evidence.context.after].filter(
    (chunk): chunk is NonNullable<typeof chunk> => chunk !== null,
  );
  return (
    <>
      <SheetHeader className="border-b">
        <div className="flex flex-wrap items-center gap-2">
          <TypeChip>{SOURCE_KIND_LABEL[evidence.source.kind]}</TypeChip>
        </div>
        <SheetTitle className="leading-snug">{evidence.source.title}</SheetTitle>
        <SheetDescription>
          {[
            evidence.source.author ? `by ${evidence.source.author}` : null,
            evidence.source.sourceCreatedAt
              ? `created ${formatDate(evidence.source.sourceCreatedAt)}`
              : "source date unknown",
            `Supports ${evidence.item.title}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </SheetDescription>
        {evidence.source.url ? (
          <Button
            variant="link"
            size="sm"
            className="h-auto w-fit px-0"
            nativeButton={false}
            render={<a href={evidence.source.url} target="_blank" rel="noreferrer" />}
          >
            Open original
            <OpenInNewIcon aria-hidden />
          </Button>
        ) : null}
      </SheetHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-6">
          <section className="space-y-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Evidence
            </h3>
            <blockquote className="flex gap-2 rounded-md bg-ai-container/40 px-3 py-2 text-sm">
              <FormatQuoteIcon className="mt-0.5 size-4 shrink-0 text-ai" aria-hidden />
              <span>{evidence.quote}</span>
            </blockquote>
          </section>
          {chunks.length ? (
            <section className="space-y-2">
              <Separator />
              <h3 className="pt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Source context
              </h3>
              {chunks.map((chunk) => (
                <p
                  key={chunk.id}
                  className={
                    chunk.id === evidence.chunk?.id
                      ? "rounded-md bg-pane px-3 py-2 text-sm leading-relaxed"
                      : "px-3 text-sm leading-relaxed text-on-surface-variant"
                  }
                >
                  {chunk.content}
                </p>
              ))}
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </>
  );
}

function FullSourceSheet({ source, quote }: { source: SourceObjectDetail; quote?: string }) {
  return (
    <>
      <SheetHeader className="border-b">
        <div className="flex flex-wrap items-center gap-2">
          <TypeChip>{SOURCE_KIND_LABEL[source.kind]}</TypeChip>
          <SourceStatusBadge status={source.status} />
        </div>
        <SheetTitle className="leading-snug">{source.title}</SheetTitle>
        <SheetDescription>
          {[
            source.author ? `by ${source.author}` : null,
            source.sourceCreatedAt
              ? `created ${formatDate(source.sourceCreatedAt)}`
              : "source date unknown",
            `ingested ${formatDateTime(source.ingestedAt)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </SheetDescription>
        {source.url ? (
          <Button
            variant="link"
            size="sm"
            className="h-auto w-fit px-0"
            nativeButton={false}
            render={<a href={source.url} target="_blank" rel="noreferrer" />}
          >
            Open original
            <OpenInNewIcon aria-hidden />
          </Button>
        ) : null}
      </SheetHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-6">
          {quote ? (
            <section className="space-y-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Evidence
              </h3>
              <blockquote className="flex gap-2 rounded-md bg-ai-container/40 px-3 py-2 text-sm">
                <FormatQuoteIcon className="mt-0.5 size-4 shrink-0 text-ai" aria-hidden />
                <span>{quote}</span>
              </blockquote>
              <Separator />
            </section>
          ) : null}
          <section className="space-y-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Content
            </h3>
            <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">
              {source.content}
            </pre>
          </section>
        </div>
      </ScrollArea>
    </>
  );
}
