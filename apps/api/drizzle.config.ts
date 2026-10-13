import { defineConfig } from "drizzle-kit";

if (process.env.NODE_ENV !== "production") {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: fall back to process env / defaults.
  }
}

export default defineConfig({
  dialect: "sqlite",
  // Single schema file so drizzle-kit needs no import resolution.
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "./data/contextos.db",
  },
  strict: true,
  verbose: true,
});
