import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget =
    env.VITE_DEV_API_PROXY_TARGET && env.VITE_DEV_API_PROXY_TARGET.length > 0
      ? env.VITE_DEV_API_PROXY_TARGET
      : "http://localhost:3000";

  return {
    plugins: [react(), tailwindcss()],
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
