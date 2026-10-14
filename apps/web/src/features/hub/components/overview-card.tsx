import type { CitedText, ContextItem, Hub } from "@contextos/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowDropDownIcon, HelpIcon, HistoryIcon, HubFilledIcon, UpdateIcon } from "@/components/ui/icons";
import { TypeChip } from "@/components/ui/meta-chip";
import { StatusChip } from "@/components/ui/status-chip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { FeedbackButtons } from "@/features/feedback/components/feedback-buttons";
import { useRefreshHub } from "@/features/hub/api/hub.queries";
import { useSourceDrawer } from "@/features/sources/hooks/use-source-drawer";
import { formatDateTime } from "@/lib/format";
import { KIND_LABEL } from "@/lib/labels";

interface OverviewCardProps {
  projectId: string;
  hub: Hub;
  items: ContextItem[];
}

const FIELDS: Array<{
  key: keyof Omit<Hub["overview"] & object, "keyUnknowns" | "model" | "generatedAt" | "stale">;
  label: string;
}> = [
  { key: "whatItIs", label: "What it is" },
  { key: "problem", label: "Why it exists" },
  { key: "users", label: "Who it is for" },
  { key: "howItWorks", label: "How it works" },
  { key: "currentFocus", label: "What is happening now" },
];

export function OverviewCard({ projectId, hub, items }: OverviewCardProps) {
  const refresh = useRefreshHub(projectId);
  const overview = hub.overview;
  const itemsById = new Map(items.map((item) => [item.id, item]));

  if (!overview) {
    const processing = hub.sync.state === "processing";
    const failed = hub.sync.state === "attention";
    const noSources = hub.project.stats.sources === 0;
    return (
      <Empty className="border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">{processing ? <Spinner /> : <HubFilledIcon />}</EmptyMedia>
          <EmptyTitle>
            {processing ? "Reconstructing context…" : "Not enough source evidence yet"}
          </EmptyTitle>
          <EmptyDescription>
            {noSources
              ? "Add a few sources and ContextOS will build a cited overview from what they establish."
              : processing
                ? "Sources are being chunked, indexed and analysed. The overview appears when extraction finishes."
                : failed
                  ? "Processing failed for at least one source. Fix the cause shown above, then retry the failed jobs."
                  : "The processed sources did not yield context items to summarise. Add richer sources or reprocess failed ones."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              Overview
              {overview.stale ? (
                <StatusChip tone="warning" icon={<HistoryIcon />}>
                  Sources changed since generated
                </StatusChip>
              ) : null}
            </CardTitle>
            <CardDescription>
              Generated {formatDateTime(overview.generatedAt)} by {overview.model}. Every paragraph
              lists the context items it rests on; items link to their source evidence.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={refresh.isPending || hub.sync.state === "processing"}
            onClick={() =>
              refresh.mutate(undefined, {
                onSuccess: () => toast.success("Overview refresh queued"),
              })
            }
          >
            {refresh.isPending ? <Spinner /> : <UpdateIcon aria-hidden />}
            Regenerate
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {FIELDS.map((field) => (
          <CitedParagraph
            key={field.key}
            label={field.label}
            cited={overview[field.key]}
            itemsById={itemsById}
          />
        ))}
        {overview.keyUnknowns.length > 0 ? (
          <section className="space-y-1.5">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <HelpIcon className="size-4 text-muted-foreground" aria-hidden />
              Not established by the sources
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {overview.keyUnknowns.map((unknown) => (
                <li key={unknown}>{unknown}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="flex justify-end">
          <FeedbackButtons projectId={projectId} targetType="overview" targetId="overview" />
        </div>
      </CardContent>
    </Card>
  );
}

function CitedParagraph({
  label,
  cited,
  itemsById,
}: {
  label: string;
  cited: CitedText;
  itemsById: Map<string, ContextItem>;
}) {
  const [open, setOpen] = useState(false);
  const drawer = useSourceDrawer();
  const supporting = cited.evidenceItemIds
    .map((id) => itemsById.get(id))
    .filter((item): item is ContextItem => item !== undefined);

  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-medium">{label}</h3>
      <p className={supporting.length === 0 ? "text-sm text-muted-foreground italic" : "text-sm"}>
        {cited.text}
      </p>
      {supporting.length > 0 ? (
        <div>
          <Button
            variant="ghost"
            size="xs"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <ArrowDropDownIcon
              className={open ? "rotate-180 transition-transform" : "transition-transform"}
              aria-hidden
            />
            {supporting.length} supporting {supporting.length === 1 ? "item" : "items"}
          </Button>
          {open ? (
            <ul className="mt-1 space-y-1.5">
              {supporting.map((item) => {
                const evidence = item.evidence[0];
                return (
                  <li key={item.id} className="rounded-md bg-pane px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TypeChip>{KIND_LABEL[item.kind]}</TypeChip>
                      <span className="font-medium">{item.title}</span>
                    </div>
                    {evidence ? (
                      <p className="mt-1 text-muted-foreground">
                        “{evidence.quote}” —{" "}
                        <Button
                          variant="link"
                          size="xs"
                          className="h-auto px-0 text-xs"
                          onClick={() =>
                            drawer.open({
                              sourceId: evidence.sourceObjectId,
                              quote: evidence.quote,
                            })
                          }
                        >
                          {evidence.sourceTitle}
                        </Button>
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
