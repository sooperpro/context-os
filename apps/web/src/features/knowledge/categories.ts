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
 * shapes and descriptions. Company, Products, Projects and Processes are projects by category
 * (the API does not store a category yet, so every project counts as "project" until it does).
 * Systems, Decisions and Glossary come from the context items extracted from each project.
 */
export type CategoryId =
  "company" | "product" | "project" | "system" | "process" | "decision" | "glossary";

interface CategoryBase {
  id: CategoryId;
  name: string;
  description: string;
  icon: MaterialIcon;
  shape: ShapeKind;
  /** Shown when the collection is empty. */
  emptyNote: string;
}

export type KnowledgeCategory = CategoryBase &
  (
    | { source: "projects"; projectCategory: ProjectCategory }
    | {
        source: "items";
        kinds: ContextItemKind[];
        /** The project section that lists these items. */ tab: string;
      }
  );

export const CATEGORIES: readonly KnowledgeCategory[] = [
  {
    id: "company",
    name: "Company",
    description: "Mission, strategy, how we're organized",
    icon: ApartmentIcon,
    shape: "cookie6",
    source: "projects",
    projectCategory: "company",
    emptyNote: "No company pages yet.",
  },
  {
    id: "product",
    name: "Products",
    description: "What we sell and how it works",
    icon: LocalShippingIcon,
    shape: "clover4",
    source: "projects",
    projectCategory: "product",
    emptyNote: "No product pages yet.",
  },
  {
    id: "project",
    name: "Projects",
    description: "Initiatives in flight and their history",
    icon: RocketLaunchFilledIcon,
    shape: "sunny",
    source: "projects",
    projectCategory: "project",
    emptyNote: "No projects yet.",
  },
  {
    id: "system",
    name: "Systems",
    description: "Architecture, services and data",
    icon: AccountTreeIcon,
    shape: "cookie9",
    source: "items",
    kinds: ["component", "dependency"],
    tab: "system",
    emptyNote: "Nothing here yet. Systems appear as sources describe services and integrations.",
  },
  {
    id: "process",
    name: "Processes",
    description: "How work gets done here",
    icon: ConversionPathIcon,
    shape: "flower",
    source: "projects",
    projectCategory: "process",
    emptyNote: "No process pages yet.",
  },
  {
    id: "decision",
    name: "Decisions",
    description: "Decision records and why we chose them",
    icon: GavelIcon,
    shape: "cookie4",
    source: "items",
    kinds: ["decision"],
    tab: "decisions",
    emptyNote: "Nothing here yet. Decisions appear as sources state what was decided and why.",
  },
  {
    id: "glossary",
    name: "Glossary & FAQs",
    description: "The words and acronyms we use",
    icon: MenuBookIcon,
    shape: "clover8",
    source: "items",
    kinds: ["term"],
    tab: "terms",
    emptyNote: "Nothing here yet. Terms appear as sources define them.",
  },
];

export function categoryById(id: string | null): KnowledgeCategory | undefined {
  return CATEGORIES.find((category) => category.id === id);
}

/** The collection an extracted item belongs to, if it is one the hub lists. */
export function categoryForKind(
  kind: ContextItemKind,
): Extract<KnowledgeCategory, { source: "items" }> | undefined {
  return CATEGORIES.find(
    (category): category is Extract<KnowledgeCategory, { source: "items" }> =>
      category.source === "items" && category.kinds.includes(kind),
  );
}
