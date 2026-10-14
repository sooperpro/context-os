import type { SystemRole } from "@contextos/shared";
import {
  ChecklistFilledIcon,
  ChecklistIcon,
  HubFilledIcon,
  HubIcon,
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
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: "home",
    label: "Home",
    icon: HomeIcon,
    activeIcon: HomeFilledIcon,
    to: "/",
    end: true,
    roles: ["manager", "member", "guest"],
  },
  // The prototype labels the admin's Home "Overview".
  {
    id: "overview",
    label: "Overview",
    icon: SpaceDashboardIcon,
    activeIcon: SpaceDashboardFilledIcon,
    to: "/",
    end: true,
    roles: ["owner", "admin"],
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
    id: "people",
    label: "People",
    icon: GroupIcon,
    activeIcon: GroupFilledIcon,
    to: "/members",
    roles: ["owner", "admin", "manager", "member"],
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

export function navItemsFor(role: SystemRole | undefined): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.roles || (role !== undefined && item.roles.includes(role)),
  );
}

/** The bottom bar holds at most four destinations (M3). */
export const BOTTOM_NAV_LIMIT = 4;
