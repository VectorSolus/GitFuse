import type {
  AccountTier,
  PlanTier,
  RazorpaySubscriptionStatus,
  TierLimits,
} from "@gitfuse/types/billing";

export type {
  AccountLimitsResponse,
  AccountTier,
  LimitName,
  PlanTier,
  UsageSummary,
} from "@gitfuse/types/billing";

export const PLAN_LIMITS: Record<PlanTier, TierLimits> = {
  free: {
    repos: 5,
    devices: 2,
    historyDays: 7,
    historyYears: 1,
    bundleSizeBytes: 50 * 1024 * 1024,
    storageTotalBytes: 500 * 1024 * 1024,
  },
  pro: {
    repos: "unlimited",
    devices: "unlimited",
    historyDays: 730,
    historyYears: 2,
    bundleSizeBytes: 500 * 1024 * 1024,
    storageTotalBytes: 50 * 1024 * 1024 * 1024,
  },
  team: {
    repos: "unlimited",
    devices: "unlimited",
    historyDays: 730,
    historyYears: 2,
    bundleSizeBytes: 500 * 1024 * 1024,
    storageTotalBytes: 50 * 1024 * 1024 * 1024,
  },
  enterprise: {
    repos: "unlimited",
    devices: "unlimited",
    historyDays: 730,
    historyYears: 2,
    bundleSizeBytes: 500 * 1024 * 1024,
    storageTotalBytes: 50 * 1024 * 1024 * 1024,
  },
};

export function accountTierForPlan(
  tier: PlanTier | AccountTier | null | undefined,
): AccountTier {
  return tier === "free" || !tier ? "free" : "paid";
}

export function accountLimitsForTier(tier: AccountTier) {
  return {
    tier,
    devices: {
      limit: tier === "free" ? 2 : null,
    },
    retentionDays: tier === "free" ? 7 : null,
  };
}

function isPaidSubscriptionStatus(
  status: string | null | undefined,
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
