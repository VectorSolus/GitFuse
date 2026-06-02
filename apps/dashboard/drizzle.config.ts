import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../../packages/db/schema.ts",
  out: "../../packages/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? ""
  },
  strict: true,
  verbose: true
});
