import type { RoadmapStage } from "@contextos/shared";
import { cn } from "cn";
import { CheckIcon, PlayArrowFilledIcon, VerifiedFilledIcon } from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import { Shape } from "@/components/ui/shape";
import { STAGE_PANEL_ID, stageTabId } from "@/features/learning/learning-meta";
import { formatDayDate, formatShortDate } from "@/lib/format";

/**
 * The roadmap's stage rail (prototype `.stage-rail`): one tab per stage with its weeks, progress and
 * opening date, then the probation review. Scrolls sideways when the content pane is narrow.
 */
export function StageTabs({
  stages,
  selected,
  onSelect,
  probationReviewOn,
  totalDays,
}: {
  stages: RoadmapStage[];
  selected: string;
  onSelect: (id: string) => void;
  probationReviewOn: string | null;
  totalDays: number;
}) {
  const move = (from: number, step: number) => {
    const next = stages[(from + step + stages.length) % stages.length];
    if (!next) return;
    onSelect(next.id);
    document.getElementById(stageTabId(next.id))?.focus();
  };

  return (
    <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1.5 medium:-mx-8 medium:px-8 @min-[940px]:mx-0 @min-[940px]:grid @min-[940px]:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,0.8fr)] @min-[940px]:overflow-visible @min-[940px]:px-0">
      <div role="tablist" aria-label="Roadmap stages" className="contents">
        {stages.map((stage, index) => {
          const done = stage.modules.filter((module) => module.status === "done").length;
          const isSelected = stage.id === selected;
          const complete = done === stage.modules.length;
          return (
            <button
              key={stage.id}
              type="button"
              role="tab"
              id={stageTabId(stage.id)}
              aria-selected={isSelected}
              aria-controls={STAGE_PANEL_ID}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelect(stage.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") move(index, 1);
                if (event.key === "ArrowLeft") move(index, -1);
              }}
              className={cn(
                "relative isolate flex w-50 shrink-0 flex-col gap-1 rounded-xl bg-card px-4 pt-3.5 pb-4 text-start transition-[border-radius,background-color] duration-[350ms] ease-spring-fast-spatial outline-none hover:bg-[color-mix(in_srgb,var(--color-card),var(--color-on-surface)_6%)] focus-visible:ring-3 focus-visible:ring-ring/50 active:rounded-md @min-[940px]:w-auto",
                isSelected &&
                  "rounded-[28px] bg-secondary-container text-on-secondary-container hover:bg-secondary-container",
              )}
            >
              <span
                className={cn(
                  "flex min-h-5 items-center gap-1.5 text-xs font-medium",
                  !isSelected && "text-on-surface-variant",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-5 place-items-center rounded-full shadow-[inset_0_0_0_2px_var(--color-outline-variant)] [&_svg]:size-3.5",
                    stage.state === "current" && "bg-primary text-primary-foreground shadow-none",
                  )}
                >
                  {stage.state === "current" ? (
                    <PlayArrowFilledIcon />
                  ) : complete ? (
                    <CheckIcon />
                  ) : null}
                </span>
                Weeks {stage.weekStart}–{stage.weekEnd}
                {stage.state === "current" ? (
                  <span className="ms-auto rounded-sm bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">
                    Now
                  </span>
                ) : null}
              </span>
              <b
                className={cn(
                  "text-base font-medium",
                  !isSelected &&
                    stage.state !== "current" &&
                    stage.state !== "done" &&
                    "text-on-surface-variant",
                )}
              >
                {stage.name}
              </b>
              <span className={cn("text-xs", !isSelected && "text-on-surface-variant")}>
                {done} of {stage.modules.length} done
                {stage.state === "next" || stage.state === "later"
                  ? ` · opens ${formatShortDate(stage.startsOn)}`
                  : ""}
              </span>
              <Progress
                flat
                value={stage.modules.length ? Math.round((done / stage.modules.length) * 100) : 0}
                aria-label={`${stage.name} progress`}
                className="mt-1.5"
              />
            </button>
          );
        })}
      </div>
      {probationReviewOn ? (
        <div className="flex w-50 shrink-0 flex-col gap-1 rounded-xl px-4 pt-3.5 pb-4 shadow-[inset_0_0_0_1.5px_var(--color-outline-variant)] @min-[940px]:w-auto">
          <span className="flex min-h-5 items-center gap-1.5 text-xs font-medium text-on-surface-variant">
            <span
              aria-hidden
              className="relative grid size-5.5 place-items-center text-on-ai-container [&_svg]:size-3.5"
            >
              <Shape kind="cookie4" className="absolute inset-0 size-full text-ai-container" />
              <VerifiedFilledIcon className="relative z-10" />
            </span>
            Day {totalDays}
          </span>
          <b className="text-base font-medium">Probation review</b>
          <span className="text-xs text-on-surface-variant">
            {formatDayDate(probationReviewOn)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
