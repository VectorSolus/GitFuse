import "./test/env";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { cancelRazorpaySubscription } from "./lib/billing";
import { getSql } from "./lib/db";

const userIds: string[] = [];

async function seedProPlan(input: { subscriptionId?: string | null } = {}) {
  const sql = getSql();
  const id = randomUUID();
  const subscriptionId =
    input.subscriptionId === undefined ? `sub_${id}` : input.subscriptionId;
  userIds.push(id);

  await sql`
    insert into users (id, github_id, github_username, email)
    values (${id}, ${`cancel:${id}`}, ${`cancel-${id}`}, ${`cancel-${id}@example.com`})
  `;
  await sql`
    insert into plans (
      user_id,
      tier,
      requested_tier,
      payment_provider,
      razorpay_subscription_id,
      razorpay_plan_id,
      subscription_status,
      team_seat_count
    )
    values (
      ${id},
      'pro',
      'pro',
      'razorpay',
      ${subscriptionId},
      'plan_test_pro',
      'active',
      1
    )
  `;

  return { id, subscriptionId };
}

async function planState(userId: string) {
  const sql = getSql();
  const [row] = await sql<{
    tier: string;
    requested_tier: string;
    subscription_status: string | null;
    razorpay_subscription_id: string | null;
  }[]>`
    select tier, requested_tier, subscription_status, razorpay_subscription_id
    from plans
    where user_id = ${userId}
    limit 1
  `;

  return row;
}

afterAll(async () => {
  if (userIds.length === 0) return;

  const sql = getSql();
  await sql`
    delete from users
    where id in ${sql(userIds)}
  `;
});

describe("Razorpay cancellation", () => {
  it("cancels through Razorpay before marking the local plan as free", async () => {
    const seeded = await seedProPlan();
    const calls: Array<{ subscriptionId: string; cancelAtCycleEnd?: boolean | number }> = [];

    const result = await cancelRazorpaySubscription(seeded.id, {
      cancelSubscription: async (subscriptionId, cancelAtCycleEnd) => {
        calls.push({ subscriptionId, cancelAtCycleEnd });
        return {
          id: subscriptionId,
          status: "cancelled",
          ended_at: 1_782_432_000,
        } as any;
      },
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      { subscriptionId: seeded.subscriptionId, cancelAtCycleEnd: false },
    ]);
    await expect(planState(seeded.id)).resolves.toMatchObject({
      tier: "free",
      requested_tier: "free",
      subscription_status: "cancelled",
      razorpay_subscription_id: seeded.subscriptionId,
    });
  });

  it("marks the plan free when no Razorpay subscription id is present", async () => {
    const seeded = await seedProPlan({ subscriptionId: null });

    const result = await cancelRazorpaySubscription(seeded.id, {
      cancelSubscription: async () => {
        throw new Error("Razorpay should not be called");
      },
    });

    expect(result.ok).toBe(true);
    await expect(planState(seeded.id)).resolves.toMatchObject({
      tier: "free",
      requested_tier: "free",
      subscription_status: "cancelled",
      razorpay_subscription_id: null,
    });
  });
});
