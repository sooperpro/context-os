import { createContext } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = Exclude<Theme, "system">;

export interface ThemeContextValue {
  /** The user's preference. */
  theme: Theme;
  /** The theme actually applied (system preference resolved). */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

/** Must match the key used by the pre-render snippet in index.html. */
export const THEME_STORAGE_KEY = "contextos-theme";

export const ThemeContext = createContext<ThemeContextValue | null>(null);
