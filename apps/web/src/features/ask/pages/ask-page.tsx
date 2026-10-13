import { useQuery } from "@tanstack/react-query";
import { MessageSquareIcon } from "lucide-react";
import { useParams } from "react-router";
import { PageHeader } from "@/components/layout/page-header";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { questionsQuery, useAskQuestion } from "@/features/ask/api/ask.queries";
import { AnswerCard } from "@/features/ask/components/answer-card";
import { AskForm } from "@/features/ask/components/ask-form";

export function AskPage() {
  const { projectId = "" } = useParams();
  const questions = useQuery(questionsQuery(projectId));
  const ask = useAskQuestion(projectId);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ask ContextOS"
        description="Answers are built only from this project's sources and cite the passages they rest on. When the evidence is thin, it says so."
      />
      <AskForm isPending={ask.isPending} onSubmit={(question) => ask.mutate({ question })} />

      <section className="space-y-4" aria-live="polite">
        {ask.isPending ? <Skeleton className="h-40 rounded-xl" /> : null}
        {questions.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : questions.isError ? (
          <p className="text-sm text-destructive">
            Could not load history: {questions.error.message}
          </p>
        ) : questions.data.items.length === 0 && !ask.isPending ? (
          <Empty className="border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareIcon />
              </EmptyMedia>
              <EmptyTitle>No questions yet</EmptyTitle>
              <EmptyDescription>
                Try one of the suggestions above. Each answer keeps its citations so you can verify
                it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          questions.data.items.map((answer) => (
            <AnswerCard key={answer.id} projectId={projectId} answer={answer} />
          ))
        )}
      </section>
    </div>
  );
}
