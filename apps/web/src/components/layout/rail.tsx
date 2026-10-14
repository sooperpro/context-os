import { cn } from "cn";
import { NavLink } from "react-router";
import { useAssistant } from "@/components/layout/assistant-context";
import { Brand } from "@/components/layout/brand";
import { SETTINGS_ITEM, type NavItem } from "@/components/layout/navigation";
import { Button } from "@/components/ui/button";
import { Fab } from "@/components/ui/fab";
import { HubFilledIcon, MenuIcon, MenuOpenIcon } from "@/components/ui/icons";

interface RailProps {
  items: NavItem[];
  collapsed: boolean;
  /** False when the window size forces the collapsed state. */
  canToggle: boolean;
  onToggle: () => void;
}

/**
 * Navigation rail (M3): 248px expanded, 96px collapsed. Hidden on compact windows, where the
 * bottom navigation bar takes over. Holds the brand, the Ask FAB, destinations and the theme toggle.
 */
export function Rail({ items, collapsed, canToggle, onToggle }: RailProps) {
  const { open, toggleAssistant } = useAssistant();

  return (
    <nav
      aria-label="Main"
      data-collapsed={collapsed || undefined}
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col gap-1 overflow-x-hidden overflow-y-auto pt-3 pb-4 transition-[width] duration-[410ms] ease-spring-default-spatial medium:flex",
        collapsed ? "w-24 px-2" : "w-62 px-3",
      )}
    >
      {/* Prototype rail-top: toggle then brand in a row; collapsed, a column of toggle and mark. */}
      <div
        className={cn(
          "mb-2 flex items-center gap-1",
          collapsed ? "mb-1 flex-col justify-center gap-3" : "h-12 pl-2",
        )}
      >
        {canToggle ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-on-surface-variant"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={onToggle}
          >
            {collapsed ? <MenuIcon /> : <MenuOpenIcon />}
          </Button>
        ) : null}
        <Brand compact={collapsed} />
      </div>

      <Fab
        aria-label="Ask Context Bot"
        aria-pressed={open}
        aria-controls="assistant"
        onClick={toggleAssistant}
        className={cn("mt-1 mb-4", collapsed ? "w-14 self-center px-0" : "self-start")}
      >
        <HubFilledIcon />
        {collapsed ? null : <span>Ask Context Bot</span>}
      </Fab>

      <ul className={cn("flex flex-col", collapsed ? "gap-2" : "gap-1")}>
        {items.map((item) => (
          <li key={item.id}>
            <RailLink item={item} collapsed={collapsed} />
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-3">
        <RailLink item={SETTINGS_ITEM} collapsed={collapsed} />
      </div>
    </nav>
  );
}

/** One rail destination: a 56px row when expanded, an icon pill over a short label when collapsed. */
function RailLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "group/nav flex items-center gap-3 rounded-full text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          // One state layer only: the whole row when expanded, the icon pill when collapsed.
          collapsed
            ? "flex-col gap-1 py-1 text-xs"
            : "h-14 px-4 text-sm font-medium hover:bg-on-surface/8",
          isActive ? "text-on-surface" : "text-on-surface-variant",
          isActive && !collapsed && "bg-secondary-container text-on-secondary-container",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden
            className={cn(
              "grid place-items-center rounded-full [&_svg]:size-6",
              collapsed &&
                "h-8 w-14 transition-colors group-hover/nav:bg-on-surface/8 group-focus-visible/nav:bg-on-surface/10",
              collapsed && isActive && "bg-secondary-container text-on-secondary-container",
            )}
          >
            {isActive ? <item.activeIcon /> : <item.icon />}
          </span>
          <span className={cn("truncate", collapsed && "max-w-21 text-center font-medium")}>
            {collapsed ? (item.short ?? item.label) : item.label}
          </span>
        </>
      )}
    </NavLink>
  );
}
