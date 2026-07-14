import {
  accountLimitsForTier,
  accountTierForPlan,
  effectivePlanTier,
  type AccountLimitsResponse,
  type PlanTier,
} from "@gitfuse/types/billing";
import { getSql } from "./db";

type DashboardAccountRef = {
  id: string;
};

export async function getDashboardAccountLimits(
  account: DashboardAccountRef,
): Promise<AccountLimitsResponse> {
  const sql = getSql();
  const [tierRow] = await sql<{
    tier: PlanTier | null;
    requested_tier: PlanTier | null;
    payment_provider: string | null;
    subscription_status: string | null;
  }[]>`
    select tier, requested_tier, payment_provider, subscription_status
    from plans
    where user_id = ${account.id}
    limit 1
  `;
  const tier = accountTierForPlan(
    effectivePlanTier({
      tier: tierRow?.tier,
      requestedTier: tierRow?.requested_tier,
      paymentProvider: tierRow?.payment_provider,
      subscriptionStatus: tierRow?.subscription_status,
    }),
  );
  const limits = accountLimitsForTier(tier);
  const [devices] = await sql<{ count: number | string }[]>`
    select count(*)::int as count
    from devices
    where user_id = ${account.id}
      and revoked_at is null
  `;

  return {
    tier,
    devices: {
      limit: limits.devices.limit,
      current: Number(devices?.count ?? 0),
    },
    retention_days: limits.retentionDays,
  };
}
