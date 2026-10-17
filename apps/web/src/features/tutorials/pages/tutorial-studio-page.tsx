import type { TutorialContent, TutorialDetail, TutorialLesson } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { lazy, Suspense, useId, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { ReviewBanner, SendBackDialog } from "@/components/review-parts";
import { SectionCard } from "@/components/section-card";
import { DragHandle, SortableList } from "@/components/sortable-list";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowBackIcon,
  ArrowDownwardIcon,
  ArrowUpwardIcon,
  CheckCircleFilledIcon,
  DeleteIcon,
  DescriptionIcon,
  GroupIcon,
  LockIcon,
  MoreVertIcon,
  QuizIcon,
  RateReviewIcon,
  SendIcon,
  SmartToyIcon,
  WarningIcon,
} from "@/components/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { directoryQuery } from "@/features/people/api/people.queries";
import { templateQuery } from "@/features/people-ops/api/people-ops.queries";
import { templatePath } from "@/features/people-ops/people-ops-meta";
import { TUTORIAL_ENDPOINTS } from "@/features/tutorials/api/tutorials.api";
import {
  tutorialQuery,
  useArchiveTutorial,
  useAssignTutorial,
  usePublishTutorial,
  useRegenerateTutorial,
  useSendBackTutorial,
  useSubmitTutorial,
  useUpdateTutorial,
} from "@/features/tutorials/api/tutorials.queries";
import { COMPANY_WIDE, TUTORIAL_STATUS } from "@/features/tutorials/tutorials-meta";
import { useIsReviewer } from "@/features/workspace/hooks/use-is-reviewer";
import { formatRelativeTime } from "@/lib/format";

type Selection = { kind: "overview" } | { kind: "lesson"; id: string } | { kind: "check" };

/**
 * Tutorial Studio (FR-LRN-004): review and edit a drafted tutorial, preview it as learners will see
 * it, then publish a version. Regenerating writes a new draft from the project's current knowledge;
 * nothing changes for learners until it is published. Owner, Admin and HR publish; path curators
 * and managers submit it for review (N-18).
 */
export function TutorialStudioPage() {
  const { tutorialId = "" } = useParams();
  const query = useQuery(tutorialQuery(tutorialId));
  if (query.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-360 rounded-3xl" />;
  if (query.isError)
    return (
      <SectionCard
        title="Tutorial"
        endpoint={TUTORIAL_ENDPOINTS.detail.path}
        status={query}
        className="mx-auto max-w-360"
      />
    );
  return (
    <>
      <BackToTemplate />
      <Studio tutorial={query.data} />
    </>
  );
}

/** Opened from a template's "Edit lessons": the way back to it. */
function BackToTemplate() {
  const [params] = useSearchParams();
  const templateId = params.get("template") ?? "";
  const template = useQuery({ ...templateQuery(templateId), enabled: templateId !== "" });
  if (!templateId) return null;
  return (
    <div className="mx-auto mb-2 w-full max-w-360">
      <Button
        variant="ghost"
        size="xs"
        nativeButton={false}
        render={<Link to={templatePath(templateId)} />}
      >
        <ArrowBackIcon aria-hidden />
        {template.data ? `Back to ${template.data.name}` : "Back to template"}
      </Button>
    </div>
  );
}

function Studio({ tutorial }: { tutorial: TutorialDetail }) {
  const update = useUpdateTutorial(tutorial.id);
  const archive = useArchiveTutorial(tutorial.id);
  const submit = useSubmitTutorial(tutorial.id);
  const sendBack = useSendBackTutorial(tutorial.id);
  const reviewer = useIsReviewer();
  const inReview = tutorial.review?.state === "in_review";
  // Unsaved edits sit on top of the saved draft; without them, a new draft shows as it arrives.
  const [edits, setEdits] = useState<TutorialContent | null>(null);
  const content = edits ?? tutorial.content;
  const dirty = edits !== null;
  const [selection, setSelection] = useState<Selection>({ kind: "overview" });
  const [dialog, setDialog] = useState<"publish" | "assign" | "regenerate" | "send-back" | null>(
    null,
  );

  const edit = (next: TutorialContent) => setEdits(next);
  const save = () =>
    edits &&
    update.mutate(
      { content: edits },
      {
        onSuccess: () => {
          setEdits(null);
          toast.success("Draft saved");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  const status = TUTORIAL_STATUS[tutorial.status];
  const changed = tutorial.sources.filter((source) => source.state !== "current");
  const restricted = tutorial.sources.filter((source) => source.restricted);

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-3 medium:gap-4">
      <PageHeader
        kicker={`${tutorial.project?.name ?? COMPANY_WIDE} · for ${tutorial.audience}`}
        title={content?.title ?? tutorial.title}
        description={
          tutorial.publishedVersion
            ? `Learners see version ${tutorial.publishedVersion}${tutorial.publishedBy ? `, published by ${tutorial.publishedBy.name}` : ""}${tutorial.publishedAt ? ` ${formatRelativeTime(tutorial.publishedAt).toLowerCase()}` : ""}.`
            : "Not published yet: only curators can see it."
        }
        actions={
          <>
            <Button
              variant="outline"
              disabled={tutorial.generating}
              onClick={() => setDialog("regenerate")}
            >
              <SmartToyIcon aria-hidden /> Regenerate
            </Button>
            {tutorial.status === "published" ? (
              <Button variant="outline" onClick={() => setDialog("assign")}>
                Assign
              </Button>
            ) : null}
            {reviewer ? (
              <Button
                disabled={!content?.lessons.length || dirty || tutorial.generating}
                onClick={() => setDialog("publish")}
              >
                {tutorial.publishedVersion ? "Publish update" : "Publish"}
              </Button>
            ) : (
              <Button
                disabled={
                  !content?.lessons.length ||
                  dirty ||
                  tutorial.generating ||
                  inReview ||
                  !tutorial.unpublishedChanges ||
                  submit.isPending
                }
                onClick={() =>
                  submit.mutate(undefined, {
                    onSuccess: () =>
                      toast.success("Submitted for review. People Ops have been told."),
                    onError: (error) => toast.error(error.message),
                  })
                }
              >
                <SendIcon aria-hidden /> {inReview ? "Submitted" : "Submit for review"}
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip
          tone={status.tone}
          icon={
            tutorial.status === "published" ? (
              <CheckCircleFilledIcon />
            ) : tutorial.status === "generating" ? (
              <SmartToyIcon />
            ) : tutorial.status === "failed" ? (
              <WarningIcon />
            ) : (
              <DescriptionIcon />
            )
          }
        >
          {status.label}
        </StatusChip>
        {tutorial.unpublishedChanges && tutorial.publishedVersion ? (
          <StatusChip tone="warning" icon={<WarningIcon />}>
            Unpublished changes
          </StatusChip>
        ) : null}
        {inReview ? (
          <StatusChip tone="info" icon={<RateReviewIcon />}>
            In review
          </StatusChip>
        ) : null}
        <StatusChip icon={<GroupIcon />}>{tutorial.learners} learners</StatusChip>
        {tutorial.status === "published" ? (
          <Button
            size="xs"
            variant="ghost"
            disabled={archive.isPending}
            onClick={() =>
              archive.mutate(undefined, { onSuccess: () => toast.success("Tutorial archived") })
            }
          >
            Archive
          </Button>
        ) : null}
      </div>

      <ReviewBanner
        review={tutorial.review}
        reviewer={reviewer}
        what="tutorial"
        onSendBack={() => setDialog("send-back")}
      />
      {tutorial.update && !tutorial.generating ? (
        <Banner
          tone="ai"
          icon={<SmartToyIcon />}
          title="Updated draft from new company knowledge"
          description={`${tutorial.update.changes.join(". ")}. Learners keep version ${tutorial.publishedVersion ?? 1} until it's published.`}
        />
      ) : null}
      {tutorial.generating ? (
        <Banner
          tone="ai"
          icon={<SmartToyIcon />}
          title="Writing the draft from the project's knowledge"
          description="This usually takes about a minute. You can leave this page; it's saved as a draft for you to review."
        />
      ) : null}
      {tutorial.status === "failed" ? (
        <Banner
          tone="error"
          icon={<WarningIcon />}
          title="The draft couldn't be written"
          description={tutorial.error ?? "Try again in a moment."}
          actions={
            <Button size="sm" variant="outline" onClick={() => setDialog("regenerate")}>
              Try again
            </Button>
          }
        />
      ) : null}
      {changed.length ? (
        <Banner
          tone="warning"
          icon={<WarningIcon />}
          title={`${changed.length} source${changed.length === 1 ? "" : "s"} changed since this was written`}
          description={`${changed.map((source) => `${source.title} (${source.state})`).join(", ")}. Syncing doesn't change tutorials: regenerate when you want to update it. Learners keep the published version until you publish again.`}
          actions={
            <Button size="sm" variant="outline" onClick={() => setDialog("regenerate")}>
              Regenerate
            </Button>
          }
        />
      ) : null}
      {restricted.length ? (
        <Banner
          tone="neutral"
          icon={<LockIcon />}
          title="Some lessons use restricted sources"
          description={`People who can't open ${restricted.map((source) => source.title).join(", ")} will see those lessons locked. Share the sources with the workspace to make them available to everyone.`}
        />
      ) : null}

      {content ? (
        <div className="grid gap-4 @4xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
          <Outline
            content={content}
            selection={selection}
            onSelect={setSelection}
            onChange={edit}
          />
          <div className="flex min-w-0 flex-col gap-3">
            {selection.kind === "overview" ? (
              <OverviewEditor content={content} tutorial={tutorial} onChange={edit} />
            ) : selection.kind === "check" ? (
              <CheckEditor content={content} onChange={edit} />
            ) : (
              <LessonEditor
                key={selection.id}
                lesson={content.lessons.find((lesson) => lesson.id === selection.id)}
                onChange={(lesson) =>
                  edit({
                    ...content,
                    lessons: content.lessons.map((entry) =>
                      entry.id === lesson.id ? lesson : entry,
                    ),
                  })
                }
              />
            )}
            {dirty ? (
              <div className="sticky bottom-3 flex flex-wrap items-center justify-end gap-2 rounded-2xl bg-surface-container-high p-3 shadow-elevation-2">
                <span className="me-auto text-sm">You have unsaved changes.</span>
                <Button variant="ghost" onClick={() => setEdits(null)}>
                  Discard
                </Button>
                <Button disabled={update.isPending} onClick={save}>
                  Save draft
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : tutorial.generating ? (
        <Loader label="Writing the draft" />
      ) : null}

      <PublishDialog
        tutorial={tutorial}
        open={dialog === "publish"}
        onClose={() => setDialog(null)}
      />
      <AssignDialog
        tutorial={tutorial}
        open={dialog === "assign"}
        onClose={() => setDialog(null)}
      />
      {reviewer ? (
        <SendBackDialog
          open={dialog === "send-back"}
          pending={sendBack.isPending}
          onOpenChange={(open) => setDialog(open ? "send-back" : null)}
          onSendBack={(note) =>
            sendBack.mutate(
              { note },
              {
                onSuccess: () => {
                  setDialog(null);
                  toast.success(`Sent back to ${tutorial.review?.by?.name ?? "them"}`);
                },
                onError: (error) => toast.error(error.message),
              },
            )
          }
        />
      ) : null}
      <RegenerateDialog
        tutorial={tutorial}
        open={dialog === "regenerate"}
        dirty={dirty}
        onClose={() => setDialog(null)}
        onStarted={() => setEdits(null)}
      />
    </div>
  );
}

/* ---- Outline ---------------------------------------------------------------------------------- */

function Outline({
  content,
  selection,
  onSelect,
  onChange,
}: {
  content: TutorialContent;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onChange: (content: TutorialContent) => void;
}) {
  const move = (index: number, by: -1 | 1) => {
    const lessons = [...content.lessons];
    const [lesson] = lessons.splice(index, 1);
    lessons.splice(index + by, 0, lesson!);
    onChange({ ...content, lessons });
  };
  // `fill`: a lesson row's title takes the room its move and delete buttons leave, and truncates.
  const item = (active: boolean, { fill = false } = {}) =>
    cn(
      "flex items-center gap-2 rounded-lg px-3 py-2 text-start text-sm transition-colors",
      fill ? "min-w-0 flex-1" : "w-full",
      active ? "bg-secondary-container font-medium" : "hover:bg-surface-container-high",
    );
  return (
    <nav
      aria-label="Tutorial outline"
      className="flex min-w-0 flex-col gap-1 self-start rounded-3xl bg-card p-3"
    >
      <button
        type="button"
        className={item(selection.kind === "overview")}
        aria-current={selection.kind === "overview" ? "true" : undefined}
        onClick={() => onSelect({ kind: "overview" })}
      >
        Overview
      </button>
      <span className="mt-2 px-3 text-xs font-medium text-on-surface-variant">Lessons</span>
      <SortableList
        label="Lessons"
        items={content.lessons}
        getId={(lesson) => lesson.id}
        getLabel={(lesson) => lesson.title}
        onReorder={(lessons) => onChange({ ...content, lessons })}
      >
        {(lesson, index, row) => {
          const active = selection.kind === "lesson" && selection.id === lesson.id;
          const remove = () => {
            onChange({
              ...content,
              lessons: content.lessons.filter((entry) => entry.id !== lesson.id),
            });
            if (active) onSelect({ kind: "overview" });
          };
          return (
            <li
              ref={row.setRow}
              style={row.style}
              className={cn("flex min-w-0 items-center gap-0.5 rounded-lg bg-card", row.className)}
            >
              <DragHandle handle={row.handle} label={`Reorder ${lesson.title}`} />
              <button
                type="button"
                className={item(active, { fill: true })}
                title={lesson.title}
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect({ kind: "lesson", id: lesson.id })}
              >
                <span className="text-xs text-on-surface-variant tabular-nums">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
              </button>
              {/* Moving without dragging; shows with the handle. */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${lesson.title}`}
                      className="opacity-0 transition-opacity group-focus-within/sortable:opacity-100 group-hover/sortable:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 [@media(hover:none)]:opacity-100"
                    />
                  }
                >
                  <MoreVertIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUpwardIcon aria-hidden /> Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={index === content.lessons.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDownwardIcon aria-hidden /> Move down
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${lesson.title}`}
                disabled={content.lessons.length === 1}
                onClick={remove}
              >
                <DeleteIcon />
              </Button>
            </li>
          );
        }}
      </SortableList>
      {content.check ? (
        <button
          type="button"
          className={cn(item(selection.kind === "check"), "mt-2")}
          aria-current={selection.kind === "check" ? "true" : undefined}
          onClick={() => onSelect({ kind: "check" })}
        >
          <QuizIcon className="size-4" aria-hidden />
          Knowledge check · {content.check.questions.length} questions
        </button>
      ) : null}
    </nav>
  );
}

/* ---- Editors ---------------------------------------------------------------------------------- */

/** The visual editor loads only when a lesson is edited, so other pages stay light. */
const RichMarkdownEditor = lazy(() => import("@/components/rich-markdown/rich-markdown-editor"));

/**
 * Lesson text: a visual editor where what you see is what learners read, or the Markdown it is
 * stored as. Both edit the same text.
 */
function MarkdownField({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const markdownId = useId();
  return (
    <Tabs defaultValue="edit" className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <TabsList>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="markdown">Markdown</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="edit">
        <Suspense fallback={<Skeleton className="h-48 rounded-2xl" aria-busy="true" />}>
          <RichMarkdownEditor id={id} label={label} value={value} onChange={onChange} />
        </Suspense>
      </TabsContent>
      <TabsContent value="markdown">
        <Textarea
          id={markdownId}
          aria-label={`${label} (Markdown)`}
          value={value}
          rows={rows}
          className="font-mono text-[13px] leading-5"
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="mt-1 block text-xs text-on-surface-variant">
          Markdown: ## headings, - lists, **bold**, `code`, &gt; quotes, | tables |.
        </span>
      </TabsContent>
    </Tabs>
  );
}

function OverviewEditor({
  content,
  tutorial,
  onChange,
}: {
  content: TutorialContent;
  tutorial: TutorialDetail;
  onChange: (content: TutorialContent) => void;
}) {
  const update = useUpdateTutorial(tutorial.id);
  const ids = { title: useId(), objectives: useId(), module: useId() };
  const NONE = "none";
  return (
    <SectionCard title="Overview">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.title}>Title</Label>
        <Input
          id={ids.title}
          value={content.title}
          maxLength={200}
          onChange={(event) => onChange({ ...content, title: event.target.value })}
        />
      </div>
      <MarkdownField
        label="Why it matters"
        value={content.summary}
        rows={5}
        onChange={(summary) => onChange({ ...content, summary })}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.objectives}>What learners will be able to do (one per line)</Label>
        <Textarea
          id={ids.objectives}
          rows={4}
          value={content.objectives.join("\n")}
          onChange={(event) =>
            onChange({
              ...content,
              objectives: event.target.value
                .split("\n")
                .map((line) => line.trimStart())
                .filter((line, index, all) => line || index < all.length - 1)
                .slice(0, 8),
            })
          }
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.module}>Teaches an onboarding template module</Label>
        <Select
          items={{
            [NONE]: "None: assign it directly",
            ...Object.fromEntries(
              tutorial.moduleOptions.map((option) => [option.id, option.title]),
            ),
          }}
          value={tutorial.coversModule ?? NONE}
          onValueChange={(value) =>
            update.mutate(
              { coversModule: value === NONE ? null : String(value) },
              {
                onSuccess: () => toast.success("Saved"),
                onError: (error) => toast.error(error.message),
              },
            )
          }
        >
          <SelectTrigger id={ids.module} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None: assign it directly</SelectItem>
            {tutorial.moduleOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-on-surface-variant">
          Once published, new hires whose template includes that module read this tutorial in its
          place.
        </span>
      </div>
      {tutorial.sources.length ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Written from</span>
          <ul className="flex flex-wrap gap-1.5">
            {tutorial.sources.map((source) => (
              <li key={source.id}>
                <StatusChip
                  tone={source.state === "current" ? "neutral" : "warning"}
                  icon={source.restricted ? <LockIcon /> : undefined}
                >
                  {source.title}
                  {source.state !== "current" ? ` · ${source.state}` : ""}
                </StatusChip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SectionCard>
  );
}

function LessonEditor({
  lesson,
  onChange,
}: {
  lesson: TutorialLesson | undefined;
  onChange: (lesson: TutorialLesson) => void;
}) {
  const ids = { title: useId(), minutes: useId() };
  if (!lesson) return null;
  return (
    <SectionCard title="Lesson">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.title}>Title</Label>
          <Input
            id={ids.title}
            value={lesson.title}
            maxLength={200}
            onChange={(event) => onChange({ ...lesson, title: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.minutes}>Minutes</Label>
          <Input
            id={ids.minutes}
            type="number"
            min={1}
            max={600}
            value={lesson.minutes}
            onChange={(event) =>
              onChange({ ...lesson, minutes: Math.max(1, Number(event.target.value) || 1) })
            }
          />
        </div>
      </div>
      <MarkdownField
        label="Lesson"
        value={lesson.body}
        rows={18}
        onChange={(body) => onChange({ ...lesson, body })}
      />
      {lesson.basedOn.length ? (
        <span className="text-xs text-on-surface-variant">
          Based on {lesson.basedOn.join(", ")}
        </span>
      ) : null}
    </SectionCard>
  );
}

function CheckEditor({
  content,
  onChange,
}: {
  content: TutorialContent;
  onChange: (content: TutorialContent) => void;
}) {
  const passId = useId();
  const check = content.check;
  if (!check) return null;
  const questions = check.questions;
  return (
    <SectionCard title="Knowledge check" count={questions.length}>
      <div className="flex max-w-60 flex-col gap-1.5">
        <Label htmlFor={passId}>Pass mark</Label>
        <Input
          id={passId}
          type="number"
          min={1}
          max={questions.length}
          value={check.passMark}
          onChange={(event) =>
            onChange({
              ...content,
              check: {
                ...check,
                passMark: Math.min(questions.length, Math.max(1, Number(event.target.value) || 1)),
              },
            })
          }
        />
        <span className="text-xs text-on-surface-variant">
          Correct answers needed out of {questions.length}.
        </span>
      </div>
      <ol className="flex flex-col gap-3">
        {questions.map((question, index) => (
          <li key={question.id} className="flex flex-col gap-2 rounded-2xl bg-pane p-4">
            <div className="flex items-start gap-2">
              <b className="flex-1 text-sm font-medium">
                {index + 1}. {question.prompt}
              </b>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove question ${index + 1}`}
                disabled={questions.length === 1}
                onClick={() => {
                  const remaining = questions.filter((entry) => entry.id !== question.id);
                  onChange({
                    ...content,
                    check: {
                      passMark: Math.min(check.passMark, remaining.length),
                      questions: remaining,
                    },
                  });
                }}
              >
                <DeleteIcon />
              </Button>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {question.options.map((option) => (
                <li
                  key={option.id}
                  className={cn(
                    "flex items-center gap-2",
                    option.id === question.correctOptionId && "font-medium text-success",
                  )}
                >
                  {option.id === question.correctOptionId ? (
                    <CheckCircleFilledIcon className="size-4" aria-label="Correct answer" />
                  ) : (
                    <span className="size-4" aria-hidden />
                  )}
                  {option.text}
                </li>
              ))}
            </ul>
            <span className="text-xs text-on-surface-variant">
              {question.explanation} · {question.source}
            </span>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

/* ---- Dialogs ---------------------------------------------------------------------------------- */

function PublishDialog({
  tutorial,
  open,
  onClose,
}: {
  tutorial: TutorialDetail;
  open: boolean;
  onClose: () => void;
}) {
  const publish = usePublishTutorial(tutorial.id);
  const switchId = useId();
  // People part-way through finish the version they started unless the publisher moves them.
  const [updateLearners, setUpdateLearners] = useState(false);
  const partWay = tutorial.inProgress;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {tutorial.publishedVersion
              ? `Publish version ${tutorial.publishedVersion + 1}`
              : "Publish tutorial"}
          </DialogTitle>
          <DialogDescription>
            Learners will read exactly what you reviewed. It can then be assigned, added to
            onboarding templates, and found in My learning.
          </DialogDescription>
        </DialogHeader>
        {tutorial.publishedVersion && partWay ? (
          <div className="flex items-start gap-3 rounded-2xl bg-pane p-3.5">
            <Switch
              id={switchId}
              checked={updateLearners}
              onCheckedChange={(checked) => setUpdateLearners(Boolean(checked))}
            />
            <Label htmlFor={switchId} className="flex flex-col items-start gap-0.5 font-normal">
              <span className="font-medium">
                Move the {partWay === 1 ? "person" : `${partWay} people`} part-way through to this
                version
              </span>
              <span className="text-xs text-on-surface-variant">
                {updateLearners
                  ? "They switch now. Lessons they finished that are still in this version stay done."
                  : `${partWay === 1 ? "They finish" : "They each finish"} version ${tutorial.publishedVersion}, the one they started. Everyone who starts from now gets this version.`}
              </span>
            </Label>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={publish.isPending}
            onClick={() =>
              publish.mutate(
                { updateLearners },
                {
                  onSuccess: (detail) => {
                    toast.success(`Published version ${detail.publishedVersion ?? 1}`);
                    onClose();
                  },
                  onError: (error) => toast.error(error.message),
                },
              )
            }
          >
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({
  tutorial,
  open,
  onClose,
}: {
  tutorial: TutorialDetail;
  open: boolean;
  onClose: () => void;
}) {
  const people = useQuery({ ...directoryQuery("", "all"), enabled: open });
  const assign = useAssignTutorial(tutorial.id);
  const ids = { person: useId(), due: useId() };
  const [personId, setPersonId] = useState<string | null>(null);
  const [dueOn, setDueOn] = useState("");
  const list = people.data?.items ?? [];
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            if (!personId) return;
            assign.mutate(
              { userId: personId, dueOn: dueOn || null },
              {
                onSuccess: (placed) => {
                  const name = list.find((person) => person.id === personId)?.name ?? "They";
                  toast.success(
                    placed.placedIn === "roadmap"
                      ? `Added to ${name}'s onboarding roadmap`
                      : `Added to ${name}'s My learning`,
                  );
                  onClose();
                },
                onError: (error) => toast.error(error.message),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Assign “{tutorial.title}”</DialogTitle>
            <DialogDescription>
              Someone onboarding gets it on their roadmap, where their manager follows it; anyone
              else finds it under My learning. They're notified either way.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.person}>Person</Label>
            <Select
              items={Object.fromEntries(list.map((person) => [person.id, person.name]))}
              value={personId}
              onValueChange={(value) => setPersonId(String(value))}
            >
              <SelectTrigger id={ids.person} className="w-full">
                <SelectValue placeholder={people.isPending ? "Loading people" : "Choose someone"} />
              </SelectTrigger>
              <SelectContent>
                {list.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.due}>Due (optional)</Label>
            <Input
              id={ids.due}
              type="date"
              value={dueOn}
              onChange={(event) => setDueOn(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!personId || assign.isPending}>
              Assign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RegenerateDialog({
  tutorial,
  open,
  dirty,
  onClose,
  onStarted,
}: {
  tutorial: TutorialDetail;
  open: boolean;
  dirty: boolean;
  onClose: () => void;
  onStarted: () => void;
}) {
  const regenerate = useRegenerateTutorial(tutorial.id);
  const focusId = useId();
  const [focus, setFocus] = useState(tutorial.focus ?? "");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Regenerate the draft</DialogTitle>
          <DialogDescription>
            ContextOS writes a new draft from the project's current knowledge.
            {tutorial.publishedVersion
              ? " Learners keep the published version until you publish again."
              : ""}
            {dirty
              ? " Your unsaved edits will be lost."
              : " Edits to the current draft are replaced."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={focusId}>Focus (optional)</Label>
          <Textarea
            id={focusId}
            rows={2}
            maxLength={300}
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={regenerate.isPending}
            onClick={() =>
              regenerate.mutate(focus.trim() || undefined, {
                onSuccess: () => {
                  onStarted();
                  toast.success("Writing a new draft");
                  onClose();
                },
                onError: (error) => toast.error(error.message),
              })
            }
          >
            Regenerate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
