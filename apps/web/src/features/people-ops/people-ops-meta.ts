import type {
  ProbationReview,
  TemplateFamily,
  TemplateModule,
  TemplateModuleKind,
} from "@contextos/shared";
import {
  CheckCircleIcon,
  CodeIcon,
  Diversity3Icon,
  ErrorIcon,
  HandshakeIcon,
  HourglassEmptyIcon,
  LibraryBooksIcon,
  MonitoringIcon,
  MoreTimeIcon,
  PaletteIcon,
  PendingIcon,
  QuizIcon,
  SupervisorAccountIcon,
  SupportAgentIcon,
  ThumbUpIcon,
  type MaterialIcon,
} from "@/components/ui/icons";
import type { ShapeKind } from "@/components/ui/shape";
import { MODULE_KIND } from "@/features/learning/learning-meta";

/** How People Ops' records read wherever they appear (HR pages, HR Home). Data, not components. */

export const ONBOARDING_PATH = "/onboarding";
export const PROBATION_PATH = "/probation";
export const TEMPLATES_PATH = "/templates";

export const onboardingPath = (id: string) => `${ONBOARDING_PATH}/${encodeURIComponent(id)}`;
export const probationPath = (id: string) => `${PROBATION_PATH}/${encodeURIComponent(id)}`;
export const templatePath = (id: string) => `${TEMPLATES_PATH}/${encodeURIComponent(id)}`;

type Tone = "success" | "warning" | "error" | "info" | "neutral";

/** A review's state (prototype `STAGES`): its chip, and the step it has reached on the review track. */
export const REVIEW_STATE: Record<
  ProbationReview["state"],
  { label: string; tone: Tone; icon: MaterialIcon; step: number }
> = {
  checkins_missing: { label: "Check-ins missing", tone: "error", icon: ErrorIcon, step: 0 },
  awaiting_manager: {
    label: "Awaiting manager",
    tone: "neutral",
    icon: HourglassEmptyIcon,
    step: 1,
  },
  ready_for_approval: { label: "Ready for approval", tone: "info", icon: PendingIcon, step: 2 },
  needs_hr_review: { label: "Needs HR review", tone: "warning", icon: MoreTimeIcon, step: 2 },
  completed: { label: "Completed", tone: "success", icon: CheckCircleIcon, step: 4 },
};

export const REVIEW_TRACK = ["Milestones", "Manager", "HR review", "Recorded"] as const;

/** States where People Ops records the decision. */
export const needsHr = (state: ProbationReview["state"]) =>
  state === "ready_for_approval" || state === "needs_hr_review";

/** The manager's recommendation, or what People Ops recorded once the review is completed. */
export function recommendationChip(review: Pick<ProbationReview, "recommendation" | "decision">): {
  label: string;
  tone: Tone;
  icon: MaterialIcon;
} {
  if (review.decision) return outcomeChip(review.decision);
  switch (review.recommendation) {
    case "confirm":
      return { label: "Confirm", tone: "success", icon: ThumbUpIcon };
    case "extend":
      return { label: "Extend 30 days", tone: "warning", icon: MoreTimeIcon };
    case "discuss":
      return { label: "Discuss with HR", tone: "warning", icon: MoreTimeIcon };
    case "not_started":
      return { label: "Not started", tone: "neutral", icon: HourglassEmptyIcon };
    case "awaiting_manager":
      return { label: "Awaiting manager", tone: "neutral", icon: HourglassEmptyIcon };
  }
}

export function outcomeChip(decision: {
  outcome: "confirmed" | "extended";
  extension: string | null;
}) {
  return decision.outcome === "confirmed"
    ? { label: "Confirmed", tone: "success" as const, icon: CheckCircleIcon }
    : {
        label: `Extended ${decision.extension ?? ""}`.trim(),
        tone: "warning" as const,
        icon: MoreTimeIcon,
      };
}

/** The readiness scale a manager rates on. */
export const LEVELS = ["Not yet", "Developing", "Meets", "Exceeds"] as const;

export const TEMPLATE_FAMILY: Record<TemplateFamily, { shape: ShapeKind; icon: MaterialIcon }> = {
  engineering: { shape: "cookie9", icon: CodeIcon },
  sales: { shape: "clover4", icon: HandshakeIcon },
  support: { shape: "sunny", icon: SupportAgentIcon },
  design: { shape: "flower", icon: PaletteIcon },
  data: { shape: "cookie6", icon: MonitoringIcon },
  manager: { shape: "cookie4", icon: SupervisorAccountIcon },
  other: { shape: "cookie7", icon: LibraryBooksIcon },
};

export const TEMPLATE_MODULE_KIND: Record<
  TemplateModuleKind,
  { label: string; icon: MaterialIcon }
> = {
  ...MODULE_KIND,
  check: { label: "Check", icon: QuizIcon },
  sales: { label: "Sales", icon: HandshakeIcon },
  support: { label: "Support", icon: SupportAgentIcon },
  design: { label: "Design", icon: PaletteIcon },
  data: { label: "Data", icon: MonitoringIcon },
  people: { label: "People", icon: Diversity3Icon },
};

/** "45 min", "1.5 h", or "Ongoing" for open-ended practical tasks. */
export function minutesLabel(minutes: number | null): string {
  if (minutes === null) return "Ongoing";
  return minutes >= 60 ? `${Math.round(minutes / 6) / 10} h` : `${minutes} min`;
}

/** "Week 1" or "Weeks 3–5". */
export function weeksLabel(stage: { weekStart: number; weekEnd: number }): string {
  return stage.weekStart === stage.weekEnd
    ? `Week ${stage.weekStart}`
    : `Weeks ${stage.weekStart}–${stage.weekEnd}`;
}

const LESSONS_LABEL: Record<NonNullable<TemplateModule["lessons"]>, string> = {
  ready: "Company lessons",
  draft: "Lessons in draft",
  none: "Generic: no company lessons yet",
};

/** "Company · 25 min · Owner: Elena Brooks · Company lessons", as parts. */
export function templateModuleMeta(module: TemplateModule): string[] {
  return [
    TEMPLATE_MODULE_KIND[module.kind].label,
    minutesLabel(module.minutes),
    module.owner ? `Owner: ${module.owner}` : "",
    module.lessons ? LESSONS_LABEL[module.lessons] : "",
  ].filter(Boolean);
}
