import { useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query. Returns false where matchMedia is unavailable (tests, SSR),
 * which resolves to the compact layout, the safest default.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** M3 window size classes. Keep in sync with the breakpoints in @contextos/design-tokens. */
export const WINDOW = {
  medium: "(min-width: 600px)",
  expanded: "(min-width: 1200px)",
  large: "(min-width: 1600px)",
} as const;
