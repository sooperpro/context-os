import type { LearningTarget, LessonType, ModuleKind } from "@contextos/shared";
import {
  AccountTreeIcon,
  ApartmentIcon,
  ArticleIcon,
  ConstructionIcon,
  ConversionPathIcon,
  EditDocumentIcon,
  GavelIcon,
  LocalShippingIcon,
  PaymentsIcon,
  QuizIcon,
  RocketLaunchIcon,
  SlideshowIcon,
  SmartDisplayIcon,
  type MaterialIcon,
} from "@/components/ui/icons";

/** How learning reads wherever it appears (roadmap, Home). Data, not components. */
export const MODULE_KIND: Record<ModuleKind, { label: string; icon: MaterialIcon }> = {
  company: { label: "Company", icon: ApartmentIcon },
  business: { label: "Business", icon: PaymentsIcon },
  product: { label: "Product", icon: LocalShippingIcon },
  process: { label: "Process", icon: ConversionPathIcon },
  systems: { label: "Systems", icon: AccountTreeIcon },
  project: { label: "Project", icon: RocketLaunchIcon },
  decisions: { label: "Decisions", icon: GavelIcon },
  practical: { label: "Practical task", icon: ConstructionIcon },
  contribution: { label: "Contribution", icon: EditDocumentIcon },
};

export const LESSON_TYPE: Record<LessonType, { label: string; icon: MaterialIcon }> = {
  article: { label: "Article", icon: ArticleIcon },
  video: { label: "Video", icon: SmartDisplayIcon },
  slides: { label: "Slides", icon: SlideshowIcon },
  check: { label: "Knowledge check", icon: QuizIcon },
  practical: { label: "Practical task", icon: ConstructionIcon },
};

export const ROADMAP_PATH = "/roadmap";

/** An assigned course (learning path) from My learning. */
export function coursePath(id: string): string {
  return `/learning/${encodeURIComponent(id)}`;
}

export function modulePath(id: string): string {
  return `${ROADMAP_PATH}/modules/${encodeURIComponent(id)}`;
}

/** The page a learning target opens. */
export function learningPath(target: LearningTarget): string {
  const id = encodeURIComponent(target.id);
  if (target.kind === "lesson") return `${ROADMAP_PATH}/lessons/${id}`;
  if (target.kind === "check") return `${ROADMAP_PATH}/checks/${id}`;
  return modulePath(target.id);
}

/** "25 min", "1.5 h", or a duration such as "2 weeks". */
export function moduleTime(module: { minutes: number | null; duration: string | null }): string {
  if (module.duration) return module.duration;
  const minutes = module.minutes ?? 0;
  return minutes >= 60 ? `${Math.round(minutes / 6) / 10} h` : `${minutes} min`;
}

/** Ids linking the roadmap's stage tabs to their panel. */
export const stageTabId = (id: string) => `stage-tab-${id}`;
export const STAGE_PANEL_ID = "stage-panel";
