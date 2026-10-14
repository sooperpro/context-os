import type { RoadmapModule } from "@contextos/shared";
import { cn } from "cn";
import { Link } from "react-router";
import { DotList } from "@/components/ui/dot-list";
import { CheckCircleFilledIcon, LockIcon, PendingIcon, ScheduleIcon } from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedItemTrail,
} from "@/components/ui/segmented-list";
import { Shape } from "@/components/ui/shape";
import { StatusChip } from "@/components/ui/status-chip";
import { MODULE_KIND, modulePath, moduleTime } from "@/features/learning/learning-meta";
import { formatPercent, formatShortDate } from "@/lib/format";

/** The module's lead (prototype `.mod-lead`): done, active on a cookie, to do, or locked. */
export function ModuleLead({ module }: { module: Pick<RoadmapModule, "kind" | "status"> }) {
  const Icon = MODULE_KIND[module.kind].icon;
  if (module.status === "active") {
    return (
      <span
        aria-hidden
        className="relative grid size-11 shrink-0 place-items-center text-primary-foreground"
      >
        <Shape kind="cookie7" className="absolute inset-0 size-full text-primary" />
        <Icon className="relative z-10 size-5" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-md [&_svg]:size-5",
        module.status === "done" && "bg-success-container text-on-success-container",
        module.status === "todo" && "bg-surface-container-high text-on-surface-variant",
        module.status === "locked" &&
          "text-outline shadow-[inset_0_0_0_1px_var(--color-outline-variant)]",
      )}
    >
      {module.status === "done" ? <CheckCircleFilledIcon /> : <Icon />}
    </span>
  );
}

function Due({ on }: { on: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-on-surface-variant">
      <ScheduleIcon className="size-4" aria-hidden />
      Due {formatShortDate(on)}
    </span>
  );
}

function Trail({ module, opensOn }: { module: RoadmapModule; opensOn: string | null }) {
  if (module.status === "done") {
    return (
      <>
        <span className="text-xs whitespace-nowrap text-on-surface-variant">
          <DotList
            parts={[module.result, module.completedOn ? formatShortDate(module.completedOn) : null]}
          />
        </span>
        <StatusChip tone="success" icon={<CheckCircleFilledIcon />}>
          Done
        </StatusChip>
      </>
    );
  }
  if (module.status === "active") {
    return (
      <>
        {module.kind === "practical" ? (
          module.dueOn ? (
            <Due on={module.dueOn} />
          ) : null
        ) : (
          <>
            <Progress
              value={Math.round(module.progress * 100)}
              aria-label="Module progress"
              className="w-18"
            />
            <span className="text-xs tabular-nums">{formatPercent(module.progress)}</span>
          </>
        )}
        <StatusChip tone="info" icon={<PendingIcon />}>
          In progress
        </StatusChip>
      </>
    );
  }
  if (module.status === "locked") {
    return (
      <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-on-surface-variant">
        <LockIcon className="size-4" aria-hidden />
        {opensOn ? `Unlocks ${formatShortDate(opensOn)}` : "Locked"}
      </span>
    );
  }
  return module.dueOn ? <Due on={module.dueOn} /> : null;
}

/** One module in a roadmap stage (prototype `.module-row`). */
export function ModuleRow({ module, opensOn }: { module: RoadmapModule; opensOn: string | null }) {
  return (
    <SegmentedItem
      render={<Link to={modulePath(module.id)} />}
      className="flex-wrap gap-3.5 @min-[640px]:flex-nowrap"
    >
      <ModuleLead module={module} />
      <SegmentedItemBody>
        <SegmentedItemTitle
          className={cn(
            "whitespace-normal",
            module.status === "locked" && "text-on-surface-variant",
          )}
        >
          {module.title}
        </SegmentedItemTitle>
        <SegmentedItemMeta>
          <DotList
            parts={[
              `Module ${module.number}`,
              MODULE_KIND[module.kind].label,
              `${module.lessonCount} ${module.lessonCount === 1 ? "step" : "lessons"}`,
              moduleTime(module),
              module.note ? <span className="font-medium text-primary">{module.note}</span> : null,
            ]}
          />
        </SegmentedItemMeta>
      </SegmentedItemBody>
      <SegmentedItemTrail className="w-full flex-wrap justify-start ps-13.5 @min-[640px]:w-auto @min-[640px]:justify-end @min-[640px]:ps-0">
        <Trail module={module} opensOn={opensOn} />
      </SegmentedItemTrail>
    </SegmentedItem>
  );
}
