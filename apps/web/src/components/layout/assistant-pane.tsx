import { cn } from "cn";
import type { ReactNode } from "react";
import { useAssistant } from "@/components/layout/assistant-context";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useMediaQuery, WINDOW } from "@/hooks/use-media-query";

/**
 * Where Context Bot lives, by window size:
 * - expanded and up (>= 1200px): a 420px side pane that pushes the content
 * - medium (600–1199px): a modal side sheet, 420px, over a scrim
 * "Expand panel" widens either to 640px (prototype `data-bot-size="wide"`).
 * - compact (< 600px): full screen
 * The content is supplied by the app (a feature component); this is only the frame.
 */
export function AssistantPane({ children }: { children: ReactNode }) {
  const { open, wide, closeAssistant } = useAssistant();
  const expanded = useMediaQuery(WINDOW.expanded);

  if (expanded) {
    if (!open) return null;
    return (
      <aside
        id="assistant"
        aria-label="Context Bot"
        className={cn(
          "sticky top-3 flex h-[calc(100svh-1rem)] shrink-0 flex-col overflow-hidden rounded-2xl bg-pane transition-[width] duration-[410ms] ease-spring-default-spatial",
          wide ? "w-[min(640px,48vw)]" : "w-105",
        )}
      >
        {children}
      </aside>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : closeAssistant())}>
      <SheetContent
        id="assistant"
        side="right"
        showCloseButton={false}
        aria-label="Context Bot"
        className={cn(
          "w-full gap-0 border-0 bg-pane p-0 medium:rounded-l-2xl sm:max-w-none",
          wide ? "medium:w-[min(640px,calc(100vw-72px))]" : "medium:w-105",
        )}
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}
