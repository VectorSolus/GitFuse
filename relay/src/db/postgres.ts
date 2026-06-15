import {
  effectivePlanTier,
  type PlanTier,
} from "@gitfuse/types/billing";
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

let cachedSql: postgres.Sql | null = null;

function getSql() {
  if (cachedSql) return cachedSql;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return null;
  cachedSql = postgres(connectionString, { prepare: false });
  return cachedSql;
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

export async function findRelayDatabaseUserById(userId: string) {
  const sql = getSql();
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
  const sql = getSql();
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
  const sql = getSql();
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
