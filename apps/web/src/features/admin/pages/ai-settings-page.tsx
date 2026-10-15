import type { AiSettings, AiSettingsInput, AnswerStrictness } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ConnectorLogo } from "@/components/connector-logo";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { ConnectedButton, ConnectedButtonGroup } from "@/components/ui/connected-button-group";
import {
  AdminPanelSettingsIcon,
  ArrowForwardIcon,
  BlockIcon,
  HelpIcon,
  TuneIcon,
} from "@/components/ui/icons";
import { MiniTile } from "@/components/ui/kpi-tile";
import { Label } from "@/components/ui/label";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedList,
} from "@/components/ui/segmented-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ADMIN_ENDPOINTS as E } from "@/features/admin/api/admin.api";
import { aiSettingsQuery, useUpdateAiSettings } from "@/features/admin/api/admin.queries";
import { ACCESS_PATH, STRICTNESS } from "@/features/admin/admin-meta";
import { formatPercent } from "@/lib/format";

const STALE = { "1": "1 hour", "2": "2 hours", "6": "6 hours", "24": "24 hours" } as const;
const ROUTE = { "2": "2 people", "3": "3 people", "5": "5 people" } as const;

/** AI settings (prototype `#ai`): how Context Bot answers, cites and handles what it can't answer. */
export function AiSettingsPage() {
  useBotContext(
    {
      chips: [
        { icon: TuneIcon, label: "AI settings" },
        { icon: AdminPanelSettingsIcon, label: "Workspace" },
      ],
      suggestions: [
        "Which sources are excluded from answers?",
        "Why is the Jira connector failing?",
      ],
    },
    "ai",
  );
  const query = useQuery(aiSettingsQuery());
  const data = query.data;
  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker="Context Bot"
        title="AI settings"
        description="How Context Bot answers, cites its sources, and handles questions it can’t answer."
      />
      {query.isPending ? (
        <Skeleton className="h-96 rounded-card" />
      ) : !data ? (
        <SectionCard title="AI settings" endpoint={E.aiSettings.path} status={query} />
      ) : (
        <Settings data={data} />
      )}
    </div>
  );
}

function Settings({ data }: { data: AiSettings }) {
  const update = useUpdateAiSettings();
  const ids = { stale: useId(), route: useId(), digest: useId() };
  const save = (input: AiSettingsInput, message: string) =>
    update.mutate(input, {
      onSuccess: () => toast.success(message),
      onError: () => toast.error("The setting could not be saved. Please try again."),
    });
  const top = Math.max(...data.unhelpfulReasons.map((entry) => entry.share), 0.01);

  return (
    <>
      <div
        role="group"
        aria-label="Answer quality"
        className="grid grid-cols-2 gap-3 @min-[940px]:grid-cols-4"
      >
        <MiniTile
          className="bg-card"
          label="Rated helpful"
          value={formatPercent(data.stats.helpfulRate)}
        />
        <MiniTile
          className="bg-card"
          label="Answered with sources"
          value={formatPercent(data.stats.withSources)}
        />
        <MiniTile
          className="bg-card"
          label="No answer found"
          value={formatPercent(data.stats.noAnswer)}
        />
        <MiniTile
          className="bg-card"
          label={`Ratings, ${data.stats.periodDays} days`}
          value={data.stats.ratings.toLocaleString()}
        />
      </div>
      <PageColumns>
        <PageMain>
          <SectionCard title="Answer rules" endpoint={E.aiSettings.path}>
            <ul className="flex flex-col gap-4">
              {data.rules.map((rule) => (
                <li key={rule.id} className="flex items-start justify-between gap-4">
                  <label htmlFor={`rule-${rule.id}`} className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium">{rule.label}</span>
                    <span className="text-xs text-on-surface-variant">{rule.detail}</span>
                  </label>
                  <Switch
                    id={`rule-${rule.id}`}
                    checked={rule.enabled}
                    disabled={rule.locked || update.isPending}
                    onCheckedChange={(enabled) =>
                      save(
                        { rules: { [rule.id]: enabled } },
                        `${enabled ? "Turned on" : "Turned off"}: ${rule.label}`,
                      )
                    }
                  />
                </li>
              ))}
            </ul>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">When to say “no answer found”</legend>
              <ConnectedButtonGroup aria-label="Answer strictness">
                {(Object.keys(STRICTNESS) as AnswerStrictness[]).map((value) => (
                  <ConnectedButton
                    key={value}
                    pressed={data.strictness === value}
                    onClick={() =>
                      value === data.strictness
                        ? null
                        : save(
                            { strictness: value },
                            `Answer strictness set to ${STRICTNESS[value].label}`,
                          )
                    }
                  >
                    {STRICTNESS[value].label}
                  </ConnectedButton>
                ))}
              </ConnectedButtonGroup>
              <p className="text-xs text-on-surface-variant">
                {STRICTNESS[data.strictness].description}
              </p>
            </fieldset>
            <div className="grid gap-4 @min-[640px]:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.stale}>Warn when a source hasn’t synced for</Label>
                <Select
                  items={STALE}
                  value={String(data.staleAfterHours)}
                  onValueChange={(value) =>
                    save(
                      { staleAfterHours: Number(value) as AiSettings["staleAfterHours"] },
                      "Saved",
                    )
                  }
                >
                  <SelectTrigger id={ids.stale} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STALE) as Array<keyof typeof STALE>).map((value) => (
                      <SelectItem key={value} value={value}>
                        {STALE[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.route}>
                  Send an unanswered question to its owners once it’s asked by
                </Label>
                <Select
                  items={ROUTE}
                  value={String(data.routeAfterAsks)}
                  onValueChange={(value) =>
                    save({ routeAfterAsks: Number(value) as AiSettings["routeAfterAsks"] }, "Saved")
                  }
                >
                  <SelectTrigger id={ids.route} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROUTE) as Array<keyof typeof ROUTE>).map((value) => (
                      <SelectItem key={value} value={value}>
                        {ROUTE[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SectionCard>
          <SectionCard
            title="Never used in answers"
            action={
              <Button
                variant="ghost"
                size="xs"
                nativeButton={false}
                render={<Link to={ACCESS_PATH} />}
              >
                Manage in Access policies <ArrowForwardIcon aria-hidden />
              </Button>
            }
          >
            <ul className="flex flex-col gap-0.5">
              {data.excluded.map((entry) => (
                <li
                  key={entry.label}
                  className="flex items-center gap-3 rounded-xs bg-pane px-3 py-2.5 first:rounded-t-2xl last:rounded-b-2xl"
                >
                  <ConnectorLogo provider={entry.provider} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-on-surface-variant">
                      {entry.label}
                    </span>
                    <span className="text-xs text-on-surface-variant">{entry.reason}</span>
                  </span>
                  <BlockIcon className="size-5 shrink-0 text-error" aria-label="Excluded" />
                </li>
              ))}
            </ul>
          </SectionCard>
        </PageMain>
        <PageSide>
          <SectionCard
            title="Why answers were rated unhelpful"
            action={
              <span className="text-xs text-on-surface-variant">{data.stats.periodDays} days</span>
            }
          >
            {/* One series, one hue: bars scale to the largest reason; the value sits at the tip in text color. */}
            <ul aria-label="Reasons, share of unhelpful ratings" className="flex flex-col gap-2.5">
              {data.unhelpfulReasons.map((entry) => (
                <li
                  key={entry.reason}
                  title={`${entry.reason}: ${formatPercent(entry.share)}`}
                  className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)_40px] items-center gap-2.5"
                >
                  <span className="truncate text-sm">{entry.reason}</span>
                  <span className="h-4" aria-hidden>
                    <span
                      className="block h-full rounded-r-[4px] bg-primary"
                      style={{ width: `${(entry.share / top) * 100}%` }}
                    />
                  </span>
                  <span className="text-end text-xs tabular-nums">
                    {formatPercent(entry.share)}
                  </span>
                </li>
              ))}
            </ul>
            {data.unhelpfulNote ? (
              <p className="text-xs text-on-surface-variant">{data.unhelpfulNote}</p>
            ) : null}
          </SectionCard>
          <SectionCard title="Top unanswered questions">
            <SegmentedList>
              {data.unanswered.map((entry) => (
                <SegmentedItem key={entry.question} className="min-h-0 gap-3 px-3 py-2.5">
                  <SegmentedItemLead tone="ai" size="sm">
                    <HelpIcon />
                  </SegmentedItemLead>
                  <SegmentedItemBody>
                    <SegmentedItemTitle className="whitespace-normal">
                      {entry.question}
                    </SegmentedItemTitle>
                    <SegmentedItemMeta>
                      Asked {entry.asks}× · sent to {entry.routedTo}
                    </SegmentedItemMeta>
                  </SegmentedItemBody>
                </SegmentedItem>
              ))}
            </SegmentedList>
            <label
              htmlFor={ids.digest}
              className="flex items-center justify-between gap-3 rounded-md bg-pane px-3.5 py-3"
            >
              <span className="flex flex-col">
                <span className="text-sm font-medium">Weekly digest to managers</span>
                <span className="text-xs text-on-surface-variant">
                  Each manager gets their team’s unanswered questions on Mondays.
                </span>
              </span>
              <Switch
                id={ids.digest}
                checked={data.weeklyDigest}
                disabled={update.isPending}
                onCheckedChange={(on) =>
                  save(
                    { weeklyDigest: on },
                    on ? "Weekly digest turned on" : "Weekly digest turned off",
                  )
                }
              />
            </label>
          </SectionCard>
        </PageSide>
      </PageColumns>
    </>
  );
}
