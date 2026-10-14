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
import { StatusChip } from "@/components/ui/status-chip";

const STATUS: Record<
  OnboardingStatus,
  { label: string; tone: "success" | "warning" | "error" | "neutral" | "info"; icon: ReactNode }
> = {
  ahead: { label: "Ahead", tone: "success", icon: <TrendingUpIcon /> },
  on_track: { label: "On track", tone: "success", icon: <CheckCircleIcon /> },
  at_risk: { label: "At risk", tone: "warning", icon: <ErrorIcon /> },
  blocked: { label: "Blocked", tone: "error", icon: <BlockIcon /> },
  not_started: { label: "Not started", tone: "neutral", icon: <ScheduleIcon /> },
  needs_setup: { label: "Needs setup", tone: "info", icon: <InfoIcon /> },
  ready: { label: "Ready", tone: "success", icon: <CheckCircleIcon /> },
};

/** Where someone is against their onboarding plan; never color alone, always an icon and a label. */
export function OnboardingStatusChip({ status }: { status: OnboardingStatus }) {
  const meta = STATUS[status];
  return (
    <StatusChip tone={meta.tone} icon={meta.icon}>
      {meta.label}
    </StatusChip>
  );
}
