import {
  accountLimitsForTier,
  accountTierForPlan,
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
    tier: "free" | "paid" | null;
    plan_tier: PlanTier | null;
  }[]>`
    select users.tier, plans.tier as plan_tier
    from users
    left join plans on plans.user_id = users.id
    where users.id = ${account.id}
    limit 1
  `;
  const tier = tierRow?.tier ?? accountTierForPlan(tierRow?.plan_tier);
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
