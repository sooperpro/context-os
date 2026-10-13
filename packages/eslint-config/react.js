import tanstackQuery from "@tanstack/eslint-plugin-query";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import { createBaseConfig } from "./base.js";

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
    // Must be last: disables formatting rules that conflict with Prettier.
    prettier,
  ]);
}
