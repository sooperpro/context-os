import { cn } from "cn";
import { NavLink } from "react-router";
import { useAssistant } from "@/components/layout/assistant-context";
import { Brand } from "@/components/layout/brand";
import type { NavItem } from "@/components/layout/navigation";
import { ThemeToggle } from "@/components/layout/theme-toggle";
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
        "sticky top-0 hidden h-svh shrink-0 flex-col gap-4 px-3 py-3 transition-[width] duration-[410ms] ease-spring-default-spatial medium:flex",
        collapsed ? "w-24" : "w-62",
      )}
    >
      <div className={cn("flex h-12 items-center gap-1", collapsed && "justify-center")}>
        {/* When the window forces the collapsed state there is nothing to toggle: show the mark instead. */}
        {canToggle ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-on-surface-variant"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            onClick={onToggle}
          >
            {collapsed ? <MenuIcon /> : <MenuOpenIcon />}
          </Button>
        ) : (
          <Brand compact />
        )}
        {collapsed || !canToggle ? null : <Brand />}
      </div>

      <Fab
        aria-label="Ask Context Bot"
        aria-pressed={open}
        aria-controls="assistant"
        onClick={toggleAssistant}
        className={cn(collapsed ? "w-14 self-center px-0" : "w-full justify-start self-start")}
      >
        <HubFilledIcon />
        {collapsed ? null : <span>Ask Context Bot</span>}
      </Fab>

      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "group/nav flex items-center gap-3 rounded-full text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  // One state layer only: the whole row when expanded, the icon pill when collapsed.
                  collapsed ? "flex-col gap-1 py-1 text-xs" : "h-14 px-4 hover:bg-on-surface/8",
                  isActive ? "font-medium text-on-surface" : "text-on-surface-variant",
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
                      collapsed && "h-8 w-14 transition-colors group-hover/nav:bg-on-surface/8 group-focus-visible/nav:bg-on-surface/10",
                      collapsed && isActive && "bg-secondary-container text-on-secondary-container",
                    )}
                  >
                    {isActive ? <item.activeIcon /> : <item.icon />}
                  </span>
                  <span className="truncate">{collapsed ? (item.short ?? item.label) : item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className={cn("mt-auto flex", collapsed ? "justify-center" : "px-2")}>
        <ThemeToggle />
      </div>
    </nav>
  );
}
