import type { Answer, AnswerConfidence, Citation } from "@contextos/shared";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircleFilledIcon,
  HelpIcon,
  OpenInNewIcon,
  PendingIcon,
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
import { CiteButton } from "@/features/ask/components/cite-button";

type Tone = React.ComponentProps<typeof StatusChip>["tone"];

/** The prototype's confidence labels; state is icon + label, never color alone. */
const CONFIDENCE: Record<
  AnswerConfidence,
  { tone: Tone; icon: React.ReactNode; label: (sources: number) => string }
> = {
  high: {
    tone: "success",
    icon: <CheckCircleFilledIcon />,
    label: (sources) => (sources > 1 ? `Verified · ${sources} sources agree` : "Verified"),
  },
  medium: { tone: "info", icon: <PendingIcon />, label: () => "Partly verified" },
  low: { tone: "warning", icon: <WarningIcon />, label: () => "Low confidence" },
  insufficient: { tone: "error", icon: <HelpIcon />, label: () => "Not enough evidence" },
};

interface AnswerCardProps {
  projectId: string;
  answer: Answer;
}

/** An answer on the Ask page: the question as the card title, then the shared answer body. */
export function AnswerCard({ projectId, answer }: AnswerCardProps) {
  return (
    <Card>
      <CardHeader>
        <span className="text-xs text-on-surface-variant">{formatDateTime(answer.createdAt)}</span>
        <CardTitle className="text-base leading-snug">{answer.question}</CardTitle>
        {answer.rationale ? <CardDescription>{answer.rationale}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <AnswerBody projectId={projectId} answer={answer} />
      </CardContent>
    </Card>
  );
}

/**
 * The prototype's answer anatomy, shared by the Ask page and Context Bot: confidence, the answer with
 * citation chips, current state, uncertainties, numbered sources, related items and answer tools.
 */
export function AnswerBody({ projectId, answer }: AnswerCardProps) {
  const drawer = useSourceDrawer();
  const citationByRef = new Map(answer.citations.map((c) => [c.ref, c]));
  const openCitation = (citation: Citation) =>
    drawer.open({ sourceId: citation.sourceObjectId, quote: citation.excerpt.slice(0, 280) });
  const confidence = CONFIDENCE[answer.confidence];
  const distinctSources = new Set(answer.citations.map((c) => c.sourceObjectId)).size;

  return (
    <div className="flex flex-col gap-4">
      <StatusChip tone={confidence.tone} icon={confidence.icon} className="self-start">
        {confidence.label(distinctSources)}
      </StatusChip>
      <p className="text-[15px] leading-6 whitespace-pre-wrap">
        <AnswerText text={answer.answer} citationByRef={citationByRef} onCite={openCitation} />
      </p>

      {answer.currentState ? (
        <section className="rounded-md bg-pane px-3 py-2 text-sm">
          <h3 className="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide text-on-surface-variant uppercase [&_svg]:size-4">
            <UpdateIcon aria-hidden />
            Current state
            {answer.currentState.asOf ? ` · as of ${formatDate(answer.currentState.asOf)}` : ""}
          </h3>
          <p>{answer.currentState.statement}</p>
        </section>
      ) : null}

      {answer.timelineContext ? (
        <section className="text-sm">
          <h3 className="mb-1 text-xs font-medium tracking-wide text-on-surface-variant uppercase">
            Timeline context
          </h3>
          <p>{answer.timelineContext}</p>
        </section>
      ) : null}

      {answer.uncertainties.length > 0 ? (
        <section className="flex gap-2 rounded-md bg-warning-container px-3 py-2.5 text-sm text-on-warning-container">
          <WarningIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <h3 className="mb-1 text-xs font-medium tracking-wide uppercase">Uncertainties</h3>
            <ul className="list-disc space-y-1 pl-5">
              {answer.uncertainties.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {answer.citations.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-xs font-medium tracking-wide text-on-surface-variant uppercase">
            Sources
          </h3>
          <ol className="flex flex-col gap-0.5">
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
                    <p className="mt-1">
                      <span className="text-on-surface-variant">Supports:</span> {citation.claim}
                    </p>
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

      <AnswerFeedback projectId={projectId} answer={answer} />
    </div>
  );
}

/** Renders "[n]" markers as the prototype's citation chips (AI container, 18px). */
function AnswerText({
  text,
  citationByRef,
  onCite,
}: {
  text: string;
  citationByRef: Map<number, Citation>;
  onCite: (citation: Citation) => void;
}) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, index) => {
        const match = /^\[(\d+)\]$/.exec(part);
        const citation = match ? citationByRef.get(Number(match[1])) : undefined;
        if (!match || !citation) return <Fragment key={index}>{part}</Fragment>;
        return (
          <CiteButton
            key={index}
            n={citation.ref}
            title={citation.sourceTitle}
            onClick={() => onCite(citation)}
          />
        );
      })}
    </>
  );
}
