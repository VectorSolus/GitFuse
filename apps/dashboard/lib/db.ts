import postgres from "postgres";

let cachedSql: postgres.Sql | null = null;

export function getSql() {
  if (cachedSql) return cachedSql;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the gitfuse dashboard.");
  }
  cachedSql = postgres(connectionString, { prepare: false });
  return cachedSql;
}
