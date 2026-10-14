import type { OnboardingTemplate } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "@/components/layout/page-header";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { AddIcon, CheckCircleIcon, EditIcon, LibraryBooksIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { HOME_ENDPOINTS } from "@/features/home/api/home.api";
import { homeQuery } from "@/features/home/api/home.queries";
import { NewTemplateDialog, TemplateTile } from "@/features/people-ops/components/template-parts";
import { templatePath } from "@/features/people-ops/people-ops-meta";
import { formatShortDate } from "@/lib/format";

/** Onboarding templates (prototype `#templates`): reusable roadmaps by role. */
export function TemplatesPage() {
  useBotContext(
    {
      chips: [{ icon: LibraryBooksIcon, label: "Onboarding templates" }],
      suggestions: [
        "What changed in the Engineering template v4?",
        "Which teams have overdue check-ins?",
      ],
    },
    "templates",
  );
  const query = useQuery(homeQuery("templates"));
  const [creating, setCreating] = useState(false);
  const items = query.data?.items ?? [];

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker="People Operations"
        title="Onboarding templates"
        description="Reusable roadmaps by role. Managers start from a template and adjust it for each person."
        actions={
          <Button disabled={!items.length} onClick={() => setCreating(true)}>
            <AddIcon aria-hidden /> New template
          </Button>
        }
      />
      <div className="flex justify-end empty:hidden">
        <PreviewDataChip endpoint={HOME_ENDPOINTS.templates.path} />
      </div>
      {query.isPending ? (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3"
          aria-busy="true"
        >
          {[0, 1, 2].map((tile) => (
            <Skeleton key={tile} className="h-64 rounded-3xl" />
          ))}
        </div>
      ) : query.isError ? (
        <SectionCard
          title="Onboarding templates"
          endpoint={HOME_ENDPOINTS.templates.path}
          status={query}
        />
      ) : (
        <ul
          aria-label="Templates"
          className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3"
        >
          {items.map((template) => (
            <li key={template.id} className="flex">
              <TemplateCard template={template} />
            </li>
          ))}
        </ul>
      )}
      <NewTemplateDialog open={creating} onOpenChange={setCreating} templates={items} />
    </div>
  );
}

function TemplateCard({ template }: { template: OnboardingTemplate }) {
  const stats = [
    ["Stages", template.stageCount],
    ["Modules", template.moduleCount],
    ["In use", template.activeCount],
  ] as const;
  return (
    <Link
      to={templatePath(template.id)}
      className="flex w-full flex-col gap-2 rounded-3xl bg-card p-4.5 text-on-surface no-underline transition-[border-radius,box-shadow] duration-[350ms] ease-spring-fast-spatial outline-none hover:rounded-[32px] hover:shadow-elevation-1 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="mb-1 flex items-center justify-between gap-2">
        <TemplateTile family={template.family} />
        {template.status === "draft" ? (
          <StatusChip icon={<EditIcon />}>Draft {template.version}</StatusChip>
        ) : (
          <StatusChip tone="success" icon={<CheckCircleIcon />}>
            {template.version}
          </StatusChip>
        )}
      </span>
      <b className="font-heading text-base font-medium">{template.name}</b>
      <span className="text-xs text-on-surface-variant">
        {template.roles.join(", ")} · {template.weeks} weeks
      </span>
      <dl className="my-1 grid grid-cols-3 gap-0.5">
        {stats.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col rounded-[4px] bg-pane px-2.5 py-2 first:rounded-l-xl last:rounded-r-xl"
          >
            <dt className="text-[11px] font-medium tracking-[0.4px] text-on-surface-variant">
              {label}
            </dt>
            <dd className="text-sm font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <span className="text-xs text-on-surface-variant">
        Updated {formatShortDate(template.updatedAt)} by {template.updatedBy}
      </span>
    </Link>
  );
}
