import { useBotContext } from "@/components/layout/bot-context";
import {
  CONTRIBUTION_MIN_TITLE,
  CONTRIBUTION_MIN_WORDS,
  ContributionInputSchema,
  ContributionVisibilitySchema,
  KnowledgeSectionSchema,
  countWords,
  type ContributionVisibility,
  type KnowledgeGap,
  type KnowledgeSection,
  type SourcePick,
  type WritableContributionKind,
} from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { OriginIcon } from "@/components/origin-icon";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { SectionCard } from "@/components/section-card";
import { PersonAvatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConnectedButton, ConnectedButtonGroup } from "@/components/ui/connected-button-group";
import { DotList } from "@/components/ui/dot-list";
import {
  AddLinkIcon,
  CheckCircleFilledIcon,
  CloseIcon,
  EditIcon,
  HelpIcon,
  HubIcon,
  InfoIcon,
  RadioButtonUncheckedIcon,
  SaveIcon,
  SendIcon,
  SyncProblemIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
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
import { Textarea } from "@/components/ui/textarea";
import { CONTRIBUTION_ENDPOINTS as E } from "@/features/contributions/api/contributions.api";
import {
  myKnowledgeGapsQuery,
  suggestedReviewerQuery,
  useCreateContribution,
  useDraftContribution,
} from "@/features/contributions/api/contributions.queries";
import { SourcePickerDialog } from "@/features/contributions/components/source-picker-dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiClientError } from "@/lib/api-client";
import { KNOWLEDGE_ORIGIN_LABEL, SECTION_LABEL, VISIBILITY_LABEL } from "@/lib/labels";

const KINDS: Array<{ value: WritableContributionKind; label: string }> = [
  { value: "article", label: "New article" },
  { value: "edit", label: "Suggested edit" },
  { value: "glossary_term", label: "Glossary term" },
];

interface Draft {
  kind: WritableContributionKind;
  title: string;
  section: KnowledgeSection;
  visibility: ContributionVisibility;
  body: string;
  sources: SourcePick[];
  /** The body came from "Draft from sources". */
  drafted: boolean;
}

/** "How do I roll back a Kestrel deploy?" → "Roll back a Kestrel deploy". */
function titleFromQuestion(question: string): string {
  const stripped = question
    .trim()
    .replace(/^how (do|can|should) (i|we|you) /i, "")
    .replace(/\?$/, "");
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/**
 * New contribution (prototype `editorPage`). `?gap=<id>` starts from one of your knowledge gaps;
 * `?question=` starts from a question someone asked (the manager's knowledge gaps).
 */
export function ContributionEditorPage() {
  const [params] = useSearchParams();
  const gapId = params.get("gap");
  const question = params.get("question");
  const gaps = useQuery({ ...myKnowledgeGapsQuery(), enabled: gapId !== null });

  if (gapId && gaps.isPending) {
    return (
      <div className="grid min-h-80 place-items-center">
        <Loader label="Loading the knowledge gap" />
      </div>
    );
  }
  const gap = gapId ? (gaps.data?.find((entry) => entry.id === gapId) ?? null) : null;
  return (
    <EditorForm
      key={gap?.id ?? question ?? "blank"}
      gap={gap}
      question={gap?.question ?? question}
    />
  );
}

function EditorForm({ gap, question }: { gap: KnowledgeGap | null; question: string | null }) {
  const navigate = useNavigate();
  const ids = { title: useId(), section: useId(), visibility: useId(), body: useId() };
  const [draft, setDraft] = useState<Draft>(() => ({
    kind: gap?.suggestedKind ?? "article",
    title: question ? titleFromQuestion(question) : "",
    section: gap?.section ?? "process",
    visibility: "workspace",
    body: "",
    sources: [],
    drafted: false,
  }));
  const [pickerOpen, setPickerOpen] = useState(false);
  useBotContext(
    {
      chips: [
        {
          icon: EditIcon,
          label: draft.title.trim() ? `Draft: ${draft.title.trim()}` : "New contribution",
        },
      ],
      suggestions: ["How do I roll back a Kestrel deploy?", "Who should I ask about Kestrel?"],
      intro: "Ask me to find sources or check facts while you write.",
    },
    `editor:${draft.title.trim()}`,
  );
  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const debouncedTitle = useDebouncedValue(draft.title.trim());
  const reviewer = useQuery(suggestedReviewerQuery(draft.section, debouncedTitle));
  const writeDraft = useDraftContribution();
  const create = useCreateContribution();

  const words = countWords(draft.body);
  const checks: Array<[string, boolean]> = [
    ["Title", draft.title.trim().length >= CONTRIBUTION_MIN_TITLE],
    [`At least ${CONTRIBUTION_MIN_WORDS} words`, words >= CONTRIBUTION_MIN_WORDS],
    ["At least one source", draft.sources.length > 0],
  ];
  const ready = checks.every(([, ok]) => ok);

  const draftFromSources = () =>
    writeDraft.mutate(
      {
        kind: draft.kind,
        title: draft.title.trim(),
        sourceIds: draft.sources.map((source) => source.id),
      },
      {
        onSuccess: (result) => {
          setDraft((current) => {
            const known = new Set(current.sources.map((source) => source.id));
            return {
              ...current,
              body: result.body,
              drafted: true,
              sources: [
                ...current.sources,
                ...result.sources.filter((source) => !known.has(source.id)),
              ],
            };
          });
          toast(
            `Draft written from ${result.sources.length} ${result.sources.length === 1 ? "source" : "sources"}. Check every step before you submit.`,
          );
        },
        onError: () => toast.error("Context Bot could not write a draft. Please try again."),
      },
    );

  const save = (submit: boolean) => {
    const parsed = ContributionInputSchema.safeParse({
      kind: draft.kind,
      title: draft.title.trim(),
      section: draft.section,
      visibility: draft.visibility,
      body: draft.body,
      sourceIds: draft.sources.map((source) => source.id),
      gapId: gap?.id ?? null,
      submit,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the contribution and try again.");
      return;
    }
    create.mutate(parsed.data, {
      onSuccess: (created) => {
        toast.success(
          submit
            ? `Submitted for review. ${created.reviewer?.name ?? "A reviewer"} will review it.`
            : "Draft saved",
        );
        void navigate("/contributions", { state: { highlight: created.id } });
      },
      onError: (error) =>
        toast.error(
          error instanceof ApiClientError
            ? error.message
            : "It could not be saved. Please try again.",
        ),
    });
  };

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/contributions" />}>Contributions</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New contribution</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-[28px] leading-9 font-semibold tracking-tight">
          New contribution
        </h1>
        <ConnectedButtonGroup aria-label="Contribution type" className="flex-wrap">
          {KINDS.map((kind) => (
            <ConnectedButton
              key={kind.value}
              pressed={draft.kind === kind.value}
              onClick={() =>
                update({
                  kind: kind.value,
                  section: kind.value === "glossary_term" ? "glossary" : draft.section,
                })
              }
            >
              {kind.label}
            </ConnectedButton>
          ))}
        </ConnectedButtonGroup>
      </div>
      {question ? (
        <Banner
          tone="ai"
          icon={<HelpIcon aria-hidden />}
          title={<>Fills the gap: “{question}”</>}
          description="People who asked will be notified when it’s published."
        />
      ) : null}
      <PageColumns>
        <PageMain>
          <form
            onSubmit={(event) => event.preventDefault()}
            autoComplete="off"
            aria-label="Contribution"
          >
            <Card className="gap-4.5 px-6">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.title}>Title</Label>
                <Input
                  id={ids.title}
                  value={draft.title}
                  onChange={(event) => update({ title: event.target.value })}
                  placeholder={
                    draft.kind === "glossary_term"
                      ? "e.g. Dwell time"
                      : "e.g. Roll back a Kestrel deploy"
                  }
                  maxLength={200}
                />
              </div>
              <div className="grid gap-4 @min-[640px]:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={ids.section}>Section</Label>
                  <Select
                    items={SECTION_LABEL}
                    value={draft.section}
                    onValueChange={(value) => {
                      const section = KnowledgeSectionSchema.safeParse(value);
                      if (section.success) update({ section: section.data });
                    }}
                  >
                    <SelectTrigger id={ids.section} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KnowledgeSectionSchema.options.map((section) => (
                        <SelectItem key={section} value={section}>
                          {SECTION_LABEL[section]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={ids.visibility}>Who can see it</Label>
                  <Select
                    items={VISIBILITY_LABEL}
                    value={draft.visibility}
                    onValueChange={(value) => {
                      const visibility = ContributionVisibilitySchema.safeParse(value);
                      if (visibility.success) update({ visibility: visibility.data });
                    }}
                  >
                    <SelectTrigger id={ids.visibility} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ContributionVisibilitySchema.options.map((visibility) => (
                        <SelectItem key={visibility} value={visibility}>
                          {VISIBILITY_LABEL[visibility]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor={ids.body}>Content</Label>
                  <span className="flex items-center gap-2">
                    <PreviewDataChip endpoint={E.draft.path} />
                    <Button
                      type="button"
                      size="xs"
                      variant="ai-tonal"
                      disabled={draft.drafted || writeDraft.isPending}
                      onClick={draftFromSources}
                    >
                      <HubIcon aria-hidden />
                      {draft.drafted
                        ? "Drafted from sources"
                        : writeDraft.isPending
                          ? "Drafting…"
                          : "Draft from sources"}
                    </Button>
                  </span>
                </div>
                {draft.drafted ? (
                  <p className="flex items-center gap-1.5 rounded-md bg-warning-container px-3 py-2 text-xs text-on-warning-container">
                    <InfoIcon className="size-4 shrink-0" aria-hidden />
                    Drafted by Context Bot from the sources below. Check every step before you
                    submit.
                  </p>
                ) : null}
                <Textarea
                  id={ids.body}
                  value={draft.body}
                  onChange={(event) => update({ body: event.target.value })}
                  rows={14}
                  placeholder="Write in plain steps. Markdown works: ## headings, 1. numbered steps, `code`."
                  className="min-h-75 font-mono text-[15px] leading-6"
                />
                <span className="text-xs text-on-surface-variant" aria-live="polite">
                  {words} {words === 1 ? "word" : "words"}
                </span>
              </div>
            </Card>
          </form>
          <SectionCard
            title="Sources"
            count={draft.sources.length}
            action={
              <Button type="button" size="xs" variant="outline" onClick={() => setPickerOpen(true)}>
                <AddLinkIcon aria-hidden /> Add source
              </Button>
            }
          >
            {draft.sources.length ? (
              <SegmentedList>
                {draft.sources.map((source) => (
                  <SegmentedItem key={source.id} className="min-h-0 gap-3 py-2.5 pr-2 pl-3">
                    <SegmentedItemLead tone="neutral" size="sm">
                      <OriginIcon origin={source.origin} />
                    </SegmentedItemLead>
                    <SegmentedItemBody>
                      <SegmentedItemTitle className="whitespace-normal">
                        {source.title}
                      </SegmentedItemTitle>
                      <SegmentedItemMeta>
                        <DotList
                          parts={[
                            source.label,
                            KNOWLEDGE_ORIGIN_LABEL[source.origin],
                            source.owner,
                          ]}
                        />
                      </SegmentedItemMeta>
                      {source.stale ? (
                        <span className="inline-flex items-center gap-1 text-xs text-warning">
                          <SyncProblemIcon className="size-4" aria-hidden />
                          This source’s connector is failing. Check it is current.
                        </span>
                      ) : null}
                    </SegmentedItemBody>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${source.title}`}
                      onClick={() =>
                        update({ sources: draft.sources.filter((entry) => entry.id !== source.id) })
                      }
                    >
                      <CloseIcon />
                    </Button>
                  </SegmentedItem>
                ))}
              </SegmentedList>
            ) : (
              <p className="text-sm text-on-surface-variant">
                Add at least one source so readers and Context Bot can check where this came from.
              </p>
            )}
          </SectionCard>
        </PageMain>
        <PageSide>
          <SectionCard title="Review" endpoint={[E.reviewer.path, E.create.path]}>
            {reviewer.data ? (
              <div className="flex items-center gap-3 rounded-xl bg-pane py-2 pr-2 pl-2.5">
                <PersonAvatar person={reviewer.data.reviewer} size="md" />
                <div className="flex min-w-0 flex-col">
                  <b className="text-sm font-medium">{reviewer.data.reviewer.name}</b>
                  <span className="text-xs text-on-surface-variant">
                    Reviewer · {reviewer.data.reason}
                  </span>
                </div>
              </div>
            ) : reviewer.isError ? (
              <p className="text-xs text-on-surface-variant">
                A reviewer is picked when you submit.
              </p>
            ) : (
              <Skeleton className="h-16 rounded-xl" />
            )}
            <ul className="flex flex-col gap-1.5" aria-label="Ready to submit">
              {checks.map(([label, ok]) => (
                <li
                  key={label}
                  className={
                    ok
                      ? "flex items-center gap-2.5 text-sm"
                      : "flex items-center gap-2.5 text-sm text-on-surface-variant"
                  }
                >
                  {ok ? (
                    <CheckCircleFilledIcon className="size-5 text-success" aria-hidden />
                  ) : (
                    <RadioButtonUncheckedIcon className="size-5" aria-hidden />
                  )}
                  {label}
                  <span className="sr-only">{ok ? " (done)" : " (to do)"}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 [&>*]:flex-[1_1_auto]">
              <Button
                type="button"
                variant="outline"
                disabled={create.isPending}
                onClick={() => save(false)}
              >
                <SaveIcon aria-hidden /> Save draft
              </Button>
              <Button
                type="button"
                disabled={!ready || create.isPending}
                onClick={() => save(true)}
              >
                <SendIcon aria-hidden /> Submit for review
              </Button>
            </div>
          </SectionCard>
        </PageSide>
      </PageColumns>
      <SourcePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        query={draft.title}
        selected={draft.sources}
        onConfirm={(sources) => {
          update({ sources });
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
