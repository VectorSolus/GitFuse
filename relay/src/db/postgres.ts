import {
  effectivePlanTier,
  type PlanTier,
} from "../billing-runtime.js";
import postgres from "postgres";

type RelayDatabaseUser = {
  id: string;
  github_username: string;
  email: string;
  tier: PlanTier | null;
  requested_tier: PlanTier | null;
  payment_provider: string | null;
  subscription_status: string | null;
};

type RelayDatabaseGlobal = typeof globalThis & {
  __gitfuseRelaySql?: postgres.Sql;
  __gitfuseRelaySqlDatabaseUrl?: string;
};

export type RelayDatabasePoolConfig = {
  max: number;
  idle_timeout: number;
  connect_timeout: number;
  max_lifetime: number;
  prepare: false;
};

const globalForDatabase = globalThis as RelayDatabaseGlobal;
let cachedSql: postgres.Sql | null = null;

function positiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function getRelayDatabasePoolConfig(): RelayDatabasePoolConfig {
  return {
    max: positiveIntegerEnv("DATABASE_POOL_MAX", 4),
    idle_timeout: positiveIntegerEnv("DATABASE_IDLE_TIMEOUT", 20),
    connect_timeout: positiveIntegerEnv("DATABASE_CONNECT_TIMEOUT", 10),
    max_lifetime: positiveIntegerEnv("DATABASE_MAX_LIFETIME", 30 * 60),
    prepare: false,
  };
}

export function getRelaySql() {
  if (cachedSql) return cachedSql;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return null;

  if (
    process.env.NODE_ENV !== "production" &&
    globalForDatabase.__gitfuseRelaySql &&
    globalForDatabase.__gitfuseRelaySqlDatabaseUrl === connectionString
  ) {
    cachedSql = globalForDatabase.__gitfuseRelaySql;
    return cachedSql;
  }

  cachedSql = postgres(connectionString, getRelayDatabasePoolConfig());

  if (process.env.NODE_ENV !== "production") {
    globalForDatabase.__gitfuseRelaySql = cachedSql;
    globalForDatabase.__gitfuseRelaySqlDatabaseUrl = connectionString;
  }

  return cachedSql;
}

export async function closeRelaySqlForTest() {
  const sql = cachedSql ?? globalForDatabase.__gitfuseRelaySql;
  cachedSql = null;
  delete globalForDatabase.__gitfuseRelaySql;
  delete globalForDatabase.__gitfuseRelaySqlDatabaseUrl;

  if (sql) {
    await sql.end({ timeout: 5 });
  }
}

function withEffectiveTier(user: RelayDatabaseUser) {
  return {
    id: user.id,
    githubUsername: user.github_username,
    email: user.email,
    tier: effectivePlanTier({
      tier: user.tier,
      requestedTier: user.requested_tier,
      paymentProvider: user.payment_provider,
      subscriptionStatus: user.subscription_status,
    }),
  };
}

export function relayDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export type RelayDatabaseReadiness =
  | { ok: true }
  | { ok: false; reason: "database_not_configured" | "database_unreachable" | "database_timeout" };

export async function checkRelayDatabaseReady(timeoutMs = 2000): Promise<RelayDatabaseReadiness> {
  const sql = getRelaySql();
  if (!sql) return { ok: false, reason: "database_not_configured" };

  let timeout: NodeJS.Timeout | null = null;
  try {
    await Promise.race([
      sql`select 1`,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("database_timeout")), timeoutMs);
      }),
    ]);
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message === "database_timeout") {
      return { ok: false, reason: "database_timeout" };
    }
    return { ok: false, reason: "database_unreachable" };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function findRelayDatabaseUserById(userId: string) {
  const sql = getRelaySql();
  if (!sql) return null;

  const [user] = await sql<RelayDatabaseUser[]>`
    select
      users.id,
      users.github_username,
      users.email,
      plans.tier,
      plans.requested_tier,
      plans.payment_provider,
      plans.subscription_status
    from users
    left join plans on plans.user_id = users.id
    where users.id = ${userId}
    limit 1
  `;

  return user ? withEffectiveTier(user) : null;
}

export async function findRelayDatabaseUserByIdentity(
  githubUsername: string,
  email?: string | null,
) {
  const sql = getRelaySql();
  if (!sql) return null;

  const [user] = await sql<RelayDatabaseUser[]>`
    select
      users.id,
      users.github_username,
      users.email,
      plans.tier,
      plans.requested_tier,
      plans.payment_provider,
      plans.subscription_status
    from users
    left join plans on plans.user_id = users.id
    where users.github_username = ${githubUsername}
       or (${email ?? null}::text is not null and lower(users.email) = lower(${email ?? null}))
    order by users.updated_at desc
    limit 1
  `;

  return user ? withEffectiveTier(user) : null;
}

export async function ensureRelayDatabaseUser(
  githubUsername: string,
  email: string,
) {
  const sql = getRelaySql();
  if (!sql) return null;

  const existing = await findRelayDatabaseUserByIdentity(
    githubUsername,
    email,
  );
  if (existing) return existing;

  const [user] = await sql<{
    id: string;
    github_username: string;
    email: string;
  }[]>`
    insert into users (github_id, github_username, email)
    values (${`relay:${githubUsername}`}, ${githubUsername}, ${email})
    returning id, github_username, email
  `;

  await sql`
    insert into plans (user_id, tier, requested_tier, team_seat_count)
    values (${user.id}, 'free', 'free', 1)
    on conflict (user_id) do nothing
  `;

  return {
    id: user.id,
    githubUsername: user.github_username,
    email: user.email,
    tier: "free" as const,
  };
}
