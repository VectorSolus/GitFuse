import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { cancelRazorpaySubscription } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth().catch(() => null);
  if (!session?.user?.id || session.invalid) {
    return NextResponse.json(
      { error: "not_authenticated", message: "Sign in is required." },
      { status: 401 },
    );
  }

  try {
    const result = await cancelRazorpaySubscription(session.user.id);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    console.error("[billing:cancel]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "cancel_unavailable",
        message: "Plan cancellation is unavailable right now.",
      },
      { status: 500 },
    );
  }
}
