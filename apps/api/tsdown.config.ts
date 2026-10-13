import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: false,
  // Emit dist/index.js (not .mjs); the package is already "type": "module".
  fixedExtension: false,
  deps: {
    // Workspace packages are plain TypeScript source, so inline them into the bundle.
    // Everything else in `dependencies` stays external and is installed in the image.
    alwaysBundle: ["@contextos/shared"],
  },
});
