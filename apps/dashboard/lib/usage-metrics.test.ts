import { describe, expect, it } from "vitest";

import type { DashboardData } from "@/hooks/use-dashboard-data";
import type { DashboardDevice } from "./devices";
import {
  buildUsageMetrics,
  getUsageMetricPercent,
} from "./usage-metrics";

const activeDeviceA: DashboardDevice = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "Piyushs-MacBook-Pro.local",
  lastActiveAt: "2026-07-18T10:15:00.000Z",
  createdAt: "2026-07-01T08:00:00.000Z",
  revokedAt: null,
  status: "active",
};

const activeDeviceB: DashboardDevice = {
  id: "00000000-0000-4000-8000-000000000102",
  name: "Build-Mini.local",
  lastActiveAt: null,
  createdAt: "2026-07-02T08:00:00.000Z",
  revokedAt: null,
  status: "active",
};

const activeDeviceC: DashboardDevice = {
  id: "00000000-0000-4000-8000-000000000104",
  name: "Desk-Studio.local",
  lastActiveAt: "2026-07-18T09:15:00.000Z",
  createdAt: "2026-07-04T08:00:00.000Z",
  revokedAt: null,
  status: "active",
};

const revokedDevice: DashboardDevice = {
  id: "00000000-0000-4000-8000-000000000103",
  name: "Old-Air.local",
  lastActiveAt: "2026-07-03T08:00:00.000Z",
  createdAt: "2026-07-03T08:00:00.000Z",
  revokedAt: "2026-07-10T08:00:00.000Z",
  status: "revoked",
};

describe("usage metric metadata", () => {
  it("counts only active devices for device usage", () => {
    const devicesMetric = findMetric(
      buildUsageMetrics(
        makeDashboardData({
          devices: [activeDeviceA, activeDeviceB, revokedDevice],
          usage: makeUsage({
            devices: { current: 3, max: 2 },
          }),
        }),
      ),
      "devices",
    );

    expect(devicesMetric.value).toBe(2);
    expect(devicesMetric.limit).toBe(2);
  });

  it("uses active devices only for device usage percentage", () => {
    const devicesMetric = findMetric(
      buildUsageMetrics(
        makeDashboardData({
          devices: [activeDeviceA, activeDeviceB, revokedDevice],
          usage: makeUsage({
            devices: { current: 3, max: 2 },
          }),
        }),
      ),
      "devices",
    );

    expect(getUsageMetricPercent(devicesMetric)).toBe(100);
  });

  it("keeps unlimited repo and device limits explicit for compact displays", () => {
    const metrics = buildUsageMetrics(
      makeDashboardData({
        devices: [activeDeviceA, activeDeviceB, activeDeviceC],
        usage: makeUsage({
          tier: "pro",
          repos: { current: 11, max: "unlimited" },
          devices: { current: 3, max: "unlimited" },
        }),
        billing: {
          ...makeDashboardData().billing,
          tier: "pro",
          requestedTier: "pro",
          paymentProvider: "razorpay",
          subscriptionStatus: "active",
        },
      }),
    );

    const repositoriesMetric = findMetric(metrics, "repositories");
    const devicesMetric = findMetric(metrics, "devices");

    expect(repositoriesMetric.value).toBe(11);
    expect(repositoriesMetric.limit).toBe("unlimited");
    expect(repositoriesMetric.displayLimit).toBe("∞");
    expect(repositoriesMetric.isUnlimited).toBe(true);
    expect(getUsageMetricPercent(repositoriesMetric)).toBe(0);

    expect(devicesMetric.value).toBe(3);
    expect(devicesMetric.limit).toBe("unlimited");
    expect(devicesMetric.displayLimit).toBe("∞");
    expect(devicesMetric.isUnlimited).toBe(true);
    expect(getUsageMetricPercent(devicesMetric)).toBe(0);
  });

  it("excludes revoked devices from the selected device detail rows", () => {
    const devicesMetric = findMetric(
      buildUsageMetrics(
        makeDashboardData({
          devices: [activeDeviceA, activeDeviceB, revokedDevice],
        }),
      ),
      "devices",
    );

    expect(devicesMetric.rows.map((row) => row.name)).toEqual([
      "Piyushs-MacBook-Pro.local",
      "Build-Mini.local",
    ]);
    expect(devicesMetric.rows.map((row) => row.name)).not.toContain(
      "Old-Air.local",
    );
    expect(devicesMetric.rowsTitle).toBe("Active devices");
  });

  it("formats storage, history, and bundle usage metadata", () => {
    const metrics = buildUsageMetrics(
      makeDashboardData({
        repositories: [
          {
            id: "repo-1",
            rootSha: "abc123",
            displayName: "gitfuse",
            remoteUrl: null,
            relayEntryId: "relay/gitfuse",
            createdAt: "2026-07-01T08:00:00.000Z",
            lastSyncedAt: "2026-07-18T10:00:00.000Z",
            activeBundleCount: 2,
            activeStorageBytes: 1536,
            latestEventType: "sync",
            latestEventAt: "2026-07-18T10:00:00.000Z",
            syncState: "synced",
          },
        ],
        history: [
          {
            id: "event-1",
            eventType: "sync",
            commitCount: 1,
            bundleSizeBytes: 2048,
            createdAt: "2026-07-18T10:00:00.000Z",
            repositoryName: "gitfuse",
            relayEntryId: "relay/gitfuse",
            deviceName: "Piyushs-MacBook-Pro.local",
            commits: [],
          },
        ],
        usage: makeUsage({
          storage: {
            currentBytes: 1536,
            maxBytes: 1024 * 1024,
            percentage: 0.146484375,
          },
          bundleSize: {
            maxBytes: 50 * 1024 * 1024,
            largestRecentBundleBytes: 2048,
            percentage: 0.00390625,
          },
          historyDays: 7,
          historyRetention: {
            usedDays: 3,
            maxDays: 7,
            percentage: 42.857142857142854,
          },
          recentBundles: [
            {
              repositoryName: "gitfuse",
              deviceName: "Piyushs-MacBook-Pro.local",
              sizeBytes: 2048,
              syncedAt: "2026-07-18T10:00:00.000Z",
            },
          ],
        }),
      }),
    );

    const storageMetric = findMetric(metrics, "storage");
    const historyMetric = findMetric(metrics, "history");
    const bundleMetric = findMetric(metrics, "bundle");

    expect(storageMetric.displayValue).toBe("1.5 KB");
    expect(storageMetric.displayLimit).toBe("1.0 MB");
    expect(storageMetric.rows).toMatchObject([
      { name: "gitfuse", value: "1.5 KB" },
    ]);
    expect(historyMetric.value).toBe(3);
    expect(historyMetric.limit).toBe(7);
    expect(historyMetric.rows).toMatchObject([
      { name: "gitfuse", value: "Jul 18, 2026" },
    ]);
    expect(bundleMetric.displayValue).toBe("2.0 KB");
    expect(bundleMetric.displayLimit).toBe("50 MB");
    expect(bundleMetric.rows).toMatchObject([
      {
        name: "gitfuse",
        meta: "Piyushs-MacBook-Pro.local - Jul 18, 2026",
        value: "2.0 KB",
      },
    ]);
  });
});

function findMetric(
  metrics: ReturnType<typeof buildUsageMetrics>,
  id: ReturnType<typeof buildUsageMetrics>[number]["id"],
) {
  const metric = metrics.find((candidate) => candidate.id === id);
  if (!metric) {
    throw new Error(`Missing usage metric ${id}`);
  }

  return metric;
}

function makeDashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    user: {
      name: "Piyush",
      email: "piyush@example.com",
    },
    repositories: [],
    devices: [],
    history: [],
    usage: makeUsage(),
    accountLimits: {
      tier: "free",
      devices: { limit: 2, current: 0 },
      retention_days: 7,
    },
    billing: {
      tier: "free",
      requestedTier: "free",
      paymentProvider: null,
      subscriptionStatus: null,
      razorpayCustomerId: null,
      razorpaySubscriptionId: null,
      razorpayPlanId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      invoices: [],
    },
    security: {
      pairingPinSet: false,
      legacyPairingPinNeedsReset: false,
      pairingPinUpdatedAt: null,
      pairingEvents: [],
    },
    authProviders: {
      github: true,
      google: false,
    },
    historyYears: [2026],
    selectedHistoryYear: 2026,
    ...overrides,
  };
}

function makeUsage(
  overrides: Partial<DashboardData["usage"]> = {},
): DashboardData["usage"] {
  return {
    tier: "free",
    repos: { current: 0, max: 5 },
    devices: { current: 0, max: 2 },
    storage: {
      currentBytes: 0,
      maxBytes: 500 * 1024 * 1024,
      percentage: 0,
    },
    bundleSize: {
      maxBytes: 50 * 1024 * 1024,
      largestRecentBundleBytes: 0,
      percentage: 0,
    },
    historyDays: 7,
    activeBundleCount: 0,
    nextExpiryAt: null,
    historyRetention: {
      usedDays: 0,
      maxDays: 7,
      percentage: 0,
    },
    recentBundles: [],
    ...overrides,
  };
}
