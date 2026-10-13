import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

/**
 * Shared base rules for every TypeScript package.
 * Type-aware linting is enabled via the TypeScript project service, so each
 * consumer must pass its own `tsconfigRootDir` (usually `import.meta.dirname`).
 *
 * @param {{ tsconfigRootDir: string; ignores?: string[] }} options
 */
export function createBaseConfig({ tsconfigRootDir, ignores = [] }) {
  return defineConfig([
    globalIgnores([
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.turbo/**",
      ...ignores,
    ]),
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { prefer: "type-imports", fixStyle: "inline-type-imports" },
        ],
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            caughtErrorsIgnorePattern: "^_",
          },
        ],
        "@typescript-eslint/no-misused-promises": [
          "error",
          { checksVoidReturn: { attributes: false } },
        ],
        "@typescript-eslint/consistent-type-definitions": "off",
        "@typescript-eslint/array-type": ["error", { default: "array-simple" }],
        "no-console": ["warn", { allow: ["warn", "error"] }],
        eqeqeq: ["error", "always", { null: "ignore" }],
        "prefer-const": "error",
      },
    },
    {
      // Plain JS files (config files) are not part of a TS project: skip type-aware rules.
      files: ["**/*.{js,mjs,cjs}"],
      extends: [tseslint.configs.disableTypeChecked],
    },
  ]);
}
