import type { Answer, AnswerConfidence, Citation, DirectoryCitation } from "@contextos/shared";
import { Link, useNavigate } from "react-router";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AccountTreeIcon,
  CheckCircleFilledIcon,
  FolderOpenIcon,
  GroupsIcon,
  HelpIcon,
  OpenInNewIcon,
  PendingIcon,
  PersonIcon,
  UpdateIcon,
  WarningIcon,
} from "@/components/ui/icons";
import { TypeChip } from "@/components/ui/meta-chip";
import { StatusChip } from "@/components/ui/status-chip";
import { AnswerFeedback } from "@/features/feedback/components/answer-feedback";
import { KIND_ICON, SOURCE_KIND_ICON } from "@/features/hub/components/kind-icon";
import { useSourceDrawer } from "@/features/sources/hooks/use-source-drawer";
import { formatDate, formatDateTime } from "@/lib/format";
import { SOURCE_KIND_LABEL } from "@/lib/labels";
import { stripCitations } from "@/lib/citations";
import { CiteButton } from "@/features/ask/components/cite-button";

type Tone = React.ComponentProps<typeof StatusChip>["tone"];

/** What a directory citation is about, by its icon: a person, a team, a department, a project. */
const DIRECTORY_ICON: Record<DirectoryCitation["kind"], React.ReactNode> = {
  person: <PersonIcon />,
  team: <GroupsIcon />,
  department: <AccountTreeIcon />,
  project: <FolderOpenIcon />,
};

/** The prototype's confidence labels; state is icon + label, never color alone. */
const CONFIDENCE: Record<
  AnswerConfidence,
  { tone: Tone; icon: React.ReactNode; label: (sources: number, directoryOnly: boolean) => string }
> = {
  high: {
    tone: "success",
    icon: <CheckCircleFilledIcon />,
    label: (sources, directoryOnly) =>
      directoryOnly
        ? "Verified · from the ContextOS directory"
        : sources > 1
          ? `Verified · ${sources} sources agree`
          : "Verified",
  },
  medium: { tone: "info", icon: <PendingIcon />, label: () => "Partly verified" },
  low: { tone: "warning", icon: <WarningIcon />, label: () => "Low confidence" },
  insufficient: { tone: "error", icon: <HelpIcon />, label: () => "Not enough evidence" },
};

interface AnswerCardProps {
  answer: Answer;
}

/** An answer on the Ask page: the question as the card title, then the shared answer body. */
export function AnswerCard({ answer }: AnswerCardProps) {
  return (
    <Card>
      <CardHeader>
        <span className="text-xs text-on-surface-variant">{formatDateTime(answer.createdAt)}</span>
        <CardTitle className="text-base leading-snug">{answer.question}</CardTitle>
        {answer.rationale ? (
          <CardDescription>
            <Markdown text={stripCitations(answer.rationale)} />
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <AnswerBody answer={answer} />
      </CardContent>
    </Card>
  );
}

/**
 * The prototype's answer anatomy, shared by the Ask page and Context Bot: confidence, the answer with
 * citation chips, current state, uncertainties, numbered sources, related items and answer tools.
 */
export function AnswerBody({ answer }: AnswerCardProps) {
  const drawer = useSourceDrawer();
  const navigate = useNavigate();
  const directory = answer.directory ?? [];
  const citationByRef: CitationMap = new Map<number, Citation | DirectoryCitation>([
    ...answer.citations.map((c) => [c.ref, c] as const),
    ...directory.map((entry) => [entry.ref, entry] as const),
  ]);
  const openCitation = (citation: Citation | DirectoryCitation) => {
    if ("to" in citation) void navigate(citation.to);
    else drawer.open({ sourceId: citation.sourceObjectId, quote: citation.excerpt.slice(0, 280) });
  };
  const confidence = CONFIDENCE[answer.confidence];
  const distinctSources =
    new Set(answer.citations.map((c) => c.sourceObjectId)).size + directory.length;

  return (
    <div className="flex flex-col gap-4">
      <StatusChip tone={confidence.tone} icon={confidence.icon} className="self-start">
        {confidence.label(distinctSources, directory.length > 0 && answer.citations.length === 0)}
      </StatusChip>
      <AnswerText
        text={answer.answer}
        citationByRef={citationByRef}
        onCite={openCitation}
        className="text-[15px] leading-6"
      />

      {answer.currentState ? (
        <section className="rounded-md bg-pane px-3 py-2 text-sm">
          <h3 className="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide text-on-surface-variant uppercase [&_svg]:size-4">
            <UpdateIcon aria-hidden />
            Current state
            {answer.currentState.asOf ? ` · as of ${formatDate(answer.currentState.asOf)}` : ""}
          </h3>
          <AnswerText
            text={answer.currentState.statement}
            citationByRef={citationByRef}
            onCite={openCitation}
          />
        </section>
      ) : null}

      {answer.timelineContext ? (
        <section className="text-sm">
          <h3 className="mb-1 text-xs font-medium tracking-wide text-on-surface-variant uppercase">
            Timeline context
          </h3>
          <AnswerText
            text={answer.timelineContext}
            citationByRef={citationByRef}
            onCite={openCitation}
          />
        </section>
      ) : null}

      {answer.uncertainties.length > 0 ? (
        <section className="flex gap-2 rounded-md bg-warning-container px-3 py-2.5 text-sm text-on-warning-container">
          <WarningIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <h3 className="mb-1 text-xs font-medium tracking-wide uppercase">Uncertainties</h3>
            <ul className="list-disc space-y-1 pl-5">
              {answer.uncertainties.map((u) => (
                <li key={u}>
                  <AnswerText text={u} citationByRef={citationByRef} onCite={openCitation} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {answer.citations.length > 0 || directory.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-xs font-medium tracking-wide text-on-surface-variant uppercase">
            Sources
          </h3>
          <ol className="flex flex-col gap-0.5">
            {directory.map((entry) => (
              <li
                key={`directory-${entry.ref}`}
                className="flex items-start gap-2.5 rounded-xs bg-pane px-3 py-2.5 text-xs first:rounded-t-lg last:rounded-b-lg"
              >
                <span
                  aria-hidden
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-xs bg-ai-container font-mono text-[11px] font-semibold text-on-ai-container"
                >
                  {entry.ref}
                </span>
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-sm bg-surface-container-highest text-on-surface-variant [&_svg]:size-4"
                >
                  {DIRECTORY_ICON[entry.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    to={entry.to}
                    className="block max-w-full truncate rounded-xs text-sm font-medium text-on-surface no-underline outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {entry.title}
                  </Link>
                  <p className="text-on-surface-variant">
                    ContextOS directory{entry.detail ? ` · ${entry.detail}` : ""}
                  </p>
                </div>
              </li>
            ))}
            {answer.citations.map((citation) => {
              const Icon = SOURCE_KIND_ICON[citation.sourceKind];
              return (
                <li
                  key={`${citation.ref}-${citation.claim}`}
                  className="flex items-start gap-2.5 rounded-xs bg-pane px-3 py-2.5 text-xs first:rounded-t-lg last:rounded-b-lg"
                >
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-xs bg-ai-container font-mono text-[11px] font-semibold text-on-ai-container"
                  >
                    {citation.ref}
                  </span>
                  <span
                    aria-hidden
                    className="grid size-7 shrink-0 place-items-center rounded-sm bg-surface-container-highest text-on-surface-variant [&_svg]:size-4"
                  >
                    <Icon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      className="block max-w-full truncate rounded-xs text-start text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      onClick={() => openCitation(citation)}
                    >
                      {citation.sourceTitle}
                    </button>
                    <p className="text-on-surface-variant">
                      {SOURCE_KIND_LABEL[citation.sourceKind]}
                      {citation.sourceCreatedAt ? ` · ${formatDate(citation.sourceCreatedAt)}` : ""}
                    </p>
                    <div className="mt-1 flex gap-1">
                      <span className="shrink-0 text-on-surface-variant">Supports:</span>
                      <Markdown text={stripCitations(citation.claim)} />
                    </div>
                  </div>
                  {citation.sourceUrl ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      nativeButton={false}
                      aria-label={`Open ${citation.sourceTitle} in its source`}
                      render={
                        <a href={citation.sourceUrl} target="_blank" rel="noopener noreferrer" />
                      }
                    >
                      <OpenInNewIcon />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {answer.relatedItems.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-on-surface-variant">Related:</span>
          {answer.relatedItems.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <TypeChip key={item.id}>
                <Icon /> {item.title}
              </TypeChip>
            );
          })}
        </div>
      ) : null}

      <AnswerFeedback answer={answer} />
    </div>
  );
}

/** Renders "[n]" markers as the prototype's citation chips (AI container, 18px). */
/**
 * The answer as formatted Markdown, with its `[n]` markers as citation chips: each marker becomes a
 * `#cite-n` link, which renders as the chip that opens the source.
 */
type CitationMap = Map<number, Citation | DirectoryCitation>;

function AnswerText({
  text,
  citationByRef,
  onCite,
  className,
}: {
  text: string;
  citationByRef: CitationMap;
  onCite: (citation: Citation | DirectoryCitation) => void;
  className?: string;
}) {
  const linked = text.replace(/\[(\d+)\](?!\()/g, (marker, n: string) =>
    citationByRef.has(Number(n)) ? `[${n}](#cite-${n})` : marker,
  );
  return (
    <Markdown
      text={linked}
      className={className}
      overrides={{
        a: ({ href, children }) => {
          const ref = href?.startsWith("#cite-") ? Number(href.slice("#cite-".length)) : null;
          const citation = ref === null ? undefined : citationByRef.get(ref);
          if (!citation)
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-primary underline underline-offset-2"
              >
                {children}
              </a>
            );
          return (
            <CiteButton
              n={citation.ref}
              title={"to" in citation ? citation.title : citation.sourceTitle}
              onClick={() => onCite(citation)}
            />
          );
        },
      }}
    />
  );
}
