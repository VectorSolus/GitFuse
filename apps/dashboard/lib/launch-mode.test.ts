import { describe, expect, it } from "vitest";

import {
  EARLY_ACCESS_COPY,
  EARLY_ACCESS_PLAN_CARDS,
  PAID_BILLING_ENABLED,
} from "./launch-mode";

describe("early-access launch mode", () => {
  it("keeps paid billing disabled while making Free Early Access the active plan", () => {
    expect(PAID_BILLING_ENABLED).toBe(false);

    const freePlan = EARLY_ACCESS_PLAN_CARDS.find((plan) => plan.tier === "free");
    expect(freePlan).toMatchObject({
      availability: "Free Early Access",
      ctaEnabled: true,
      ctaHref: "/login",
      ctaLabel: EARLY_ACCESS_COPY.freeCta,
      priceLabel: "$0",
    });
  });

  it("marks Pro and Team as Coming Soon without live paid CTAs", () => {
    const paidPlans = EARLY_ACCESS_PLAN_CARDS.filter(
      (plan) => plan.tier === "pro" || plan.tier === "team",
    );

    expect(paidPlans).toHaveLength(2);
    for (const plan of paidPlans) {
      expect(plan.availability).toBe("Coming Soon");
      expect(plan.priceLabel).toBe("Coming Soon");
      expect(plan.ctaLabel).toBe("Coming Soon");
      expect(plan.ctaEnabled).toBe(false);
      expect(plan.ctaHref).toBeUndefined();
      expect(plan.ctaLabel).not.toMatch(/buy|checkout|subscribe|upgrade/i);
    }
  });
});
