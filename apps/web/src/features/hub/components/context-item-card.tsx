import type { ContextItem } from "@contextos/shared";
import { Link } from "react-router";
import { DifferenceIcon, EventIcon } from "@/components/ui/icons";
import { TypeChip } from "@/components/ui/meta-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeedbackButtons } from "@/features/feedback/components/feedback-buttons";
import { ConfidenceBadge, VerificationBadge } from "@/features/hub/components/badges";
import { EvidenceList } from "@/features/hub/components/evidence-list";
import { ItemDetails, KindBadge, VerificationControls } from "@/features/hub/components/item-parts";
import { itemPath } from "@/features/hub/hub-paths";
import { KIND_ICON } from "@/features/hub/components/kind-icon";
import { formatDate } from "@/lib/format";
import { KIND_LABEL } from "@/lib/labels";

interface ContextItemCardProps {
  projectId: string;
  item: ContextItem;
  /** Resolve conflicting item ids to titles for the conflict notice. */
  itemsById?: Map<string, ContextItem>;
}

export function ContextItemCard({ projectId, item, itemsById }: ContextItemCardProps) {
  const date = item.eventAt ?? item.asOf;
  const KindIcon = KIND_ICON[item.kind];

  return (
    <Card size="sm" data-testid="context-item">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <TypeChip>
            <KindIcon /> {KIND_LABEL[item.kind]}
          </TypeChip>
          <KindBadge item={item} />
          <VerificationBadge verification={item.verification} />
          <ConfidenceBadge confidence={item.confidence} />
          {date ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground [&_svg]:size-3.5">
              <EventIcon aria-hidden />
              {item.kind === "status_claim" ? "as of " : ""}
              {formatDate(date)}
            </span>
          ) : null}
        </div>
        <CardTitle className="text-base leading-snug">
          <Link to={itemPath(item)} className="text-on-surface no-underline hover:underline">
            {item.title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{item.summary}</p>
        <ItemDetails item={item} />
        {item.conflictsWith.length > 0 ? (
          <div className="flex gap-2 rounded-md bg-error-container px-3 py-2 text-xs text-on-error-container">
            <DifferenceIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Conflicting sources: another claim about the same subject says something different
              {itemsById
                ? ` (${item.conflictsWith
                    .map((id) => itemsById.get(id)?.summary)
                    .filter(Boolean)
                    .join("; ")})`
                : ""}
              . Check the dates and evidence before trusting either.
            </p>
          </div>
        ) : null}
        <EvidenceList evidence={item.evidence} />
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <VerificationControls projectId={projectId} item={item} />
          <FeedbackButtons projectId={projectId} targetType="context_item" targetId={item.id} />
        </div>
      </CardContent>
    </Card>
  );
}
