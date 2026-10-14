import { cn } from "cn";
import { NavLink, useLocation } from "react-router";
import { useAssistant } from "@/components/layout/assistant-context";
import { BOTTOM_NAV_LIMIT, isInActivePaths, type NavItem } from "@/components/layout/navigation";
import { Fab } from "@/components/ui/fab";
import { SmartToyFilledIcon } from "@/components/ui/icons";

/** Compact windows (< 600px): a bottom navigation bar with up to four destinations and the Ask FAB. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const { open, toggleAssistant } = useAssistant();
  const { pathname } = useLocation();

  return (
    <>
      <Fab
        floating
        aria-label="Ask Context Bot"
        aria-pressed={open}
        aria-controls="assistant"
        onClick={toggleAssistant}
        className="fixed right-4 bottom-24 z-20 medium:hidden"
      >
        <SmartToyFilledIcon />
      </Fab>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 flex h-20 items-stretch bg-surface-container pb-[env(safe-area-inset-bottom)] medium:hidden"
      >
        {items.slice(0, BOTTOM_NAV_LIMIT).map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            end={item.end}
            aria-current={isInActivePaths(item, pathname) ? "page" : undefined}
            className={({ isActive }) =>
              cn(
                "group/nav flex flex-1 flex-col items-center justify-center gap-1 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                isActive || isInActivePaths(item, pathname)
                  ? "font-medium text-on-surface"
                  : "text-on-surface-variant",
              )
            }
          >
            {({ isActive: exact }) => {
              const isActive = exact || isInActivePaths(item, pathname);
              return (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      "grid h-8 w-14 place-items-center rounded-full [&_svg]:size-6",
                      isActive && "bg-secondary-container text-on-secondary-container",
                    )}
                  >
                    {isActive ? <item.activeIcon /> : <item.icon />}
                  </span>
                  {item.short ?? item.label}
                </>
              );
            }}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
