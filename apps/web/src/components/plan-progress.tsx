import type { OnboardingStatus } from "@contextos/shared";
import { cn } from "cn";
import { Progress } from "@/components/ui/progress";
import { formatPercent } from "@/lib/format";

const TONE: Record<OnboardingStatus, "primary" | "warning" | "error"> = {
  ahead: "primary",
  on_track: "primary",
  at_risk: "warning",
  blocked: "error",
  not_started: "primary",
  needs_setup: "primary",
};

/**
 * Progress against plan (prototype `.vs-plan`): a flat bar in the status tone with a tick where the
 * plan expects the person to be today, and "34% / plan 45%". Used wherever a manager or HR sees
 * someone's onboarding.
 */
export function PlanProgress({
  progress,
  expected,
  status,
  label,
  className,
}: {
  progress: number;
  expected: number;
  status: OnboardingStatus;
  /** Names the bar for screen readers: "Leah Park progress". */
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div className="relative min-w-0 flex-1">
        <Progress flat tone={TONE[status]} value={Math.round(progress * 100)} aria-label={label} />
        <span
          aria-hidden
          title={`Plan: ${formatPercent(expected)}`}
          className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-on-surface/75"
          style={{ left: `calc(${expected} * (100% - 4px))` }}
        />
      </div>
      <span className="text-xs whitespace-nowrap tabular-nums">
        <b className="font-medium">{formatPercent(progress)}</b>{" "}
        <span className="text-on-surface-variant">/ plan {formatPercent(expected)}</span>
      </span>
    </div>
  );
}

/** The legend line under plan bars. */
export function PlanTickNote({ who = "each person" }: { who?: string }) {
  return (
    <p className="flex items-center gap-2 text-xs text-on-surface-variant">
      <span aria-hidden className="h-3.5 w-0.5 rounded-full bg-on-surface/75" />
      The tick shows where {who} is expected to be today.
    </p>
  );
}
