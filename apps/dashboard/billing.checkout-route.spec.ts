import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  session: null as unknown,
  result: null as unknown,
}));

vi.mock("./lib/auth", () => ({
  auth: vi.fn(async () => routeState.session),
}));

vi.mock("./lib/billing", () => ({
  createRazorpaySubscription: vi.fn(async () => routeState.result),
}));

import { EARLY_ACCESS_COPY } from "./lib/launch-mode";
import { POST } from "./app/api/billing/checkout/route";
import { createRazorpaySubscription } from "./lib/billing";

function checkoutRequest(tier: "pro" | "team" = "pro") {
  return new Request("http://gitfuse.test/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tier }),
  });
}

describe("billing checkout route", () => {
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
      provider: "razorpay",
      keyId: "rzp_test_key",
      subscriptionId: "sub_test",
      name: "Owner",
      email: "owner@example.com",
      plan: "pro",
    };
    vi.mocked(createRazorpaySubscription).mockClear();
  });

  it("requires an authenticated session", async () => {
    routeState.session = null;

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(401);
    expect(createRazorpaySubscription).not.toHaveBeenCalled();
  });

  it("defers checkout during Free Early Access without creating a subscription", async () => {
    const response = await POST(checkoutRequest("team"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      error: "billing_deferred",
      message: EARLY_ACCESS_COPY.checkoutDeferred,
    });
    expect(createRazorpaySubscription).not.toHaveBeenCalled();
  });
});
