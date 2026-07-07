import type { Device } from "@gitfuse/types/workspace";

import { getSql } from "./db";

export type DashboardDevice = Pick<Device, "id" | "name" | "lastActiveAt" | "createdAt" | "revokedAt"> & {
  status: "active" | "revoked";
};

type AccountLookup = {
  id?: string | null;
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

const COMPLETE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DashboardDeviceRevokeResult =
  | {
      ok: true;
      alreadyRevoked: boolean;
      device: {
        id: string;
        revoked: true;
        revokedAt: string;
      };
    }
  | {
      ok: false;
      error: "INVALID_DEVICE_ID" | "DEVICE_NOT_FOUND";
      message: string;
    };

export function isCompleteDeviceUuid(value: string) {
  return COMPLETE_UUID_PATTERN.test(value);
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
    order by devices.revoked_at nulls first,
             devices.last_active_at desc nulls last,
             devices.created_at desc,
             devices.id asc
  `;

  return rows.map(mapDevice);
}

export async function countPendingDashboardDeviceApprovals(userId: string) {
  const sql = getSql();
  const [row] = await sql<{ count: number | string }[]>`
    select count(*)::int as count
    from cli_auth_sessions
    where user_id = ${userId}
      and approved_at is null
      and expires_at > now()
  `;

  return Number(row?.count ?? 0);
}

export async function revokeDashboardDevice(
  account: AccountLookup,
  deviceId: string,
  options: { revokeLog?: string | null } = {}
): Promise<DashboardDeviceRevokeResult> {
  if (!isCompleteDeviceUuid(deviceId)) {
    return {
      ok: false,
      error: "INVALID_DEVICE_ID",
      message: "A complete device UUID is required.",
    };
  }

  if (process.env.NODE_ENV !== "production" && options.revokeLog) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(options.revokeLog, `revoked=${deviceId} email=${account.email ?? ""}\n`);
    return {
      ok: true,
      alreadyRevoked: false,
      device: {
        id: deviceId,
        revoked: true,
        revokedAt: new Date().toISOString(),
      },
    };
  }

  if (!account.id && !account.email && !account.username) {
    return {
      ok: false,
      error: "DEVICE_NOT_FOUND",
      message: "Device not found.",
    };
  }

  const sql = getSql();
  const [device] = await sql<{
    id: string;
    revoked_at: Date | string;
    was_revoked: boolean;
  }[]>`
    with dashboard_user as (
      select u.id
      from users as u
      where (${account.id ?? null}::uuid is not null and u.id = ${account.id ?? null})
         or (${account.email ?? null}::text is not null and u.email = ${account.email ?? null})
         or (${account.username ?? null}::text is not null and u.github_username = ${account.username ?? null})
      order by u.updated_at desc
      limit 1
    ),
    target_device as (
      select d.id,
             d.revoked_at as previous_revoked_at
      from devices as d
      join dashboard_user as du on du.id = d.user_id
      where d.id = ${deviceId}
      for update
    ),
    revoked_device as (
      update devices as d
      set revoked_at = now()
      from target_device as td
      where d.id = td.id
        and td.previous_revoked_at is null
      returning d.id,
                d.revoked_at
    )
    select td.id,
           coalesce(rd.revoked_at, td.previous_revoked_at) as revoked_at,
           td.previous_revoked_at is not null as was_revoked
    from target_device as td
    left join revoked_device as rd on rd.id = td.id
  `;

  if (!device) {
    return {
      ok: false,
      error: "DEVICE_NOT_FOUND",
      message: "Device not found.",
    };
  }

  return {
    ok: true,
    alreadyRevoked: device.was_revoked,
    device: {
      id: device.id,
      revoked: true,
      revokedAt: toIso(device.revoked_at) ?? new Date().toISOString(),
    },
  };
}
