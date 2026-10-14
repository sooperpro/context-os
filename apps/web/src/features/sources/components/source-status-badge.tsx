import type { SourceStatus } from "@contextos/shared";
import { CheckCircleFilledIcon, ErrorFilledIcon, PendingIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip } from "@/components/ui/status-chip";
import { SOURCE_STATUS_LABEL } from "@/lib/labels";

type Tone = React.ComponentProps<typeof StatusChip>["tone"];

const STYLE: Record<SourceStatus, { tone: Tone; icon: React.ReactNode }> = {
  pending: { tone: "neutral", icon: <PendingIcon /> },
  processing: { tone: "info", icon: <Spinner className="size-3.5" /> },
  ready: { tone: "success", icon: <CheckCircleFilledIcon /> },
  failed: { tone: "error", icon: <ErrorFilledIcon /> },
};

export function SourceStatusBadge({ status }: { status: SourceStatus }) {
  const style = STYLE[status];
  return (
    <StatusChip tone={style.tone} icon={style.icon}>
      {SOURCE_STATUS_LABEL[status]}
    </StatusChip>
  );
}
