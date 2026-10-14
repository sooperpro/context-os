import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  MOTION_STORAGE_KEY,
  THEME_STORAGE_KEY,
  ThemeContext,
  type ResolvedTheme,
  type Theme,
  type ThemeContextValue,
} from "@/components/theme-context";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredTheme(fallback: Theme): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

function readStoredMotion(): boolean {
  try {
    return window.localStorage.getItem(MOTION_STORAGE_KEY) === "reduced";
  } catch {
    return false;
  }
}

function subscribeToSystemTheme(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSystemTheme(): ResolvedTheme {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches
    ? "dark"
    : "light";
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

/**
 * Light/dark/system theming for a client-rendered app: persists the preference,
 * follows the OS when set to "system", and sets `data-theme` on <html>, which the
 * design tokens, Tailwind's `dark:` variant and `color-scheme` all key off.
 */
export function ThemeProvider({ children, defaultTheme = "system" }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme(defaultTheme));
  const systemTheme = useSyncExternalStore<ResolvedTheme>(
    subscribeToSystemTheme,
    getSystemTheme,
    () => "light",
  );
  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;
  const [reducedMotion, setReducedMotionState] = useState(readStoredMotion);

  // `data-motion="reduced"` stops animation and transitions (index.css), like the OS setting does.
  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) root.dataset.motion = "reduced";
    else delete root.dataset.motion;
  }, [reducedMotion]);

  const setReducedMotion = useCallback((reduced: boolean) => {
    setReducedMotionState(reduced);
    try {
      if (reduced) window.localStorage.setItem(MOTION_STORAGE_KEY, "reduced");
      else window.localStorage.removeItem(MOTION_STORAGE_KEY);
    } catch {
      // Storage unavailable: the preference lasts until reload.
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode, quota): the preference simply won't persist.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, reducedMotion, setReducedMotion }),
    [theme, resolvedTheme, setTheme, reducedMotion, setReducedMotion],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
