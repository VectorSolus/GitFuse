import { NextResponse } from "next/server";

import { resolveUpgradePrice } from "../../../../lib/billing";

export const runtime = "nodejs";

function countryFromRequest(request: Request) {
  if (process.env.NODE_ENV !== "production") {
    const testCountry = request.headers.get("x-gitfuse-test-country");
    if (testCountry) return testCountry;
  }

  return request.headers.get("cf-ipcountry");
}

export async function GET(request: Request) {
  const tier = new URL(request.url).searchParams.get("tier");
  const paidTier = tier === "team" ? "team" : "pro";
  const price = resolveUpgradePrice(countryFromRequest(request), paidTier);
  return NextResponse.json(price);
}
