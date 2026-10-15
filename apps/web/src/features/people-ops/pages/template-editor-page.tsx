import type { TemplateDetail, TemplateModule } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
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
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { DotList } from "@/components/ui/dot-list";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AddIcon,
  ArrowDownwardIcon,
  ArrowUpwardIcon,
  CloseIcon,
  DeleteIcon,
  HistoryIcon,
  InfoIcon,
  Inventory2Icon,
  LibraryBooksIcon,
  MoreVertIcon,
  PublishIcon,
  SaveIcon,
  UndoIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
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
  useArchiveTemplate,
  useDeleteTemplate,
  usePublishTemplate,
  useRestoreTemplate,
  useSaveTemplateDraft,
} from "@/features/people-ops/api/people-ops.queries";
import {
  AddModuleDialog,
  PublishDialog,
  TemplateActionDialog,
  TemplateTile,
  TemplateVersionDialog,
} from "@/features/people-ops/components/template-parts";
import {
  TEMPLATES_PATH,
  TEMPLATE_MODULE_KIND,
  minutesLabel,
  templateModuleMeta,
  weeksLabel,
} from "@/features/people-ops/people-ops-meta";
import { formatCount, formatShortDate } from "@/lib/format";
import { toastWithUndo } from "@/lib/undo-toast";

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
  useBotContext(
    {
      chips: [{ icon: LibraryBooksIcon, label: template.name }],
      suggestions: [
        `What changed in ${template.name} ${template.version}?`,
        "Which teams have overdue check-ins?",
      ],
    },
    `template:${template.id}`,
  );
  const [stages, setStages] = useState<Stages>(template.stages);
  const [audience, setAudience] = useState({ roles: template.roles, teams: template.teams });
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState<{ id: string; name: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [action, setAction] = useState<"archive" | "delete" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const navigate = useNavigate();
  const save = useSaveTemplateDraft(template.id);
  const publish = usePublishTemplate(template.id);
  const archive = useArchiveTemplate(template.id);
  const restore = useRestoreTemplate(template.id);
  const deleteTemplate = useDeleteTemplate(template.id);
  const archived = template.archived;
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
  const changeAudience = (key: keyof typeof audience, values: string[]) => {
    setAudience((current) => ({ ...current, [key]: values }));
    setDirty(true);
  };

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
    toastWithUndo(`Removed “${module.title}”`, () =>
      change(stageId, (modules) => [...modules.slice(0, index), module, ...modules.slice(index)]),
    );
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
            disabled={archived || !dirty || save.isPending}
            onClick={() =>
              save.mutate(
                { stages: payload(), ...audience },
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
          <Button disabled={archived || !(dirty || draft)} onClick={() => setPublishing(true)}>
            <PublishIcon aria-hidden /> Publish {next}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="icon" aria-label="More actions for this template" />
              }
            >
              <MoreVertIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {archived ? (
                <DropdownMenuItem
                  onClick={() =>
                    restore.mutate(undefined, {
                      onSuccess: () => toast.success(`Restored ${template.name}`),
                      onError: () => toast.error("It could not be restored. Please try again."),
                    })
                  }
                >
                  <UndoIcon aria-hidden /> Restore template
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setAction("archive")}>
                  <Inventory2Icon aria-hidden /> Archive template
                </DropdownMenuItem>
              )}
              {template.deletable ? (
                <DropdownMenuItem variant="destructive" onClick={() => setAction("delete")}>
                  <DeleteIcon aria-hidden /> Delete template
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {archived ? (
        <Banner
          tone="info"
          icon={<Inventory2Icon aria-hidden />}
          title="This template is archived"
          description="It isn’t offered for new onboardings and can’t be edited. People already on it keep their roadmap."
          actions={
            <Button
              size="xs"
              variant="outline"
              disabled={restore.isPending}
              onClick={() =>
                restore.mutate(undefined, {
                  onSuccess: () => toast.success(`Restored ${template.name}`),
                  onError: () => toast.error("It could not be restored. Please try again."),
                })
              }
            >
              Restore
            </Button>
          }
        />
      ) : null}

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
            <AudienceField
              label="Roles"
              placeholder="Add a role"
              values={audience.roles}
              onChange={(values) => changeAudience("roles", values)}
            />
            <AudienceField
              label="Teams"
              placeholder="Add a team"
              values={audience.teams}
              onChange={(values) => changeAudience("teams", values)}
            />
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
                  title={
                    entry.saved ? (
                      <button
                        type="button"
                        aria-label={`Open ${entry.version}: ${entry.note}`}
                        className="rounded-xs text-start font-normal text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                        onClick={() => setViewing(entry.version)}
                      >
                        {entry.note}
                      </button>
                    ) : (
                      <span className="font-normal">{entry.note}</span>
                    )
                  }
                  detail={formatShortDate(entry.on)}
                />
              ))}
            </Timeline>
            {template.history.some((entry) => !entry.saved) ? (
              <p className="text-xs text-on-surface-variant">
                Versions published from now on can be opened here. Older ones weren’t saved.
              </p>
            ) : null}
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
      <TemplateVersionDialog
        templateId={template.id}
        version={viewing}
        onOpenChange={(open) => (open ? null : setViewing(null))}
      />
      <TemplateActionDialog
        template={template}
        action={action}
        pending={archive.isPending || deleteTemplate.isPending}
        onOpenChange={(open) => (open ? null : setAction(null))}
        onConfirm={() => {
          if (action === "archive")
            archive.mutate(undefined, {
              onSuccess: () => {
                setAction(null);
                toast.success(`Archived ${template.name}`);
              },
              onError: () => toast.error("It could not be archived. Please try again."),
            });
          else
            deleteTemplate.mutate(undefined, {
              onSuccess: () => {
                toast.success(`Deleted ${template.name}`);
                void navigate(TEMPLATES_PATH);
              },
              onError: (error) =>
                toast.error(error.message || "It could not be deleted. Please try again."),
            });
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
            { stages: payload(), ...audience, note },
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

/** Roles or teams a template is for: chips to remove, and a field that adds one on Enter. */
function AudienceField({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (!values.some((entry) => entry.toLowerCase() === value.toLowerCase()))
      onChange([...values, value]);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-on-surface-variant">
        {label}
      </label>
      {values.length ? (
        <span className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <MetaChip key={value} tone="outline" className="h-7.5 gap-1 ps-3 pe-1 text-sm">
              {value}
              <button
                type="button"
                className="grid size-5 place-items-center rounded-full hover:bg-surface-container-high [&_svg]:size-4"
                aria-label={`Remove ${value}`}
                onClick={() => onChange(values.filter((entry) => entry !== value))}
              >
                <CloseIcon aria-hidden />
              </button>
            </MetaChip>
          ))}
        </span>
      ) : null}
      <Input
        id={id}
        value={draft}
        maxLength={100}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          add();
        }}
        onBlur={add}
      />
    </div>
  );
}
