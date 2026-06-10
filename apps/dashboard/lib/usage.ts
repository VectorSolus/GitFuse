import { TIER_LIMITS, type PlanTier, type UsageSummary } from "@gitfuse/types/billing";

import { getSql } from "./db";

export type DashboardUsage = UsageSummary & {
  activeBundleCount: number;
  nextExpiryAt: string | null;
};

type AccountLookup = {
  email?: string | null;
  username?: string | null;
};

type UsageRow = {
  tier: PlanTier | null;
  repo_count: number | string | null;
  active_device_count: number | string | null;
  storage_bytes: number | string | null;
  active_bundle_count: number | string | null;
  next_expiry_at: Date | string | null;
};

function toIso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function buildUsage(row: UsageRow): DashboardUsage {
  const tier = row.tier ?? "free";
  const limits = TIER_LIMITS[tier];
  return {
    tier,
    repos: {
      current: Number(row.repo_count ?? 0),
      max: limits.repos
    },
    devices: {
      current: Number(row.active_device_count ?? 0),
      max: limits.devices
    },
    storage: {
      currentBytes: Number(row.storage_bytes ?? 0),
      maxBytes: limits.storageTotalBytes
    },
    bundleSize: {
      maxBytes: limits.bundleSizeBytes
    },
    historyDays: limits.historyDays,
    activeBundleCount: Number(row.active_bundle_count ?? 0),
    nextExpiryAt: toIso(row.next_expiry_at)
  };
}

async function loadFixtureUsage(fixturePath: string) {
  const { readFile } = await import("node:fs/promises");
  const parsed = JSON.parse(await readFile(fixturePath, "utf8")) as DashboardUsage;
  return parsed;
}

export async function getDashboardUsage(account: AccountLookup, options: { fixturePath?: string | null } = {}) {
  if (process.env.NODE_ENV !== "production" && options.fixturePath) {
    return loadFixtureUsage(options.fixturePath);
  }

  if (!account.email && !account.username) {
    return buildUsage({
      tier: "free",
      repo_count: 0,
      active_device_count: 0,
      storage_bytes: 0,
      active_bundle_count: 0,
      next_expiry_at: null
    });
  }

  const sql = getSql();
  const [row] = await sql<UsageRow[]>`
    with dashboard_user as (
      select id
      from users
      where (${account.email ?? null}::text is not null and email = ${account.email ?? null})
         or (${account.username ?? null}::text is not null and github_username = ${account.username ?? null})
      order by updated_at desc
      limit 1
    ),
    owned_repos as (
      select repositories.id
      from repositories
      join dashboard_user on dashboard_user.id = repositories.user_id
    )
    select
      plans.tier,
      (select count(*) from owned_repos)::int as repo_count,
      (
        select count(*) from devices
        join dashboard_user on dashboard_user.id = devices.user_id
        where devices.revoked_at is null
      )::int as active_device_count,
      coalesce((
        select sum(bundles.size_bytes)
        from bundles
        join owned_repos on owned_repos.id = bundles.repository_id
        where bundles.status = 'active'
      ), 0)::bigint as storage_bytes,
      (
        select count(*)
        from bundles
        join owned_repos on owned_repos.id = bundles.repository_id
        where bundles.status = 'active'
      )::int as active_bundle_count,
      (
        select min(bundles.expires_at)
        from bundles
        join owned_repos on owned_repos.id = bundles.repository_id
        where bundles.status = 'active'
      ) as next_expiry_at
    from dashboard_user
    left join plans on plans.user_id = dashboard_user.id
    limit 1
  `;

  return buildUsage(
    row ?? {
      tier: "free",
      repo_count: 0,
      active_device_count: 0,
      storage_bytes: 0,
      active_bundle_count: 0,
      next_expiry_at: null
    }
  );
}
