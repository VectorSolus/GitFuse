import postgres from "postgres";

type DashboardDatabaseGlobal = typeof globalThis & {
  __gitfuseDashboardSql?: postgres.Sql;
  __gitfuseDashboardSqlDatabaseUrl?: string;
};

export type DashboardDatabasePoolConfig = {
  max: number;
  idle_timeout: number;
  connect_timeout: number;
  max_lifetime: number;
  prepare: false;
};

const globalForDatabase = globalThis as DashboardDatabaseGlobal;
let cachedSql: postgres.Sql | null = null;

function positiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function getDashboardDatabasePoolConfig(): DashboardDatabasePoolConfig {
  return {
    max: positiveIntegerEnv("DATABASE_POOL_MAX", 4),
    idle_timeout: positiveIntegerEnv("DATABASE_IDLE_TIMEOUT", 20),
    connect_timeout: positiveIntegerEnv("DATABASE_CONNECT_TIMEOUT", 10),
    max_lifetime: positiveIntegerEnv("DATABASE_MAX_LIFETIME", 30 * 60),
    prepare: false,
  };
}

function dashboardDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the gitfuse dashboard.");
  }
  return connectionString;
}

export function getSql() {
  if (cachedSql) return cachedSql;

  const connectionString = dashboardDatabaseUrl();
  if (
    process.env.NODE_ENV !== "production" &&
    globalForDatabase.__gitfuseDashboardSql &&
    globalForDatabase.__gitfuseDashboardSqlDatabaseUrl === connectionString
  ) {
    cachedSql = globalForDatabase.__gitfuseDashboardSql;
    return cachedSql;
  }

  cachedSql = postgres(connectionString, getDashboardDatabasePoolConfig());

  if (process.env.NODE_ENV !== "production") {
    globalForDatabase.__gitfuseDashboardSql = cachedSql;
    globalForDatabase.__gitfuseDashboardSqlDatabaseUrl = connectionString;
  }

  return cachedSql;
}

export async function closeDashboardSqlForTest() {
  const sql = cachedSql ?? globalForDatabase.__gitfuseDashboardSql;
  cachedSql = null;
  delete globalForDatabase.__gitfuseDashboardSql;
  delete globalForDatabase.__gitfuseDashboardSqlDatabaseUrl;

  if (sql) {
    await sql.end({ timeout: 5 });
  }
}
