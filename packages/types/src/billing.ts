export type PlanTier = "free" | "pro" | "team" | "enterprise";
export type PaidPlanTier = Extract<PlanTier, "pro" | "team">;

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
  bundleSizeBytes: number;
  storageTotalBytes: number;
};

export const PLAN_LIMITS: Record<PlanTier, TierLimits> = {
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

export const TIER_LIMITS = PLAN_LIMITS;

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
