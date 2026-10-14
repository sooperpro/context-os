import type { Confidence, StatusState, Verification } from "@contextos/shared";
import {
  CancelIcon,
  CheckCircleFilledIcon,
  DifferenceIcon,
  EventIcon,
  HelpIcon,
  HistoryIcon,
  PendingIcon,
  ShieldIcon,
  SyncAltIcon,
  VerifiedFilledIcon,
  WarningIcon,
} from "@/components/ui/icons";
import { StatusChip } from "@/components/ui/status-chip";
import { CONFIDENCE_LABEL, STATE_LABEL, VERIFICATION_LABEL } from "@/lib/labels";

type Tone = React.ComponentProps<typeof StatusChip>["tone"];

/* State is never color alone: every badge pairs a tone with an icon and a label. */

const VERIFICATION: Record<Verification, { tone: Tone; icon: React.ReactNode; className?: string }> = {
  inferred: { tone: "neutral", icon: <PendingIcon /> },
  confirmed: { tone: "success", icon: <VerifiedFilledIcon /> },
  stale: { tone: "warning", icon: <HistoryIcon /> },
  disputed: { tone: "error", icon: <DifferenceIcon /> },
  superseded: { tone: "neutral", icon: <CancelIcon />, className: "line-through" },
};

export function VerificationBadge({ verification }: { verification: Verification }) {
  const style = VERIFICATION[verification];
  return (
    <StatusChip tone={style.tone} icon={style.icon} className={style.className}>
      {VERIFICATION_LABEL[verification]}
    </StatusChip>
  );
}

const CONFIDENCE: Record<Confidence, { tone: Tone; icon: React.ReactNode }> = {
  high: { tone: "success", icon: <CheckCircleFilledIcon /> },
  medium: { tone: "info", icon: <PendingIcon /> },
  low: { tone: "warning", icon: <WarningIcon /> },
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const style = CONFIDENCE[confidence];
  return (
    <StatusChip tone={style.tone} icon={style.icon}>
      {CONFIDENCE_LABEL[confidence]}
    </StatusChip>
  );
}

const STATE: Record<StatusState, { tone: Tone; icon: React.ReactNode }> = {
  active: { tone: "info", icon: <SyncAltIcon /> },
  blocked: { tone: "error", icon: <CancelIcon /> },
  done: { tone: "success", icon: <CheckCircleFilledIcon /> },
  planned: { tone: "neutral", icon: <EventIcon /> },
  risk: { tone: "warning", icon: <ShieldIcon /> },
  open_question: { tone: "neutral", icon: <HelpIcon /> },
};

export function StateBadge({ state }: { state: StatusState }) {
  const style = STATE[state];
  return (
    <StatusChip tone={style.tone} icon={style.icon}>
      {STATE_LABEL[state]}
    </StatusChip>
  );
}
