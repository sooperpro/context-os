import type { ReactNode } from "react";
import { useAssistant } from "@/components/layout/assistant-context";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useMediaQuery, WINDOW } from "@/hooks/use-media-query";

/**
 * Where Context Bot lives, by window size:
 * - expanded and up (>= 1200px): a 420px side pane that pushes the content
 * - medium (600–1199px): a modal side sheet, 420px, over a scrim
 * - compact (< 600px): full screen
 * The content is supplied by the app (a feature component); this is only the frame.
 */
export function AssistantPane({ children }: { children: ReactNode }) {
  const { open, closeAssistant } = useAssistant();
  const expanded = useMediaQuery(WINDOW.expanded);

  if (expanded) {
    if (!open) return null;
    return (
      <aside
        id="assistant"
        aria-label="Context Bot"
        className="sticky top-3 flex h-[calc(100svh-1rem)] w-105 shrink-0 flex-col overflow-hidden rounded-2xl bg-pane"
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
        className="w-full gap-0 border-0 bg-pane p-0 sm:max-w-none medium:w-105 medium:rounded-l-2xl"
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}
