import type { AccessConflict, AccessPolicy } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useId, useState } from "react";
import { ConnectorLogo } from "@/components/connector-logo";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  AddIcon,
  AdminPanelSettingsIcon,
  BlockIcon,
  CallSplitIcon,
  CheckCircleFilledIcon,
  EditIcon,
  GroupIcon,
  LockIcon,
  PolicyIcon,
} from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { MetaChip } from "@/components/ui/meta-chip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { ADMIN_ENDPOINTS as E } from "@/features/admin/api/admin.api";
import { accessPreviewQuery, policiesQuery } from "@/features/admin/api/admin.queries";
import { PolicyDialog, ResolveConflictDialog } from "@/features/admin/components/policy-dialogs";
import { POLICY_EFFECT } from "@/features/admin/admin-meta";

/**
 * Access policies (prototype `#access`): source permissions are mirrored first, policies add rules
 * on top for search and answers alike. Conflicts are flagged and resolved here; the preview shows
 * what one person can reach.
 */
export function AccessPage() {
  useBotContext(
    {
      chips: [
        { icon: PolicyIcon, label: "Access policies" },
        { icon: AdminPanelSettingsIcon, label: "Workspace" },
      ],
      suggestions: [
        "Which sources are excluded from answers?",
        "Who changed access policies this week?",
      ],
    },
    "access",
  );
  const query = useQuery(policiesQuery());
  const [editing, setEditing] = useState<{ policy: AccessPolicy | null } | null>(null);
  const [resolving, setResolving] = useState<AccessConflict | null>(null);
  const data = query.data;
  const conflict = data?.conflicts[0];

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker={data ? `${data.total} policies · ${data.items.length} shown` : undefined}
        title="Access policies"
        description="ContextOS mirrors each source’s permissions first. Policies add rules on top, for search and Context Bot answers alike."
        actions={
          <Button disabled={!data} onClick={() => setEditing({ policy: null })}>
            <AddIcon aria-hidden /> New policy
          </Button>
        }
      />
      {conflict ? (
        <Banner
          tone="error"
          icon={<CallSplitIcon aria-hidden />}
          title={conflict.title}
          description={conflict.description}
          actions={
            <Button variant="destructive" onClick={() => setResolving(conflict)}>
              Resolve
            </Button>
          }
        />
      ) : null}
      {query.isPending ? (
        <Skeleton className="h-96 rounded-card" />
      ) : (
        <PageColumns>
          <PageMain>
            <SectionCard title="Policies" endpoint={E.policies.path} status={query}>
              <ul className="flex flex-col gap-0.5">
                {(data?.items ?? []).map((policy) => (
                  <PolicyItem
                    key={policy.id}
                    policy={policy}
                    onEdit={() => setEditing({ policy })}
                  />
                ))}
              </ul>
            </SectionCard>
          </PageMain>
          <PageSide>
            {data?.previewPeople.length ? <PreviewCard people={data.previewPeople} /> : null}
          </PageSide>
        </PageColumns>
      )}
      <PolicyDialog
        policy={editing?.policy ?? null}
        open={editing !== null}
        groups={data?.groups ?? []}
        sources={data?.sourceOptions ?? []}
        onOpenChange={(open) => (open ? null : setEditing(null))}
      />
      <ResolveConflictDialog
        conflict={resolving}
        onOpenChange={(open) => (open ? null : setResolving(null))}
      />
    </div>
  );
}

function PolicyItem({ policy, onEdit }: { policy: AccessPolicy; onEdit: () => void }) {
  const effect = POLICY_EFFECT[policy.effect];
  return (
    <li
      className={cn(
        "flex flex-col items-start gap-2 rounded-xs bg-pane px-4 py-3.5 first:rounded-t-[20px] last:rounded-b-[20px]",
        policy.conflict &&
          "shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--color-error)_60%,transparent)]",
      )}
    >
      <span className="flex flex-wrap items-center gap-2">
        <b className="text-sm font-medium">{policy.name}</b>
        <StatusChip tone={effect.tone} icon={<effect.icon />}>
          {effect.label}
        </StatusChip>
        {policy.conflict ? (
          <StatusChip tone="error" icon={<CallSplitIcon />}>
            Conflict
          </StatusChip>
        ) : null}
      </span>
      <p className="text-xs text-on-surface-variant">{policy.description}</p>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {policy.sources.length ? (
          <span className="flex flex-wrap gap-1.5">
            {policy.sources.map((source) => (
              <span key={source.label} className="inline-flex items-center gap-1.5 text-xs">
                <ConnectorLogo provider={source.provider} size="sm" />
                {source.label}
              </span>
            ))}
          </span>
        ) : null}
        <span className="flex flex-wrap gap-1.5">
          {policy.groups.map((group) => (
            <MetaChip key={group} tone="outline" className="gap-1">
              <GroupIcon aria-hidden /> {group}
            </MetaChip>
          ))}
        </span>
      </span>
      {policy.locked ? (
        <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
          <LockIcon className="size-4" aria-hidden /> Always on
        </span>
      ) : (
        <Button size="xs" variant="ghost" aria-label={`Edit ${policy.name}`} onClick={onEdit}>
          <EditIcon aria-hidden /> Edit
        </Button>
      )}
    </li>
  );
}

function PreviewCard({
  people,
}: {
  people: Array<{ person: { id: string; name: string }; groups: string }>;
}) {
  const fieldId = useId();
  const [personId, setPersonId] = useState(people[0]?.person.id ?? "");
  const preview = useQuery(accessPreviewQuery(personId));
  const items = Object.fromEntries(
    people.map((entry) => [entry.person.id, `${entry.person.name} · ${entry.groups}`]),
  );
  return (
    <SectionCard title="Preview access" endpoint={E.preview.path} status={preview}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId}>See what someone can access</Label>
        <Select
          items={items}
          value={personId}
          onValueChange={(value) => setPersonId(String(value))}
        >
          <SelectTrigger id={fieldId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {people.map((entry) => (
              <SelectItem key={entry.person.id} value={entry.person.id}>
                {items[entry.person.id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ul
        aria-label={`What ${preview.data?.person.name ?? "they"} can access`}
        className="flex flex-col gap-0.5"
      >
        {(preview.data?.items ?? []).map((row) => (
          <li
            key={row.label}
            className="flex items-center gap-3 rounded-xs bg-pane px-3 py-2.5 first:rounded-t-2xl last:rounded-b-2xl"
          >
            <ConnectorLogo provider={row.provider} size="sm" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn("text-sm font-medium", !row.allowed && "text-on-surface-variant")}
              >
                {row.label}
              </span>
              <span className="text-xs text-on-surface-variant">{row.reason}</span>
            </span>
            {row.allowed ? (
              <CheckCircleFilledIcon className="size-5 shrink-0 text-success" aria-hidden />
            ) : (
              <BlockIcon className="size-5 shrink-0 text-error" aria-hidden />
            )}
            <span className="sr-only">{row.allowed ? "Can access" : "No access"}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
