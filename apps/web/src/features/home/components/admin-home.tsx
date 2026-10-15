import type {
  AdminConnector,
  AuditEntry,
  SecurityCheck,
  SystemRole,
  WorkspaceMember,
} from "@contextos/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ConnectorLogo } from "@/components/connector-logo";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  AddIcon,
  ArrowForwardIcon,
  AutoDeleteIcon,
  CableIcon,
  CheckCircleIcon,
  ErrorIcon,
  KeyIcon,
  PersonAddIcon,
  PolicyIcon,
  SyncAltIcon,
  SyncProblemIcon,
  TuneIcon,
} from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { StatusChip } from "@/components/ui/status-chip";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminConnectorsQuery, useUpdateAiSettings } from "@/features/admin/api/admin.queries";
import {
  ACCESS_PATH,
  AI_SETTINGS_PATH,
  AUDIT_PATH,
  CONNECTORS_PATH,
  CONNECTOR_STATE,
  MEMBERS_PATH,
  auditArea,
} from "@/features/admin/admin-meta";
import { HOME_ENDPOINTS as E } from "@/features/home/api/home.api";
import { homeQuery } from "@/features/home/api/home.queries";
import { membersQuery } from "@/features/members/api/members.queries";
import { currentWorkspaceQuery } from "@/features/workspace/api/workspace.queries";
import {
  formatCount,
  formatDuration,
  formatPercent,
  formatRelativeTime,
  formatTime,
} from "@/lib/format";
import { AUDIT_ACTION_LABEL, ROLE_LABEL } from "@/lib/labels";
import { DotList } from "@/components/ui/dot-list";
import { DashboardGrid } from "./dashboard";
import { span } from "./dashboard-meta";

/**
 * The admin's workspace overview (prototype `adminHome`): connectors, members, security, sync
 * activity, AI answers and the audit log, all served by the API.
 */
export function AdminHome() {
  const workspace = useQuery(currentWorkspaceQuery());
  // The workspace's connectors (every member's connections), as on the Connectors page.
  const connectors = useQuery(adminConnectorsQuery());
  const members = useQuery(membersQuery());
  const connected = (connectors.data?.items ?? []).filter((item) => item.state !== "available");
  const broken = connected.filter((item) => item.state === "error");

  return (
    <div className="mx-auto flex max-w-360 flex-col">
      <PageHeader
        kicker={workspace.data?.name}
        title="Workspace overview"
        description={
          members.data && connectors.data
            ? `${formatCount(members.data.length, "member")} · ${formatCount(connected.length, "knowledge source")} connected`
            : undefined
        }
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link to={MEMBERS_PATH} />}>
              <PersonAddIcon aria-hidden /> Invite people
            </Button>
            <Button nativeButton={false} render={<Link to={CONNECTORS_PATH} />}>
              <AddIcon aria-hidden /> Add connector
            </Button>
          </>
        }
      />
      {broken.length ? (
        <Banner
          tone="error"
          className="mb-3 medium:mb-4"
          icon={<SyncProblemIcon aria-hidden />}
          title={
            broken.length === 1
              ? `${broken[0]?.name ?? "A knowledge source"} needs attention`
              : `${broken.length} knowledge sources need attention`
          }
          description={
            broken.length === 1 && broken[0]?.error
              ? `${broken[0].error} Answers that cite it may be out of date.`
              : "Imports from them are paused. Answers that cite them may be out of date."
          }
          actions={
            <Button
              variant="destructive"
              nativeButton={false}
              render={<Link to={CONNECTORS_PATH} />}
            >
              Reconnect
            </Button>
          }
        />
      ) : null}
      <DashboardGrid>
        <SourcesCard query={connectors} items={connected} />
        <SecurityCard />
        <SyncActivityCard />
        <AiAnswersCard />
        <AuditCard />
        <MembersCard query={members} />
      </DashboardGrid>
    </div>
  );
}

/* ---- Knowledge sources (live) ------------------------------------------------------------- */

function SourcesCard({
  query,
  items,
}: {
  query: UseQueryResult<{ items: AdminConnector[] }>;
  items: AdminConnector[];
}) {
  return (
    <SectionCard
      className={span(8)}
      title="Knowledge sources"
      count={query.data ? `${items.length} connected` : undefined}
      status={query}
      action={
        <Button variant="ghost" nativeButton={false} render={<Link to={CONNECTORS_PATH} />}>
          All connectors <ArrowForwardIcon aria-hidden />
        </Button>
      }
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {items.map((connector) => {
          const state = CONNECTOR_STATE[connector.state];
          return (
            <div key={connector.id} className="flex flex-col gap-3 rounded-xl bg-pane p-4">
              <div className="flex items-center gap-3">
                <ConnectorLogo provider={connector.id} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <b className="truncate text-sm font-medium">{connector.name}</b>
                  <span className="truncate text-xs text-on-surface-variant">
                    {connector.error ?? connector.detail ?? "Connected"}
                  </span>
                </div>
              </div>
              {connector.state === "syncing" && connector.progress !== null ? (
                <Progress
                  value={Math.round(connector.progress * 100)}
                  aria-label={`${connector.name} sync progress`}
                />
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusChip tone={state.tone} icon={<state.icon />}>
                  {state.short}
                </StatusChip>
                {connector.lastSyncAt ? (
                  <span className="text-xs text-on-surface-variant">
                    {formatRelativeTime(connector.lastSyncAt)}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
        <Link
          to={CONNECTORS_PATH}
          className="flex min-h-28 flex-col items-start justify-center gap-2 rounded-xl p-4 text-sm font-medium text-on-surface-variant shadow-[inset_0_0_0_1px_var(--color-outline-variant)] transition-colors outline-none hover:bg-on-surface/8 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="grid size-10 place-items-center rounded-md bg-surface-container-high [&_svg]:size-5">
            <CableIcon aria-hidden />
          </span>
          Add a knowledge source
        </Link>
      </div>
    </SectionCard>
  );
}

/* ---- Access & security (preview) ---------------------------------------------------------- */

const SECURITY: Record<SecurityCheck["id"], { label: string; icon: ReactNode; to?: string }> = {
  sso: { label: "Single sign-on", icon: <KeyIcon /> },
  scim: { label: "SCIM provisioning", icon: <SyncAltIcon />, to: MEMBERS_PATH },
  access_policies: { label: "Knowledge access policies", icon: <PolicyIcon />, to: ACCESS_PATH },
  role_requests: { label: "Role requests", icon: <PersonAddIcon />, to: MEMBERS_PATH },
  data_retention: { label: "Data retention", icon: <AutoDeleteIcon /> },
};

const SECURITY_STATE: Record<
  SecurityCheck["state"],
  { label: string; tone: "success" | "warning" | "neutral"; icon: ReactNode }
> = {
  ok: { label: "OK", tone: "success", icon: <CheckCircleIcon /> },
  attention: { label: "Review", tone: "warning", icon: <ErrorIcon /> },
  off: { label: "Off", tone: "neutral", icon: <SyncProblemIcon /> },
};

function SecurityCard() {
  const query = useQuery(homeQuery("security"));
  return (
    <SectionCard
      className={span(4)}
      title="Access & security"
      endpoint={E.security.path}
      status={query}
    >
      <SegmentedList>
        {(query.data?.items ?? []).map((check) => {
          const meta = SECURITY[check.id];
          const state = SECURITY_STATE[check.state];
          const body = (
            <>
              <SegmentedItemLead tone="neutral" size="sm">
                {meta.icon}
              </SegmentedItemLead>
              <SegmentedItemBody>
                <SegmentedItemTitle>{meta.label}</SegmentedItemTitle>
                <SegmentedItemMeta>{check.value}</SegmentedItemMeta>
              </SegmentedItemBody>
              <StatusChip tone={state.tone} icon={state.icon}>
                {state.label}
              </StatusChip>
            </>
          );
          return meta.to ? (
            <SegmentedItem
              key={check.id}
              className="min-h-15 gap-3 px-3.5 py-2.5"
              render={<Link to={meta.to} />}
            >
              {body}
            </SegmentedItem>
          ) : (
            <SegmentedItem key={check.id} className="min-h-15 gap-3 px-3.5 py-2.5">
              {body}
            </SegmentedItem>
          );
        })}
      </SegmentedList>
    </SectionCard>
  );
}

/* ---- Sync activity (preview) -------------------------------------------------------------- */

function SyncActivityCard() {
  const query = useQuery(homeQuery("syncRuns"));
  const items = query.data?.items ?? [];
  return (
    <SectionCard
      className={span(8)}
      title="Sync activity"
      count="Today"
      endpoint={E.syncRuns.path}
      status={query}
    >
      {items.length ? (
        <div className="-mx-6 overflow-x-auto px-6">
          <Table className="min-w-150">
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="tabular-nums">{formatTime(run.startedAt)}</TableCell>
                  <TableCell className="font-medium">{run.connector}</TableCell>
                  <TableCell>
                    {run.ok ? (
                      <StatusChip tone="success" icon={<CheckCircleIcon />}>
                        Succeeded
                      </StatusChip>
                    ) : (
                      <StatusChip tone="error" icon={<ErrorIcon />}>
                        Failed
                      </StatusChip>
                    )}
                  </TableCell>
                  <TableCell
                    className={run.ok ? "text-xs text-on-surface-variant" : "text-xs text-error"}
                  >
                    {run.detail}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatDuration(run.durationMs)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">No syncs ran today.</p>
      )}
    </SectionCard>
  );
}

/* ---- AI answers (preview) ----------------------------------------------------------------- */

function AiAnswersCard() {
  const query = useQuery(homeQuery("ai"));
  const update = useUpdateAiSettings();
  const data = query.data;
  return (
    <SectionCard
      className={span(4)}
      title="AI answers"
      endpoint={E.ai.path}
      status={query}
      action={
        <Button
          variant="ghost"
          size="icon"
          aria-label="AI settings"
          nativeButton={false}
          render={<Link to={AI_SETTINGS_PATH} />}
        >
          <TuneIcon />
        </Button>
      }
    >
      {data ? (
        <>
          <div className="flex items-end gap-3">
            <span className="font-heading text-5xl leading-[52px] font-semibold tracking-tight tabular-nums">
              {formatPercent(data.helpfulRate)}
            </span>
            <span className="pb-1 text-xs text-on-surface-variant">
              of answers rated helpful
              <br />
              {data.ratings.toLocaleString()} ratings in the last {data.periodDays} days
            </span>
          </div>
          {data.unanswered.length ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-on-surface-variant">Top unanswered</span>
              <ul aria-label="Top unanswered questions" className="flex flex-col gap-1">
                {data.unanswered.map((entry) => (
                  <li key={entry.question} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm">{entry.question}</span>
                    <span className="shrink-0 text-xs text-on-surface-variant tabular-nums">
                      {formatCount(entry.asks, "ask")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <ul className="flex flex-col gap-3">
            {data.settings.map((setting) => (
              <li key={setting.id} className="flex items-start justify-between gap-4">
                <label htmlFor={`ai-${setting.id}`} className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{setting.label}</span>
                  <span className="text-xs text-on-surface-variant">{setting.detail}</span>
                </label>
                <Switch
                  id={`ai-${setting.id}`}
                  checked={setting.enabled}
                  disabled={setting.locked || update.isPending}
                  onCheckedChange={(enabled) =>
                    update.mutate(
                      { rules: { [setting.id]: enabled } },
                      {
                        onSuccess: () =>
                          toast.success(
                            `${enabled ? "Turned on" : "Turned off"}: ${setting.label}`,
                          ),
                        onError: () =>
                          toast.error("The setting could not be saved. Please try again."),
                      },
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </SectionCard>
  );
}

/* ---- Audit log (live) --------------------------------------------------------------------- */

function AuditIcon({ action }: { action: string }) {
  const Icon = auditArea(action).icon;
  return <Icon />;
}

/** Newest first. The endpoint returns the oldest entries first and takes no sort yet. */
function latest(entries: AuditEntry[], count: number): AuditEntry[] {
  return [...entries]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, count);
}

function AuditCard() {
  const query = useQuery(homeQuery("audit", { limit: 100 }));
  const entries = latest(query.data?.items ?? [], 5);
  return (
    <SectionCard
      className={span(8)}
      title="Audit log"
      status={query}
      action={
        <Button variant="ghost" nativeButton={false} render={<Link to={AUDIT_PATH} />}>
          Full log <ArrowForwardIcon aria-hidden />
        </Button>
      }
    >
      {entries.length ? (
        <SegmentedList>
          {entries.map((entry) => (
            <SegmentedItem key={entry.id} className="min-h-0 gap-3 px-3 py-2.5">
              <SegmentedItemLead tone="neutral" size="sm">
                <AuditIcon action={entry.action} />
              </SegmentedItemLead>
              <SegmentedItemBody>
                <span className="text-sm text-on-surface">
                  {AUDIT_ACTION_LABEL[entry.action] ?? entry.action}
                </span>
                <SegmentedItemMeta>
                  <DotList parts={[entry.actorName, formatRelativeTime(entry.createdAt)]} />
                </SegmentedItemMeta>
              </SegmentedItemBody>
            </SegmentedItem>
          ))}
        </SegmentedList>
      ) : (
        <p className="text-sm text-on-surface-variant">Nothing has been recorded yet.</p>
      )}
    </SectionCard>
  );
}

/* ---- Members & roles (live) --------------------------------------------------------------- */

const ROLE_ORDER: SystemRole[] = ["member", "manager", "admin", "owner", "guest"];

function MembersCard({ query }: { query: UseQueryResult<WorkspaceMember[]> }) {
  const members = query.data ?? [];
  const active = members.filter((member) => member.status === "active").length;
  return (
    <SectionCard
      className={span(4)}
      title="Members & roles"
      status={query}
      action={
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          render={<Link to={MEMBERS_PATH} />}
          aria-label="Manage members"
        >
          <ArrowForwardIcon />
        </Button>
      }
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-[22px] leading-7 font-semibold tabular-nums">
            {active}
          </span>
          <span className="text-sm text-on-surface-variant">
            of {formatCount(members.length, "member")} active
          </span>
        </div>
        <Progress
          flat
          value={members.length ? Math.round((active / members.length) * 100) : 0}
          aria-label="Active members"
        />
      </div>
      <dl className="flex flex-col gap-2">
        {ROLE_ORDER.map((role) => {
          const count = members.filter((member) => member.role === role).length;
          return count ? (
            <div key={role} className="flex items-center justify-between gap-2">
              <dt className="text-sm">{ROLE_LABEL[role]}s</dt>
              <dd className="text-sm font-medium tabular-nums">{count}</dd>
            </div>
          ) : null;
        })}
      </dl>
    </SectionCard>
  );
}
