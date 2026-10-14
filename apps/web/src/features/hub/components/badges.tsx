import type { Confidence, StatusState, Verification } from "@contextos/shared";
import { Badge } from "@/components/ui/badge";
import { CONFIDENCE_LABEL, STATE_LABEL, VERIFICATION_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

const VERIFICATION_STYLE: Record<Verification, string> = {
  inferred: "text-muted-foreground",
  confirmed: "border-success/40 bg-success/10 text-success",
  stale: "border-warning/40 bg-warning/10 text-warning",
  disputed: "border-destructive/40 bg-destructive/10 text-destructive",
  superseded: "border-outline/40 bg-surface-container-high text-on-surface-variant line-through",
};

export function VerificationBadge({ verification }: { verification: Verification }) {
  return (
    <Badge variant="outline" className={cn(VERIFICATION_STYLE[verification])}>
      {VERIFICATION_LABEL[verification]}
    </Badge>
  );
}

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high: "text-muted-foreground",
  medium: "text-muted-foreground",
  low: "border-warning/40 text-warning",
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <Badge variant="outline" className={cn(CONFIDENCE_STYLE[confidence])}>
      {CONFIDENCE_LABEL[confidence]}
    </Badge>
  );
}

const STATE_STYLE: Record<StatusState, string> = {
  active: "border-info/40 bg-info/10 text-info",
  blocked: "border-destructive/40 bg-destructive/10 text-destructive",
  done: "border-success/40 bg-success/10 text-success",
  planned: "text-muted-foreground",
  risk: "border-warning/40 bg-warning/10 text-warning",
  open_question: "border-outline/40 bg-surface-container-high text-on-surface-variant",
};

export function StateBadge({ state }: { state: StatusState }) {
  return (
    <Badge variant="outline" className={cn(STATE_STYLE[state])}>
      {STATE_LABEL[state]}
    </Badge>
  );
}
