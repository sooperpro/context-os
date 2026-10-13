import type { SyncStatus as SyncStatusValue } from "@contextos/shared";
import { AlertTriangleIcon, CheckCircle2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";

export function SyncStatus({ sync }: { sync: SyncStatusValue }) {
  if (sync.state === "processing") {
    const pending = sync.queued + sync.running;
    return (
      <Badge variant="outline" className="text-sky-700 dark:text-sky-400">
        <Spinner className="size-3" />
        Processing {pending} {pending === 1 ? "job" : "jobs"}
      </Badge>
    );
  }
  if (sync.state === "attention") {
    return (
      <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
        <AlertTriangleIcon aria-hidden />
        {sync.failed} failed {sync.failed === 1 ? "job" : "jobs"}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-muted-foreground"
      title={sync.lastCompletedAt ? `Last sync ${formatDateTime(sync.lastCompletedAt)}` : undefined}
    >
      <CheckCircle2Icon aria-hidden />
      {sync.lastCompletedAt ? `Synced ${formatDateTime(sync.lastCompletedAt)}` : "Up to date"}
    </Badge>
  );
}
