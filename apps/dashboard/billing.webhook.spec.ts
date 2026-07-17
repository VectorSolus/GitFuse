import "./test/env";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getSql } from "./lib/db";
import { syncRazorpaySubscriptionEvent } from "./lib/billing";

process.env.RAZORPAY_PRO_PLAN_ID = "plan_test_pro";

const userIds: string[] = [];
const proPlanId = process.env.RAZORPAY_PRO_PLAN_ID;

async function seedPlan(tier: "free" | "pro") {
  const sql = getSql();
  const id = randomUUID();
  userIds.push(id);
  await sql`
    insert into users (id, github_id, github_username, email)
    values (${id}, ${`test:${id}`}, ${`billing-${id}`}, ${`billing-${id}@example.com`})
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
      ${tier},
      'pro',
      'razorpay',
      ${`sub_${id}`},
      ${proPlanId},
      ${tier === "free" ? "created" : "active"},
      1
    )
  `;
  return { id, subscriptionId: `sub_${id}` };
}

async function planTier(userId: string) {
  const sql = getSql();
  const [row] = await sql<{ tier: string }[]>`
    select tier from plans where user_id = ${userId} limit 1
  `;
  return row?.tier;
}

afterAll(async () => {
  if (userIds.length === 0) return;
  const sql = getSql();
  await sql`
    delete from users
    where id in ${sql(userIds)}
  `;
});

describe("Razorpay webhook tier sync", () => {
  it("payment.captured flips a seeded free plan to paid via plans.tier", async () => {
    const seeded = await seedPlan("free");

    await syncRazorpaySubscriptionEvent({
      event: "payment.captured",
      payload: {
        payment: { entity: { subscription_id: seeded.subscriptionId } },
        subscription: {
          entity: {
            id: seeded.subscriptionId,
            plan_id: proPlanId,
            status: "active",
          },
        },
      },
    });

    await expect(planTier(seeded.id)).resolves.toBe("pro");
  });

  it("payment.failed flips a seeded paid plan back to free via plans.tier", async () => {
    const seeded = await seedPlan("pro");

    await syncRazorpaySubscriptionEvent({
      event: "payment.failed",
      payload: {
        payment: { entity: { subscription_id: seeded.subscriptionId } },
      },
    });

    await expect(planTier(seeded.id)).resolves.toBe("free");
  });
});
