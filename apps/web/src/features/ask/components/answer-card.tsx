import type { Answer, AnswerConfidence, Citation } from "@contextos/shared";
import { AlertTriangleIcon, ClockIcon, LinkIcon } from "lucide-react";
import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FeedbackButtons } from "@/features/feedback/components/feedback-buttons";
import { useSourceDrawer } from "@/features/sources/hooks/use-source-drawer";
import { formatDate, formatDateTime } from "@/lib/format";
import { ANSWER_CONFIDENCE_LABEL, KIND_LABEL, SOURCE_KIND_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

const CONFIDENCE_STYLE: Record<AnswerConfidence, string> = {
  high: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  medium: "text-muted-foreground",
  low: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  insufficient: "border-destructive/40 bg-destructive/10 text-destructive",
};

interface AnswerCardProps {
  projectId: string;
  answer: Answer;
}

export function AnswerCard({ projectId, answer }: AnswerCardProps) {
  const drawer = useSourceDrawer();
  const citationByRef = new Map(answer.citations.map((c) => [c.ref, c]));
  const openCitation = (citation: Citation) =>
    drawer.open({ sourceId: citation.sourceObjectId, quote: citation.excerpt.slice(0, 280) });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn(CONFIDENCE_STYLE[answer.confidence])}>
            {ANSWER_CONFIDENCE_LABEL[answer.confidence]}
          </Badge>
          <span className="text-xs text-muted-foreground">{formatDateTime(answer.createdAt)}</span>
        </div>
        <CardTitle className="text-base leading-snug">{answer.question}</CardTitle>
        {answer.rationale ? <CardDescription>{answer.rationale}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          <AnswerText text={answer.answer} citationByRef={citationByRef} onCite={openCitation} />
        </p>

        {answer.currentState ? (
          <section className="rounded-md border px-3 py-2 text-sm">
            <h3 className="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <ClockIcon className="size-3.5" aria-hidden />
              Current state
              {answer.currentState.asOf ? ` · as of ${formatDate(answer.currentState.asOf)}` : ""}
            </h3>
            <p>{answer.currentState.statement}</p>
          </section>
        ) : null}

        {answer.timelineContext ? (
          <section className="text-sm">
            <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Timeline context
            </h3>
            <p>{answer.timelineContext}</p>
          </section>
        ) : null}

        {answer.uncertainties.length > 0 ? (
          <section className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
            <h3 className="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide text-amber-700 uppercase dark:text-amber-400">
              <AlertTriangleIcon className="size-3.5" aria-hidden />
              Uncertainties
            </h3>
            <ul className="list-disc space-y-1 pl-5">
              {answer.uncertainties.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {answer.citations.length > 0 ? (
          <section className="space-y-1.5">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Sources
            </h3>
            <ol className="space-y-1.5">
              {answer.citations.map((citation) => (
                <li
                  key={`${citation.ref}-${citation.claim}`}
                  className="rounded-md border bg-muted/40 px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] text-primary-foreground">
                      {citation.ref}
                    </span>
                    <Button
                      variant="link"
                      size="xs"
                      className="h-auto px-0 text-xs"
                      onClick={() => openCitation(citation)}
                    >
                      <LinkIcon aria-hidden />
                      {citation.sourceTitle}
                    </Button>
                    <span className="text-muted-foreground">
                      {SOURCE_KIND_LABEL[citation.sourceKind]}
                      {citation.sourceCreatedAt ? ` · ${formatDate(citation.sourceCreatedAt)}` : ""}
                    </span>
                  </div>
                  <p className="mt-1">
                    <span className="text-muted-foreground">Supports:</span> {citation.claim}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {answer.relatedItems.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Related:</span>
            {answer.relatedItems.map((item) => (
              <Badge key={item.id} variant="secondary">
                {KIND_LABEL[item.kind]}: {item.title}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="flex justify-end">
          <FeedbackButtons projectId={projectId} targetType="answer" targetId={answer.id} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Renders "[n]" markers as clickable citation chips. */
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
        if (!match) return <Fragment key={index}>{part}</Fragment>;
        if (!citation) return <Fragment key={index}>{part}</Fragment>;
        return (
          <button
            key={index}
            type="button"
            className="mx-0.5 rounded bg-primary/10 px-1 align-baseline font-mono text-[10px] text-primary hover:bg-primary/20"
            onClick={() => onCite(citation)}
            aria-label={`Open source ${citation.ref}: ${citation.sourceTitle}`}
          >
            {citation.ref}
          </button>
        );
      })}
    </>
  );
}
