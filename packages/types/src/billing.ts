export type PlanTier = "free" | "pro" | "team" | "enterprise";

export type LimitName = "repos" | "devices" | "storage" | "bundle_size";

export type TierLimits = {
  repos: number | "unlimited";
  devices: number | "unlimited";
  historyDays: number;
  bundleSizeBytes: number;
  storageTotalBytes: number;
};

export const TIER_LIMITS: Record<PlanTier, TierLimits> = {
  free: {
    repos: 5,
    devices: 3,
    historyDays: 30,
    bundleSizeBytes: 50 * 1024 * 1024,
    storageTotalBytes: 500 * 1024 * 1024
  },
  pro: {
    repos: "unlimited",
    devices: "unlimited",
    historyDays: 365,
    bundleSizeBytes: 500 * 1024 * 1024,
    storageTotalBytes: 50 * 1024 * 1024 * 1024
  },
  team: {
    repos: "unlimited",
    devices: "unlimited",
    historyDays: 365,
    bundleSizeBytes: 500 * 1024 * 1024,
    storageTotalBytes: 50 * 1024 * 1024 * 1024
  },
  enterprise: {
    repos: "unlimited",
    devices: "unlimited",
    historyDays: 365,
    bundleSizeBytes: 500 * 1024 * 1024,
    storageTotalBytes: 50 * 1024 * 1024 * 1024
  }
};

export type UsageSummary = {
  tier: PlanTier;
  repos: { current: number; max: number | "unlimited" };
  devices: { current: number; max: number | "unlimited" };
  storage: { currentBytes: number; maxBytes: number };
  bundleSize: { maxBytes: number };
  historyDays: number;
};
