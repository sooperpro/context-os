import type { ContextItem, Verification } from "@contextos/shared";
import { AlertOctagonIcon, CalendarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeedbackButtons } from "@/features/feedback/components/feedback-buttons";
import { useSetVerification } from "@/features/hub/api/hub.queries";
import { ConfidenceBadge, StateBadge, VerificationBadge } from "@/features/hub/components/badges";
import { EvidenceList } from "@/features/hub/components/evidence-list";
import { formatDate } from "@/lib/format";
import { DECISION_STATUS_LABEL, KIND_LABEL } from "@/lib/labels";

interface ContextItemCardProps {
  projectId: string;
  item: ContextItem;
  /** Resolve conflicting item ids to titles for the conflict notice. */
  itemsById?: Map<string, ContextItem>;
}

export function ContextItemCard({ projectId, item, itemsById }: ContextItemCardProps) {
  const verify = useSetVerification(projectId);
  const setVerification = (verification: Verification) =>
    verify.mutate({ itemId: item.id, verification });
  const date = item.eventAt ?? item.asOf;

  return (
    <Card size="sm" data-testid="context-item">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{KIND_LABEL[item.kind]}</Badge>
          <KindBadge item={item} />
          <VerificationBadge verification={item.verification} />
          <ConfidenceBadge confidence={item.confidence} />
          {date ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarIcon className="size-3" aria-hidden />
              {item.kind === "status_claim" ? "as of " : ""}
              {formatDate(date)}
            </span>
          ) : null}
        </div>
        <CardTitle className="text-base leading-snug">{item.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{item.summary}</p>
        <ItemDetails item={item} />
        {item.conflictsWith.length > 0 ? (
          <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertOctagonIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
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
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Verification">
            <VerifyButton
              label="Confirm"
              active={item.verification === "confirmed"}
              disabled={verify.isPending}
              onClick={() => setVerification("confirmed")}
            />
            <VerifyButton
              label="Mark stale"
              active={item.verification === "stale"}
              disabled={verify.isPending}
              onClick={() => setVerification("stale")}
            />
            <VerifyButton
              label="Dispute"
              active={item.verification === "disputed"}
              disabled={verify.isPending}
              onClick={() => setVerification("disputed")}
            />
          </div>
          <FeedbackButtons projectId={projectId} targetType="context_item" targetId={item.id} />
        </div>
      </CardContent>
    </Card>
  );
}

function VerifyButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="xs"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function KindBadge({ item }: { item: ContextItem }) {
  switch (item.kind) {
    case "decision":
      return <Badge variant="outline">{DECISION_STATUS_LABEL[item.data.decisionStatus]}</Badge>;
    case "event":
      return (
        <Badge variant="outline" className="capitalize">
          {item.data.category}
        </Badge>
      );
    case "status_claim":
      return <StateBadge state={item.data.state} />;
    case "component":
      return (
        <Badge variant="outline" className="capitalize">
          {item.data.componentType}
        </Badge>
      );
    case "dependency":
      return <Badge variant="outline">{item.data.relation.replace("_", " ")}</Badge>;
    default:
      return null;
  }
}

function ItemDetails({ item }: { item: ContextItem }) {
  switch (item.kind) {
    case "decision": {
      const { rationale, alternatives, participants, consequences } = item.data;
      if (!rationale && alternatives.length === 0 && participants.length === 0 && !consequences) {
        return null;
      }
      return (
        <dl className="grid gap-1.5 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
          {rationale ? (
            <>
              <dt className="text-muted-foreground">Why</dt>
              <dd>{rationale}</dd>
            </>
          ) : null}
          {alternatives.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Alternatives</dt>
              <dd>{alternatives.join(", ")}</dd>
            </>
          ) : null}
          {participants.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Participants</dt>
              <dd>{participants.join(", ")}</dd>
            </>
          ) : null}
          {consequences ? (
            <>
              <dt className="text-muted-foreground">Consequences</dt>
              <dd>{consequences}</dd>
            </>
          ) : null}
        </dl>
      );
    }
    case "person":
      return item.data.owns.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Owns</span>
          {item.data.owns.map((area) => (
            <Badge key={area} variant="secondary">
              {area}
            </Badge>
          ))}
        </div>
      ) : null;
    case "dependency":
      return (
        <p className="text-sm">
          <span className="font-medium">{item.data.from}</span>{" "}
          <span className="text-muted-foreground">{item.data.relation.replace("_", " ")}</span>{" "}
          <span className="font-medium">{item.data.to}</span>
        </p>
      );
    default:
      return null;
  }
}
