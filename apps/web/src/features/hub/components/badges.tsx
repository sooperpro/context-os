import type { Confidence, StatusState, Verification } from "@contextos/shared";
import { Badge } from "@/components/ui/badge";
import { CONFIDENCE_LABEL, STATE_LABEL, VERIFICATION_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

const VERIFICATION_STYLE: Record<Verification, string> = {
  inferred: "text-muted-foreground",
  confirmed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  stale: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  disputed: "border-destructive/40 bg-destructive/10 text-destructive",
  superseded: "border-slate-500/40 bg-slate-500/10 text-slate-700 line-through dark:text-slate-300",
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
  low: "border-amber-500/40 text-amber-700 dark:text-amber-400",
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <Badge variant="outline" className={cn(CONFIDENCE_STYLE[confidence])}>
      {CONFIDENCE_LABEL[confidence]}
    </Badge>
  );
}

const STATE_STYLE: Record<StatusState, string> = {
  active: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  blocked: "border-destructive/40 bg-destructive/10 text-destructive",
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  planned: "text-muted-foreground",
  risk: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  open_question: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

export function StateBadge({ state }: { state: StatusState }) {
  return (
    <Badge variant="outline" className={cn(STATE_STYLE[state])}>
      {STATE_LABEL[state]}
    </Badge>
  );
}
