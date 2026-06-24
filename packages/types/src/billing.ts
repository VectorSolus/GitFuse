export type PlanTier = "free" | "pro" | "team" | "enterprise";
export type PaidPlanTier = Extract<PlanTier, "pro" | "team">;
export type AccountTier = "free" | "paid";

export type PaymentProvider = "razorpay";

export type RazorpaySubscriptionStatus =
  | "created"
  | "authenticated"
  | "active"
  | "pending"
  | "halted"
  | "cancelled"
  | "completed"
  | "expired"
  | "paused"
  | "failed";

export type LimitName = "repos" | "devices" | "storage" | "bundle_size";

export type TierLimits = {
  repos: number | "unlimited";
  devices: number | "unlimited";
  historyDays: number;
  historyYears: number;
  bundleSizeBytes: number;
  storageTotalBytes: number;
};

export const PLAN_LIMITS: Record<PlanTier, TierLimits> = {
  free: {
    repos: 5,
    devices: 2,
    historyDays: 7,
    historyYears: 1,
    bundleSizeBytes: 50 * 1024 * 1024,
    storageTotalBytes: 500 * 1024 * 1024
  },
  pro: {
    repos: "unlimited",
    devices: "unlimited",
    historyDays: 730,
    historyYears: 2,
    bundleSizeBytes: 500 * 1024 * 1024,
    storageTotalBytes: 50 * 1024 * 1024 * 1024
  },
  team: {
    repos: "unlimited",
    devices: "unlimited",
    historyDays: 730,
    historyYears: 2,
    bundleSizeBytes: 500 * 1024 * 1024,
    storageTotalBytes: 50 * 1024 * 1024 * 1024
  },
  enterprise: {
    repos: "unlimited",
    devices: "unlimited",
    historyDays: 730,
    historyYears: 2,
    bundleSizeBytes: 500 * 1024 * 1024,
    storageTotalBytes: 50 * 1024 * 1024 * 1024
  }
};

export const TIER_LIMITS = PLAN_LIMITS;

export function accountTierForPlan(tier: PlanTier | AccountTier | null | undefined): AccountTier {
  return tier === "free" || !tier ? "free" : "paid";
}

export function accountLimitsForTier(tier: AccountTier) {
  return {
    tier,
    devices: {
      limit: tier === "free" ? 2 : null
    },
    retentionDays: tier === "free" ? 7 : null
  };
}

export function availableHistoryYears(
  tier: PlanTier,
  currentYear = new Date().getFullYear()
) {
  return Array.from(
    { length: PLAN_LIMITS[tier].historyYears },
    (_, index) => currentYear - index
  );
}

export function resolvePermittedHistoryYear(
  tier: PlanTier,
  requestedYear: number | null | undefined,
  currentYear = new Date().getFullYear()
) {
  const years = availableHistoryYears(tier, currentYear);
  return requestedYear && years.includes(requestedYear)
    ? requestedYear
    : currentYear;
}

export function isPaidSubscriptionStatus(
  status: string | null | undefined
): status is Extract<RazorpaySubscriptionStatus, "active" | "authenticated"> {
  return status === "active" || status === "authenticated";
}

export function effectivePlanTier(input: {
  tier: PlanTier | null | undefined;
  requestedTier?: PlanTier | null;
  paymentProvider?: string | null;
  subscriptionStatus?: string | null;
}): PlanTier {
  if (input.paymentProvider !== "razorpay") {
    return input.tier ?? "free";
  }

  if (!isPaidSubscriptionStatus(input.subscriptionStatus)) {
    return "free";
  }

  const paidTier = input.requestedTier ?? input.tier;
  return paidTier === "pro" || paidTier === "team" ? paidTier : "free";
}

export type UsageSummary = {
  tier: PlanTier;
  repos: { current: number; max: number | "unlimited" };
  devices: { current: number; max: number | "unlimited" };
  storage: { currentBytes: number; maxBytes: number };
  bundleSize: { maxBytes: number };
  historyDays: number;
};

export type AccountLimitsResponse = {
  tier: AccountTier;
  devices: { limit: number | null; current: number };
  retention_days: number | null;
};
