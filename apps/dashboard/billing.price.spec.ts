import "./test/env";

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
    const result = await price("IN");

    expect(result).toEqual({
      country: "IN",
      tier: "pro",
      amount: 749,
      currency: "INR",
    });
    expect(result.country).not.toBe("default");
  });

  it("resolves USD pricing for the US", async () => {
    const result = await price("US");

    expect(result).toEqual({
      country: "US",
      tier: "pro",
      amount: 9,
      currency: "USD",
    });
    expect(result.country).not.toBe("default");
  });

  it("documents the default USD fallback for unknown countries", async () => {
    await expect(price("ZZ")).resolves.toEqual({
      country: "default",
      tier: "pro",
      amount: 9,
      currency: "USD",
    });
  });
});
