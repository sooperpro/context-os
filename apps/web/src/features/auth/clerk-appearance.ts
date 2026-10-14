import type { ClerkProvider } from "@clerk/react";
import { useEffect, useState, type ComponentProps } from "react";
import type { ResolvedTheme } from "@/components/theme-context";

type Appearance = NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]>;

/**
 * Clerk's prebuilt components (sign-in, organization list, account menu) are themed from the design
 * tokens at runtime: the token values are read from the document so the same source of truth
 * drives them, in both themes. Clerk wants concrete colors, so the reference tokens (hex) are read,
 * never retyped here.
 */
const TOKENS = {
  primary: "--md-sys-color-primary",
  onPrimary: "--md-sys-color-on-primary",
  background: "--cx-card",
  text: "--md-sys-color-on-surface",
  textSecondary: "--md-sys-color-on-surface-variant",
  input: "--cx-field",
  danger: "--md-sys-color-error",
  outline: "--md-sys-color-outline",
  outlineVariant: "--md-sys-color-outline-variant",
  font: "--md-ref-typeface-plain",
  radius: "--md-sys-shape-corner-medium",
} as const;

function readTokens(): Record<keyof typeof TOKENS, string> {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return Object.fromEntries(
    (Object.keys(TOKENS) as Array<keyof typeof TOKENS>).map((key) => [key, read(TOKENS[key])]),
  ) as Record<keyof typeof TOKENS, string>;
}

export function buildClerkAppearance(tokens: Record<keyof typeof TOKENS, string>): Appearance {
  return {
    variables: {
      colorPrimary: tokens.primary,
      colorPrimaryForeground: tokens.onPrimary,
      colorBackground: tokens.background,
      colorForeground: tokens.text,
      colorMutedForeground: tokens.textSecondary,
      colorInput: tokens.input,
      colorInputForeground: tokens.text,
      colorDanger: tokens.danger,
      colorNeutral: tokens.outline,
      colorBorder: tokens.outlineVariant,
      fontFamily: tokens.font,
      fontFamilyButtons: tokens.font,
      borderRadius: tokens.radius,
    },
    options: {
      socialButtonsVariant: "blockButton",
      socialButtonsPlacement: "top",
      logoPlacement: "none",
    },
    elements: {
      // The sign-in frame provides its own heading, card and chrome.
      rootBox: "w-full",
      cardBox: "w-full shadow-none",
      card: "bg-transparent p-0 shadow-none",
      header: "hidden",
      socialButtonsBlockButton: "h-14 rounded-full",
      formButtonPrimary: "h-14 rounded-full",
      formFieldInput: "h-14 rounded-md",
      footer: "bg-transparent",
    },
  };
}

/** Appearance for the active theme. Re-read after the theme attribute changes on the document. */
export function useClerkAppearance(resolvedTheme: ResolvedTheme): Appearance {
  const [appearance, setAppearance] = useState<Appearance>(() => buildClerkAppearance(readTokens()));
  useEffect(() => {
    // ThemeProvider writes data-theme in its own effect, which runs after this one: wait a frame.
    const frame = requestAnimationFrame(() => setAppearance(buildClerkAppearance(readTokens())));
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);
  return appearance;
}
