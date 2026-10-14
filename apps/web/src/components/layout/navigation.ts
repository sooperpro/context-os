import type { SystemRole } from "@contextos/shared";
import {
  ChecklistFilledIcon,
  ChecklistIcon,
  Diversity3FilledIcon,
  Diversity3Icon,
  EditNoteFilledIcon,
  EditNoteIcon,
  EventAvailableFilledIcon,
  EventAvailableIcon,
  HowToRegFilledIcon,
  HowToRegIcon,
  LibraryBooksFilledIcon,
  LibraryBooksIcon,
  HubFilledIcon,
  HubIcon,
  ManageAccountsFilledIcon,
  ManageAccountsIcon,
  RateReviewFilledIcon,
  RateReviewIcon,
  RouteFilledIcon,
  RouteIcon,
  GroupFilledIcon,
  GroupIcon,
  HomeFilledIcon,
  HomeIcon,
  SettingsFilledIcon,
  SettingsIcon,
  SpaceDashboardFilledIcon,
  SpaceDashboardIcon,
  type MaterialIcon,
} from "@/components/ui/icons";
import type { Persona } from "@/features/workspace/viewer";

/**
 * The one place navigation is defined. The rail, the bottom bar and any future command palette
 * read from here. Items are gated by the backend role of the current workspace membership, never
 * by a client-side notion of "who the user is".
 *
 * Add a screen here when it ships. Do not add links to screens that do not exist yet.
 */
export interface NavItem {
  id: string;
  label: string;
  /** Short label for the collapsed rail and the bottom bar. */
  short?: string;
  icon: MaterialIcon;
  /** Filled variant shown while the destination is active (M3 FILL 1). */
  activeIcon: MaterialIcon;
  to: string;
  /** Match only the exact path (for the home item). */
  end?: boolean;
  /** Other path sections that belong to this destination, e.g. project pages under the Knowledge Hub. */
  activePaths?: readonly string[];
  /** Roles that see this item. Omit for everyone. */
  roles?: readonly SystemRole[];
  /** Personas whose rail has this item, as in the prototype's "View as". Omit for every persona. */
  personas?: readonly Persona[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: "home",
    label: "Home",
    icon: HomeIcon,
    activeIcon: HomeFilledIcon,
    to: "/",
    end: true,
    personas: ["employee", "manager", "people_ops"],
  },
  // The prototype labels the admin's Home "Overview".
  {
    id: "overview",
    label: "Overview",
    icon: SpaceDashboardIcon,
    activeIcon: SpaceDashboardFilledIcon,
    to: "/",
    end: true,
    personas: ["admin"],
  },
  {
    id: "roadmap",
    label: "My roadmap",
    short: "Roadmap",
    icon: RouteIcon,
    activeIcon: RouteFilledIcon,
    to: "/roadmap",
    personas: ["employee"],
  },
  {
    id: "team",
    label: "Team onboarding",
    short: "Team",
    icon: Diversity3Icon,
    activeIcon: Diversity3FilledIcon,
    to: "/team",
    personas: ["manager"],
  },
  {
    id: "onboarding",
    label: "Onboarding",
    icon: HowToRegIcon,
    activeIcon: HowToRegFilledIcon,
    to: "/onboarding",
    personas: ["people_ops"],
  },
  {
    id: "probation",
    label: "Probation reviews",
    short: "Probation",
    icon: EventAvailableIcon,
    activeIcon: EventAvailableFilledIcon,
    to: "/probation",
    personas: ["people_ops"],
  },
  {
    id: "templates",
    label: "Templates",
    icon: LibraryBooksIcon,
    activeIcon: LibraryBooksFilledIcon,
    to: "/templates",
    personas: ["people_ops"],
  },
  {
    id: "members",
    label: "Members & roles",
    short: "Members",
    icon: ManageAccountsIcon,
    activeIcon: ManageAccountsFilledIcon,
    to: "/members",
    roles: ["owner", "admin"],
    personas: ["admin"],
  },
  // The prototype has no Projects item: projects are a collection inside the Knowledge Hub.
  {
    id: "knowledge",
    label: "Knowledge Hub",
    short: "Knowledge",
    icon: HubIcon,
    activeIcon: HubFilledIcon,
    to: "/knowledge",
    activePaths: ["projects"],
  },
  {
    id: "reviews",
    label: "Review queue",
    short: "Reviews",
    icon: RateReviewIcon,
    activeIcon: RateReviewFilledIcon,
    to: "/reviews",
    personas: ["manager"],
  },
  {
    id: "people",
    label: "People",
    icon: GroupIcon,
    activeIcon: GroupFilledIcon,
    to: "/people",
    // The directory; guests cannot read it (API 403). Admins manage people from "Members & roles".
    roles: ["owner", "admin", "manager", "member"],
    personas: ["employee", "manager", "people_ops"],
  },
  {
    id: "contributions",
    label: "Contributions",
    short: "Contribute",
    icon: EditNoteIcon,
    activeIcon: EditNoteFilledIcon,
    to: "/contributions",
    personas: ["employee"],
    roles: ["member"],
  },
  {
    id: "learning",
    label: "My learning",
    short: "Learning",
    icon: RouteIcon,
    activeIcon: RouteFilledIcon,
    to: "/learning",
    personas: ["manager"],
  },
  {
    id: "setup",
    label: "Workspace setup",
    short: "Setup",
    icon: ChecklistIcon,
    activeIcon: ChecklistFilledIcon,
    to: "/setup",
    roles: ["owner", "admin"],
  },
];

/** Pinned to the bottom of the rail for everyone (prototype `.rail-bottom`); on phones it is in the account menu. */
export const SETTINGS_ITEM: NavItem = {
  id: "settings",
  label: "Settings",
  icon: SettingsIcon,
  activeIcon: SettingsFilledIcon,
  to: "/settings",
};

/** True when the path is inside one of the item's extra sections (works under any route prefix). */
export function isInActivePaths(item: NavItem, pathname: string): boolean {
  return (item.activePaths ?? []).some((section) =>
    new RegExp(`(^|/)${section}(/|$)`).test(pathname),
  );
}

/** Rails whose order differs from `NAV_ITEMS`, as in the prototype: People Ops puts People first. */
const PERSONA_ORDER: Partial<Record<Persona, readonly string[]>> = {
  people_ops: ["home", "onboarding", "probation", "templates", "people", "knowledge"],
};

/** The rail for a role and persona (see useViewer). An unknown role or persona hides gated items. */
export function navItemsFor(role: SystemRole | undefined, persona?: Persona): NavItem[] {
  const items = NAV_ITEMS.filter(
    (item) =>
      (!item.roles || (role !== undefined && item.roles.includes(role))) &&
      (!item.personas || (persona !== undefined && item.personas.includes(persona))),
  );
  const order = persona ? PERSONA_ORDER[persona] : undefined;
  if (!order) return items;
  const rank = (item: NavItem) => {
    const index = order.indexOf(item.id);
    return index < 0 ? order.length : index;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/** The bottom bar holds at most four destinations (M3). */
export const BOTTOM_NAV_LIMIT = 4;
