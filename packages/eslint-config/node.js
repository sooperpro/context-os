import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import globals from "globals";
import { createBaseConfig } from "./base.js";

/**
 * ESLint config for Node.js services.
 * @param {{ tsconfigRootDir: string; ignores?: string[] }} options
 */
export function createNodeConfig(options) {
  return defineConfig([
    ...createBaseConfig(options),
    {
      languageOptions: {
        globals: { ...globals.node },
      },
    },
    // Must be last: disables formatting rules that conflict with Prettier.
    prettier,
  ]);
}
