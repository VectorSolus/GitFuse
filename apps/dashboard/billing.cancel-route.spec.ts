import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  session: null as unknown,
  result: null as unknown,
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => routeState.session),
}));

vi.mock("@/lib/billing", () => ({
  cancelRazorpaySubscription: vi.fn(async () => routeState.result),
}));

import { cancelRazorpaySubscription } from "@/lib/billing";
import { POST } from "./app/api/billing/cancel/route";

describe("billing cancel route", () => {
  beforeEach(() => {
    routeState.session = {
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "owner@example.com",
      },
      invalid: false,
    };
    routeState.result = {
      ok: true,
      message: "Plan cancelled.",
      cancelledExternally: true,
      billing: {
        tier: "free",
        requestedTier: "free",
        paymentProvider: "razorpay",
        subscriptionStatus: "cancelled",
        razorpayCustomerId: null,
        razorpaySubscriptionId: "sub_test",
        razorpayPlanId: "plan_test",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: true,
        invoices: [],
      },
    };
    vi.mocked(cancelRazorpaySubscription).mockClear();
  });

  it("requires an authenticated session", async () => {
    routeState.session = null;

    const response = await POST();

    expect(response.status).toBe(401);
    expect(cancelRazorpaySubscription).not.toHaveBeenCalled();
  });

  it("cancels the authenticated user's subscription on the server", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(cancelRazorpaySubscription).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(body).toEqual(routeState.result);
  });
});
