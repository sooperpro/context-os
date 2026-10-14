import type { OnboardingStatus } from "@contextos/shared";
import type { ReactNode } from "react";
import {
  BlockIcon,
  CheckCircleIcon,
  ErrorIcon,
  InfoIcon,
  ScheduleIcon,
  TrendingUpIcon,
} from "@/components/ui/icons";
import type { StatusChip } from "@/components/ui/status-chip";

/** Shared, non-component pieces of the Home dashboards (kept apart from components for fast refresh). */

const SPAN = {
  12: "col-span-12",
  8: "col-span-12 @min-[940px]:col-span-8",
  7: "col-span-12 @min-[940px]:col-span-7",
  5: "col-span-12 @min-[940px]:col-span-5",
  4: "col-span-12 @min-[940px]:col-span-4",
} as const;

export function span(columns: keyof typeof SPAN): string {
  return SPAN[columns];
}

type Tone = NonNullable<React.ComponentProps<typeof StatusChip>["tone"]>;

/** How each onboarding status reads: never color alone, always an icon and a label. */
export const ONBOARDING_STATUS: Record<
  OnboardingStatus,
  { label: string; tone: Tone; icon: ReactNode }
> = {
  ahead: { label: "Ahead", tone: "success", icon: <TrendingUpIcon /> },
  on_track: { label: "On track", tone: "success", icon: <CheckCircleIcon /> },
  at_risk: { label: "At risk", tone: "warning", icon: <ErrorIcon /> },
  blocked: { label: "Blocked", tone: "error", icon: <BlockIcon /> },
  not_started: { label: "Not started", tone: "neutral", icon: <ScheduleIcon /> },
  needs_setup: { label: "Needs setup", tone: "info", icon: <InfoIcon /> },
};

/** Progress tone for a status, for bars next to the status chip. */
export const ONBOARDING_PROGRESS_TONE: Record<OnboardingStatus, "primary" | "warning" | "error"> = {
  ahead: "primary",
  on_track: "primary",
  at_risk: "warning",
  blocked: "error",
  not_started: "primary",
  needs_setup: "primary",
};

/** First name for greetings. */
export function firstName(name: string | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}

/** "Oct 12–16", or "Oct 30 – Nov 3" across months. */
export function formatDateRange(from: Date, to: Date): string {
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  const start = from.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return sameMonth
    ? `${start}–${to.getDate()}`
    : `${start} – ${to.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
