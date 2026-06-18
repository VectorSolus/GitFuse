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
  commits: DashboardSyncCommit[];
};

export type DashboardSyncCommit = {
  sha: string;
  message: string;
  authorName: string | null;
  authorEmail: string | null;
  authoredAt: string | null;
  committedAt: string | null;
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
  commits: DashboardSyncCommit[] | null;
};

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export function historyYearRange(
  year: number,
  timezoneOffsetMinutes = 0,
) {
  const offsetMilliseconds = timezoneOffsetMinutes * 60 * 1000;
  return {
    start: new Date(Date.UTC(year, 0, 1) + offsetMilliseconds),
    end: new Date(Date.UTC(year + 1, 0, 1) + offsetMilliseconds),
  };
}

export function isTimestampInHistoryYear(
  timestamp: string,
  year: number,
  timezoneOffsetMinutes = 0,
) {
  const range = historyYearRange(year, timezoneOffsetMinutes);
  const value = new Date(timestamp).getTime();
  return value >= range.start.getTime() && value < range.end.getTime();
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
    deviceName: row.device_name,
    commits: Array.isArray(row.commits) ? row.commits : []
  };
}

async function loadFixtureHistory(fixturePath: string) {
  const { readFile } = await import("node:fs/promises");
  const parsed = JSON.parse(await readFile(fixturePath, "utf8")) as { events?: DashboardSyncEvent[] };
  return parsed.events ?? [];
}

export async function listDashboardSyncHistory(
  account: AccountLookup,
  options: {
    fixturePath?: string | null;
    limit?: number;
    year?: number;
    timezoneOffsetMinutes?: number;
  } = {}
) {
  const year = options.year ?? new Date().getFullYear();
  const timezoneOffsetMinutes = options.timezoneOffsetMinutes ?? 0;
  const { start: rangeStart, end: rangeEnd } = historyYearRange(
    year,
    timezoneOffsetMinutes,
  );

  if (process.env.NODE_ENV !== "production" && options.fixturePath) {
    return (await loadFixtureHistory(options.fixturePath)).filter((event) =>
      isTimestampInHistoryYear(
        event.createdAt,
        year,
        timezoneOffsetMinutes,
      ),
    );
  }

  if (!account.email && !account.username) return [];

  const limit = Math.max(1, Math.min(options.limit ?? 2000, 5000));
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
      devices.name as device_name,
      coalesce(commit_rows.commits, '[]'::json) as commits
    from sync_events
    join repositories on repositories.id = sync_events.repository_id
    join devices on devices.id = sync_events.device_id
    join dashboard_user on dashboard_user.id = repositories.user_id
    left join lateral (
      select json_agg(
        json_build_object(
          'sha', sync_event_commits.sha,
          'message', sync_event_commits.message,
          'authorName', sync_event_commits.author_name,
          'authorEmail', sync_event_commits.author_email,
          'authoredAt', sync_event_commits.authored_at,
          'committedAt', sync_event_commits.committed_at
        )
        order by coalesce(sync_event_commits.committed_at, sync_event_commits.authored_at, sync_event_commits.created_at)
      ) as commits
      from sync_event_commits
      where sync_event_commits.sync_event_id = sync_events.id
    ) commit_rows on true
    where sync_events.created_at >= ${rangeStart.toISOString()}
      and sync_events.created_at < ${rangeEnd.toISOString()}
    order by sync_events.created_at desc
    limit ${limit}
  `;

  return rows.map(mapSyncEvent);
}
