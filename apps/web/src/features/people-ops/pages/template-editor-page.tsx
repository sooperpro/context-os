import type { TemplateDetail, TemplateModule } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { SectionCard } from "@/components/section-card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DotList } from "@/components/ui/dot-list";
import {
  AddIcon,
  ArrowDownwardIcon,
  ArrowUpwardIcon,
  DeleteIcon,
  HistoryIcon,
  InfoIcon,
  PublishIcon,
  SaveIcon,
} from "@/components/ui/icons";
import { Loader } from "@/components/ui/loader";
import { MetaChip } from "@/components/ui/meta-chip";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { PEOPLE_OPS_ENDPOINTS as E } from "@/features/people-ops/api/people-ops.api";
import {
  templateQuery,
  usePublishTemplate,
  useSaveTemplateDraft,
} from "@/features/people-ops/api/people-ops.queries";
import {
  AddModuleDialog,
  PublishDialog,
  TemplateTile,
} from "@/features/people-ops/components/template-parts";
import {
  TEMPLATES_PATH,
  TEMPLATE_MODULE_KIND,
  minutesLabel,
  templateModuleMeta,
  weeksLabel,
} from "@/features/people-ops/people-ops-meta";
import { formatCount, formatShortDate } from "@/lib/format";

/** The template editor (prototype `#templates-<id>`): stages and modules, who it is for, versions. */
export function TemplateEditorPage() {
  const { templateId = "" } = useParams();
  const query = useQuery(templateQuery(templateId));
  if (query.isPending) {
    return (
      <div className="grid min-h-80 place-items-center">
        <Loader label="Loading the template" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-360">
        <SectionCard
          title="This template could not be loaded"
          endpoint={E.template.path}
          status={query}
        />
      </div>
    );
  }
  // A saved or published version starts a fresh editing session.
  return <Editor key={`${query.data.version}-${query.data.updatedAt}`} template={query.data} />;
}

type Stages = TemplateDetail["stages"];

function Editor({ template }: { template: TemplateDetail }) {
  const [stages, setStages] = useState<Stages>(template.stages);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState<{ id: string; name: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const save = useSaveTemplateDraft(template.id);
  const publish = usePublishTemplate(template.id);
  const draft = template.status === "draft";
  const number = Number(template.version.slice(1)) || 1;
  const next = draft ? template.version : `v${number + 1}`;
  const inTemplate = new Set(stages.flatMap((stage) => stage.modules.map((module) => module.id)));
  const totalMinutes = stages.reduce(
    (sum, stage) => sum + stage.modules.reduce((acc, module) => acc + (module.minutes ?? 0), 0),
    0,
  );
  const payload = () =>
    stages.map((stage) => ({ id: stage.id, moduleIds: stage.modules.map((module) => module.id) }));

  const change = (stageId: string, update: (modules: TemplateModule[]) => TemplateModule[]) => {
    setStages((current) =>
      current.map((stage) =>
        stage.id === stageId ? { ...stage, modules: update(stage.modules) } : stage,
      ),
    );
    setDirty(true);
  };

  const move = (stageId: string, index: number, by: -1 | 1) =>
    change(stageId, (modules) => {
      const next = [...modules];
      const [module] = next.splice(index, 1);
      if (module) next.splice(index + by, 0, module);
      return next;
    });

  const remove = (stageId: string, index: number) => {
    const module = stages.find((stage) => stage.id === stageId)?.modules[index];
    if (!module) return;
    change(stageId, (modules) => modules.filter((_, position) => position !== index));
    toast(`Removed “${module.title}”`, {
      action: {
        label: "Undo",
        onClick: () =>
          change(stageId, (modules) => [
            ...modules.slice(0, index),
            module,
            ...modules.slice(index),
          ]),
      },
    });
  };

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to={TEMPLATES_PATH} />}>Templates</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{template.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <TemplateTile family={template.family} size="lg" />
          <div className="min-w-0">
            <h1 className="font-heading text-[28px] leading-9 font-semibold tracking-tight">
              {template.name}
            </h1>
            <p className="flex flex-wrap items-center gap-x-1 text-sm text-on-surface-variant">
              <DotList
                parts={[
                  draft ? `Draft ${template.version}` : `Version ${number}`,
                  `used by ${formatCount(template.activeCount, "active onboarding")}`,
                ]}
              />
              {dirty ? <span className="text-warning">· Unsaved changes</span> : null}
              <PreviewDataChip endpoint={E.template.path} />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate(
                { stages: payload() },
                {
                  onSuccess: (saved) =>
                    toast.success(`Draft ${saved.version} saved. Only People Ops can see it.`),
                  onError: () => toast.error("The draft could not be saved. Please try again."),
                },
              )
            }
          >
            <SaveIcon aria-hidden /> Save draft
          </Button>
          <Button disabled={!(dirty || draft)} onClick={() => setPublishing(true)}>
            <PublishIcon aria-hidden /> Publish {next}
          </Button>
        </div>
      </header>

      <PageColumns>
        <PageMain>
          {stages.map((stage, stageIndex) => (
            <SectionCard
              key={stage.id}
              title={
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-medium text-primary-foreground"
                  >
                    {stageIndex + 1}
                  </span>
                  {stage.name}
                </span>
              }
              count={`${weeksLabel(stage)} · ${formatCount(stage.modules.length, "module")}`}
            >
              {stage.modules.length ? (
                <SegmentedList>
                  {stage.modules.map((module, index) => {
                    const Kind = TEMPLATE_MODULE_KIND[module.kind].icon;
                    return (
                      <SegmentedItem key={module.id} className="gap-3">
                        <SegmentedItemLead tone="neutral" size="sm">
                          <Kind />
                        </SegmentedItemLead>
                        <SegmentedItemBody>
                          <SegmentedItemTitle className="whitespace-normal">
                            {module.title}
                          </SegmentedItemTitle>
                          <SegmentedItemMeta>
                            <DotList parts={templateModuleMeta(module)} />
                          </SegmentedItemMeta>
                        </SegmentedItemBody>
                        <span className="flex shrink-0">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={index === 0}
                            aria-label={`Move ${module.title} up`}
                            onClick={() => move(stage.id, index, -1)}
                          >
                            <ArrowUpwardIcon aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={index === stage.modules.length - 1}
                            aria-label={`Move ${module.title} down`}
                            onClick={() => move(stage.id, index, 1)}
                          >
                            <ArrowDownwardIcon aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${module.title}`}
                            onClick={() => remove(stage.id, index)}
                          >
                            <DeleteIcon aria-hidden />
                          </Button>
                        </span>
                      </SegmentedItem>
                    );
                  })}
                </SegmentedList>
              ) : (
                <p className="text-sm text-on-surface-variant">No modules in this stage yet.</p>
              )}
              <Button
                variant="ghost"
                size="xs"
                className="self-start"
                aria-label={`Add module to ${stage.name}`}
                onClick={() => setAdding({ id: stage.id, name: stage.name })}
              >
                <AddIcon aria-hidden /> Add module
              </Button>
            </SectionCard>
          ))}
        </PageMain>
        <PageSide>
          <SectionCard title="Who it’s for">
            {(
              [
                ["Roles", template.roles],
                ["Teams", template.teams],
              ] as const
            ).map(([label, values]) => (
              <div key={label} className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-on-surface-variant">{label}</span>
                <span className="flex flex-wrap gap-1.5">
                  {values.map((value) => (
                    <MetaChip key={value} tone="outline" className="h-7.5 px-3 text-sm">
                      {value}
                    </MetaChip>
                  ))}
                </span>
              </div>
            ))}
            <dl className="flex flex-col gap-2.5 text-sm">
              {(
                [
                  ["Length", `${template.weeks} weeks`],
                  ["Knowledge check pass mark", `${template.passMark} of 5`],
                  ["Total learning time", minutesLabel(totalMinutes)],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-2">
                  <dt className="text-xs text-on-surface-variant">{label}</dt>
                  <dd className="text-end font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>
          <SectionCard title="Version history">
            <Timeline>
              {template.history.map((entry, index) => (
                <TimelineItem
                  key={entry.version}
                  date={entry.version}
                  state={index === 0 ? "soon" : "later"}
                  icon={index === 0 ? <PublishIcon aria-hidden /> : <HistoryIcon aria-hidden />}
                  title={<span className="font-normal">{entry.note}</span>}
                  detail={formatShortDate(entry.on)}
                />
              ))}
            </Timeline>
          </SectionCard>
          <p className="flex items-start gap-1.5 px-1 text-xs text-on-surface-variant">
            <InfoIcon className="mt-px size-4 shrink-0" aria-hidden />
            {template.publishedVersion
              ? `Publishing applies to new onboardings. The ${template.activeCount} people already using ${template.publishedVersion} keep their current roadmap.`
              : "Publishing makes this template available for new onboardings."}
          </p>
        </PageSide>
      </PageColumns>
      <AddModuleDialog
        stage={adding}
        exclude={inTemplate}
        onOpenChange={(open) => (open ? null : setAdding(null))}
        onAdd={(module) => {
          if (!adding) return;
          change(adding.id, (modules) => [...modules, module]);
          toast.success(`Added “${module.title}” to ${adding.name}`);
        }}
      />
      <PublishDialog
        template={template}
        next={next}
        open={publishing}
        pending={publish.isPending}
        onOpenChange={setPublishing}
        onPublish={(note) =>
          publish.mutate(
            { stages: payload(), note },
            {
              onSuccess: (published) => {
                setPublishing(false);
                toast.success(`Published ${published.version}`);
              },
              onError: () => toast.error("The template could not be published. Please try again."),
            },
          )
        }
      />
    </div>
  );
}
