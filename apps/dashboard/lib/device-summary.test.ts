import { describe, expect, it } from "vitest";

import {
  buildDashboardDeviceSummary,
  filterDashboardDevices,
  getDeviceDisplayStatus,
  shortDeviceId,
} from "./device-summary";
import type { DashboardDevice } from "./devices";

const statusNow = new Date("2026-07-06T07:25:05.788Z");

const duplicateHostnameDevices: DashboardDevice[] = [
  {
    id: "b707fbb3-df65-47b9-b593-6e2920ee90ce",
    name: "Piyushs-MacBook-Pro.local",
    lastActiveAt: "2026-06-29T07:25:05.788Z",
    createdAt: "2026-06-29T07:19:27.000Z",
    revokedAt: null,
    status: "active",
  },
  {
    id: "086b3c4c-a1c0-4d8b-a615-3462cae53e22",
    name: "Piyushs-MacBook-Pro.local",
    lastActiveAt: "2026-06-29T07:25:10.246Z",
    createdAt: "2026-06-29T07:20:09.000Z",
    revokedAt: null,
    status: "active",
  },
];

describe("dashboard device summary", () => {
  it("derives display status with revoked precedence and inactive timeout", () => {
    expect(getDeviceDisplayStatus(duplicateHostnameDevices[0], statusNow)).toBe(
      "active",
    );
    expect(
      getDeviceDisplayStatus(
        {
          ...duplicateHostnameDevices[0],
          lastActiveAt: "2026-06-29T07:25:05.787Z",
        },
        statusNow,
      ),
    ).toBe("inactive");
    expect(
      getDeviceDisplayStatus(
        {
          ...duplicateHostnameDevices[0],
          lastActiveAt: null,
        },
        statusNow,
      ),
    ).toBe("inactive");
    expect(
      getDeviceDisplayStatus(
        {
          ...duplicateHostnameDevices[0],
          lastActiveAt: "2026-07-06T07:25:05.788Z",
          revokedAt: "2026-07-06T07:26:00.000Z",
        },
        statusNow,
      ),
    ).toBe("revoked");
  });

  it("keeps the exact seven-day boundary active", () => {
    expect(getDeviceDisplayStatus(duplicateHostnameDevices[0], statusNow)).toBe(
      "active",
    );
  });

  it("counts trusted devices by immutable ID and revocation state", () => {
    const summary = buildDashboardDeviceSummary({
      devices: [
        ...duplicateHostnameDevices,
        {
          ...duplicateHostnameDevices[0],
          id: "00000000-0000-4000-8000-000000000777",
          lastActiveAt: "2026-06-20T00:00:00.000Z",
        },
      ],
      deviceLimit: 2,
      activeSessionCount: 1,
      pendingApprovalCount: 0,
    });

    expect(summary).toEqual({
      trustedDeviceCount: 3,
      activeSessionCount: 1,
      pendingApprovalCount: 0,
      deviceLimit: 2,
    });
  });

  it("does not collapse shared hostnames during search or presentation", () => {
    const matches = filterDashboardDevices(
      duplicateHostnameDevices,
      "Piyushs-MacBook-Pro.local",
      "active",
      statusNow,
    );

    expect(matches).toHaveLength(2);
    expect(matches.map((device) => shortDeviceId(device.id))).toEqual([
      "b707fbb3",
      "086b3c4c",
    ]);
  });

  it("filters by inactive and revoked display status", () => {
    const inactiveDevice = {
      ...duplicateHostnameDevices[0],
      id: "00000000-0000-4000-8000-000000000778",
      lastActiveAt: null,
    };
    const revokedDevice = {
      ...duplicateHostnameDevices[0],
      id: "00000000-0000-4000-8000-000000000779",
      revokedAt: "2026-06-29T08:00:00.000Z",
      status: "revoked" as const,
    };

    expect(
      filterDashboardDevices(
        [...duplicateHostnameDevices, inactiveDevice, revokedDevice],
        "",
        "inactive",
        statusNow,
      ).map((device) => device.id),
    ).toEqual([inactiveDevice.id]);
    expect(
      filterDashboardDevices(
        [...duplicateHostnameDevices, inactiveDevice, revokedDevice],
        "",
        "revoked",
        statusNow,
      ).map((device) => device.id),
    ).toEqual([revokedDevice.id]);
  });

  it("excludes revoked devices from trusted counts without removing active devices", () => {
    const summary = buildDashboardDeviceSummary({
      devices: [
        ...duplicateHostnameDevices,
        {
          ...duplicateHostnameDevices[0],
          id: "00000000-0000-4000-8000-000000000999",
          revokedAt: "2026-06-29T08:00:00.000Z",
          status: "revoked",
        },
      ],
      deviceLimit: 2,
      activeSessionCount: 1,
      pendingApprovalCount: 0,
    });

    expect(summary.trustedDeviceCount).toBe(2);
  });
});
