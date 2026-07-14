import { describe, expect, it } from "vitest";
import { GET } from "./app/api/billing/price/route";

async function price(country: string, tier = "pro") {
  const response = await GET(
    new Request(`http://gitfuse.test/api/billing/price?tier=${tier}`, {
      headers: {
        "x-gitfuse-test-country": country,
      },
    }),
  );
  return response.json();
}

describe("billing price route", () => {
  it("resolves INR pricing for India", async () => {
    await expect(price("IN")).resolves.toEqual({
      country: "IN",
      tier: "pro",
      amount: 749,
      currency: "INR",
    });
  });

  it("resolves USD pricing for the US", async () => {
    await expect(price("US")).resolves.toEqual({
      country: "US",
      tier: "pro",
      amount: 9,
      currency: "USD",
    });
  });
});
