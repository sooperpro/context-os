import type { SystemRole } from "@contextos/shared";
import { FolderKanbanIcon, type LucideIcon } from "lucide-react";

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
  icon: LucideIcon;
  to: string;
  /** Match only the exact path (for the home item). */
  end?: boolean;
  /** Roles that see this item. Omit for everyone. */
  roles?: readonly SystemRole[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "projects", label: "Projects", icon: FolderKanbanIcon, to: "/", end: true },
];

export function navItemsFor(role: SystemRole | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || (role !== undefined && item.roles.includes(role)));
}

/** The bottom bar holds at most four destinations (M3). */
export const BOTTOM_NAV_LIMIT = 4;
