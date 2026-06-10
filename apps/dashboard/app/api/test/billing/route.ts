import { NextResponse } from "next/server";

import { createBillingCheckoutSession, getDashboardBilling } from "../../../../lib/billing";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: string; githubUsername?: string; fixturePath?: string; tier?: "pro" | "team"; checkoutLog?: string }
    | null;

  if (!body?.email && !body?.githubUsername) {
    return NextResponse.json({ error: "email or githubUsername is required" }, { status: 400 });
  }

  if (body.tier) {
    return NextResponse.json(
      await createBillingCheckoutSession({
        tier: body.tier,
        email: body.email,
        username: body.githubUsername,
        successUrl: "http://localhost:3013/dashboard/billing?checkout=success",
        cancelUrl: "http://localhost:3013/dashboard/billing?checkout=cancelled",
        checkoutLog: body.checkoutLog
      })
    );
  }

  const billing = await getDashboardBilling(
    { email: body.email, username: body.githubUsername },
    { fixturePath: body.fixturePath }
  );

  return NextResponse.json({ billing });
}
