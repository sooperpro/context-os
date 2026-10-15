import type { AdminConnector, ConnectorCategory } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConnectorLogo } from "@/components/connector-logo";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyMini } from "@/components/ui/empty-mini";
import {
  AddCommentIcon,
  AddLinkIcon,
  AdminPanelSettingsIcon,
  CableIcon,
  CheckIcon,
  ErrorIcon,
  SearchOffIcon,
  SettingsIcon,
  ShieldPersonIcon,
  VerifiedUserIcon,
} from "@/components/ui/icons";
import { MiniTile } from "@/components/ui/kpi-tile";
import { Progress } from "@/components/ui/progress";
import { SearchField } from "@/components/ui/search-field";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { ADMIN_ENDPOINTS as E } from "@/features/admin/api/admin.api";
import { adminConnectorsQuery, useReconnectConnector } from "@/features/admin/api/admin.queries";
import {
  ConnectWizard,
  ManageConnectorDialog,
  RequestConnectorDialog,
} from "@/features/admin/components/connector-dialogs";
import { CONNECTOR_CATEGORY, CONNECTOR_STATE } from "@/features/admin/admin-meta";
import { ApiClientError } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/format";

/** Connectors (prototype `#connectors`): what's connected and healthy, and the catalog to add more. */
export function ConnectorsPage() {
  useBotContext(
    {
      chips: [
        { icon: CableIcon, label: "Connectors" },
        { icon: AdminPanelSettingsIcon, label: "Workspace" },
      ],
      suggestions: [
        "Why is the Jira connector failing?",
        "Which sources are excluded from answers?",
      ],
    },
    "connectors",
  );
  const query = useQuery(adminConnectorsQuery());
  const [requesting, setRequesting] = useState(false);
  const [connecting, setConnecting] = useState<AdminConnector | null>(null);
  const [managing, setManaging] = useState<AdminConnector | null>(null);
  const [category, setCategory] = useState<ConnectorCategory | "all">("all");
  const [text, setText] = useState("");
  const items = query.data?.items ?? [];
  const connected = items.filter((item) => item.state !== "available");
  const failing = connected.filter((item) => item.state === "error").length;
  const q = text.trim().toLowerCase();
  const catalog = items.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      (!q || `${item.name} ${item.description}`.toLowerCase().includes(q)),
  );
  useReadyToasts(items);

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker="Workspace settings"
        title="Connectors"
        description="Connect the tools where your company’s knowledge lives. ContextOS reads content and who can see it, so people only get answers from sources they can already open."
        actions={
          <Button variant="outline" onClick={() => setRequesting(true)}>
            <AddCommentIcon aria-hidden /> Request a connector
          </Button>
        }
      />
      {query.isPending ? (
        <Skeleton className="h-96 rounded-card" />
      ) : query.isError ? (
        <SectionCard title="Connectors" endpoint={E.connectors.path} status={query} />
      ) : (
        <>
          <div
            role="group"
            aria-label="Summary"
            className="grid grid-cols-2 gap-3 @min-[940px]:grid-cols-[1fr_1fr_1fr_2fr]"
          >
            <MiniTile className="bg-card" label="Connected" value={connected.length} />
            <MiniTile
              className="bg-card"
              label={
                failing ? (
                  <>
                    <ErrorIcon aria-hidden /> Need attention
                  </>
                ) : (
                  "Need attention"
                )
              }
              value={failing}
              tone={failing ? "error" : "neutral"}
            />
            <MiniTile
              className="bg-card"
              label="Available to add"
              value={items.length - connected.length}
            />
            <div className="col-span-2 flex items-center gap-3 rounded-lg bg-card px-4 py-3.5 text-xs @min-[940px]:col-span-1">
              <VerifiedUserIcon className="size-6 shrink-0 text-success" aria-hidden />
              Read-only access. Each source’s sharing permissions are enforced in search and Context
              Bot answers.
            </div>
          </div>
          <SectionCard title="Connected" count={connected.length} endpoint={E.connectors.path}>
            <ul
              aria-label="Connected sources"
              className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3"
            >
              {connected.map((connector) => (
                <li key={connector.id} className="flex">
                  <ConnectedCard connector={connector} onManage={() => setManaging(connector)} />
                </li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard title="Add a knowledge source" count={`${items.length} integrations`}>
            <div className="flex flex-col gap-3">
              <SearchField
                label="Search connectors"
                value={text}
                onValueChange={setText}
                placeholder="Search connectors"
                tone="field"
                className="max-w-120"
              />
              <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
                {(
                  ["all", ...Object.keys(CONNECTOR_CATEGORY)] as Array<ConnectorCategory | "all">
                ).map((value) => (
                  <Chip
                    key={value}
                    variant="filter"
                    selected={category === value}
                    onClick={() => setCategory(value)}
                  >
                    {category === value ? <CheckIcon aria-hidden /> : null}
                    {value === "all" ? "All" : CONNECTOR_CATEGORY[value]}
                  </Chip>
                ))}
              </div>
            </div>
            {catalog.length ? (
              <ul
                aria-label="Catalog"
                aria-live="polite"
                className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3"
              >
                {catalog.map((connector) => (
                  <li key={connector.id} className="flex">
                    <CatalogCard
                      connector={connector}
                      onConnect={() => setConnecting(connector)}
                      onManage={() => setManaging(connector)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyMini
                icon={<SearchOffIcon />}
                title={
                  q ? `No connectors match “${text.trim()}”` : "No connectors in this category"
                }
                description="Tell us which tool you use and we’ll prioritize it."
                action={
                  <Button size="xs" variant="outline" onClick={() => setRequesting(true)}>
                    Request a connector
                  </Button>
                }
              />
            )}
          </SectionCard>
        </>
      )}
      <ConnectWizard
        connector={connecting}
        onOpenChange={(open) => (open ? null : setConnecting(null))}
      />
      <ManageConnectorDialog
        connector={managing}
        onOpenChange={(open) => (open ? null : setManaging(null))}
        onAddMore={(connector) => setConnecting(connector)}
      />
      <RequestConnectorDialog open={requesting} onOpenChange={setRequesting} />
    </div>
  );
}

/** Tells the admin when a first sync or a reconnect finishes. */
function useReadyToasts(items: AdminConnector[]) {
  const syncing = useRef(new Set<string>());
  useEffect(() => {
    for (const item of items) {
      if (item.state === "syncing") syncing.current.add(item.id);
      else if (syncing.current.has(item.id)) {
        syncing.current.delete(item.id);
        if (item.state === "healthy")
          toast.success(
            `${item.name} is ready. Its content now appears in search and Context Bot answers.`,
          );
      }
    }
  }, [items]);
}

function syncedLine(connector: AdminConnector): string {
  if (!connector.lastSyncAt) return "";
  const when = formatRelativeTime(connector.lastSyncAt).toLowerCase();
  if (connector.state === "syncing") return `Started ${when}`;
  if (connector.state === "error") return `Failed ${when}`;
  return `Synced ${when}`;
}

function ConnectedCard({
  connector,
  onManage,
}: {
  connector: AdminConnector;
  onManage: () => void;
}) {
  const reconnect = useReconnectConnector();
  const state = CONNECTOR_STATE[connector.state];
  return (
    <article
      aria-label={connector.name}
      className={cn(
        "flex w-full flex-col gap-2 rounded-xl bg-pane p-4",
        connector.state === "error" &&
          "shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--color-error)_60%,transparent)]",
      )}
    >
      <span className="mb-1 flex items-center justify-between gap-2">
        <ConnectorLogo provider={connector.id} />
        <StatusChip tone={state.tone} icon={<state.icon />}>
          {state.short}
        </StatusChip>
      </span>
      <b className="font-heading text-base font-medium">{connector.name}</b>
      <span className="text-xs text-on-surface-variant">{connector.error ?? connector.detail}</span>
      {connector.state === "syncing" && connector.progress !== null ? (
        <Progress
          value={Math.round(connector.progress * 100)}
          aria-label={`${connector.name} sync progress`}
        />
      ) : null}
      <span className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-on-surface-variant">{syncedLine(connector)}</span>
        {connector.state === "error" ? (
          <Button
            size="xs"
            variant="secondary"
            disabled={reconnect.isPending}
            onClick={() =>
              reconnect.mutate(connector.id, {
                onSuccess: () => toast(`Reconnecting ${connector.name}…`),
                onError: (error) =>
                  toast.error(
                    error instanceof ApiClientError
                      ? error.message
                      : `${connector.name} could not be reconnected. Please try again.`,
                  ),
              })
            }
          >
            Fix
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${connector.name} settings`}
            onClick={onManage}
          >
            <SettingsIcon aria-hidden />
          </Button>
        )}
      </span>
    </article>
  );
}

function CatalogCard({
  connector,
  onConnect,
  onManage,
}: {
  connector: AdminConnector;
  onConnect: () => void;
  onManage: () => void;
}) {
  const state = CONNECTOR_STATE[connector.state];
  const on = connector.state !== "available";
  return (
    <article
      aria-label={connector.name}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-xl p-4",
        on ? "bg-pane" : "shadow-[inset_0_0_0_1px_var(--color-outline-variant)]",
      )}
    >
      <span className="mb-1.5 flex items-start justify-between gap-2">
        <ConnectorLogo provider={connector.id} size="lg" />
        {connector.popular && !on ? <Badge variant="info">Popular</Badge> : null}
      </span>
      <h3 className="font-heading text-base font-medium">{connector.name}</h3>
      <span className="text-xs font-medium text-on-surface-variant">
        {CONNECTOR_CATEGORY[connector.category]}
      </span>
      <p className="text-sm text-on-surface-variant">{connector.description}</p>
      {connector.needsAdminOf && !on ? (
        <span className="flex items-center gap-1 text-xs text-on-surface-variant">
          <ShieldPersonIcon className="size-4" aria-hidden /> Needs {connector.needsAdminOf} admin
        </span>
      ) : null}
      <span className="mt-auto flex items-center justify-between gap-2 pt-2">
        {on ? (
          <>
            <StatusChip tone={state.tone} icon={<state.icon />}>
              {state.long}
            </StatusChip>
            <Button size="xs" variant="ghost" onClick={onManage}>
              Manage
            </Button>
          </>
        ) : (
          <Button size="xs" onClick={onConnect} aria-label={`Connect ${connector.name}`}>
            <AddLinkIcon aria-hidden /> Connect
          </Button>
        )}
      </span>
    </article>
  );
}
