import type { CheckResult, KnowledgeCheck } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { useAssistant } from "@/components/layout/assistant-context";
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
import {
  ArrowForwardIcon,
  CancelFilledIcon,
  CheckCircleFilledIcon,
  FlagIcon,
  HubIcon,
  LinkIcon,
  PlayArrowFilledIcon,
  QuizIcon,
  ReplayIcon,
  SendIcon,
} from "@/components/ui/icons";
import { Loader } from "@/components/ui/loader";
import { MetaChip } from "@/components/ui/meta-chip";
import { OptionList, OptionTile } from "@/components/ui/option-tile";
import { ProgressRing } from "@/components/ui/progress-ring";
import { LEARNING_ENDPOINTS as E } from "@/features/learning/api/learning.api";
import { checkQuery, useSubmitCheck } from "@/features/learning/api/learning.queries";
import { ROADMAP_PATH, modulePath } from "@/features/learning/learning-meta";
import { formatPercent } from "@/lib/format";

/** A knowledge check (prototype `checkPage`): answer every question, then see the graded review. */
export function CheckPage() {
  const { checkId = "" } = useParams();
  const query = useQuery(checkQuery(checkId));

  if (query.isPending) {
    return (
      <div className="grid min-h-80 place-items-center">
        <Loader label="Loading the knowledge check" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-360">
        <SectionCard
          title="This knowledge check could not be loaded"
          endpoint={E.check.path}
          status={query}
        />
      </div>
    );
  }
  return <CheckView check={query.data} />;
}

function CheckView({ check }: { check: KnowledgeCheck }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CheckResult | null>(null);
  const submit = useSubmitCheck(check.id);
  const answered = Object.keys(answers).length;
  const total = check.questions.length;

  const send = () =>
    submit.mutate(
      {
        answers: Object.entries(answers).map(([questionId, optionId]) => ({
          questionId,
          optionId,
        })),
      },
      {
        onSuccess: (graded) => {
          setResult(graded);
          toast(
            graded.passed
              ? "Knowledge check passed. Your progress is updated."
              : `${graded.score} of ${graded.total}. Review the explanations and try again.`,
          );
          document.getElementById("main")?.scrollTo({ top: 0 });
        },
        onError: () => toast.error("Your answers could not be submitted. Please try again."),
      },
    );

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to={ROADMAP_PATH} />}>My roadmap</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to={`${ROADMAP_PATH}?stage=${check.stage.id}`} />}>
              {check.stage.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to={modulePath(check.module.id)} />}>
              {check.module.title}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Knowledge check</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-on-surface-variant">
          Module {check.module.number} · Knowledge check
        </p>
        <h1 className="font-heading text-[28px] leading-9 font-semibold tracking-tight text-balance medium:text-[32px] medium:leading-10">
          {check.module.title}
        </h1>
        <div className="flex flex-wrap gap-1.5">
          <MetaChip tone="filled">
            <QuizIcon aria-hidden /> {total} questions
          </MetaChip>
          <MetaChip tone="filled">
            <FlagIcon aria-hidden /> Pass mark {check.passMark} of {total}
          </MetaChip>
          <MetaChip tone="filled">
            <ReplayIcon aria-hidden /> Retake as often as you like
          </MetaChip>
          <MetaChip tone="filled">
            <LinkIcon aria-hidden /> Every answer cites its source
          </MetaChip>
        </div>
      </header>

      {result ? (
        <CheckReview
          check={check}
          answers={answers}
          result={result}
          onRetake={() => {
            setAnswers({});
            setResult(null);
          }}
        />
      ) : (
        <form
          className="flex max-w-190 flex-col gap-3"
          aria-label="Knowledge check"
          onSubmit={(event) => {
            event.preventDefault();
            if (answered === total) send();
          }}
        >
          {check.questions.map((question, index) => (
            <fieldset
              key={question.id}
              className="flex min-w-0 flex-col gap-3 rounded-card bg-card p-6"
            >
              <legend className="contents">
                <span className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-on-surface-variant">
                    Question {index + 1} of {total}
                  </span>
                  <span className="text-base font-medium">{question.prompt}</span>
                </span>
              </legend>
              <OptionList>
                {question.options.map((option) => (
                  <OptionTile
                    key={option.id}
                    className="bg-pane text-base"
                    input={
                      <input
                        type="radio"
                        name={question.id}
                        value={option.id}
                        checked={answers[question.id] === option.id}
                        onChange={() =>
                          setAnswers((current) => ({ ...current, [question.id]: option.id }))
                        }
                      />
                    }
                    title={option.text}
                  />
                ))}
              </OptionList>
            </fieldset>
          ))}
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-container-high px-4 py-3 shadow-elevation-1">
            <span className="text-sm" aria-live="polite">
              <b className="font-medium">{answered}</b> of {total} answered
            </span>
            <Button type="submit" size="md" disabled={answered < total || submit.isPending}>
              <SendIcon aria-hidden /> Submit answers
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function CheckReview({
  check,
  answers,
  result,
  onRetake,
}: {
  check: KnowledgeCheck;
  answers: Record<string, string>;
  result: CheckResult;
  onRetake: () => void;
}) {
  const { openAssistant } = useAssistant();
  const optionText = (questionId: string, optionId: string) =>
    check.questions
      .find((question) => question.id === questionId)
      ?.options.find((option) => option.id === optionId)?.text ?? "";

  return (
    <>
      <section
        role="status"
        className={cn(
          "flex flex-wrap items-center gap-7 rounded-[28px] px-7 py-6",
          result.passed
            ? "bg-[color-mix(in_srgb,var(--color-success-container)_65%,var(--color-pane))] text-on-success-container"
            : "bg-[color-mix(in_srgb,var(--color-warning-container)_65%,var(--color-pane))] text-on-warning-container",
        )}
      >
        <ProgressRing
          value={result.score / result.total}
          size={120}
          tone={result.passed ? "success" : "warning"}
          aria-hidden
        >
          <span className="font-heading text-2xl leading-7 font-semibold">
            {result.score}/{result.total}
          </span>
        </ProgressRing>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5">
          <h2 className="font-heading text-2xl leading-8 font-semibold">
            {result.passed
              ? "You passed. Module complete."
              : `${result.score} of ${result.total}. You need ${result.passMark} to pass.`}
          </h2>
          <p className="text-base">
            {result.passed
              ? "Nice work. Your roadmap and progress are updated."
              : "Review the explanations below, then try again. Nothing is recorded until you pass."}
          </p>
          {result.progress ? (
            <div className="grid grid-cols-1 gap-2 @min-[640px]:grid-cols-3">
              {(
                [
                  [
                    result.progress.stageName,
                    `${result.progress.modulesDone} of ${result.progress.moduleCount} modules`,
                  ],
                  [
                    "Overall onboarding",
                    <>
                      {formatPercent(result.progress.overallBefore)}{" "}
                      <ArrowForwardIcon className="size-4" aria-label="to" />{" "}
                      {formatPercent(result.progress.overallAfter)}
                    </>,
                  ],
                  [
                    "Knowledge checks",
                    `${result.progress.checksPassed} of ${result.progress.checksTotal} passed`,
                  ],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex flex-col gap-0.5 rounded-lg bg-pane px-3.5 py-3 text-on-surface"
                >
                  <span className="text-xs font-medium text-on-surface-variant">{label}</span>
                  <span className="inline-flex items-center gap-1 text-base font-medium">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-1 flex flex-wrap gap-3">
            {result.passed ? (
              <>
                {result.nextModule ? (
                  <Button
                    size="md"
                    nativeButton={false}
                    render={<Link to={modulePath(result.nextModule.id)} />}
                  >
                    <PlayArrowFilledIcon aria-hidden /> Next: {result.nextModule.title}
                  </Button>
                ) : null}
                <Button
                  size="md"
                  variant="outline"
                  className="text-current"
                  nativeButton={false}
                  render={<Link to={ROADMAP_PATH} />}
                >
                  Back to roadmap
                </Button>
              </>
            ) : (
              <>
                <Button size="md" onClick={onRetake}>
                  <ReplayIcon aria-hidden /> Retake the check
                </Button>
                <Button
                  size="md"
                  variant="outline"
                  className="text-current"
                  nativeButton={false}
                  render={<Link to={modulePath(check.module.id)} />}
                >
                  Review the module
                </Button>
              </>
            )}
          </div>
        </div>
      </section>
      <SectionCard
        title="Your answers"
        action={
          <Button
            size="xs"
            variant="ai-tonal"
            onClick={() => openAssistant(`Explain the answers in “${check.module.title}”`)}
          >
            <HubIcon aria-hidden /> Ask about a question
          </Button>
        }
      >
        <ol className="flex flex-col gap-0.5">
          {result.review.map((entry, index) => {
            const correct = entry.chosenOptionId === entry.correctOptionId;
            const prompt =
              check.questions.find((question) => question.id === entry.questionId)?.prompt ?? "";
            return (
              <li
                key={entry.questionId}
                className="flex items-start gap-3 rounded-xs bg-pane px-4 py-3.5 first:rounded-t-lg last:rounded-b-lg"
              >
                {correct ? (
                  <CheckCircleFilledIcon
                    className="size-5 shrink-0 text-success"
                    aria-label="Correct"
                  />
                ) : (
                  <CancelFilledIcon className="size-5 shrink-0 text-error" aria-label="Incorrect" />
                )}
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-medium">
                    {index + 1}. {prompt}
                  </span>
                  <span className="text-sm">
                    {correct ? null : (
                      <span className="text-on-surface-variant">
                        Your answer: {optionText(entry.questionId, answers[entry.questionId] ?? "")}
                        .{" "}
                      </span>
                    )}
                    <b className="font-medium">
                      {optionText(entry.questionId, entry.correctOptionId)}
                    </b>
                  </span>
                  <span className="text-xs text-on-surface-variant">{entry.explanation}</span>
                  <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
                    <LinkIcon className="size-4" aria-hidden /> {entry.source}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </SectionCard>
    </>
  );
}
