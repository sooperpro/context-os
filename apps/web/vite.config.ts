import { readFileSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import svgr from "vite-plugin-svgr";
import { defineConfig } from "vitest/config";

/**
 * Serves MSW's worker script (dev-server/mockServiceWorker.js, written by `msw init`) at the site
 * root during `vite serve` only. It lives outside public/ so production builds never ship it.
 */
function mockServiceWorker(): Plugin {
  const file = path.resolve(import.meta.dirname, "dev-server/mockServiceWorker.js");
  return {
    name: "contextos:mock-service-worker",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/mockServiceWorker.js", (_request, response) => {
        response.setHeader("Content-Type", "text/javascript");
        response.setHeader("Cache-Control", "no-cache");
        response.end(readFileSync(file));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget =
    env.VITE_DEV_API_PROXY_TARGET && env.VITE_DEV_API_PROXY_TARGET.length > 0
      ? env.VITE_DEV_API_PROXY_TARGET
      : "http://localhost:3000";

  return {
    plugins: [
      mockServiceWorker(),
      react(),
      tailwindcss(),
      // Material Symbols ship as one SVG per icon; `?react` imports them as components, so only the
      // icons a screen uses end up in the bundle. `data-symbol` lets index.css set their weight.
      svgr({
        include: "**/*.svg?react",
        svgrOptions: {
          icon: true,
          svgProps: { fill: "currentColor", "aria-hidden": "true", "data-symbol": "" },
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      strictPort: false,
      // Same-origin `/api` in development avoids CORS and mirrors the production proxy.
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      sourcemap: true,
      target: "es2022",
      rolldownOptions: {
        output: {
          // Keep long-lived vendor code in its own chunks so app changes don't bust their cache.
          codeSplitting: {
            groups: [
              {
                name: "react",
                test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
              },
              { name: "vendor", test: /node_modules/ },
            ],
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      testTimeout: 15_000,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      restoreMocks: true,
      css: false,
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"],
        include: ["src/**"],
        exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/components/ui/**", "src/main.tsx"],
      },
    },
  };
});
