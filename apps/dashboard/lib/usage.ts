import {
  PLAN_LIMITS,
  effectivePlanTier,
  type PlanTier,
  type UsageSummary,
} from "@gitfuse/types/billing";

import { getSql } from "./db";

export type DashboardUsage = UsageSummary & {
  activeBundleCount: number;
  nextExpiryAt: string | null;
  historyRetention: {
    usedDays: number;
    maxDays: number;
    percentage: number;
  };
  bundleSize: UsageSummary["bundleSize"] & {
    largestRecentBundleBytes: number;
    percentage: number;
  };
  storage: UsageSummary["storage"] & {
    percentage: number;
  };
  recentBundles: DashboardUsageBundle[];
};

export type DashboardUsageBundle = {
  repositoryName: string;
  deviceName: string | null;
  sizeBytes: number;
  syncedAt: string;
};

type AccountLookup = {
  email?: string | null;
  username?: string | null;
};

type UsageRow = {
  tier: PlanTier | null;
  requested_tier: PlanTier | null;
  payment_provider: string | null;
  subscription_status: string | null;
  repo_count: number | string | null;
  active_device_count: number | string | null;
  storage_bytes: number | string | null;
  active_bundle_count: number | string | null;
  next_expiry_at: Date | string | null;
  history_used_days: number | string | null;
  largest_bundle_bytes: number | string | null;
};

type RecentBundleRow = {
  repository_name: string;
  device_name: string | null;
  size_bytes: number | string;
  synced_at: Date | string;
};

function toIso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function percentage(current: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, (current / max) * 100));
}

function mapRecentBundle(row: RecentBundleRow): DashboardUsageBundle {
  return {
    repositoryName: row.repository_name,
    deviceName: row.device_name,
    sizeBytes: Number(row.size_bytes ?? 0),
    syncedAt: toIso(row.synced_at) ?? ""
  };
}

function buildUsage(row: UsageRow, recentBundles: DashboardUsageBundle[] = []): DashboardUsage {
  const tier = effectivePlanTier({
    tier: row.tier,
    requestedTier: row.requested_tier,
    paymentProvider: row.payment_provider,
    subscriptionStatus: row.subscription_status,
  });
  const limits = PLAN_LIMITS[tier];
  const storageBytes = Number(row.storage_bytes ?? 0);
  const historyUsedDays = Number(row.history_used_days ?? 0);
  const largestBundleBytes = Number(row.largest_bundle_bytes ?? 0);
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
      currentBytes: storageBytes,
      maxBytes: limits.storageTotalBytes,
      percentage: percentage(storageBytes, limits.storageTotalBytes)
    },
    bundleSize: {
      maxBytes: limits.bundleSizeBytes,
      largestRecentBundleBytes: largestBundleBytes,
      percentage: percentage(largestBundleBytes, limits.bundleSizeBytes)
    },
    historyDays: limits.historyDays,
    activeBundleCount: Number(row.active_bundle_count ?? 0),
    nextExpiryAt: toIso(row.next_expiry_at),
    historyRetention: {
      usedDays: historyUsedDays,
      maxDays: limits.historyDays,
      percentage: percentage(historyUsedDays, limits.historyDays)
    },
    recentBundles
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
      requested_tier: "free",
      payment_provider: null,
      subscription_status: null,
      repo_count: 0,
      active_device_count: 0,
      storage_bytes: 0,
      active_bundle_count: 0,
      next_expiry_at: null,
      history_used_days: 0,
      largest_bundle_bytes: 0
    });
  }

  const sql = getSql();
  const [row, recentBundles] = await Promise.all([
    sql<UsageRow[]>`
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
      plans.requested_tier,
      plans.payment_provider,
      plans.subscription_status,
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
      ) as next_expiry_at,
      (
        select count(distinct to_char(sync_events.created_at at time zone 'UTC', 'YYYY-MM-DD'))
        from sync_events
        join owned_repos on owned_repos.id = sync_events.repository_id
      )::int as history_used_days,
      coalesce((
        select max(bundles.size_bytes)
        from bundles
        join owned_repos on owned_repos.id = bundles.repository_id
        where bundles.status = 'active'
      ), 0)::bigint as largest_bundle_bytes
    from dashboard_user
    left join plans on plans.user_id = dashboard_user.id
    limit 1
  `,
    sql<RecentBundleRow[]>`
      with dashboard_user as (
        select id
        from users
        where (${account.email ?? null}::text is not null and email = ${account.email ?? null})
           or (${account.username ?? null}::text is not null and github_username = ${account.username ?? null})
        order by updated_at desc
        limit 1
      )
      select
        repositories.display_name as repository_name,
        devices.name as device_name,
        bundles.size_bytes,
        bundles.created_at as synced_at
      from bundles
      join repositories on repositories.id = bundles.repository_id
      join devices on devices.id = bundles.device_id
      join dashboard_user on dashboard_user.id = repositories.user_id
      where bundles.status = 'active'
      order by bundles.created_at desc
      limit 12
    `,
  ]);

  return buildUsage(
    (row[0]) ?? {
      tier: "free",
      requested_tier: "free",
      payment_provider: null,
      subscription_status: null,
      repo_count: 0,
      active_device_count: 0,
      storage_bytes: 0,
      active_bundle_count: 0,
      next_expiry_at: null,
      history_used_days: 0,
      largest_bundle_bytes: 0
    },
    recentBundles.map(mapRecentBundle)
  );
}
