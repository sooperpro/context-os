import type { AuditEntry } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { Chip } from "@/components/ui/chip";
import { ConnectedButton, ConnectedButtonGroup } from "@/components/ui/connected-button-group";
import { DotList } from "@/components/ui/dot-list";
import {
  AdminPanelSettingsIcon,
  CheckIcon,
  HistoryIcon,
  KeyboardArrowDownIcon,
  KeyboardArrowUpIcon,
} from "@/components/ui/icons";
import { TypeChip } from "@/components/ui/meta-chip";
import { SearchField } from "@/components/ui/search-field";
import { SegmentedItemLead } from "@/components/ui/segmented-list";
import { ADMIN_ENDPOINTS as E } from "@/features/admin/api/admin.api";
import { auditQuery } from "@/features/admin/api/admin.queries";
import { AUDIT_CATEGORIES, auditArea, type AuditCategory } from "@/features/admin/admin-meta";
import { daysFromToday, formatDateTime, formatRelativeTime } from "@/lib/format";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { AUDIT_ACTION_LABEL } from "@/lib/labels";

const RANGES = [
  [0, "Today"],
  [7, "7 days"],
  [30, "30 days"],
] as const;

/**
 * The audit log (prototype `#audit`). The API returns the newest events in the chosen date range;
 * category and text filters apply here.
 */
export function AuditPage() {
  // HR gets the People Ops trail only (the API narrows it), so there is nothing to filter by area.
  const peopleOps = useViewer().persona === "people_ops";
  useBotContext(
    {
      chips: [
        { icon: HistoryIcon, label: "Audit log" },
        { icon: AdminPanelSettingsIcon, label: peopleOps ? "People Ops" : "Workspace" },
      ],
      suggestions: [
        peopleOps
          ? "Who recorded probation decisions this week?"
          : "Who changed access policies this week?",
      ],
    },
    "audit",
  );
  const [text, setText] = useState("");
  const [range, setRange] = useState<number>(7);
  const query = useQuery(auditQuery(range));
  const [category, setCategory] = useState<AuditCategory | "All">("All");
  const [open, setOpen] = useState<string | null>(null);
  const q = text.trim().toLowerCase();
  const entries = [...(query.data?.items ?? [])]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .filter((entry) => {
      const label = AUDIT_ACTION_LABEL[entry.action] ?? entry.action;
      return (
        -daysFromToday(entry.createdAt) <= range &&
        (category === "All" || auditArea(entry.action).category === category) &&
        (!q || `${entry.actorName} ${label} ${entry.action}`.toLowerCase().includes(q))
      );
    });

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker={peopleOps ? "People Ops" : "Security"}
        title="Audit log"
        description={
          peopleOps
            ? "Every onboarding, probation and template change, with who made it. Employment decisions are recorded here."
            : "Every change to access, roles, connectors, sources and workspace settings, with who made it."
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          label="Search the audit log"
          value={text}
          onValueChange={setText}
          placeholder="Search by person or action"
          className="flex-[1_1_320px]"
        />
        <ConnectedButtonGroup aria-label="Date range">
          {RANGES.map(([days, label]) => (
            <ConnectedButton key={days} pressed={range === days} onClick={() => setRange(days)}>
              {label}
            </ConnectedButton>
          ))}
        </ConnectedButtonGroup>
      </div>
      {peopleOps ? null : (
        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
          {(["All", ...AUDIT_CATEGORIES] as const).map((value) => (
            <Chip
              key={value}
              variant="filter"
              selected={category === value}
              onClick={() => setCategory(value)}
            >
              {category === value ? <CheckIcon aria-hidden /> : null}
              {value}
            </Chip>
          ))}
        </div>
      )}
      <SectionCard
        title="Events"
        count={query.data ? entries.length : undefined}
        endpoint={E.audit.path}
        status={query}
      >
        {entries.length ? (
          <ol className="flex flex-col gap-0.5">
            {entries.map((entry) => (
              <EventRow
                key={entry.id}
                entry={entry}
                open={open === entry.id}
                onToggle={() => setOpen(open === entry.id ? null : entry.id)}
              />
            ))}
          </ol>
        ) : (
          <p className="text-sm text-on-surface-variant">No events match these filters.</p>
        )}
        {query.data && query.data.items.length >= 100 ? (
          <p className="text-xs text-on-surface-variant">Showing the latest 100 events.</p>
        ) : null}
      </SectionCard>
    </div>
  );
}

function EventRow({
  entry,
  open,
  onToggle,
}: {
  entry: AuditEntry;
  open: boolean;
  onToggle: () => void;
}) {
  const area = auditArea(entry.action);
  const label = AUDIT_ACTION_LABEL[entry.action] ?? entry.action;
  const detailId = `audit-${entry.id}`;
  const metadata = Object.entries(entry.metadata ?? {}).filter(
    ([, value]) => value !== null && value !== undefined,
  );
  return (
    <li className="overflow-hidden rounded-xs bg-pane first:rounded-t-[20px] last:rounded-b-[20px] only:rounded-[20px]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-start transition-colors outline-none hover:bg-on-surface/4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <SegmentedItemLead tone="neutral" size="sm">
          <area.icon />
        </SegmentedItemLead>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm">{label}</span>
          <span className="text-xs text-on-surface-variant">
            <DotList parts={[entry.actorName, formatRelativeTime(entry.createdAt)]} />
          </span>
        </span>
        <TypeChip className="hidden @min-[640px]:inline-flex">{area.category}</TypeChip>
        {open ? (
          <KeyboardArrowUpIcon className="size-5 shrink-0 text-on-surface-variant" aria-hidden />
        ) : (
          <KeyboardArrowDownIcon className="size-5 shrink-0 text-on-surface-variant" aria-hidden />
        )}
      </button>
      {open ? (
        <div id={detailId} className="px-3.5 pb-3.5 @min-[640px]:pl-15">
          <dl className="grid max-w-120 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
            <dt className="text-on-surface-variant">Actor</dt>
            <dd>{entry.actorName}</dd>
            <dt className="text-on-surface-variant">When</dt>
            <dd>{formatDateTime(entry.createdAt)}</dd>
            <dt className="text-on-surface-variant">Target</dt>
            <dd className="break-all">
              {entry.targetType} · {entry.targetId}
            </dd>
            <dt className="text-on-surface-variant">Action</dt>
            <dd className="font-mono">{entry.action}</dd>
            {metadata.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-on-surface-variant">{key}</dt>
                <dd className="break-all">
                  {typeof value === "string" ? value : JSON.stringify(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </li>
  );
}
