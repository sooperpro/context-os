import type { ContextItemKind } from "@contextos/shared";
import {
  AccountTreeIcon,
  Book2Icon,
  GavelIcon,
  PersonIcon,
  RocketLaunchFilledIcon,
  type MaterialIcon,
} from "@/components/ui/icons";
import type { ShapeKind } from "@/components/ui/shape";

/**
 * The Knowledge Hub's collections (prototype CATS), limited to what the backend stores: projects,
 * and the decisions, systems, people and terms extracted from their sources. The prototype's
 * Company, Products and Processes collections have nothing behind them yet, so they are not shown.
 */
export interface KnowledgeCategory {
  id: "projects" | "decisions" | "systems" | "people" | "terms";
  name: string;
  description: string;
  icon: MaterialIcon;
  shape: ShapeKind;
  /** Context item kinds in this collection; projects are listed from the projects API instead. */
  kinds: ContextItemKind[];
  /** The project section that lists these items. */
  tab: string | null;
}

export const CATEGORIES: readonly KnowledgeCategory[] = [
  {
    id: "projects",
    name: "Projects",
    description: "Initiatives in flight and their history",
    icon: RocketLaunchFilledIcon,
    shape: "sunny",
    kinds: [],
    tab: null,
  },
  {
    id: "decisions",
    name: "Decisions",
    description: "What was decided, why, and what it replaced",
    icon: GavelIcon,
    shape: "cookie9",
    kinds: ["decision"],
    tab: "decisions",
  },
  {
    id: "systems",
    name: "Systems",
    description: "Services, integrations and what depends on what",
    icon: AccountTreeIcon,
    shape: "clover4",
    kinds: ["component", "dependency"],
    tab: "system",
  },
  {
    id: "people",
    name: "People and owners",
    description: "Who owns what, as the sources state it",
    icon: PersonIcon,
    shape: "cookie12",
    kinds: ["person"],
    tab: "people",
  },
  {
    id: "terms",
    name: "Glossary",
    description: "Project terms and what they mean",
    icon: Book2Icon,
    shape: "flower",
    kinds: ["term"],
    tab: "terms",
  },
];

export type CategoryId = KnowledgeCategory["id"];

export function categoryById(id: string | null): KnowledgeCategory | undefined {
  return CATEGORIES.find((category) => category.id === id);
}

export function categoryForKind(kind: ContextItemKind): KnowledgeCategory | undefined {
  return CATEGORIES.find((category) => category.kinds.includes(kind));
}
