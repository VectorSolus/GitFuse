// import { defineConfig } from "drizzle-kit";

// export default defineConfig({
//   dialect: "postgresql", 
//   schema: "./schema.ts",
//   out: "./migrations",
// });

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql", 
  schema: "./schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: (globalThis as any).process?.env?.DATABASE_URL || "postgresql://localhost:5432/gitfuse_db",
  },
});
