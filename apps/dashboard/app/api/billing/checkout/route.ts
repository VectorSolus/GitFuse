import { NextResponse } from "next/server";

import { auth } from "../../../../lib/auth";
import { createBillingCheckoutSession } from "../../../../lib/billing";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { tier?: "pro" | "team"; email?: string; checkoutLog?: string }
    | null;

  if (body?.tier !== "pro" && body?.tier !== "team") {
    return NextResponse.json({ error: "tier must be pro or team" }, { status: 400 });
  }

  const session = process.env.NODE_ENV !== "production" && body.email ? null : await auth();
  const email = body.email ?? session?.user?.email;
  if (!email) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const url = new URL(request.url);
  const checkout = await createBillingCheckoutSession({
    tier: body.tier,
    email,
    username: session?.user?.name,
    successUrl: `${url.origin}/dashboard/upgrade?checkout=success`,
    cancelUrl: `${url.origin}/dashboard/upgrade?checkout=cancelled`,
    checkoutLog: body.checkoutLog
  });

  return NextResponse.json(checkout);
}
