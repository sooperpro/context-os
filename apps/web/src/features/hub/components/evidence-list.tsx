import type { Evidence } from "@contextos/shared";
import { Button } from "@/components/ui/button";
import { FormatQuoteIcon, WarningIcon } from "@/components/ui/icons";
import { useSourceDrawer } from "@/features/sources/hooks/use-source-drawer";
import { formatDate } from "@/lib/format";
import { SOURCE_KIND_LABEL } from "@/lib/labels";

/** Every claim links back to the source span it rests on. */
export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  const drawer = useSourceDrawer();
  if (evidence.length === 0) {
    return <p className="text-xs text-muted-foreground">No evidence recorded.</p>;
  }
  return (
    <ul className="space-y-2">
      {evidence.map((item) => (
        <li key={item.id} className="rounded-md bg-pane px-3 py-2 text-sm">
          <blockquote className="flex gap-2">
            <FormatQuoteIcon className="mt-0.5 size-4 shrink-0 text-on-surface-variant" aria-hidden />
            <span className="leading-snug">{item.quote}</span>
          </blockquote>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{SOURCE_KIND_LABEL[item.sourceKind]}</span>
            <span aria-hidden>·</span>
            <Button
              variant="link"
              size="xs"
              className="h-auto px-0 text-xs"
              onClick={() => drawer.open({ sourceId: item.sourceObjectId, quote: item.quote })}
            >
              {item.sourceTitle}
            </Button>
            {item.sourceCreatedAt ? (
              <>
                <span aria-hidden>·</span>
                <span>{formatDate(item.sourceCreatedAt)}</span>
              </>
            ) : null}
            {!item.quoteVerified ? (
              <span className="flex items-center gap-1 text-warning">
                <WarningIcon className="size-3.5" aria-hidden />
                Quote not found verbatim in source
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
