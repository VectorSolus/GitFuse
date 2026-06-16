import { NextResponse } from "next/server";

import { auth } from "../../../../lib/auth";
import { createRazorpaySubscription } from "../../../../lib/billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { tier?: "pro" | "team" }
    | null;

  if (body?.tier !== "pro" && body?.tier !== "team") {
    return NextResponse.json(
      { error: "tier must be pro or team" },
      { status: 400 },
    );
  }

  const session = await auth().catch(() => null);
  if (!session?.user?.id || session.invalid) {
    return NextResponse.json(
      { error: "not_authenticated", message: "Sign in is required." },
      { status: 401 },
    );
  }

  try {
    const checkout = await createRazorpaySubscription(
      session.user.id,
      body.tier,
    );
    const status =
      checkout.ok
        ? 200
        : checkout.error.startsWith("Missing Razorpay config:")
          ? 503
          : 409;
    return NextResponse.json(checkout, { status });
  } catch (error) {
    console.error("[billing:checkout]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "checkout_unavailable",
        message: "Razorpay checkout is unavailable right now.",
      },
      { status: 500 },
    );
  }
}
