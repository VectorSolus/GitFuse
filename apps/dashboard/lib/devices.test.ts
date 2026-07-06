import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  sql: null as null | ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>),
}));

vi.mock("./db", () => ({
  getSql: () => {
    if (!dbState.sql) throw new Error("test sql not installed");
    return dbState.sql;
  },
}));

import { buildDashboardDeviceSummary } from "./device-summary";
import {
  isCompleteDeviceUuid,
  listDashboardDevices,
  revokeDashboardDevice,
} from "./devices";

let tempDir: string | null = null;

beforeEach(() => {
  dbState.sql = null;
});

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("dashboard devices", () => {
  it("preserves two active devices that share the same hostname", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "gitfuse-devices-"));
    const fixturePath = join(tempDir, "devices.json");
    writeFileSync(
      fixturePath,
      JSON.stringify({
        devices: [
          {
            id: "b707fbb3-df65-47b9-b593-6e2920ee90ce",
            name: "Piyushs-MacBook-Pro.local",
            lastActiveAt: "2026-06-29T04:47:57.182Z",
            createdAt: "2026-06-29T04:33:00.000Z",
            revokedAt: null,
            status: "active"
          },
          {
            id: "086b3c4c-a1c0-4d8b-a615-3462cae53e22",
            name: "Piyushs-MacBook-Pro.local",
            lastActiveAt: "2026-06-29T04:48:07.429Z",
            createdAt: "2026-06-29T04:34:00.000Z",
            revokedAt: null,
            status: "active"
          }
        ]
      }),
    );

    const devices = await listDashboardDevices(
      { email: "piyush@example.com" },
      { fixturePath },
    );

    expect(devices).toHaveLength(2);
    expect(devices.map((device) => device.id).sort()).toEqual([
      "086b3c4c-a1c0-4d8b-a615-3462cae53e22",
      "b707fbb3-df65-47b9-b593-6e2920ee90ce"
    ]);
    expect(new Set(devices.map((device) => device.name)).size).toBe(1);
  });

  it("reads updated device state on the next request without process restart", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "gitfuse-devices-cache-"));
    const fixturePath = join(tempDir, "devices.json");
    writeFileSync(
      fixturePath,
      JSON.stringify({
        devices: [
          {
            id: "b707fbb3-df65-47b9-b593-6e2920ee90ce",
            name: "Piyushs-MacBook-Pro.local",
            lastActiveAt: "2026-06-29T07:19:27.000Z",
            createdAt: "2026-06-29T07:19:27.000Z",
            revokedAt: null,
            status: "active"
          }
        ]
      }),
    );

    await expect(
      listDashboardDevices({ email: "piyush@example.com" }, { fixturePath }),
    ).resolves.toHaveLength(1);

    writeFileSync(
      fixturePath,
      JSON.stringify({
        devices: [
          {
            id: "b707fbb3-df65-47b9-b593-6e2920ee90ce",
            name: "Piyushs-MacBook-Pro.local",
            lastActiveAt: "2026-06-29T07:25:05.788Z",
            createdAt: "2026-06-29T07:19:27.000Z",
            revokedAt: null,
            status: "active"
          },
          {
            id: "086b3c4c-a1c0-4d8b-a615-3462cae53e22",
            name: "Piyushs-MacBook-Pro.local",
            lastActiveAt: "2026-06-29T07:25:10.246Z",
            createdAt: "2026-06-29T07:20:09.000Z",
            revokedAt: null,
            status: "active"
          }
        ]
      }),
    );

    const devices = await listDashboardDevices(
      { email: "piyush@example.com" },
      { fixturePath },
    );

    expect(devices).toHaveLength(2);
    expect(devices[1].lastActiveAt).toBe("2026-06-29T07:25:10.246Z");
  });

  it("revokes an owned active device idempotently and preserves the audit row", async () => {
    const devices = installRevokeSql([
      {
        id: "00000000-0000-4000-8000-000000000101",
        userId: "00000000-0000-4000-8000-000000000001",
        name: "Piyushs-MacBook-Pro.local",
        revokedAt: null,
      },
      {
        id: "00000000-0000-4000-8000-000000000102",
        userId: "00000000-0000-4000-8000-000000000001",
        name: "Piyushs-MacBook-Pro.local",
        revokedAt: null,
      },
    ]);

    const result = await revokeDashboardDevice(
      { id: "00000000-0000-4000-8000-000000000001" },
      "00000000-0000-4000-8000-000000000101",
    );

    expect(result).toMatchObject({
      ok: true,
      alreadyRevoked: false,
      device: {
        id: "00000000-0000-4000-8000-000000000101",
        revoked: true,
      },
    });
    expect(devices.get("00000000-0000-4000-8000-000000000101")).toBeDefined();
    expect(devices.get("00000000-0000-4000-8000-000000000101")?.revokedAt).toBeTruthy();
    expect(devices.get("00000000-0000-4000-8000-000000000102")?.revokedAt).toBeNull();

    const second = await revokeDashboardDevice(
      { id: "00000000-0000-4000-8000-000000000001" },
      "00000000-0000-4000-8000-000000000101",
    );
    expect(second).toMatchObject({ ok: true, alreadyRevoked: true });
  });

  it("rejects invalid UUIDs before touching the database", async () => {
    dbState.sql = vi.fn(async () => {
      throw new Error("sql should not run");
    });

    await expect(
      revokeDashboardDevice(
        { id: "00000000-0000-4000-8000-000000000001" },
        "34dc0230",
      ),
    ).resolves.toEqual({
      ok: false,
      error: "INVALID_DEVICE_ID",
      message: "A complete device UUID is required.",
    });
    expect(isCompleteDeviceUuid("34dc0230")).toBe(false);
  });

  it("returns the same safe not-found result for unknown and cross-account devices", async () => {
    installRevokeSql([
      {
        id: "00000000-0000-4000-8000-000000000201",
        userId: "00000000-0000-4000-8000-000000000002",
        name: "Shared hostname",
        revokedAt: null,
      },
    ]);

    const crossAccount = await revokeDashboardDevice(
      { id: "00000000-0000-4000-8000-000000000001" },
      "00000000-0000-4000-8000-000000000201",
    );
    const unknown = await revokeDashboardDevice(
      { id: "00000000-0000-4000-8000-000000000001" },
      "00000000-0000-4000-8000-000000000999",
    );

    expect(crossAccount).toEqual({
      ok: false,
      error: "DEVICE_NOT_FOUND",
      message: "Device not found.",
    });
    expect(unknown).toEqual(crossAccount);
  });

  it("uses the full UUID when duplicate hostnames are revoked", async () => {
    const devices = installRevokeSql([
      {
        id: "00000000-0000-4000-8000-000000000301",
        userId: "00000000-0000-4000-8000-000000000001",
        name: "Piyushs-MacBook-Pro.local",
        revokedAt: null,
      },
      {
        id: "00000000-0000-4000-8000-000000000302",
        userId: "00000000-0000-4000-8000-000000000001",
        name: "Piyushs-MacBook-Pro.local",
        revokedAt: null,
      },
      {
        id: "00000000-0000-4000-8000-000000000303",
        userId: "00000000-0000-4000-8000-000000000001",
        name: "Piyushs-MacBook-Pro.local",
        revokedAt: "2026-06-29T08:00:00.000Z",
      },
    ]);

    await expect(
      revokeDashboardDevice(
        { id: "00000000-0000-4000-8000-000000000001" },
        "00000000-0000-4000-8000-000000000302",
      ),
    ).resolves.toMatchObject({ ok: true });

    expect(devices.get("00000000-0000-4000-8000-000000000301")?.revokedAt).toBeNull();
    expect(devices.get("00000000-0000-4000-8000-000000000302")?.revokedAt).toBeTruthy();
    expect(devices.get("00000000-0000-4000-8000-000000000303")?.revokedAt).toBeTruthy();

    const summary = buildDashboardDeviceSummary({
      devices: [...devices.values()].map((device) => ({
        id: device.id,
        name: device.name,
        lastActiveAt: null,
        createdAt: "2026-06-29T00:00:00.000Z",
        revokedAt: device.revokedAt,
        status: device.revokedAt ? "revoked" : "active",
      })),
      deviceLimit: 2,
      activeSessionCount: 1,
      pendingApprovalCount: 0,
    });

    expect(summary.trustedDeviceCount).toBe(1);
    expect(summary.activeSessionCount).toBe(1);
  });
});

type FakeDeviceRow = {
  id: string;
  userId: string;
  name: string;
  revokedAt: string | null;
};

function installRevokeSql(rows: FakeDeviceRow[]) {
  const devices = new Map(rows.map((row) => [row.id, { ...row }]));
  dbState.sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (!text.includes("locked_device") || !text.includes("update devices")) {
      throw new Error(`unexpected sql: ${text}`);
    }

    const accountId = values[1];
    const deviceId = values[values.length - 1];
    const device = devices.get(String(deviceId));
    if (!device || device.userId !== accountId) return [];

    const wasRevoked = device.revokedAt !== null;
    if (!device.revokedAt) {
      device.revokedAt = "2026-06-29T09:00:00.000Z";
    }

    return [
      {
        id: device.id,
        revoked_at: device.revokedAt,
        was_revoked: wasRevoked,
      },
    ];
  });
  return devices;
}
