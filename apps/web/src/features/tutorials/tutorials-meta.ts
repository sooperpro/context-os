import type { TutorialStatus } from "@contextos/shared";

export const TUTORIALS_PATH = "/tutorials";
export const tutorialPath = (id: string) => `${TUTORIALS_PATH}/${encodeURIComponent(id)}`;

export const TUTORIAL_STATUS: Record<
  TutorialStatus,
  { label: string; tone: "neutral" | "info" | "success" | "warning" | "error" }
> = {
  generating: { label: "Writing draft", tone: "info" },
  draft: { label: "Draft", tone: "neutral" },
  published: { label: "Published", tone: "success" },
  archived: { label: "Archived", tone: "neutral" },
  failed: { label: "Draft failed", tone: "error" },
};
