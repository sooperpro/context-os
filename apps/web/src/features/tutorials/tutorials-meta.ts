import type { LessonState, TutorialStatus } from "@contextos/shared";

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

/** Shown instead of a project name for a tutorial drafted from every project. */
export const COMPANY_WIDE = "Company-wide";

/**
 * Where a module's lessons stand, the one thing to act on first: shown on the Tutorials page and on
 * each template module. `attention`: something waits for a curator.
 */
export const LESSON_STATE: Record<
  LessonState,
  {
    label: string;
    tone: "neutral" | "info" | "success" | "warning" | "error";
    attention: boolean;
  }
> = {
  writing: { label: "Writing draft", tone: "info", attention: false },
  failed: { label: "Draft failed", tone: "error", attention: true },
  draft: { label: "Draft", tone: "neutral", attention: true },
  in_review: { label: "In review", tone: "info", attention: true },
  sent_back: { label: "Sent back", tone: "warning", attention: true },
  update_ready: { label: "Update ready to review", tone: "warning", attention: true },
  unpublished_edits: { label: "Edits not published", tone: "warning", attention: true },
  sources_changed: { label: "Sources changed", tone: "warning", attention: true },
  published: { label: "Published", tone: "success", attention: false },
  archived: { label: "Archived", tone: "neutral", attention: false },
};

/** A tutorial in the Studio, remembering the template it was opened from ("Back to template"). */
export const tutorialFromTemplate = (id: string, templateId: string) =>
  `${tutorialPath(id)}?template=${encodeURIComponent(templateId)}`;
