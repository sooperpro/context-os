import type { Contribution, ContributionKind, ContributionStatus } from "@contextos/shared";
import type { ReactNode } from "react";
import {
  ArticleIcon,
  CancelIcon,
  CheckCircleIcon,
  EditDocumentIcon,
  EditIcon,
  FlagIcon,
  MenuBookIcon,
  PendingIcon,
} from "@/components/ui/icons";

/**
 * How contributions read wherever they appear (Home, the Contributions page). Data, not components,
 * so other features may import it.
 */
export const CONTRIBUTION_KIND_ICON: Record<ContributionKind, ReactNode> = {
  article: <ArticleIcon />,
  edit: <EditDocumentIcon />,
  glossary_term: <MenuBookIcon />,
  flag: <FlagIcon />,
};

type Tone = "neutral" | "info" | "success" | "error";

/** The prototype shows three states: Draft, In review (including changes requested) and Published. */
export const CONTRIBUTION_STATUS: Record<
  ContributionStatus,
  { label: string; tone: Tone; icon: ReactNode }
> = {
  draft: { label: "Draft", tone: "neutral", icon: <EditIcon /> },
  submitted: { label: "In review", tone: "info", icon: <PendingIcon /> },
  in_review: { label: "In review", tone: "info", icon: <PendingIcon /> },
  changes_requested: { label: "In review", tone: "info", icon: <PendingIcon /> },
  published: { label: "Published", tone: "success", icon: <CheckCircleIcon /> },
  resolved: { label: "Resolved", tone: "success", icon: <CheckCircleIcon /> },
  rejected: { label: "Not accepted", tone: "error", icon: <CancelIcon /> },
};

export const CONTRIBUTION_STEPS = ["Draft", "Submitted", "In review", "Published"] as const;

/** Index into CONTRIBUTION_STEPS. */
export function contributionStep(status: ContributionStatus): number {
  switch (status) {
    case "draft":
      return 0;
    case "submitted":
      return 1;
    case "in_review":
    case "changes_requested":
      return 2;
    default:
      return 3;
  }
}

export function isInReview(status: ContributionStatus): boolean {
  return status === "submitted" || status === "in_review" || status === "changes_requested";
}

/** One line about where it stands: "Sana Iqbal is reviewing", "Viewed by 6 people", "Not submitted". */
export function contributionDetail(item: Contribution): string | null {
  if (item.status === "draft") return "Not submitted";
  if (isInReview(item.status))
    return item.reviewer ? `${item.reviewer.name} is reviewing` : "Waiting for a reviewer";
  return item.impact;
}
