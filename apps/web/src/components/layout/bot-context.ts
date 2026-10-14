import { useEffect, useSyncExternalStore } from "react";
import type { MaterialIcon } from "@/components/ui/icons";

/**
 * What Context Bot knows about the page (prototype `botContext(route)`): chips under its header,
 * an intro and suggested questions. A page declares it with `useBotContext`; pages that don't get
 * the persona's defaults. `paused` stops the bot while a knowledge check is open.
 */
export interface BotPageContext {
  chips: Array<{ icon: MaterialIcon; label: string }>;
  suggestions?: readonly string[];
  intro?: string;
  paused?: boolean;
}

let current: BotPageContext | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The context the current page declared, or null. */
export function useDeclaredBotContext(): BotPageContext | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

/**
 * Declare the page's context while it is mounted. Pass a stable `key` that changes when the
 * context should (the person, the module); the latest value is used for that key.
 */
export function useBotContext(context: BotPageContext | null, key: string): void {
  useEffect(() => {
    current = context;
    emit();
    return () => {
      if (current === context) {
        current = null;
        emit();
      }
    };
    // `key` stands in for the context's contents, which are rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
