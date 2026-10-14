import tanstackQuery from "@tanstack/eslint-plugin-query";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import { createBaseConfig } from "./base.js";

/* Design-token guardrail patterns (esquery regex attribute selectors). */
const RAW_COLOR = String.raw`/#(?:[0-9a-fA-F]{3}){1,2}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/`;
const PALETTE_CLASS = String.raw`/\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|shadow|accent|caret|divide|placeholder)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/`;
const DARK_VARIANT = String.raw`/\bdark:/`;
const RAW_COLOR_MESSAGE =
  "Raw color values belong in packages/design-tokens. Use a semantic token utility (bg-card, text-success, border-outline-variant).";
const PALETTE_MESSAGE =
  "Tailwind palette classes bypass the design tokens. Use a semantic role (success, warning, info, ai, primary-container, surface-container-*).";
const DARK_MESSAGE =
  "Semantic tokens already switch with the theme; feature code must not use dark: variants.";

/**
 * ESLint config for React (Vite) applications.
 * @param {{ tsconfigRootDir: string; ignores?: string[] }} options
 */
export function createReactConfig(options) {
  return defineConfig([
    ...createBaseConfig(options),
    {
      files: ["**/*.{ts,tsx}"],
      extends: [
        reactHooks.configs.flat.recommended,
        reactRefresh.configs.vite,
        tanstackQuery.configs["flat/recommended"],
      ],
      languageOptions: {
        globals: { ...globals.browser },
      },
    },
    {
      // shadcn/ui primitives intentionally export both components and variant helpers.
      files: ["src/components/ui/**/*.{ts,tsx}"],
      rules: {
        "react-refresh/only-export-components": "off",
      },
    },
    {
      // Design-token guardrail: components and features read semantic tokens
      // (bg-card, text-success, rounded-lg), never raw values or Tailwind's palette.
      // Values live in packages/design-tokens only.
      files: ["src/components/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}", "src/dev/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-syntax": [
          "error",
          {
            selector: `Literal[value=${RAW_COLOR}]`,
            message: RAW_COLOR_MESSAGE,
          },
          {
            selector: `TemplateElement[value.raw=${RAW_COLOR}]`,
            message: RAW_COLOR_MESSAGE,
          },
          {
            selector: `Literal[value=${PALETTE_CLASS}]`,
            message: PALETTE_MESSAGE,
          },
          {
            selector: `TemplateElement[value.raw=${PALETTE_CLASS}]`,
            message: PALETTE_MESSAGE,
          },
        ],
      },
    },
    {
      // Features never need dark: variants: semantic tokens already switch with the theme.
      files: ["src/features/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-syntax": [
          "error",
          { selector: `Literal[value=${RAW_COLOR}]`, message: RAW_COLOR_MESSAGE },
          { selector: `TemplateElement[value.raw=${RAW_COLOR}]`, message: RAW_COLOR_MESSAGE },
          { selector: `Literal[value=${PALETTE_CLASS}]`, message: PALETTE_MESSAGE },
          { selector: `TemplateElement[value.raw=${PALETTE_CLASS}]`, message: PALETTE_MESSAGE },
          { selector: `Literal[value=${DARK_VARIANT}]`, message: DARK_MESSAGE },
          { selector: `TemplateElement[value.raw=${DARK_VARIANT}]`, message: DARK_MESSAGE },
        ],
      },
    },
    {
      // One icon language: Material Symbols through the registry. shadcn generates lucide-react
      // imports; swap them for registry icons when adding a component.
      files: ["src/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "lucide-react",
                message: "Use Material Symbols from @/components/ui/icons (add the icon there if it is missing).",
              },
            ],
          },
        ],
      },
    },
    // Must be last: disables formatting rules that conflict with Prettier.
    prettier,
  ]);
}
