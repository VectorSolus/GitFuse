import type { SyncEventType } from "@gitfuse/types/workspace";

import { getSql } from "./db";

export type DashboardSyncEvent = {
  id: string;
  eventType: SyncEventType;
  commitCount: number;
  bundleSizeBytes: number;
  createdAt: string;
  repositoryName: string;
  relayEntryId: string;
  deviceName: string;
};

type AccountLookup = {
  email?: string | null;
  username?: string | null;
};

type SyncEventRow = {
  id: string;
  event_type: SyncEventType;
  commit_count: number | string;
  bundle_size_bytes: number | string;
  created_at: Date | string;
  repository_name: string;
  relay_entry_id: string;
  device_name: string;
};

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapSyncEvent(row: SyncEventRow): DashboardSyncEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    commitCount: Number(row.commit_count),
    bundleSizeBytes: Number(row.bundle_size_bytes),
    createdAt: toIso(row.created_at),
    repositoryName: row.repository_name,
    relayEntryId: row.relay_entry_id,
    deviceName: row.device_name
  };
}

async function loadFixtureHistory(fixturePath: string) {
  const { readFile } = await import("node:fs/promises");
  const parsed = JSON.parse(await readFile(fixturePath, "utf8")) as { events?: DashboardSyncEvent[] };
  return parsed.events ?? [];
}

export async function listDashboardSyncHistory(
  account: AccountLookup,
  options: { fixturePath?: string | null; limit?: number } = {}
) {
  if (process.env.NODE_ENV !== "production" && options.fixturePath) {
    return loadFixtureHistory(options.fixturePath);
  }

  if (!account.email && !account.username) return [];

  const limit = Math.max(1, Math.min(options.limit ?? 100, 200));
  const sql = getSql();
  const rows = await sql<SyncEventRow[]>`
    with dashboard_user as (
      select id
      from users
      where (${account.email ?? null}::text is not null and email = ${account.email ?? null})
         or (${account.username ?? null}::text is not null and github_username = ${account.username ?? null})
      order by updated_at desc
      limit 1
    )
    select
      sync_events.id,
      sync_events.event_type,
      sync_events.commit_count,
      sync_events.bundle_size_bytes,
      sync_events.created_at,
      repositories.display_name as repository_name,
      repositories.relay_entry_id,
      devices.name as device_name
    from sync_events
    join repositories on repositories.id = sync_events.repository_id
    join devices on devices.id = sync_events.device_id
    join dashboard_user on dashboard_user.id = repositories.user_id
    order by sync_events.created_at desc
    limit ${limit}
  `;

  return rows.map(mapSyncEvent);
}
