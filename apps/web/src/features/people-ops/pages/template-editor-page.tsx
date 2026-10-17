import type { TemplateDetail, TemplateModule } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { ReviewBanner, SendBackDialog } from "@/components/review-parts";
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
  EditIcon,
  HistoryIcon,
  InfoIcon,
  Inventory2Icon,
  LibraryBooksIcon,
  MoreVertIcon,
  PublishIcon,
  SaveIcon,
  SendIcon,
  SmartToyIcon,
  UndoIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  templateAudienceQuery,
  templateQuery,
  useArchiveTemplate,
  useDeleteTemplate,
  usePublishTemplate,
  useRestoreTemplate,
  useSaveTemplateDraft,
  useSendBackTemplate,
  useSubmitTemplate,
} from "@/features/people-ops/api/people-ops.queries";
import {
  AddModuleDialog,
  PublishDialog,
  StageDialog,
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
import { useCreateTutorial } from "@/features/tutorials/api/tutorials.queries";
import { tutorialPath } from "@/features/tutorials/tutorials-meta";
import { useIsReviewer } from "@/features/workspace/hooks/use-is-reviewer";
import { formatCount, formatShortDate } from "@/lib/format";
import { toastWithUndo } from "@/lib/undo-toast";

/** The template editor (prototype `#templates-<id>`): stages and modules, who it is for, versions. */
export function TemplateEditorPage() {
  const { templateId = "" } = useParams();
  const query = useQuery({
    ...templateQuery(templateId),
    // A generated template fills in once the plan is ready.
    refetchInterval: (current) =>
      current.state.data?.generation?.state === "running" ? 3000 : false,
  });
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

/** The stage dialog's id for a stage being added. */
const NEW_STAGE = "new";
/** The department field's "no department" choice. */
const ANY_DEPARTMENT = "any";

function Editor({ template }: { template: TemplateDetail }) {
  const probationId = useId();
  const departmentId = useId();
  // What the organisation already has, suggested in "Who it's for".
  const audienceOptions = useQuery(templateAudienceQuery());
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
  const [department, setDepartment] = useState(template.department?.id ?? ANY_DEPARTMENT);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState<{ id: string; name: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [action, setAction] = useState<"archive" | "delete" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const [removedStages, setRemovedStages] = useState<string[]>([]);
  const [probation, setProbation] = useState(String(template.probationDays));
  const [checkins, setCheckins] = useState(template.checkins);
  const navigate = useNavigate();
  const save = useSaveTemplateDraft(template.id);
  const publish = usePublishTemplate(template.id);
  const submit = useSubmitTemplate(template.id);
  const sendBack = useSendBackTemplate(template.id);
  // Owner, Admin and HR publish; managers and path curators submit their own drafts for review.
  const reviewer = useIsReviewer();
  const archive = useArchiveTemplate(template.id);
  const restore = useRestoreTemplate(template.id);
  const deleteTemplate = useDeleteTemplate(template.id);
  const createTutorial = useCreateTutorial();
  /** Company-wide lessons for a built-in module, drafted from the Hub and reviewed in the Studio. */
  const draftLessons = (module: TemplateModule) =>
    createTutorial.mutate(
      {
        coversModule: module.id,
        audience: template.roles[0] ? `New ${template.roles[0]} hires` : "New team members",
      },
      {
        onSuccess: (tutorial) => {
          toast.success("Drafting company lessons. They're ready to review in about a minute.");
          void navigate(tutorialPath(tutorial.id));
        },
        onError: (error) => toast.error(error.message),
      },
    );
  const archived = template.archived;
  const locked = archived || !template.editable;
  const inReview = template.review?.state === "in_review";
  const draft = template.status === "draft";
  const number = Number(template.version.slice(1)) || 1;
  const next = draft ? template.version : `v${number + 1}`;
  const inTemplate = new Set(stages.flatMap((stage) => stage.modules.map((module) => module.id)));
  const totalMinutes = stages.reduce(
    (sum, stage) => sum + stage.modules.reduce((acc, module) => acc + (module.minutes ?? 0), 0),
    0,
  );
  const payload = () =>
    stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      weekStart: stage.weekStart,
      weekEnd: stage.weekEnd,
      moduleIds: stage.modules.map((module) => module.id),
    }));
  const plan = () => ({
    departmentId: department === ANY_DEPARTMENT ? null : department,
    removeStages: removedStages,
    probationDays: Number(probation) >= 1 ? Math.round(Number(probation)) : template.probationDays,
    checkins: checkins.filter((checkin) => checkin.title.trim() && checkin.day >= 1),
  });
  const weeks = Math.max(0, ...stages.map((stage) => stage.weekEnd));
  // Draft modules (a generated roadmap's) are published together with the template.
  const draftModules = stages.flatMap((stage) =>
    stage.modules.filter(
      (module) => module.lessons === "draft" && module.id.startsWith("tutorial-"),
    ),
  );
  const stageEdited = (values: { name: string; weekStart: number; weekEnd: number }) => {
    setStages((current) =>
      (editingStage === NEW_STAGE
        ? [...current, { id: `stage-${Date.now().toString(36)}`, ...values, modules: [] }]
        : current.map((stage) => (stage.id === editingStage ? { ...stage, ...values } : stage))
      ).sort((a, b) => a.weekStart - b.weekStart),
    );
    setEditingStage(null);
    setDirty(true);
  };
  const stageRemoved = (id: string) => {
    setStages((current) => current.filter((stage) => stage.id !== id));
    if (template.stages.some((stage) => stage.id === id))
      setRemovedStages((current) => [...current, id]);
    setEditingStage(null);
    setDirty(true);
  };
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
          {template.editable ? (
            <Button
              variant="outline"
              disabled={locked || !dirty || save.isPending}
              onClick={() =>
                save.mutate(
                  { stages: payload(), ...audience, ...plan() },
                  {
                    onSuccess: (saved) =>
                      toast.success(
                        reviewer
                          ? `Draft ${saved.version} saved. Only People Ops can see it.`
                          : `Draft ${saved.version} saved. Only you and People Ops can see it.`,
                      ),
                    onError: () => toast.error("The draft could not be saved. Please try again."),
                  },
                )
              }
            >
              <SaveIcon aria-hidden /> Save draft
            </Button>
          ) : null}
          {reviewer ? (
            <Button disabled={archived || !(dirty || draft)} onClick={() => setPublishing(true)}>
              <PublishIcon aria-hidden /> Publish {next}
            </Button>
          ) : template.editable ? (
            <Button
              disabled={
                locked ||
                template.generation?.state === "running" ||
                !(dirty || draft) ||
                (inReview && !dirty)
              }
              onClick={() => setPublishing(true)}
            >
              <SendIcon aria-hidden /> {inReview ? "Submitted" : "Submit for review"}
            </Button>
          ) : null}
          {reviewer || (template.editable && template.deletable && !template.publishedVersion) ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="More actions for this template"
                  />
                }
              >
                <MoreVertIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!reviewer ? null : archived ? (
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
          ) : null}
        </div>
      </header>
      <ReviewBanner
        review={template.review}
        reviewer={reviewer}
        what="template"
        onSendBack={() => setSendingBack(true)}
      />
      {template.generation?.state === "running" ? (
        <Banner
          tone="ai"
          icon={<SmartToyIcon aria-hidden />}
          title="Planning this roadmap from your company’s knowledge"
          description="Stages, probation, check-ins and modules appear here in a minute or two. Lessons for each new module are drafted next."
        />
      ) : template.generation?.state === "failed" ? (
        <Banner
          tone="warning"
          icon={<InfoIcon aria-hidden />}
          title="The roadmap couldn’t be drafted"
          description={template.generation.error ?? "Please try again."}
        />
      ) : template.generated ? (
        <Banner
          tone="ai"
          icon={<SmartToyIcon aria-hidden />}
          title="AI draft: review each module before publishing"
          description={[
            template.generated.policyNote,
            template.generated.gaps.length
              ? `Not covered by the Hub yet: ${template.generated.gaps.join("; ")}.`
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      ) : null}
      {archived ? (
        <Banner
          tone="info"
          icon={<Inventory2Icon aria-hidden />}
          title="This template is archived"
          description="It isn’t offered for new onboardings and can’t be edited. People already on it keep their roadmap."
          actions={
            !reviewer ? null : (
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
            )
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
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={locked}
                    aria-label={`Edit ${stage.name}`}
                    onClick={() => setEditingStage(stage.id)}
                  >
                    <EditIcon aria-hidden />
                  </Button>
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
                          {template.generated?.reasons[module.id] ? (
                            <p className="text-sm text-on-surface-variant">
                              {template.generated.reasons[module.id]}
                            </p>
                          ) : null}
                          {module.lessons === "none" && reviewer ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="self-start"
                              disabled={createTutorial.isPending}
                              onClick={() => draftLessons(module)}
                            >
                              Draft lessons
                            </Button>
                          ) : module.lessons === "draft" && module.tutorialId ? (
                            <Link
                              to={tutorialPath(module.tutorialId)}
                              className="self-start text-sm text-primary"
                            >
                              Review draft lessons
                            </Link>
                          ) : null}
                        </SegmentedItemBody>
                        <span className="flex shrink-0">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={locked || index === 0}
                            aria-label={`Move ${module.title} up`}
                            onClick={() => move(stage.id, index, -1)}
                          >
                            <ArrowUpwardIcon aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={locked || index === stage.modules.length - 1}
                            aria-label={`Move ${module.title} down`}
                            onClick={() => move(stage.id, index, 1)}
                          >
                            <ArrowDownwardIcon aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={locked}
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
                disabled={locked}
                aria-label={`Add module to ${stage.name}`}
                onClick={() => setAdding({ id: stage.id, name: stage.name })}
              >
                <AddIcon aria-hidden /> Add module
              </Button>
            </SectionCard>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={locked}
            onClick={() => setEditingStage(NEW_STAGE)}
          >
            <AddIcon aria-hidden /> Add stage
          </Button>
        </PageMain>
        <PageSide>
          <SectionCard title="Who it’s for">
            <AudienceField
              label="Roles"
              placeholder="Add a role"
              disabled={locked}
              values={audience.roles}
              suggestions={audienceOptions.data?.roles ?? []}
              onChange={(values) => changeAudience("roles", values)}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor={departmentId} className="text-xs font-medium text-on-surface-variant">
                Department
              </label>
              <Select
                items={{
                  [ANY_DEPARTMENT]: "Any department",
                  ...Object.fromEntries(
                    (audienceOptions.data?.departments ?? []).map((entry) => [
                      entry.id,
                      entry.name,
                    ]),
                  ),
                  // The saved one shows even before the list loads.
                  ...(template.department
                    ? { [template.department.id]: template.department.name }
                    : {}),
                }}
                value={department}
                disabled={locked}
                onValueChange={(next) => {
                  setDepartment(String(next));
                  setDirty(true);
                }}
              >
                <SelectTrigger id={departmentId} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_DEPARTMENT}>Any department</SelectItem>
                  {(audienceOptions.data?.departments ?? []).map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <AudienceField
              label="Teams"
              placeholder="Add a team"
              disabled={locked}
              values={audience.teams}
              // The chosen department's teams (and teams not in a department).
              suggestions={(audienceOptions.data?.teams ?? [])
                .filter(
                  (team) =>
                    department === ANY_DEPARTMENT ||
                    team.departmentId === null ||
                    team.departmentId === department,
                )
                .map((team) => team.name)}
              onChange={(values) => changeAudience("teams", values)}
            />
            <dl className="flex flex-col gap-2.5 text-sm">
              {(
                [
                  ["Length", formatCount(weeks, "week")],
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
          <SectionCard title="Probation and check-ins">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={probationId}>Probation length (days)</Label>
              <Input
                id={probationId}
                type="number"
                min={1}
                max={730}
                value={probation}
                disabled={locked}
                onChange={(event) => {
                  setProbation(event.target.value);
                  setDirty(true);
                }}
              />
            </div>
            <ul className="flex flex-col gap-2" aria-label="Check-ins">
              {checkins.map((checkin, index) => (
                <li key={index} className="flex items-center gap-2">
                  <Input
                    aria-label={`Check-in ${index + 1} title`}
                    value={checkin.title}
                    maxLength={80}
                    disabled={locked}
                    onChange={(event) => {
                      const title = event.target.value;
                      setCheckins((current) =>
                        current.map((entry, at) => (at === index ? { ...entry, title } : entry)),
                      );
                      setDirty(true);
                    }}
                  />
                  <Input
                    aria-label={`Check-in ${index + 1} day`}
                    type="number"
                    min={1}
                    max={730}
                    className="w-20"
                    value={checkin.day}
                    disabled={locked}
                    onChange={(event) => {
                      const day = Math.round(Number(event.target.value));
                      setCheckins((current) =>
                        current.map((entry, at) => (at === index ? { ...entry, day } : entry)),
                      );
                      setDirty(true);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={locked}
                    aria-label={`Remove ${checkin.title || "check-in"}`}
                    onClick={() => {
                      setCheckins((current) => current.filter((_, at) => at !== index));
                      setDirty(true);
                    }}
                  >
                    <DeleteIcon aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="ghost"
              size="xs"
              className="self-start"
              disabled={locked || checkins.length >= 12}
              onClick={() => {
                setCheckins((current) => [...current, { title: "", day: 30 }]);
                setDirty(true);
              }}
            >
              <AddIcon aria-hidden /> Add check-in
            </Button>
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
            {!reviewer
              ? "Submitting sends it to People Ops, who publish it for new onboardings or send it back with a note."
              : template.publishedVersion
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
      <StageDialog
        key={editingStage ?? "closed"}
        stage={stages.find((stage) => stage.id === editingStage) ?? null}
        open={editingStage !== null}
        onOpenChange={(open) => {
          if (!open) setEditingStage(null);
        }}
        onSave={stageEdited}
        onRemove={() => editingStage && stageRemoved(editingStage)}
      />
      <PublishDialog
        template={template}
        next={next}
        mode={reviewer ? "publish" : "submit"}
        draftModules={draftModules.map((module) => module.title)}
        open={publishing}
        pending={publish.isPending || submit.isPending}
        onOpenChange={setPublishing}
        onPublish={(note) =>
          reviewer
            ? publish.mutate(
                {
                  stages: payload(),
                  ...audience,
                  ...plan(),
                  note,
                  ...(draftModules.length ? { publishModules: true } : {}),
                },
                {
                  onSuccess: (published) => {
                    setPublishing(false);
                    toast.success(`Published ${published.version}`);
                  },
                  onError: (error) =>
                    toast.error(
                      error.message || "The template could not be published. Please try again.",
                    ),
                },
              )
            : submit.mutate(
                { stages: payload(), ...audience, ...plan(), note },
                {
                  onSuccess: () => {
                    setPublishing(false);
                    toast.success("Submitted for review. People Ops have been told.");
                  },
                  onError: (error) =>
                    toast.error(
                      error.message || "The template could not be submitted. Please try again.",
                    ),
                },
              )
        }
      />
      {reviewer ? (
        <SendBackDialog
          open={sendingBack}
          pending={sendBack.isPending}
          onOpenChange={setSendingBack}
          onSendBack={(note) =>
            sendBack.mutate(
              { note },
              {
                onSuccess: () => {
                  setSendingBack(false);
                  toast.success(`Sent back to ${template.review?.by?.name ?? "them"}`);
                },
                onError: (error) =>
                  toast.error(error.message || "It could not be sent back. Please try again."),
              },
            )
          }
        />
      ) : null}
    </div>
  );
}

/** Roles or teams a template is for: chips to remove, and a field that adds one on Enter. */
/**
 * Roles or teams a template is for: chips to remove, and a field that adds one on Enter. It
 * suggests what the organisation already has; picking a suggestion adds it straight away.
 */
function AudienceField({
  label,
  placeholder,
  values,
  suggestions = [],
  disabled = false,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  suggestions?: string[];
  disabled?: boolean;
  onChange: (values: string[]) => void;
}) {
  const id = useId();
  const listId = useId();
  const [draft, setDraft] = useState("");
  const chosen = new Set(values.map((entry) => entry.toLowerCase()));
  const offered = suggestions.filter((entry) => !chosen.has(entry.toLowerCase()));
  const addValue = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (!chosen.has(value.toLowerCase())) onChange([...values, value]);
    setDraft("");
  };
  const add = () => addValue(draft);
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
                className="grid size-5 place-items-center rounded-full hover:bg-surface-container-high disabled:opacity-50 [&_svg]:size-4"
                disabled={disabled}
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
        disabled={disabled}
        placeholder={placeholder}
        list={offered.length ? listId : undefined}
        autoComplete="off"
        onChange={(event) => {
          const value = event.target.value;
          // Picking from the suggestions (not typing or deleting) adds it at once.
          const kind = (event.nativeEvent as InputEvent).inputType as string | undefined;
          const picked = kind === "insertReplacementText" || !kind;
          if (picked && offered.some((entry) => entry === value)) addValue(value);
          else setDraft(value);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          add();
        }}
        onBlur={add}
      />
      {offered.length ? (
        <datalist id={listId}>
          {offered.map((entry) => (
            <option key={entry} value={entry} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}
