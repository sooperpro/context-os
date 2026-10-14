import type { SyncStatus as SyncStatusValue } from "@contextos/shared";
import { CheckCircleFilledIcon, WarningIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip } from "@/components/ui/status-chip";
import { formatDateTime } from "@/lib/format";

export function SyncStatus({ sync }: { sync: SyncStatusValue }) {
  if (sync.state === "processing") {
    const pending = sync.queued + sync.running;
    return (
      <StatusChip tone="info" icon={<Spinner className="size-3.5" />}>
        Processing {pending} {pending === 1 ? "job" : "jobs"}
      </StatusChip>
    );
  }
  if (sync.state === "attention") {
    return (
      <StatusChip tone="error" icon={<WarningIcon />}>
        {sync.failed} failed {sync.failed === 1 ? "job" : "jobs"}
      </StatusChip>
    );
  }
  return (
    <StatusChip
      tone="success"
      icon={<CheckCircleFilledIcon />}
      title={sync.lastCompletedAt ? `Last sync ${formatDateTime(sync.lastCompletedAt)}` : undefined}
    >
      {sync.lastCompletedAt ? `Synced ${formatDateTime(sync.lastCompletedAt)}` : "Up to date"}
    </StatusChip>
  );
}
