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
  menuRadius: "--md-sys-shape-corner-large",
  logoTile: "--cx-logo-tile",
} as const;

function readTokens(): Record<keyof typeof TOKENS, string> {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return Object.fromEntries(
    (Object.keys(TOKENS) as Array<keyof typeof TOKENS>).map((key) => [key, read(TOKENS[key])]),
  ) as Record<keyof typeof TOKENS, string>;
}

/** Inside the sign-in frame our card is the chrome: Clerk's own card and header disappear. */
const SIGN_IN_FRAME = {
  rootBox: { width: "100%" },
  cardBox: { width: "100%", boxShadow: "none", borderRadius: 0 },
  card: { backgroundColor: "transparent", boxShadow: "none", padding: 0, gap: "1rem" },
  header: { display: "none" },
};

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
    // Style objects, not class names: Clerk injects its own styles with higher specificity than
    // utility classes. Shared elements first; the sign-in frame's chrome is scoped below so the
    // organization and account popovers keep their own card.
    elements: {
      organizationSwitcherTrigger: {
        minHeight: "2.5rem",
        borderRadius: "9999px",
        padding: "0 0.5rem 0 0.75rem",
        color: tokens.text,
      },
      organizationSwitcherPopoverCard: {
        borderRadius: tokens.menuRadius,
        backgroundColor: tokens.background,
      },
      userButtonPopoverCard: {
        borderRadius: tokens.menuRadius,
        backgroundColor: tokens.background,
      },
      userButtonAvatarBox: { width: "2rem", height: "2rem" },
      // The prototype's Google button is a filled primary button.
      socialButtonsBlockButton: {
        minHeight: "3.5rem",
        borderRadius: "9999px",
        backgroundColor: tokens.primary,
        borderColor: tokens.primary,
        color: tokens.onPrimary,
      },
      socialButtonsBlockButtonText: { color: tokens.onPrimary, fontWeight: 500 },
      socialButtonsProviderIcon: {
        backgroundColor: tokens.logoTile,
        borderRadius: "9999px",
        padding: "0.25rem",
        boxSizing: "content-box",
      },
      formButtonPrimary: { minHeight: "3.5rem", borderRadius: "9999px" },
      formFieldInput: { minHeight: "3.5rem" },
      footer: { background: "transparent" },
      footerAction: { padding: 0 },
    },
    // Sign-in and sign-up are our own forms; only the workspace chooser is Clerk's, in our card.
    organizationList: { elements: SIGN_IN_FRAME },
  };
}

/** Appearance for the active theme. Re-read after the theme attribute changes on the document. */
export function useClerkAppearance(resolvedTheme: ResolvedTheme): Appearance {
  const [appearance, setAppearance] = useState<Appearance>(() =>
    buildClerkAppearance(readTokens()),
  );
  useEffect(() => {
    // ThemeProvider writes data-theme in its own effect, which runs after this one: wait a frame.
    const frame = requestAnimationFrame(() => setAppearance(buildClerkAppearance(readTokens())));
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);
  return appearance;
}
