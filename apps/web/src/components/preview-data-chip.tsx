import { ScienceIcon } from "@/components/ui/icons";
import { StatusChip } from "@/components/ui/status-chip";
import { isPreviewEndpoint } from "@/lib/preview-data";

/**
 * Marks content that comes from the development mock layer rather than the API, so sample data is
 * never mistaken for real data. Renders nothing in production, or once the endpoint is live.
 */
export function PreviewDataChip({ endpoint }: { endpoint?: string | readonly string[] }) {
  const paths = endpoint === undefined ? [] : typeof endpoint === "string" ? [endpoint] : endpoint;
  const mocked = paths.filter((path) => isPreviewEndpoint(path));
  if (mocked.length === 0) return null;
  return (
    <StatusChip
      tone="warning"
      icon={<ScienceIcon />}
      title={`Sample data: the API does not serve ${mocked.join(", ")} yet.`}
    >
      Preview data
    </StatusChip>
  );
}
