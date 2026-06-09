import type { SyncEventType } from "@gitfuse/types/workspace";

import { getSql } from "./db";

export type DashboardRepository = {
  id: string;
  rootSha: string;
  displayName: string;
  remoteUrl: string | null;
  relayEntryId: string;
  createdAt: string;
  lastSyncedAt: string | null;
  activeBundleCount: number;
  activeStorageBytes: number;
  latestEventType: SyncEventType | null;
  latestEventAt: string | null;
  syncState: "synced" | "waiting";
};

type AccountLookup = {
  email?: string | null;
  username?: string | null;
};

type RepositoryRow = {
  id: string;
  root_sha: string;
  display_name: string;
  remote_url: string | null;
  relay_entry_id: string;
  created_at: Date | string;
  last_synced_at: Date | string | null;
  active_bundle_count: number | string | null;
  active_storage_bytes: number | string | null;
  latest_event_type: SyncEventType | null;
  latest_event_at: Date | string | null;
};

function toIso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapRepository(row: RepositoryRow): DashboardRepository {
  return {
    id: row.id,
    rootSha: row.root_sha,
    displayName: row.display_name,
    remoteUrl: row.remote_url,
    relayEntryId: row.relay_entry_id,
    createdAt: toIso(row.created_at) ?? "",
    lastSyncedAt: toIso(row.last_synced_at),
    activeBundleCount: Number(row.active_bundle_count ?? 0),
    activeStorageBytes: Number(row.active_storage_bytes ?? 0),
    latestEventType: row.latest_event_type,
    latestEventAt: toIso(row.latest_event_at),
    syncState: row.last_synced_at ? "synced" : "waiting"
  };
}

async function loadFixtureRepositories(fixturePath: string) {
  const { readFile } = await import("node:fs/promises");
  const parsed = JSON.parse(await readFile(fixturePath, "utf8")) as { repositories?: DashboardRepository[] };
  return parsed.repositories ?? [];
}

export async function listDashboardRepositories(
  account: AccountLookup,
  options: { fixturePath?: string | null } = {}
) {
  if (process.env.NODE_ENV !== "production" && options.fixturePath) {
    return loadFixtureRepositories(options.fixturePath);
  }

  if (!account.email && !account.username) return [];

  const sql = getSql();
  const rows = await sql<RepositoryRow[]>`
    with dashboard_user as (
      select id
      from users
      where (${account.email ?? null}::text is not null and email = ${account.email ?? null})
         or (${account.username ?? null}::text is not null and github_username = ${account.username ?? null})
      order by updated_at desc
      limit 1
    )
    select
      repositories.id,
      repositories.root_sha,
      repositories.display_name,
      repositories.remote_url,
      repositories.relay_entry_id,
      repositories.created_at,
      repositories.last_synced_at,
      coalesce(bundle_totals.active_bundle_count, 0) as active_bundle_count,
      coalesce(bundle_totals.active_storage_bytes, 0) as active_storage_bytes,
      latest_event.event_type as latest_event_type,
      latest_event.created_at as latest_event_at
    from repositories
    join dashboard_user on dashboard_user.id = repositories.user_id
    left join lateral (
      select count(*)::int as active_bundle_count, coalesce(sum(size_bytes), 0)::bigint as active_storage_bytes
      from bundles
      where bundles.repository_id = repositories.id
        and bundles.status = 'active'
    ) bundle_totals on true
    left join lateral (
      select event_type, created_at
      from sync_events
      where sync_events.repository_id = repositories.id
      order by created_at desc
      limit 1
    ) latest_event on true
    order by repositories.last_synced_at desc nulls last, repositories.created_at desc
  `;

  return rows.map(mapRepository);
}
