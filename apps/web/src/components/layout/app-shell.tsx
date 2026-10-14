import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Outlet } from "react-router";
import {
  AssistantContext,
  type AssistantContextValue,
  type AssistantQueryHandler,
} from "@/components/layout/assistant-context";
import { AssistantPane } from "@/components/layout/assistant-pane";
import { BottomNav } from "@/components/layout/bottom-nav";
import { navItemsFor } from "@/components/layout/navigation";
import { Rail } from "@/components/layout/rail";
import { GLOBAL_SEARCH_ID, TopBar } from "@/components/layout/top-bar";
import { currentWorkspaceQuery } from "@/features/workspace/api/workspace.queries";
import { useMediaQuery, WINDOW } from "@/hooks/use-media-query";

const RAIL_STORAGE_KEY = "contextos-rail";
type RailPreference = "expanded" | "collapsed";

function readRailPreference(): RailPreference {
  try {
    return window.localStorage.getItem(RAIL_STORAGE_KEY) === "collapsed" ? "collapsed" : "expanded";
  } catch {
    return "expanded";
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * The app shell: rail (or bottom bar), top bar, content pane and the Context Bot pane.
 * Layout follows the M3 window size classes; see assistant-pane.tsx and rail.tsx.
 * Navigation items come from navigation.ts, gated by the backend role of the current workspace.
 */
export function AppShell({ assistant }: { assistant: ReactNode }) {
  const workspace = useQuery(currentWorkspaceQuery());
  const items = navItemsFor(workspace.data?.role);

  const expanded = useMediaQuery(WINDOW.expanded);
  const large = useMediaQuery(WINDOW.large);

  const [railPreference, setRailPreference] = useState<RailPreference>(readRailPreference);
  const [open, setOpen] = useState(false);
  const queryHandlers = useRef(new Set<AssistantQueryHandler>());
  const undeliveredQuery = useRef<string | null>(null);

  // 1200–1599: the rail auto-collapses while the assistant is open to make room for it.
  const forcedCollapsed = !expanded || (open && !large);
  const collapsed = forcedCollapsed || railPreference === "collapsed";

  const toggleRail = useCallback(() => {
    setRailPreference((current) => {
      const next = current === "collapsed" ? "expanded" : "collapsed";
      try {
        window.localStorage.setItem(RAIL_STORAGE_KEY, next);
      } catch {
        // Storage unavailable: the preference simply won't persist.
      }
      return next;
    });
  }, []);

  const subscribeToQueries = useCallback((handler: AssistantQueryHandler) => {
    queryHandlers.current.add(handler);
    if (undeliveredQuery.current !== null) {
      const query = undeliveredQuery.current;
      undeliveredQuery.current = null;
      handler(query);
    }
    return () => {
      queryHandlers.current.delete(handler);
    };
  }, []);

  const value = useMemo<AssistantContextValue>(
    () => ({
      open,
      openAssistant: (query) => {
        setOpen(true);
        if (query === undefined) return;
        if (queryHandlers.current.size === 0) undeliveredQuery.current = query;
        else for (const handler of queryHandlers.current) handler(query);
      },
      closeAssistant: () => setOpen(false),
      toggleAssistant: () => setOpen((current) => !current),
      subscribeToQueries,
    }),
    [open, subscribeToQueries],
  );

  // Keyboard: ⌘J / Ctrl+J toggles Context Bot, "/" focuses search.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (event.key === "/" && !isTypingTarget(event.target)) {
        const search = document.getElementById(GLOBAL_SEARCH_ID);
        if (search) {
          event.preventDefault();
          search.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <AssistantContext value={value}>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div className="flex min-h-svh bg-shell text-foreground">
        <Rail items={items} collapsed={collapsed} canToggle={!forcedCollapsed} onToggle={toggleRail} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <div className="flex flex-1 items-start gap-3 pr-4 pb-4 pl-3 medium:pl-1">
            <main
              id="main"
              className="@container min-h-[calc(100svh-5.5rem)] min-w-0 flex-1 rounded-2xl bg-pane px-4 py-6 pb-28 medium:px-8 medium:py-8 medium:pb-8"
            >
              <div className="mx-auto w-full max-w-6xl">
                <Outlet />
              </div>
            </main>
            <AssistantPane>{assistant}</AssistantPane>
          </div>
          <BottomNav items={items} />
        </div>
      </div>
    </AssistantContext>
  );
}
