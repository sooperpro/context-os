import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: ":memory:",
      GEMINI_API_KEY: "test-api-key",
      GEMINI_MODEL: "test-model",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**"],
      exclude: ["src/**/*.test.ts", "src/test/**", "src/scripts/**", "src/index.ts"],
    },
  },
});
