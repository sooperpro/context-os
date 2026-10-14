import type { SourceStatus } from "@contextos/shared";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { SOURCE_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

const STYLES: Record<SourceStatus, string> = {
  pending: "text-muted-foreground",
  processing: "text-info",
  ready: "border-success/40 bg-success/10 text-success",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function SourceStatusBadge({ status }: { status: SourceStatus }) {
  return (
    <Badge variant="outline" className={cn(STYLES[status])}>
      {status === "processing" || status === "pending" ? <Spinner className="size-3" /> : null}
      {SOURCE_STATUS_LABEL[status]}
    </Badge>
  );
}
