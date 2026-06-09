import type { Device } from "@gitfuse/types/workspace";

import { getSql } from "./db";

export type DashboardDevice = Pick<Device, "id" | "name" | "lastActiveAt" | "createdAt" | "revokedAt"> & {
  status: "active" | "revoked";
};

type AccountLookup = {
  email?: string | null;
  username?: string | null;
};

type DeviceRow = {
  id: string;
  name: string;
  last_active_at: Date | string | null;
  created_at: Date | string;
  revoked_at: Date | string | null;
};

function toIso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapDevice(row: DeviceRow): DashboardDevice {
  const revokedAt = toIso(row.revoked_at);
  return {
    id: row.id,
    name: row.name,
    lastActiveAt: toIso(row.last_active_at),
    createdAt: toIso(row.created_at) ?? "",
    revokedAt,
    status: revokedAt ? "revoked" : "active"
  };
}

async function loadFixtureDevices(fixturePath: string) {
  const { readFile } = await import("node:fs/promises");
  const parsed = JSON.parse(await readFile(fixturePath, "utf8")) as { devices?: DashboardDevice[] };
  return parsed.devices ?? [];
}

export async function listDashboardDevices(
  account: AccountLookup,
  options: { fixturePath?: string | null } = {}
) {
  if (process.env.NODE_ENV !== "production" && options.fixturePath) {
    return loadFixtureDevices(options.fixturePath);
  }

  if (!account.email && !account.username) return [];

  const sql = getSql();
  const rows = await sql<DeviceRow[]>`
    with dashboard_user as (
      select id
      from users
      where (${account.email ?? null}::text is not null and email = ${account.email ?? null})
         or (${account.username ?? null}::text is not null and github_username = ${account.username ?? null})
      order by updated_at desc
      limit 1
    )
    select devices.id, devices.name, devices.last_active_at, devices.created_at, devices.revoked_at
    from devices
    join dashboard_user on dashboard_user.id = devices.user_id
    order by devices.revoked_at nulls first, devices.last_active_at desc nulls last, devices.created_at desc
  `;

  return rows.map(mapDevice);
}

export async function revokeDashboardDevice(
  account: AccountLookup,
  deviceId: string,
  options: { revokeLog?: string | null } = {}
) {
  if (!deviceId) throw new Error("deviceId is required");

  if (process.env.NODE_ENV !== "production" && options.revokeLog) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(options.revokeLog, `revoked=${deviceId} email=${account.email ?? ""}\n`);
    return { revoked: true };
  }

  if (!account.email && !account.username) return { revoked: false };

  const sql = getSql();
  const [device] = await sql<{ id: string }[]>`
    with dashboard_user as (
      select id
      from users
      where (${account.email ?? null}::text is not null and email = ${account.email ?? null})
         or (${account.username ?? null}::text is not null and github_username = ${account.username ?? null})
      order by updated_at desc
      limit 1
    )
    update devices
    set revoked_at = coalesce(revoked_at, now())
    from dashboard_user
    where devices.id = ${deviceId}
      and devices.user_id = dashboard_user.id
    returning devices.id
  `;

  return { revoked: Boolean(device) };
}
