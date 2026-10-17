import type { ContextItemKind, ProjectCategory } from "@contextos/shared";
import {
  AccountTreeIcon,
  ApartmentIcon,
  ConversionPathIcon,
  GavelIcon,
  LocalShippingIcon,
  MenuBookIcon,
  RocketLaunchFilledIcon,
  type MaterialIcon,
} from "@/components/ui/icons";
import type { ShapeKind } from "@/components/ui/shape";

/**
 * The Knowledge Hub's collections, exactly as the prototype lists them (CATS): names, order, icons,
 * shapes and descriptions. Each collection lists the projects filed under it (chosen when the
 * project is created or renamed) and the context items of its kinds extracted from each project.
 */
export type CategoryId =
  "company" | "product" | "project" | "system" | "process" | "decision" | "glossary";

export interface KnowledgeCategory {
  id: CategoryId;
  name: string;
  description: string;
  icon: MaterialIcon;
  shape: ShapeKind;
  /** Shown when the collection is empty. */
  emptyNote: string;
  /** Projects filed under this collection. */
  projectCategory: ProjectCategory;
  /** Extracted context items listed in this collection. */
  kinds: ContextItemKind[];
}

export const CATEGORIES: readonly KnowledgeCategory[] = [
  {
    id: "company",
    name: "Company",
    description: "Mission, strategy, how we're organized",
    icon: ApartmentIcon,
    shape: "cookie6",
    projectCategory: "company",
    kinds: ["company"],
    emptyNote: "Nothing here yet. Company facts appear as sources describe the company.",
  },
  {
    id: "product",
    name: "Products",
    description: "What we sell and how it works",
    icon: LocalShippingIcon,
    shape: "clover4",
    projectCategory: "product",
    kinds: ["product"],
    emptyNote: "Nothing here yet. Products appear as sources describe what you offer.",
  },
  {
    id: "project",
    name: "Projects",
    description: "Initiatives in flight and their history",
    icon: RocketLaunchFilledIcon,
    shape: "sunny",
    projectCategory: "project",
    kinds: ["initiative"],
    emptyNote: "Nothing here yet. Projects appear as sources describe initiatives.",
  },
  {
    id: "system",
    name: "Systems",
    description: "Architecture, services and data",
    icon: AccountTreeIcon,
    shape: "cookie9",
    projectCategory: "system",
    kinds: ["component", "dependency"],
    emptyNote: "Nothing here yet. Systems appear as sources describe services and integrations.",
  },
  {
    id: "process",
    name: "Processes",
    description: "How work gets done here",
    icon: ConversionPathIcon,
    shape: "flower",
    projectCategory: "process",
    kinds: ["process"],
    emptyNote: "Nothing here yet. Processes appear as sources describe how work gets done.",
  },
  {
    id: "decision",
    name: "Decisions",
    description: "Decision records and why we chose them",
    icon: GavelIcon,
    shape: "cookie4",
    projectCategory: "decision",
    kinds: ["decision"],
    emptyNote: "Nothing here yet. Decisions appear as sources state what was decided and why.",
  },
  {
    id: "glossary",
    name: "Glossary & FAQs",
    description: "The words and acronyms we use",
    icon: MenuBookIcon,
    shape: "clover8",
    projectCategory: "glossary",
    kinds: ["term"],
    emptyNote: "Nothing here yet. Terms appear as sources define them.",
  },
];

/** The collections a project can be filed under, for the New project and Rename pickers. */
export const PROJECT_CATEGORY_OPTIONS = CATEGORIES.map((category) => ({
  value: category.projectCategory,
  label: category.name,
  description: category.description,
}));

export function categoryById(id: string | null): KnowledgeCategory | undefined {
  return CATEGORIES.find((category) => category.id === id);
}

/** The collection an extracted item belongs to, if it is one the hub lists. */
export function categoryForKind(kind: ContextItemKind): KnowledgeCategory | undefined {
  return CATEGORIES.find((category) => category.kinds.includes(kind));
}
